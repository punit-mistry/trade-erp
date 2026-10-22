"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { useRef, useState } from "react";
import { AlertTriangle, ExternalLink, FileSignature, GitBranch, Info, Printer, ShieldAlert } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Section } from "@/components/shared/section";
import { StatusBadge, TonePill } from "@/components/shared/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useViewer } from "@/hooks/use-viewer";
import { formatDateTime } from "@/lib/format";
import { CONTRACT_STATUS } from "@/lib/status";
import { ContractActions, GenerateDraftButton } from "./contract-actions";
import { toDocData, type ContractDocData } from "./contract-document";
import { ContractPreview } from "./contract-preview";
import { ContractVersions } from "./contract-versions";
import { printElement } from "./use-contract-pdf";

export const SIGNATURE_LABEL = {
  none: { label: "Not requested", tone: "muted" as const },
  awaiting: { label: "Awaiting signature", tone: "warning" as const },
  signed_copy_uploaded: { label: "Signed copy uploaded", tone: "success" as const },
};

/** Contract tab on the trade detail page: working version, actions, preview and history. */
export function TradeContractTab({ tradeId }: { tradeId: Id<"trades"> }) {
  const data = useQuery(api.contracts.listForTrade, { tradeId });
  const [viewRevision, setViewRevision] = useState(true);

  if (data === undefined) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24" />
        <Skeleton className="h-[480px]" />
      </div>
    );
  }

  if (data.versions.length === 0 || (!data.current && !data.pendingRevision)) {
    return <NoContractYet tradeId={tradeId} tradeStatus={data.trade.status} />;
  }

  const showingRevision = Boolean(data.pendingRevision && viewRevision);
  const contract = (showingRevision ? data.pendingRevision : data.current) ?? data.pendingRevision!;
  const docData = toDocData(contract);

  return (
    <div className="space-y-4" data-tour="contract-tab">
      {data.pendingRevision && data.current && (
        <Alert>
          <GitBranch />
          <AlertTitle>
            Revision v{data.pendingRevision.version} in progress — v{data.current.version} remains in force
          </AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-2">
            Reason: {data.pendingRevision.revisionReason ?? "—"}. A manager must issue the revision before it replaces the
            current contract.
            <Button size="xs" variant="outline" onClick={() => setViewRevision(!viewRevision)}>
              {viewRevision ? `View v${data.current.version} (in force)` : `View revision v${data.pendingRevision.version}`}
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <ContractWorkspace
        contract={contract}
        data={docData}
        tradeStatus={data.trade.status}
        stale={contract.status === "draft" ? data.workingDraftStale : false}
        hasPendingRevision={Boolean(data.pendingRevision)}
        templateName={contract.templateName}
      />

      {data.versions.length > 1 && (
        <Section title="Version history" description="Issued versions are frozen; compare any version with its predecessor.">
          <ContractVersions versions={data.versions} />
        </Section>
      )}
    </div>
  );
}

type WorkspaceContract = Parameters<typeof ContractActions>[0]["contract"] & {
  pdfUrl?: string | null;
  issuedAt?: number;
  issuedByName?: string;
  sentAt?: number;
  sentTo?: string;
  templateVersion: number;
  pdfGeneratedAt?: number;
};

/** Summary + warnings + actions + preview for one contract version (shared with /contracts/[id]). */
export function ContractWorkspace({
  contract,
  data,
  tradeStatus,
  stale,
  hasPendingRevision,
  templateName,
  showDetailLink = true,
}: {
  contract: WorkspaceContract;
  data: ContractDocData;
  tradeStatus?: Parameters<typeof ContractActions>[0]["tradeStatus"];
  stale?: boolean;
  hasPendingRevision?: boolean;
  templateName?: string;
  showDetailLink?: boolean;
}) {
  const previewRef = useRef<HTMLDivElement>(null);
  const sig = SIGNATURE_LABEL[contract.signatureStatus];
  return (
    <>
      <Section
        title={
          <span className="flex flex-wrap items-center gap-2">
            {contract.contractNumber}
            <span className="font-normal text-muted-foreground">v{contract.version}</span>
            <StatusBadge value={contract.status} map={CONTRACT_STATUS} />
            <TonePill tone={sig.tone}>{sig.label}</TonePill>
          </span>
        }
        description={
          <>
            Template {templateName ?? "—"} v{contract.templateVersion}
            {contract.issuedAt && ` · Issued ${formatDateTime(contract.issuedAt)}${contract.issuedByName ? ` by ${contract.issuedByName}` : ""}`}
            {contract.sentAt && ` · Sent ${formatDateTime(contract.sentAt)}${contract.sentTo ? ` to ${contract.sentTo}` : ""}`}
            {contract.pdfGeneratedAt && ` · PDF ${formatDateTime(contract.pdfGeneratedAt)}`}
          </>
        }
        actions={
          showDetailLink ? (
            <Button size="sm" variant="ghost" asChild>
              <Link href={`/contracts/${contract._id}`}>
                Open <ExternalLink />
              </Link>
            </Button>
          ) : undefined
        }
      >
        <div className="space-y-3">
          {contract.unknownVariables.length > 0 && (
            <Alert variant="destructive">
              <ShieldAlert />
              <AlertTitle>Unknown template variables</AlertTitle>
              <AlertDescription>
                {contract.unknownVariables.map((u) => `{{${u}}}`).join(", ")} — the template refers to variables that do not
                exist. Fix the template, then regenerate.
              </AlertDescription>
            </Alert>
          )}
          {contract.missingVariables.length > 0 && (
            <Alert>
              <AlertTriangle />
              <AlertTitle>Missing values</AlertTitle>
              <AlertDescription>
                {contract.missingVariables.join(", ")} — complete these on the trade, then regenerate the draft.
              </AlertDescription>
            </Alert>
          )}
          {stale && (
            <Alert>
              <Info />
              <AlertTitle>Trade data changed</AlertTitle>
              <AlertDescription>This draft no longer matches the trade. Regenerate it before issuing.</AlertDescription>
            </Alert>
          )}
          {contract.status === "pending_signature" && contract.signatureStatus !== "signed_copy_uploaded" && (
            <p className="text-xs text-muted-foreground">
              No e-signature integration is configured. Mark signature progress by uploading the counter-signed copy.
            </p>
          )}
          <ContractActions
            contract={contract}
            data={data}
            pdfUrl={contract.pdfUrl}
            tradeStatus={tradeStatus}
            stale={stale}
            hasPendingRevision={hasPendingRevision}
            previewRef={previewRef}
          />
        </div>
      </Section>
      <div className="rounded-lg border bg-muted/40 p-3 sm:p-6">
        <ContractPreview ref={previewRef} data={data} />
      </div>
    </>
  );
}

function NoContractYet({ tradeId, tradeStatus }: { tradeId: Id<"trades">; tradeStatus: string }) {
  const { can } = useViewer();
  const templates = useQuery(api.contractTemplates.list, { status: "active" });
  const [templateId, setTemplateId] = useState<Id<"contractTemplates"> | undefined>();
  const preview = useQuery(api.contracts.previewForTrade, { tradeId, templateId });
  const previewRef = useRef<HTMLDivElement>(null);
  const cancelled = tradeStatus === "cancelled";

  const docData: ContractDocData | null =
    preview?.rendered && preview.contractNumber
      ? {
          contractNumber: preview.contractNumber,
          version: 1,
          status: "preview",
          snapshot: {
            title: preview.rendered.title,
            header: preview.rendered.header,
            footer: preview.rendered.footer,
            intro: preview.rendered.intro,
            clauses: preview.rendered.clauses,
            variables: preview.rendered.variables,
          },
        }
      : null;

  return (
    <div className="space-y-4">
      <Section
        title="Contract"
        description="No contract has been generated for this trade yet. The preview below is built from the trade's saved data."
      >
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-full space-y-1.5 sm:w-80">
            <label className="text-[13px] font-medium">Contract template</label>
            <Select
              value={templateId ?? "__auto__"}
              onValueChange={(v) => setTemplateId(v === "__auto__" ? undefined : (v as Id<"contractTemplates">))}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__auto__">Trade / default template{preview?.template ? ` (${preview.template.name})` : ""}</SelectItem>
                {(templates ?? []).map((t) => (
                  <SelectItem key={t._id} value={t._id}>
                    {t.name} v{t.version}
                    {t.isDefault ? " · default" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {can("contract.prepare") && (
            <GenerateDraftButton tradeId={tradeId} templateId={templateId} disabled={cancelled || !preview?.template} />
          )}
          {docData && (
            <Button
              variant="ghost"
              onClick={() => printElement(previewRef.current, `${preview?.template?.name ?? "Contract"} preview`)}
            >
              <Printer /> Print preview
            </Button>
          )}
        </div>
        {cancelled && <p className="mt-3 text-sm text-destructive">This trade is cancelled — contracts cannot be prepared.</p>}
        {preview && !preview.template && (
          <p className="mt-3 text-sm text-muted-foreground">
            No active contract template exists.{" "}
            <Link href="/contract-templates" className="font-medium text-primary hover:underline">
              Set one up under Contract Templates
            </Link>
            .
          </p>
        )}
        {preview?.rendered && (preview.rendered.missing.length > 0 || preview.rendered.unknown.length > 0) && (
          <p className="mt-3 text-sm text-muted-foreground">
            <AlertTriangle className="mr-1 inline size-3.5 text-warning" />
            {preview.rendered.missing.length > 0 && `Missing on the trade: ${preview.rendered.missing.join(", ")}. `}
            {preview.rendered.unknown.length > 0 && `Unknown variables in template: ${preview.rendered.unknown.join(", ")}.`}
          </p>
        )}
      </Section>

      {preview === undefined ? (
        <Skeleton className="h-[480px]" />
      ) : docData ? (
        <div className="rounded-lg border bg-muted/40 p-3 sm:p-6">
          <div className="mb-3 flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <FileSignature className="size-3.5" /> Preview — not saved
          </div>
          <ContractPreview ref={previewRef} data={docData} />
        </div>
      ) : null}
    </div>
  );
}
