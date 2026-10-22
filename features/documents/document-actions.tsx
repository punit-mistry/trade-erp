"use client";

import { useConvex, useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { Archive, ArchiveRestore, Check, Download, Loader2, MoreHorizontal, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { DocumentRow } from "@/convex/documents";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { StatusBadge } from "@/components/shared/status-badge";
import { useViewer } from "@/hooks/use-viewer";
import { getErrorMessage } from "@/lib/errors";
import { formatDateTime } from "@/lib/format";
import { REVIEW_STATUS } from "@/lib/status";
import { UploadDocumentDialog } from "./upload-document-dialog";

/** Returns a function that fetches an authorized download URL and opens it. */
export function useOpenDocument() {
  const convex = useConvex();
  const [pendingId, setPendingId] = useState<string | null>(null);
  async function open(id: Id<"documents">) {
    setPendingId(id);
    // Open the tab synchronously (popup blockers), then point it at the URL.
    const win = window.open("", "_blank");
    try {
      const url = await convex.query(api.documents.getDownloadUrl, { id });
      if (!url) throw new Error("The file is no longer available in storage.");
      if (win) win.location.href = url;
      else window.location.href = url;
    } catch (e) {
      win?.close();
      toast.error(getErrorMessage(e));
    } finally {
      setPendingId(null);
    }
  }
  return { open, pendingId };
}

export function DownloadButton({ id, label }: { id: Id<"documents">; label?: string }) {
  const { open, pendingId } = useOpenDocument();
  return (
    <Button
      variant="ghost"
      size={label ? "sm" : "icon-sm"}
      onClick={() => open(id)}
      disabled={pendingId === id}
      aria-label={label ?? "Download"}
      title="Download / open"
    >
      {pendingId === id ? <Loader2 className="animate-spin" /> : <Download />}
      {label}
    </Button>
  );
}

function VersionsPopover({ doc }: { doc: DocumentRow }) {
  const [open, setOpen] = useState(false);
  const versions = useQuery(api.documents.versions, open ? { groupKey: doc.groupKey } : "skip");
  const { open: openDoc } = useOpenDocument();
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="rounded px-1 text-xs text-muted-foreground tabular hover:bg-muted hover:text-foreground"
          title="Version history"
        >
          v{doc.version}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        <div className="border-b px-3 py-2 text-xs font-semibold">Version history</div>
        <div className="max-h-64 overflow-auto">
          {versions === undefined ? (
            <div className="flex items-center gap-2 px-3 py-4 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" /> Loading…
            </div>
          ) : (
            versions.map((ver) => (
              <button
                key={ver._id}
                type="button"
                onClick={() => openDoc(ver._id)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-muted"
              >
                <span className="w-7 font-medium tabular">v{ver.version}</span>
                <span className="min-w-0 flex-1 truncate">{ver.fileName}</span>
                <span className="shrink-0 text-muted-foreground">{formatDateTime(ver._creationTime)}</span>
                {ver.archived && <span className="text-muted-foreground">(archived)</span>}
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function DocumentVersion({ doc }: { doc: DocumentRow }) {
  if (doc.version === 1 && doc.isLatest) return <span className="text-xs text-muted-foreground tabular">v1</span>;
  return <VersionsPopover doc={doc} />;
}

/** Row action menu: download, new version, approve/reject, archive/restore. */
export function DocumentRowActions({ doc }: { doc: DocumentRow }) {
  const { can, viewer } = useViewer();
  const review = useMutation(api.documents.review);
  const archive = useMutation(api.documents.archive);
  const restore = useMutation(api.documents.restore);
  const { open, pendingId } = useOpenDocument();
  const [versionOpen, setVersionOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const canReview = can("document.review");
  const canArchive = can("document.archive");
  const canUpload = can("document.upload") && doc.source === "upload" && doc.isLatest && !doc.archived;
  void viewer;

  async function approve() {
    try {
      await review({ id: doc._id, status: "approved" });
      toast.success("Document approved");
    } catch (e) {
      toast.error(getErrorMessage(e));
    }
  }

  return (
    <div className="flex items-center justify-end gap-0.5">
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => open(doc._id)}
        disabled={pendingId === doc._id}
        aria-label={`Download ${doc.fileName}`}
        title="Download / open"
      >
        {pendingId === doc._id ? <Loader2 className="animate-spin" /> : <Download />}
      </Button>
      {(canUpload || canReview || canArchive) && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="More actions">
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            {canUpload && (
              <DropdownMenuItem onSelect={() => setVersionOpen(true)}>
                <Upload /> Upload new version
              </DropdownMenuItem>
            )}
            {canReview && doc.reviewStatus !== "approved" && !doc.archived && (
              <DropdownMenuItem onSelect={approve}>
                <Check /> Approve
              </DropdownMenuItem>
            )}
            {canReview && doc.reviewStatus !== "rejected" && !doc.archived && (
              <DropdownMenuItem onSelect={() => setRejectOpen(true)}>
                <X /> Reject / return
              </DropdownMenuItem>
            )}
            {canArchive && (
              <>
                <DropdownMenuSeparator />
                {doc.archived ? (
                  <DropdownMenuItem
                    onSelect={async () => {
                      try {
                        await restore({ id: doc._id });
                        toast.success("Document restored");
                      } catch (e) {
                        toast.error(getErrorMessage(e));
                      }
                    }}
                  >
                    <ArchiveRestore /> Restore
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem variant="destructive" onSelect={() => setArchiveOpen(true)}>
                    <Archive /> Archive
                  </DropdownMenuItem>
                )}
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {canUpload && (
        <UploadDocumentDialog
          open={versionOpen}
          onOpenChange={setVersionOpen}
          defaults={{
            groupKey: doc.groupKey,
            docType: doc.docType,
            tradeId: doc.tradeId,
            contractId: doc.contractId,
            counterpartyId: doc.counterpartyId,
            blDocumentId: doc.blDocumentId,
          }}
          title={`New version of ${doc.fileName}`}
        />
      )}
      <ConfirmDialog
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        title="Reject document"
        description={`Return “${doc.fileName}” for correction. The uploader will see the reason in the activity history.`}
        confirmLabel="Reject"
        destructive
        reason={{ label: "Reason", required: true, placeholder: "e.g. Wrong consignee on page 2" }}
        successMessage="Document rejected"
        onConfirm={(note) => review({ id: doc._id, status: "rejected", note })}
      />
      <ConfirmDialog
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        title="Archive document?"
        description={`“${doc.fileName}” will be hidden from lists. Managers can restore it later from the Document Centre.`}
        confirmLabel="Archive"
        destructive
        successMessage="Document archived"
        onConfirm={() => archive({ id: doc._id })}
      />
    </div>
  );
}

export function ReviewBadge({ doc }: { doc: Pick<DocumentRow, "reviewStatus" | "archived"> }) {
  if (doc.archived) return <span className="text-xs text-muted-foreground">Archived</span>;
  return <StatusBadge value={doc.reviewStatus} map={REVIEW_STATUS} />;
}
