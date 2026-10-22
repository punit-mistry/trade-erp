"use client";

import { useMutation } from "convex/react";
import { useState } from "react";
import { BadgeCheck, FileCheck2, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { BlRecord } from "@/convex/blDocuments";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/shared/form-field";
import { getErrorMessage } from "@/lib/errors";
import { UploadDocumentDialog } from "@/features/documents/upload-document-dialog";

/**
 * Records a carrier-issued B/L: the carrier's B/L number, issue date and the
 * uploaded carrier document are all mandatory. Generating our own draft PDF
 * can never mark a B/L as issued.
 */
export function RecordIssuedDialog({
  bl,
  open,
  onOpenChange,
}: {
  bl: BlRecord;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const record = useMutation(api.blDocuments.recordCarrierIssued);
  const [number, setNumber] = useState(bl.externalBlNumber ?? "");
  const [issueDate, setIssueDate] = useState(bl.issueDate ?? "");
  const [issuePlace, setIssuePlace] = useState(bl.issuePlace ?? "");
  const [documentId, setDocumentId] = useState<Id<"documents"> | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const ready = number.trim() !== "" && /^\d{4}-\d{2}-\d{2}$/.test(issueDate) && documentId !== null;

  async function submit() {
    if (!ready || pending || !documentId) return;
    setPending(true);
    try {
      await record({
        id: bl._id,
        externalBlNumber: number.trim(),
        issueDate,
        issuePlace: issuePlace.trim() || undefined,
        documentId,
      });
      toast.success("Carrier-issued B/L recorded");
      onOpenChange(false);
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !pending && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Record carrier-issued B/L</DialogTitle>
          <DialogDescription>
            Use this only after the shipping line / carrier has issued the B/L. Upload the carrier’s document as evidence.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <FormField label="Carrier B/L number" htmlFor="ext-bl" required>
            <Input id="ext-bl" value={number} onChange={(e) => setNumber(e.target.value)} className="font-mono" />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Issue date" htmlFor="issue-date" required>
              <Input id="issue-date" type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
            </FormField>
            <FormField label="Place of issue" htmlFor="issue-place">
              <Input id="issue-place" value={issuePlace} onChange={(e) => setIssuePlace(e.target.value)} />
            </FormField>
          </div>
          <FormField label="Carrier B/L document" required help="PDF or image of the issued B/L as received from the carrier.">
            {documentId ? (
              <div className="flex items-center gap-2 rounded-md border bg-success/5 px-3 py-2 text-sm">
                <FileCheck2 className="size-4 text-success" /> Carrier document uploaded
                <Button variant="link" size="sm" className="ml-auto h-auto p-0" onClick={() => setUploadOpen(true)}>
                  Replace
                </Button>
              </div>
            ) : (
              <Button variant="outline" className="w-full" onClick={() => setUploadOpen(true)}>
                <Upload /> Upload carrier B/L
              </Button>
            )}
          </FormField>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!ready || pending}>
            {pending ? <Loader2 className="animate-spin" /> : <BadgeCheck />} Record as issued
          </Button>
        </DialogFooter>
        <UploadDocumentDialog
          open={uploadOpen}
          onOpenChange={setUploadOpen}
          title="Upload carrier-issued B/L"
          defaults={{ tradeId: bl.tradeId, blDocumentId: bl._id, contractId: bl.contractId, docType: "bl_issued" }}
          onUploaded={(id) => setDocumentId(id)}
        />
      </DialogContent>
    </Dialog>
  );
}
