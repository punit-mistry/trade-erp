"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import {
  AlertTriangle,
  BadgeCheck,
  Eye,
  FilePlus2,
  FileDown,
  GitBranch,
  Info,
  Loader2,
  Ship,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { BlRecord } from "@/convex/blDocuments";
import type { BlStatus } from "@/convex/lib/validators";
import { BL_TRANSITIONS } from "@/convex/lib/workflow";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { PageSkeleton } from "@/components/shared/states";
import { useViewer } from "@/hooks/use-viewer";
import { getErrorMessage } from "@/lib/errors";
import { formatDateTime } from "@/lib/format";
import { BL_STATUS } from "@/lib/status";
import { cn } from "@/lib/utils";
import { DownloadButton } from "@/features/documents/document-actions";
import { DispatchChecklist } from "@/features/dispatch/dispatch-checklist";
import { BlForm } from "./bl-form";
import { BlPreview } from "./bl-preview";
import { blPrintData } from "./bl-print-data";
import { RecordIssuedDialog } from "./record-issued-dialog";

function IssuanceBanner({ bl }: { bl: BlRecord }) {
  if (bl.status === "issued") {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-success/30 bg-success/5 px-3 py-2 text-sm" data-tour="bl-status-banner">
        <BadgeCheck className="mt-0.5 size-4 shrink-0 text-success" />
        <div>
          <span className="font-medium">Carrier-issued B/L recorded</span> — carrier B/L no.{" "}
          <span className="font-mono">{bl.externalBlNumber}</span>, issued {bl.issueDate}
          {bl.issuedRecordedByName && ` · recorded by ${bl.issuedRecordedByName} on ${formatDateTime(bl.issuedRecordedAt)}`}.
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/5 px-3 py-2 text-sm" data-tour="bl-status-banner">
      <Info className="mt-0.5 size-4 shrink-0 text-warning" />
      <div>
        <span className="font-medium">Internal draft — not a carrier-issued B/L.</span>{" "}
        <span className="text-muted-foreground">
          These are our shipping details for review and instructions. The B/L becomes “Carrier Issued” only after the carrier’s
          B/L number and document are recorded.
        </span>
      </div>
    </div>
  );
}

function StatusActions({ bl }: { bl: BlRecord }) {
  const { can } = useViewer();
  const transition = useMutation(api.blDocuments.transition);
  const [pendingTo, setPendingTo] = useState<BlStatus | null>(null);
  const [returnOpen, setReturnOpen] = useState(false);
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [issueOpen, setIssueOpen] = useState(false);
  if (!bl.isCurrent) return null;
  const options = BL_TRANSITIONS[bl.status].filter((t) => can(t.permission));

  async function go(to: BlStatus) {
    setPendingTo(to);
    try {
      await transition({ id: bl._id, to });
      toast.success(`B/L ${BL_STATUS[to].label.toLowerCase()}`);
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setPendingTo(null);
    }
  }

  return (
    <>
      {options.map((t) => {
        if (t.to === "issued") {
          return (
            <Button key={t.to} size="sm" onClick={() => setIssueOpen(true)}>
              <BadgeCheck /> {t.label}
            </Button>
          );
        }
        if (t.to === "draft" && bl.status === "under_review") {
          return (
            <Button key={t.to} size="sm" variant="outline" onClick={() => setReturnOpen(true)}>
              {t.label}
            </Button>
          );
        }
        if (t.to === "verified") {
          return (
            <Button key={t.to} size="sm" onClick={() => setVerifyOpen(true)}>
              {t.label}
            </Button>
          );
        }
        return (
          <Button
            key={t.to}
            size="sm"
            variant={t.to === "draft" ? "outline" : "default"}
            onClick={() => go(t.to)}
            disabled={pendingTo !== null}
          >
            {pendingTo === t.to && <Loader2 className="animate-spin" />}
            {t.label}
          </Button>
        );
      })}
      <ConfirmDialog
        open={returnOpen}
        onOpenChange={setReturnOpen}
        title="Return B/L for correction"
        reason={{ label: "What needs correcting?", required: true }}
        confirmLabel="Return to Draft"
        successMessage="B/L returned for correction"
        onConfirm={(note) => transition({ id: bl._id, to: "draft", note })}
      />
      <ConfirmDialog
        open={verifyOpen}
        onOpenChange={setVerifyOpen}
        title="Verify B/L details"
        description="Confirm that the shipper, consignee, notify party, cargo and port details have been checked. This is an internal verification — it does not issue the B/L."
        reason={{ label: "Review note (optional)" }}
        confirmLabel="Mark Verified"
        successMessage="B/L verified"
        onConfirm={(note) => transition({ id: bl._id, to: "verified", note: note || undefined })}
      />
      {issueOpen && <RecordIssuedDialog bl={bl} open={issueOpen} onOpenChange={setIssueOpen} />}
    </>
  );
}

function GeneratePdfButton({ bl }: { bl: BlRecord }) {
  const generateUploadUrl = useMutation(api.documents.generateUploadUrl);
  const attach = useMutation(api.blDocuments.attachDraftPdf);
  const [pending, setPending] = useState(false);

  async function generate() {
    if (pending) return;
    setPending(true);
    try {
      const { generateBlPdf } = await import("./bl-pdf");
      const blob = await generateBlPdf(blPrintData(bl));
      const url = await generateUploadUrl();
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/pdf" }, body: blob });
      if (!res.ok) throw new Error(`Upload failed (${res.status}).`);
      const { storageId } = (await res.json()) as { storageId: Id<"_storage"> };
      await attach({ id: bl._id, storageId });
      toast.success("Draft B/L PDF generated and saved to documents");
    } catch (e) {
      toast.error(getErrorMessage(e, "Unable to generate the PDF."));
    } finally {
      setPending(false);
    }
  }

  return (
    <Button size="sm" variant="outline" onClick={generate} disabled={pending}>
      {pending ? <Loader2 className="animate-spin" /> : <FileDown />}
      {bl.status === "issued" ? "Generate Record PDF" : "Generate Draft PDF"}
    </Button>
  );
}

export function TradeBlTab({ tradeId }: { tradeId: Id<"trades"> }) {
  const data = useQuery(api.blDocuments.forTrade, { tradeId });
  const trade = useQuery(api.trades.get, { id: tradeId });
  const { can } = useViewer();
  const createFromTrade = useMutation(api.blDocuments.createFromTrade);
  const createRevision = useMutation(api.blDocuments.createRevision);
  const [creating, setCreating] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [revisionOpen, setRevisionOpen] = useState(false);

  if (data === undefined) return <PageSkeleton />;
  const tradeStatus = trade?.trade.status;
  const bl = data.current;

  async function create() {
    setCreating(true);
    try {
      await createFromTrade({ tradeId });
      toast.success("B/L created from trade data");
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-6">
      {!bl ? (
        <div className="rounded-lg border bg-card shadow-xs">
          <EmptyState
            icon={Ship}
            title="No B/L prepared yet"
            description={
              tradeStatus === "cancelled"
                ? "This trade is cancelled, so no B/L can be prepared."
                : "Create the B/L from this trade: parties, ports, commodity, quantity, packing and freight terms are copied from the trade and can be adjusted here without changing the trade."
            }
            action={
              can("bl.prepare") && tradeStatus !== "cancelled" ? (
                <Button onClick={create} disabled={creating}>
                  {creating ? <Loader2 className="animate-spin" /> : <FilePlus2 />} Create B/L from Trade
                </Button>
              ) : undefined
            }
          />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-mono text-sm font-semibold">{bl.blRecordNumber}</h2>
              <span className="text-xs text-muted-foreground">v{bl.version}</span>
              <StatusBadge value={bl.status} map={BL_STATUS} />
              {bl.reviewNote && bl.status === "draft" && (
                <span className="inline-flex items-center gap-1 text-xs text-warning">
                  <AlertTriangle className="size-3.5" /> Returned: {bl.reviewNote}
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => setPreviewOpen(true)}>
                <Eye /> Preview
              </Button>
              {can("bl.prepare") && <GeneratePdfButton bl={bl} />}
              {bl.draftPdfDocument && <DownloadButton id={bl.draftPdfDocument._id} label="Latest PDF" />}
              {can("bl.prepare") && bl.status !== "draft" && (
                <Button size="sm" variant="outline" onClick={() => setRevisionOpen(true)}>
                  <GitBranch /> Create Revision
                </Button>
              )}
              <StatusActions bl={bl} />
            </div>
          </div>

          <IssuanceBanner bl={bl} />

          <div className="grid gap-x-6 gap-y-1 text-xs text-muted-foreground sm:grid-cols-2 lg:grid-cols-4">
            <div>Created by {bl.createdByName ?? "—"}</div>
            {bl.preparedByName && <div>Prepared by {bl.preparedByName} · {formatDateTime(bl.preparedAt)}</div>}
            {bl.reviewedByName && <div>Reviewed by {bl.reviewedByName} · {formatDateTime(bl.reviewedAt)}</div>}
            {bl.verifiedByName && <div>Verified by {bl.verifiedByName} · {formatDateTime(bl.verifiedAt)}</div>}
            {bl.carrierDocument && (
              <div className="flex items-center gap-1">
                Carrier document: <DownloadButton id={bl.carrierDocument._id} label={bl.carrierDocument.fileName} />
              </div>
            )}
          </div>

          <BlForm
            key={bl._id}
            bl={bl}
            editable={can("bl.prepare") && (bl.status === "draft" || bl.status === "prepared")}
          />

          {data.versions.length > 1 && (
            <div className="rounded-lg border bg-card shadow-xs">
              <div className="border-b px-4 py-2.5 text-sm font-semibold">Revisions</div>
              <ul className="divide-y text-sm">
                {data.versions.map((ver) => (
                  <li key={ver._id} className={cn("flex items-center gap-3 px-4 py-2", ver.isCurrent && "bg-accent/40")}>
                    <span className="w-8 font-medium tabular">v{ver.version}</span>
                    <StatusBadge value={ver.status} map={BL_STATUS} />
                    <span className="font-mono text-xs">{ver.externalBlNumber ?? ""}</span>
                    <span className="ml-auto text-xs text-muted-foreground">{formatDateTime(ver.updatedAt)}</span>
                    {ver.isCurrent && <span className="text-xs font-medium">current</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
            <DialogContent className="max-h-[90vh] overflow-auto sm:max-w-4xl">
              <DialogHeader>
                <DialogTitle>B/L preview — saved data</DialogTitle>
              </DialogHeader>
              <BlPreview data={blPrintData(bl)} />
            </DialogContent>
          </Dialog>
          <ConfirmDialog
            open={revisionOpen}
            onOpenChange={setRevisionOpen}
            title="Create a B/L revision?"
            description={
              bl.status === "issued"
                ? "The carrier-issued version stays on record as issued. A new editable draft version is created for the amendment."
                : "The current version will be marked superseded and a new editable draft version is created."
            }
            reason={{ label: "Reason for revision", required: true, placeholder: "e.g. Consignee changed to bank order" }}
            confirmLabel="Create Revision"
            successMessage="Revision created"
            onConfirm={(reason) => createRevision({ id: bl._id, reason })}
          />
        </div>
      )}

      {tradeStatus !== "cancelled" && <DispatchChecklist tradeId={tradeId} />}
    </div>
  );
}
