"use client";

import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { AlertCircle, AlertTriangle, ArrowRight, Copy, Lock, MoreHorizontal, Pencil, ScrollText } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { computeTradeValue, valueDiscrepancy } from "@/convex/lib/money";
import { EDITABLE_TRADE_STATUSES } from "@/convex/lib/workflow";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/shared/page-header";
import { DetailList, Section } from "@/components/shared/section";
import { PageSkeleton } from "@/components/shared/states";
import { StatusBadge } from "@/components/shared/status-badge";
import { useViewer } from "@/hooks/use-viewer";
import { formatDate, formatDateTime, formatMoney, formatNumber, formatPrice, formatQuantity } from "@/lib/format";
import { DIRECTION_LABEL, TRADE_STATUS } from "@/lib/status";
import { ActivityTimeline } from "@/features/activity/activity-timeline";
import { TradeBlTab } from "@/features/bl/trade-bl-tab";
import { TradeContractTab } from "@/features/contracts/trade-contract-tab";
import { TradeDocumentsTab } from "@/features/documents/trade-documents-tab";
import { DirectionPill } from "./direction-pill";
import { CloneTradeDialog, CreateTemplateDialog, TradeStatusActions } from "./trade-actions";
import { ValueOverrideDialog } from "./value-override-dialog";

const TABS = ["overview", "terms", "contract", "bl", "documents", "activity"] as const;
type Tab = (typeof TABS)[number];

const TOLERANCE_LABEL = { buyer: "Buyer's option", seller: "Seller's option", both: "Either party" } as const;

export function TradeDetail({ id }: { id: Id<"trades"> }) {
  const data = useQuery(api.trades.get, { id });
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { can } = useViewer();
  const [templateOpen, setTemplateOpen] = useState(false);

  const rawTab = params.get("tab");
  const tab: Tab = (TABS as readonly string[]).includes(rawTab ?? "") ? (rawTab as Tab) : "overview";
  const setTab = (t: string) => router.replace(t === "overview" ? pathname : `${pathname}?tab=${t}`, { scroll: false });

  if (!data) return <PageSkeleton />;
  const { trade, company, counterparty, commodity, nextAction, issues } = data;
  const editable = EDITABLE_TRADE_STATUSES.includes(trade.status);
  const canEdit = editable && (can("trade.editAny") || (can("trade.editDraft") && trade.status === "draft"));
  const blocking = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning" && i.field !== "contractTemplateId");

  return (
    <>
      <PageHeader
        back={{ href: "/physical-trades", label: "Physical Trades" }}
        title={<span className="font-mono">{trade.tradeNumber}</span>}
        meta={
          <>
            <StatusBadge value={trade.status} map={TRADE_STATUS} />
            <DirectionPill direction={trade.direction} />
          </>
        }
        description={
          <>
            Created by {data.createdByName} on {formatDateTime(trade._creationTime)}
            {data.updatedByName && ` · Last updated by ${data.updatedByName}, ${formatDateTime(trade.updatedAt)}`}
          </>
        }
        actions={
          <>
            <TradeStatusActions tradeId={trade._id} tradeNumber={trade.tradeNumber} status={trade.status} blockingCount={blocking.length} />
            {canEdit && (
              <Button variant="outline" size="sm" asChild>
                <Link href={`/physical-trades/${trade._id}/edit`}>
                  <Pencil /> Edit
                </Link>
              </Button>
            )}
            {can("trade.create") && (
              <CloneTradeDialog
                tradeId={trade._id}
                tradeNumber={trade.tradeNumber}
                trigger={
                  <Button variant="outline" size="sm">
                    <Copy /> Clone Trade
                  </Button>
                }
              />
            )}
            {can("tradeTemplate.manage") && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-sm" aria-label="More actions">
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => setTemplateOpen(true)}>
                    <ScrollText /> Create Template from Trade
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </>
        }
      />
      <CreateTemplateDialog tradeId={trade._id} tradeNumber={trade.tradeNumber} open={templateOpen} onOpenChange={setTemplateOpen} />

      {/* Key facts */}
      <div className="mb-4 grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border shadow-xs md:grid-cols-3 xl:grid-cols-6">
        <Fact label="Company" value={company?.name} />
        <Fact
          label={trade.direction === "sales" ? "Buyer" : trade.direction === "purchase" ? "Seller" : "Counterparty"}
          value={
            counterparty ? (
              <Link href={`/suppliers/${counterparty._id}`} className="text-primary hover:underline">
                {counterparty.name}
              </Link>
            ) : undefined
          }
          sub={counterparty?.country}
        />
        <Fact label="Commodity" value={commodity?.name} sub={commodity?.code} />
        <Fact label="Quantity" value={formatQuantity(trade.quantity, trade.uom)} sub={trade.incoterm} />
        <Fact
          label="Trade value"
          value={formatMoney(trade.totalValue, trade.currency)}
          sub={trade.pricePerUom !== undefined ? `${formatPrice(trade.pricePerUom, trade.currency)} / ${trade.uom ?? "unit"}` : trade.priceNeedsValidation ? "Unit price to validate" : undefined}
        />
        <Fact label="Trade date" value={formatDate(trade.tradeDate)} sub={trade.shipmentPeriod ? `Ship ${trade.shipmentPeriod}` : undefined} />
      </div>

      {nextAction && (
        <div className="mb-4 flex flex-col gap-2 rounded-lg border border-primary/25 bg-accent/60 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-xs font-semibold tracking-wide text-primary uppercase">Next step</div>
            <div className="text-sm font-medium">{nextAction.label}</div>
            <div className="text-xs text-muted-foreground">{nextAction.description}</div>
          </div>
          {(nextAction.href || nextAction.tab) && (
            <Button
              size="sm"
              onClick={() => (nextAction.href ? router.push(nextAction.href) : setTab(nextAction.tab!))}
              disabled={Boolean(nextAction.href?.endsWith("/edit") || nextAction.href?.includes("/edit?")) && !canEdit}
            >
              {nextAction.label} <ArrowRight />
            </Button>
          )}
        </div>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <div className="overflow-x-auto">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="terms">Commercial Terms</TabsTrigger>
            <TabsTrigger value="contract">Contract</TabsTrigger>
            <TabsTrigger value="bl">B/L & Dispatch</TabsTrigger>
            <TabsTrigger value="documents">Documents</TabsTrigger>
            <TabsTrigger value="activity">Activity History</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="overview" className="mt-4">
          <OverviewTab data={data} blockingMessages={blocking.map((b) => b.message)} warnings={warnings.map((w) => w.message)} />
        </TabsContent>
        <TabsContent value="terms" className="mt-4">
          <TermsTab trade={trade} />
        </TabsContent>
        <TabsContent value="contract" className="mt-4">
          <TradeContractTab tradeId={trade._id} />
        </TabsContent>
        <TabsContent value="bl" className="mt-4">
          <TradeBlTab tradeId={trade._id} />
        </TabsContent>
        <TabsContent value="documents" className="mt-4">
          <TradeDocumentsTab tradeId={trade._id} />
        </TabsContent>
        <TabsContent value="activity" className="mt-4">
          <Section title="Activity history" description="Every change, approval and status transition on this trade.">
            <ActivityTimeline tradeId={trade._id} />
          </Section>
        </TabsContent>
      </Tabs>
    </>
  );
}

function Fact({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="min-w-0 bg-card px-3 py-2.5">
      <div className="text-[11px] font-medium text-muted-foreground">{label}</div>
      <div className="truncate text-sm font-semibold tabular">{value ?? <span className="text-muted-foreground">—</span>}</div>
      {sub && <div className="truncate text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

type TradeData = FunctionReturnType<typeof api.trades.get>;

function OverviewTab({ data, blockingMessages, warnings }: { data: TradeData; blockingMessages: string[]; warnings: string[] }) {
  const { trade, company, counterparty, commodity, workflow } = data;
  const { can } = useViewer();
  const diff = valueDiscrepancy(trade.quantity, trade.pricePerUom, trade.totalValue);
  const editable = EDITABLE_TRADE_STATUSES.includes(trade.status);
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-4">
        {blockingMessages.length > 0 && editable && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm" role="alert">
            <div className="mb-1 flex items-center gap-2 font-medium text-destructive">
              <AlertCircle className="size-4" /> Incomplete — cannot be submitted or confirmed yet
            </div>
            <ul className="list-disc space-y-0.5 pl-6">
              {blockingMessages.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </div>
        )}
        {(warnings.length > 0 || diff !== null) && (
          <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
            <ul className="space-y-1">
              {warnings.map((w) => (
                <li key={w} className="flex gap-2">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" /> {w}
                </li>
              ))}
            </ul>
            {(trade.valueOverridden || trade.priceNeedsValidation) && editable && can("trade.valueOverride") && (
              <ValueOverrideDialog
                tradeId={trade._id}
                currency={trade.currency}
                currentValue={trade.totalValue}
                computedValue={computeTradeValue(trade.quantity, trade.pricePerUom)}
                trigger={
                  <Button variant="outline" size="sm" className="mt-2">
                    <Pencil /> Validate / adjust value
                  </Button>
                }
              />
            )}
          </div>
        )}
        <Section title="Trade identity & parties">
          <DetailList
            items={[
              { label: "Trade number", value: trade.tradeNumber, mono: true },
              { label: "Direction", value: trade.direction ? DIRECTION_LABEL[trade.direction] : undefined },
              { label: "Trade date", value: formatDate(trade.tradeDate) },
              { label: "Internal company", value: company?.name },
              {
                label: trade.direction === "sales" ? "Buyer" : "Seller / supplier",
                value: counterparty ? (
                  <Link href={`/suppliers/${counterparty._id}`} className="text-primary hover:underline">
                    {counterparty.name}
                  </Link>
                ) : undefined,
              },
              { label: "Counterparty country", value: counterparty?.country },
              { label: "Commodity", value: commodity ? `${commodity.name} (${commodity.code})` : undefined },
              { label: "HS code", value: commodity?.hsCode },
              { label: "Source reference", value: trade.sourceReference },
            ]}
          />
        </Section>
        <Section title="Quantity & price">
          <DetailList
            columns={4}
            items={[
              { label: "Quantity", value: formatQuantity(trade.quantity, trade.uom) },
              { label: "Price type", value: trade.priceType },
              {
                label: "Price per UOM",
                value: trade.pricePerUom !== undefined ? formatPrice(trade.pricePerUom, trade.currency) : trade.priceNeedsValidation ? "Unavailable — needs validation" : undefined,
              },
              { label: "Total value", value: formatMoney(trade.totalValue, trade.currency) },
              ...(trade.valueOverridden ? [{ label: "Value override reason", value: trade.valueOverrideReason, span: 3 as const }] : []),
            ]}
          />
        </Section>
      </div>
      <div className="space-y-4">
        <Section title="Workflow">
          <ol className="space-y-3 text-sm">
            <WorkflowStep label="Created" by={data.createdByName} at={trade._creationTime} done />
            {trade.clonedFromId && (
              <li className="text-xs text-muted-foreground">
                Copied from{" "}
                <Link href={`/physical-trades/${trade.clonedFromId}`} className="font-mono text-primary hover:underline">
                  {trade.clonedFromNumber}
                </Link>
              </li>
            )}
            <WorkflowStep label="Submitted for review" by={workflow.submittedByName} at={trade.submittedAt} done={Boolean(trade.submittedAt)} />
            {trade.status === "draft" && trade.reviewNote && (
              <li className="rounded-md bg-warning/10 px-2 py-1 text-xs">Returned for correction: {trade.reviewNote}</li>
            )}
            <WorkflowStep label="Confirmed" by={workflow.confirmedByName} at={trade.confirmedAt} done={Boolean(trade.confirmedAt)} />
            {trade.status === "cancelled" ? (
              <WorkflowStep label="Cancelled" by={workflow.cancelledByName} at={trade.cancelledAt} done note={trade.cancelReason} danger />
            ) : (
              <WorkflowStep label="Closed" by={workflow.closedByName} at={trade.closedAt} done={Boolean(trade.closedAt)} />
            )}
          </ol>
        </Section>
        {trade.internalNotes && (
          <Section
            title={
              <span className="inline-flex items-center gap-1.5">
                <Lock className="size-3.5" /> Internal notes
              </span>
            }
            description="Team only — never printed on external documents."
          >
            <p className="text-sm whitespace-pre-line">{trade.internalNotes}</p>
          </Section>
        )}
      </div>
    </div>
  );
}

function WorkflowStep({
  label,
  by,
  at,
  done,
  note,
  danger,
}: {
  label: string;
  by?: string | null;
  at?: number;
  done: boolean;
  note?: string;
  danger?: boolean;
}) {
  return (
    <li className="flex gap-2.5">
      <span
        className={`mt-1 size-2.5 shrink-0 rounded-full ${done ? (danger ? "bg-destructive" : "bg-success") : "border border-muted-foreground/40"}`}
        aria-hidden
      />
      <div className={done ? "" : "text-muted-foreground"}>
        <div className="font-medium">{label}</div>
        {done && at ? (
          <div className="text-xs text-muted-foreground">
            {by ? `${by} · ` : ""}
            {formatDateTime(at)}
          </div>
        ) : (
          <div className="text-xs">Not yet</div>
        )}
        {note && <div className="mt-0.5 text-xs">Reason: {note}</div>}
      </div>
    </li>
  );
}

function TermsTab({ trade }: { trade: Doc<"trades"> }) {
  return (
    <div className="space-y-4">
      <Section title="Commercial & shipping terms">
        <DetailList
          items={[
            { label: "Incoterm", value: trade.incoterm },
            { label: "Payment term", value: trade.paymentTerm },
            { label: "Pricing term", value: trade.pricingTerm },
            { label: "Shipment period", value: trade.shipmentPeriod },
            { label: "Loading location", value: trade.loadingLocation },
            { label: "Discharge location", value: trade.dischargeLocation },
            { label: "Partial shipment", value: trade.partialShipment === undefined ? undefined : trade.partialShipment ? "Allowed" : "Not allowed" },
            {
              label: "Quantity tolerance",
              value:
                trade.tolerancePct === undefined
                  ? undefined
                  : `± ${formatNumber(trade.tolerancePct, 2)}%${trade.toleranceOption ? ` · ${TOLERANCE_LABEL[trade.toleranceOption]}` : ""}`,
            },
            { label: "Origin of goods", value: trade.origin },
            { label: "Manufacturer / factory", value: trade.manufacturer },
            { label: "Container loading", value: trade.containerLoading },
            { label: "Freight terms", value: trade.freightTerms },
            { label: "Special conditions", value: trade.specialConditions, span: 3 },
          ]}
        />
      </Section>
      <Section title="Contract information">
        <DetailList
          items={[
            { label: "Buyer reference / PO", value: trade.buyerReference },
            { label: "Buyer reference date", value: trade.buyerReferenceDate ? formatDate(trade.buyerReferenceDate) : undefined },
            { label: "Printed contract number", value: trade.printedContractNumber ?? "From numbering sequence" },
            { label: "Packing clause", value: trade.packingClause, span: 3 },
            { label: "Seller's bank details", value: trade.sellerBankDetails, mono: true },
            { label: "Buyer's bank details", value: trade.buyerBankDetails, mono: true },
            { label: "Documents clause", value: trade.documentsClause, span: 3 },
            { label: "Arbitration clause", value: trade.arbitrationClause, span: 3 },
            { label: "Other conditions", value: trade.otherConditions, span: 3 },
            { label: "Additional terms", value: trade.additionalTerms, span: 3 },
          ]}
        />
      </Section>
    </div>
  );
}
