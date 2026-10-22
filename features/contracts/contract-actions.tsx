"use client";

import { useMutation } from "convex/react";
import { useState } from "react";
import {
  Ban,
  CheckCircle2,
  Download,
  FilePen,
  FileSignature,
  FileUp,
  GitBranch,
  Loader2,
  Printer,
  RefreshCw,
  Save,
  Send,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { ContractStatus, TradeStatus } from "@/convex/lib/validators";
import { CONTRACT_TRANSITIONS, ISSUED_CONTRACT_STATUSES } from "@/convex/lib/workflow";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { UploadDocumentDialog } from "@/features/documents/upload-document-dialog";
import { useViewer } from "@/hooks/use-viewer";
import { getErrorMessage } from "@/lib/errors";
import type { ContractDocData } from "./contract-document";
import { printElement, useContractPdf } from "./use-contract-pdf";

export type ActionContract = {
  _id: Id<"contracts">;
  tradeId: Id<"trades">;
  contractNumber: string;
  version: number;
  status: ContractStatus;
  isCurrent: boolean;
  revisionOf?: Id<"contracts">;
  signatureStatus: "none" | "awaiting" | "signed_copy_uploaded";
  unknownVariables: string[];
  missingVariables: string[];
  pdfStorageId?: Id<"_storage">;
  snapshot: ContractDocData["snapshot"];
};

const REVISABLE: ContractStatus[] = ["generated", "sent", "pending_signature", "rate_fixed"];

const TRANSITION_ICON: Partial<Record<ContractStatus, typeof Send>> = {
  sent: Send,
  pending_signature: FileSignature,
  rate_fixed: CheckCircle2,
  closed: CheckCircle2,
  cancelled: Ban,
};

/** All lifecycle + document actions for one contract version, filtered by status and role. */
export function ContractActions({
  contract,
  data,
  pdfUrl,
  tradeStatus,
  stale,
  hasPendingRevision,
  previewRef,
}: {
  contract: ActionContract;
  data: ContractDocData;
  pdfUrl?: string | null;
  tradeStatus?: TradeStatus;
  stale?: boolean;
  hasPendingRevision?: boolean;
  previewRef?: React.RefObject<HTMLDivElement | null>;
}) {
  const { can } = useViewer();
  const generateDraft = useMutation(api.contracts.generateDraft);
  const issue = useMutation(api.contracts.issue);
  const transition = useMutation(api.contracts.transition);
  const createRevision = useMutation(api.contracts.createRevision);
  const attachSignedCopy = useMutation(api.contracts.attachSignedCopy);
  const pdf = useContractPdf();
  const [regenerating, setRegenerating] = useState(false);

  const isDraft = contract.status === "draft";
  const isIssued = ISSUED_CONTRACT_STATUSES.includes(contract.status);
  const issueBlocker =
    tradeStatus !== "confirmed"
      ? "Confirm the trade before issuing its contract."
      : contract.unknownVariables.length > 0
        ? "The template uses unknown variables — fix the template and regenerate."
        : contract.missingVariables.length > 0
          ? "Some values are missing — complete the trade and regenerate."
          : stale
            ? "The trade changed since this draft was generated — regenerate first."
            : null;

  async function regenerate() {
    if (regenerating) return;
    setRegenerating(true);
    try {
      await generateDraft({ tradeId: contract.tradeId });
      toast.success("Draft regenerated from the current trade data.");
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setRegenerating(false);
    }
  }

  const transitions = CONTRACT_TRANSITIONS[contract.status].filter(
    (t) => t.to !== "generated" && can(t.permission) && (contract.isCurrent || t.to === "cancelled"),
  );

  return (
    <div className="flex flex-wrap items-center gap-2">
      {isDraft && can("contract.prepare") && (
        <Button variant="outline" size="sm" onClick={regenerate} disabled={regenerating}>
          {regenerating ? <Loader2 className="animate-spin" /> : <RefreshCw />}
          Regenerate Draft
        </Button>
      )}

      {isDraft && can("contract.issue") && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span tabIndex={issueBlocker ? 0 : -1}>
              <ConfirmDialog
                title={contract.revisionOf ? `Approve & issue revision v${contract.version}?` : `Issue ${contract.contractNumber}?`}
                description={
                  <>
                    Issuing freezes this version exactly as shown. Later changes to the trade will not alter it; corrections
                    require a new revision.
                    {contract.revisionOf && " The previously issued version will be marked as superseded."}
                  </>
                }
                confirmLabel="Finalise & Issue"
                successMessage="Contract issued."
                onConfirm={() => issue({ contractId: contract._id })}
                trigger={
                  <Button size="sm" disabled={Boolean(issueBlocker)}>
                    <FileSignature /> Finalise &amp; Issue
                  </Button>
                }
              />
            </span>
          </TooltipTrigger>
          {issueBlocker && <TooltipContent>{issueBlocker}</TooltipContent>}
        </Tooltip>
      )}

      {transitions.map((t) => {
        const Icon = TRANSITION_ICON[t.to] ?? CheckCircle2;
        const destructive = t.to === "cancelled";
        return (
          <ConfirmDialog
            key={t.to}
            title={`${t.label} — ${contract.contractNumber} v${contract.version}`}
            description={
              destructive
                ? "Cancelling a contract cannot be undone. The trade itself is not cancelled."
                : t.to === "pending_signature"
                  ? "Marks the contract as awaiting the counterparty's signature. Upload the signed copy when it is received."
                  : undefined
            }
            confirmLabel={t.label}
            destructive={destructive}
            reason={
              t.to === "sent"
                ? { label: "Sent to (name or email)", placeholder: "e.g. procurement@buyer.com" }
                : { label: destructive ? "Reason" : "Note (optional)", required: destructive }
            }
            successMessage={`${t.label} — done.`}
            onConfirm={(text) =>
              transition({
                contractId: contract._id,
                to: t.to,
                sentTo: t.to === "sent" ? text || undefined : undefined,
                note: t.to === "sent" ? undefined : text || undefined,
              })
            }
            trigger={
              <Button size="sm" variant={destructive ? "destructive" : "outline"}>
                <Icon /> {t.label}
              </Button>
            }
          />
        );
      })}

      {contract.isCurrent && contract.status === "cancelled" && can("contract.prepare") && tradeStatus !== "cancelled" && (
        <GenerateDraftButton tradeId={contract.tradeId} />
      )}

      {contract.isCurrent && REVISABLE.includes(contract.status) && !hasPendingRevision && can("contract.prepare") && (
        <ConfirmDialog
          title="Create a revision?"
          description={`A new draft version (v${contract.version + 1}) is created from the current trade data. v${contract.version} stays in force and unchanged until a manager issues the revision.`}
          confirmLabel="Create Revision"
          reason={{ label: "Reason for revision", required: true, placeholder: "e.g. Buyer requested shipment period change" }}
          successMessage="Revision draft created."
          onConfirm={(reason) => createRevision({ contractId: contract._id, reason })}
          trigger={
            <Button size="sm" variant="outline">
              <GitBranch /> Create Revision
            </Button>
          }
        />
      )}

      {isIssued && contract.isCurrent && can("contract.prepare") && (
        <UploadDocumentDialog
          title="Upload signed contract copy"
          defaults={{ tradeId: contract.tradeId, contractId: contract._id, docType: "signed_contract" }}
          onUploaded={async (documentId) => {
            try {
              await attachSignedCopy({ contractId: contract._id, documentId });
              toast.success("Signed copy attached.");
            } catch (e) {
              toast.error(getErrorMessage(e));
            }
          }}
          trigger={
            <Button size="sm" variant="outline">
              <FileUp /> {contract.signatureStatus === "signed_copy_uploaded" ? "Replace Signed Copy" : "Upload Signed Copy"}
            </Button>
          }
        />
      )}

      <div className="ml-auto flex flex-wrap items-center gap-2">
        {can("contract.prepare") && (isDraft || !contract.pdfStorageId) && contract.status !== "superseded" && (
          <Button size="sm" variant="outline" onClick={() => pdf.saveToStorage(contract._id, data)} disabled={pdf.busy !== null}>
            {pdf.busy === "save" ? <Loader2 className="animate-spin" /> : <Save />}
            {contract.pdfStorageId ? "Regenerate PDF" : "Generate PDF"}
          </Button>
        )}
        {pdfUrl ? (
          <Button size="sm" variant="outline" asChild>
            <a href={pdfUrl} target="_blank" rel="noreferrer">
              <Download /> Download PDF
            </a>
          </Button>
        ) : (
          <Button size="sm" variant="outline" onClick={() => pdf.downloadLocal(data)} disabled={pdf.busy !== null}>
            {pdf.busy === "download" ? <Loader2 className="animate-spin" /> : <Download />}
            Download PDF
          </Button>
        )}
        {previewRef && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => printElement(previewRef.current, `${contract.contractNumber} v${contract.version}`)}
          >
            <Printer /> Print
          </Button>
        )}
      </div>
    </div>
  );
}

/** "Generate Draft Contract" for a trade without a contract yet. */
export function GenerateDraftButton({
  tradeId,
  templateId,
  disabled,
}: {
  tradeId: Id<"trades">;
  templateId?: Id<"contractTemplates">;
  disabled?: boolean;
}) {
  const generateDraft = useMutation(api.contracts.generateDraft);
  const [pending, setPending] = useState(false);
  return (
    <Button
      onClick={async () => {
        if (pending) return;
        setPending(true);
        try {
          await generateDraft({ tradeId, templateId });
          toast.success("Draft contract generated.");
        } catch (e) {
          toast.error(getErrorMessage(e));
        } finally {
          setPending(false);
        }
      }}
      disabled={pending || disabled}
    >
      {pending ? <Loader2 className="animate-spin" /> : <FilePen />}
      Generate Draft Contract
    </Button>
  );
}
