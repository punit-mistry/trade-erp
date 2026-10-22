"use client";

import { useMutation, useQuery } from "convex/react";
import { useRef, useState, type ReactNode } from "react";
import { FileUp, Loader2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { DEFAULT_SETTINGS } from "@/convex/lib/settings";
import type { DocumentType } from "@/convex/lib/validators";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Combobox } from "@/components/shared/combobox";
import { FormField } from "@/components/shared/form-field";
import { useDebouncedValue } from "@/hooks/use-debounce";
import { getErrorMessage } from "@/lib/errors";
import { formatBytes } from "@/lib/format";
import { DOCUMENT_TYPE_LABEL } from "@/lib/status";
import { cn } from "@/lib/utils";

export type UploadDefaults = {
  tradeId?: Id<"trades">;
  contractId?: Id<"contracts">;
  counterpartyId?: Id<"counterparties">;
  blDocumentId?: Id<"blDocuments">;
  dispatchItemId?: Id<"dispatchItems">;
  docType?: DocumentType;
  groupKey?: string;
};

const DOC_TYPES = Object.keys(DOCUMENT_TYPE_LABEL) as DocumentType[];
const ACCEPT = DEFAULT_SETTINGS.allowedFileTypes.join(",");

/** XHR upload so we can show real progress (fetch has no upload progress). */
function uploadWithProgress(url: string, file: File, onProgress: (pct: number) => void): Promise<Id<"_storage">> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve((JSON.parse(xhr.responseText) as { storageId: Id<"_storage"> }).storageId);
        } catch {
          reject(new Error("Unexpected response from file storage."));
        }
      } else reject(new Error(`Upload failed (${xhr.status}).`));
    };
    xhr.onerror = () => reject(new Error("Network error while uploading. Check your connection and retry."));
    xhr.send(file);
  });
}

/**
 * Upload a file to Convex storage and register it as a document linked to
 * the given records. The server re-validates type/size from storage metadata.
 */
export function UploadDocumentDialog({
  defaults,
  trigger,
  onUploaded,
  open: controlledOpen,
  onOpenChange,
  allowTradeLink = false,
  title,
}: {
  defaults: UploadDefaults;
  trigger?: ReactNode;
  onUploaded?: (documentId: Id<"documents">) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Show a trade picker (Document Centre general upload). */
  allowTradeLink?: boolean;
  title?: string;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const [file, setFile] = useState<File | null>(null);
  const [docType, setDocType] = useState<DocumentType>(defaults.docType ?? "other");
  const [notes, setNotes] = useState("");
  const [tradeId, setTradeId] = useState<Id<"trades"> | undefined>(defaults.tradeId);
  const [tradeSearch, setTradeSearch] = useState("");
  const debouncedSearch = useDebouncedValue(tradeSearch);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const generateUploadUrl = useMutation(api.documents.generateUploadUrl);
  const createDocument = useMutation(api.documents.create);
  const trades = useQuery(
    api.documents.searchTradesForLink,
    open && allowTradeLink ? { search: debouncedSearch || undefined } : "skip",
  );

  const uploading = progress !== null;
  const isVersion = Boolean(defaults.groupKey);

  function reset() {
    setFile(null);
    setNotes("");
    setProgress(null);
    setError(null);
    setDocType(defaults.docType ?? "other");
    setTradeId(defaults.tradeId);
  }

  function setOpen(o: boolean) {
    if (uploading) return;
    if (!o) reset();
    onOpenChange?.(o);
    if (controlledOpen === undefined) setInternalOpen(o);
  }

  function pick(f: File | undefined | null) {
    setError(null);
    if (!f) return;
    if (f.type && !DEFAULT_SETTINGS.allowedFileTypes.includes(f.type)) {
      setError(`“${f.name}” is not an allowed file type. Use PDF, images, CSV, Excel or Word files.`);
      return;
    }
    if (f.size > DEFAULT_SETTINGS.maxUploadMb * 1024 * 1024) {
      setError(`“${f.name}” is ${formatBytes(f.size)} — the limit is ${DEFAULT_SETTINGS.maxUploadMb} MB.`);
      return;
    }
    if (f.size === 0) {
      setError("The selected file is empty.");
      return;
    }
    setFile(f);
  }

  async function submit() {
    if (!file || uploading) return;
    setError(null);
    setProgress(0);
    try {
      const url = await generateUploadUrl();
      const storageId = await uploadWithProgress(url, file, setProgress);
      const id = await createDocument({
        storageId,
        fileName: file.name,
        docType,
        tradeId: allowTradeLink ? tradeId : defaults.tradeId,
        contractId: defaults.contractId,
        counterpartyId: defaults.counterpartyId,
        blDocumentId: defaults.blDocumentId,
        dispatchItemId: defaults.dispatchItemId,
        notes: notes.trim() || undefined,
        groupKey: defaults.groupKey,
      });
      toast.success(isVersion ? "New version uploaded" : "Document uploaded");
      onUploaded?.(id);
      setProgress(null);
      setOpen(false);
      reset();
    } catch (e) {
      setProgress(null);
      setError(getErrorMessage(e, "Unable to upload the file."));
    }
  }

  const selectedTrade = trades?.find((t) => t._id === tradeId);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title ?? (isVersion ? "Upload new version" : "Upload document")}</DialogTitle>
          <DialogDescription>
            Up to {DEFAULT_SETTINGS.maxUploadMb} MB · PDF, images, CSV, Excel or Word. Files are stored securely and only
            visible to signed-in team members.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div
            role="button"
            tabIndex={0}
            onClick={() => inputRef.current?.click()}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              pick(e.dataTransfer.files?.[0]);
            }}
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed px-4 py-6 text-center transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none",
              dragging ? "border-primary bg-accent" : "hover:bg-muted/50",
            )}
          >
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPT}
              className="hidden"
              onChange={(e) => {
                pick(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            {file ? (
              <div className="flex w-full items-center gap-3 text-left">
                <FileUp className="size-5 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{file.name}</div>
                  <div className="text-xs text-muted-foreground">{formatBytes(file.size)}</div>
                </div>
                {!uploading && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Remove file"
                    onClick={(e) => {
                      e.stopPropagation();
                      setFile(null);
                    }}
                  >
                    <X />
                  </Button>
                )}
              </div>
            ) : (
              <>
                <Upload className="mb-2 size-5 text-muted-foreground" />
                <p className="text-sm font-medium">Drop a file here or click to browse</p>
              </>
            )}
          </div>

          {!isVersion && (
            <FormField label="Document type" htmlFor="doc-type" required>
              <Select value={docType} onValueChange={(v) => setDocType(v as DocumentType)}>
                <SelectTrigger id="doc-type" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DOC_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {DOCUMENT_TYPE_LABEL[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
          )}

          {allowTradeLink && (
            <FormField label="Link to trade" htmlFor="doc-trade" help="Optional. Linked documents appear on the trade's Documents tab.">
              <Combobox
                id="doc-trade"
                options={(trades ?? []).map((t) => ({
                  value: t._id,
                  label: t.tradeNumber,
                  description: [t.counterpartyName, t.commodityName].filter(Boolean).join(" · "),
                }))}
                value={tradeId}
                onChange={(v) => setTradeId(v as Id<"trades"> | undefined)}
                onSearchChange={setTradeSearch}
                loading={trades === undefined}
                selectedLabel={selectedTrade?.tradeNumber}
                placeholder="No trade linked"
                searchPlaceholder="Search trade no., counterparty, commodity…"
              />
            </FormField>
          )}

          <FormField label="Notes" htmlFor="doc-notes">
            <Textarea id="doc-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} />
          </FormField>

          {uploading && (
            <div className="space-y-1">
              <Progress value={progress ?? 0} />
              <p className="text-xs text-muted-foreground tabular">Uploading… {progress}%</p>
            </div>
          )}
          {error && (
            <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={uploading}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!file || uploading}>
            {uploading ? <Loader2 className="animate-spin" /> : <Upload />}
            {uploading ? "Uploading…" : "Upload"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
