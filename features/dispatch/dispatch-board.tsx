"use client";

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { AlertOctagon, CalendarClock, FilePlus2, Loader2, Ship, UserRound } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { BlStatus } from "@/convex/lib/validators";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { TableSkeleton } from "@/components/shared/states";
import { FilterTabs, TableCard } from "@/components/shared/table-parts";
import { useViewer } from "@/hooks/use-viewer";
import { getErrorMessage } from "@/lib/errors";
import { formatDate, formatRelative } from "@/lib/format";
import { BL_STATUS, type StatusMeta } from "@/lib/status";
import { cn } from "@/lib/utils";

type BlFilter = BlStatus | "none" | "all";
const BL_FILTERS: BlFilter[] = ["all", "none", "draft", "prepared", "under_review", "verified", "issued"];
const BL_STATUS_WITH_NONE: Record<BlStatus | "none", StatusMeta> = {
  ...BL_STATUS,
  none: { label: "No B/L", tone: "muted", description: "No B/L record has been created for this trade yet." },
};

function Kpi({ label, value, tone }: { label: string; value: number | undefined; tone?: "danger" | "warning" }) {
  return (
    <div className="rounded-lg border bg-card px-4 py-3 shadow-xs">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className={cn(
          "mt-1 text-2xl font-semibold tabular",
          tone === "danger" && value ? "text-destructive" : tone === "warning" && value ? "text-warning" : undefined,
        )}
      >
        {value ?? "—"}
      </div>
    </div>
  );
}

function TradesWithoutBl() {
  const rows = useQuery(api.blDocuments.confirmedTradesWithoutBl);
  const create = useMutation(api.blDocuments.createFromTrade);
  const { can } = useViewer();
  const router = useRouter();
  const [pendingId, setPendingId] = useState<Id<"trades"> | null>(null);
  if (rows === undefined || rows.length === 0) return null;
  return (
    <section className="rounded-lg border bg-card shadow-xs">
      <div className="border-b px-4 py-2.5">
        <h2 className="text-sm font-semibold">Confirmed trades without a B/L</h2>
        <p className="text-xs text-muted-foreground">Create the B/L from the trade so shipping details are prepared before loading.</p>
      </div>
      <ul className="divide-y">
        {rows.map((t) => (
          <li key={t._id} className="flex flex-wrap items-center gap-3 px-4 py-2 text-sm">
            <Link href={`/physical-trades/${t._id}?tab=bl`} className="font-mono font-medium text-primary hover:underline">
              {t.tradeNumber}
            </Link>
            <span className="min-w-0 flex-1 truncate">
              {t.counterpartyName ?? "—"} <span className="text-muted-foreground">· {t.commodityName ?? "—"}</span>
            </span>
            <span className="text-xs text-muted-foreground">{t.shipmentPeriod ? `Ships ${t.shipmentPeriod}` : `Traded ${formatDate(t.tradeDate)}`}</span>
            {can("bl.prepare") && (
              <Button
                size="sm"
                variant="outline"
                disabled={pendingId !== null}
                onClick={async () => {
                  setPendingId(t._id);
                  try {
                    await create({ tradeId: t._id });
                    toast.success(`B/L created for ${t.tradeNumber}`);
                    router.push(`/physical-trades/${t._id}?tab=bl`);
                  } catch (e) {
                    toast.error(getErrorMessage(e));
                  } finally {
                    setPendingId(null);
                  }
                }}
              >
                {pendingId === t._id ? <Loader2 className="animate-spin" /> : <FilePlus2 />} Create B/L
              </Button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function DispatchBoard() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const initialBl = params.get("blStatus");
  const blFilter: BlFilter = BL_FILTERS.includes(initialBl as BlFilter) ? (initialBl as BlFilter) : "all";
  const hasBlockers = params.get("blocked") === "1";
  const overdue = params.get("overdue") === "1";
  const includeCompleted = params.get("completed") === "1";

  function setParam(key: string, value: string | null) {
    const next = new URLSearchParams(params.toString());
    if (value === null) next.delete(key);
    else next.set(key, value);
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  const all = useQuery(api.dispatch.listOpen, {});
  const rows = useQuery(api.dispatch.listOpen, {
    blStatus: blFilter === "all" ? undefined : blFilter,
    hasBlockers: hasBlockers || undefined,
    overdue: overdue || undefined,
    includeCompleted: includeCompleted || undefined,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="B/L & Dispatch"
        description="Shipments in progress: B/L preparation status, checklist completion, blockers and who acts next. Open a trade to edit its B/L and checklist."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Open dispatch checklists" value={all?.length} />
        <Kpi label="With blocked items" value={all?.filter((r) => r.progress.blocked > 0).length} tone="danger" />
        <Kpi label="With overdue items" value={all?.filter((r) => r.progress.overdue > 0).length} tone="warning" />
        <Kpi label="B/Ls under review" value={all?.filter((r) => r.blStatus === "under_review").length} />
      </div>

      <TableCard
        toolbar={
          <div className="flex flex-wrap items-center gap-3">
            <FilterTabs
              ariaLabel="Filter by B/L status"
              value={blFilter}
              onChange={(v) => setParam("blStatus", v === "all" ? null : v)}
              options={BL_FILTERS.map((f) => ({
                value: f,
                label: f === "all" ? "All" : BL_STATUS_WITH_NONE[f].label,
              }))}
            />
            <div className="flex items-center gap-2">
              <Switch id="f-blocked" checked={hasBlockers} onCheckedChange={(c) => setParam("blocked", c ? "1" : null)} />
              <Label htmlFor="f-blocked" className="text-xs">Has blockers</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch id="f-overdue" checked={overdue} onCheckedChange={(c) => setParam("overdue", c ? "1" : null)} />
              <Label htmlFor="f-overdue" className="text-xs">Overdue</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch id="f-completed" checked={includeCompleted} onCheckedChange={(c) => setParam("completed", c ? "1" : null)} />
              <Label htmlFor="f-completed" className="text-xs">Include recently completed</Label>
            </div>
          </div>
        }
        footer={rows && <span className="text-xs text-muted-foreground tabular">{rows.length} shipments</span>}
      >
        {rows === undefined ? (
          <TableSkeleton rows={6} columns={7} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Ship}
            title={all && all.length === 0 ? "No shipments in progress" : "No shipments match these filters"}
            description={
              all && all.length === 0
                ? "A dispatch checklist starts when a B/L is created from a trade, or from the trade's B/L & Dispatch tab."
                : "Clear a filter to see more shipments."
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Trade</TableHead>
                <TableHead>Counterparty</TableHead>
                <TableHead>B/L</TableHead>
                <TableHead className="w-44">Progress</TableHead>
                <TableHead className="text-right">Blocked</TableHead>
                <TableHead>Next action</TableHead>
                <TableHead className="text-right">Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow
                  key={r.checklistId}
                  className="cursor-pointer"
                  onClick={() => router.push(`/physical-trades/${r.tradeId}?tab=bl`)}
                >
                  <TableCell>
                    <Link
                      href={`/physical-trades/${r.tradeId}?tab=bl`}
                      className="font-mono font-medium text-primary hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {r.tradeNumber}
                    </Link>
                    <div className="text-xs text-muted-foreground">{r.shipmentPeriod ?? r.commodityName ?? "—"}</div>
                  </TableCell>
                  <TableCell className="max-w-56">
                    <div className="truncate">{r.counterpartyName ?? "—"}</div>
                    <div className="truncate text-xs text-muted-foreground">{r.commodityName ?? "—"}</div>
                  </TableCell>
                  <TableCell>
                    <StatusBadge value={r.blStatus} map={BL_STATUS_WITH_NONE} />
                    {r.blRecordNumber && <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">{r.blRecordNumber}</div>}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Progress value={r.progress.percent} className="h-1.5" />
                      <span className="w-9 text-right text-xs font-medium tabular">{r.progress.percent}%</span>
                    </div>
                    <div className="text-[11px] text-muted-foreground tabular">
                      {r.progress.complete}/{r.progress.total} items
                    </div>
                  </TableCell>
                  <TableCell className="num">
                    {r.progress.blocked > 0 ? (
                      <span className="inline-flex items-center gap-1 font-medium text-destructive">
                        <AlertOctagon className="size-3.5" /> {r.progress.blocked}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">0</span>
                    )}
                  </TableCell>
                  <TableCell className="max-w-64">
                    {r.nextStep ? (
                      <>
                        <div className="flex items-center gap-1 truncate text-sm">
                          {r.nextStep.label}
                          {r.progress.overdue > 0 && <CalendarClock className="size-3.5 shrink-0 text-destructive" aria-label="Overdue items" />}
                        </div>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <UserRound className="size-3" /> {r.nextStep.responsible ?? "Unassigned"}
                          {r.nextStep.dueDate && ` · due ${formatDate(r.nextStep.dueDate)}`}
                        </div>
                      </>
                    ) : (
                      <span className="text-sm text-success">All items complete</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right text-xs whitespace-nowrap text-muted-foreground">
                    {formatRelative(r.updatedAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </TableCard>

      <TradesWithoutBl />
    </div>
  );
}
