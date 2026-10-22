"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { useMemo } from "react";
import { CalendarClock, Plus } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { Section } from "@/components/shared/section";
import { Skeleton } from "@/components/ui/skeleton";
import { useViewer } from "@/hooks/use-viewer";
import { formatMoney, todayIso } from "@/lib/format";
import { FxRatesPanel } from "@/features/fx/fx-rates-panel";
import { DispatchOperations } from "./dispatch-operations";
import { DefinitionTip, KpiCard, KpiSkeleton } from "./kpi-cards";
import { PendingActions } from "./pending-actions";
import { RecentContracts } from "./recent-contracts";

function greeting(hour: number) {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export function DashboardView() {
  const { viewer, can } = useViewer();
  // Local calendar month + date, computed once per mount so query args stay stable.
  const { monthStart, monthEnd, today, hour, dateLabel } = useMemo(() => {
    const now = new Date();
    return {
      monthStart: new Date(now.getFullYear(), now.getMonth(), 1).getTime(),
      monthEnd: new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime(),
      today: todayIso(),
      hour: now.getHours(),
      dateLabel: now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" }),
    };
  }, []);
  const summary = useQuery(api.dashboard.summary, { monthStart, monthEnd });
  const firstName = viewer?.name?.split(" ")[0];

  return (
    <div className="space-y-5">
      <PageHeader
        title={`${greeting(hour)}${firstName ? `, ${firstName}` : ""}`}
        description={dateLabel}
        actions={
          can("trade.create") ? (
            <Button asChild>
              <Link href="/physical-trades/new">
                <Plus /> Book Trade
              </Link>
            </Button>
          ) : undefined
        }
        className="mb-0"
      />

      {summary === undefined ? (
        <KpiSkeleton />
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {summary.primary.map((k) => (
            <KpiCard key={k.key} kpi={k} />
          ))}
        </div>
      )}

      {summary === undefined ? (
        <Skeleton className="h-16 rounded-lg" />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-lg border bg-card px-3.5 py-2.5 shadow-xs">
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              Total Open Trade Value
              <DefinitionTip text={summary.openTradeValue.definition} label="Total Open Trade Value" />
            </div>
            {summary.openTradeValue.byCurrency.length === 0 ? (
              <div className="mt-0.5 text-lg font-semibold text-muted-foreground">—</div>
            ) : (
              <div className="mt-0.5 space-y-0.5">
                {summary.openTradeValue.byCurrency.map((v) => (
                  <div key={v.currency} className="tabular text-lg leading-snug font-semibold">
                    {formatMoney(v.total, v.currency)}
                  </div>
                ))}
              </div>
            )}
            <div className="text-[11px] text-muted-foreground">
              {summary.openTradeValue.tradeCount} open trade{summary.openTradeValue.tradeCount === 1 ? "" : "s"}
            </div>
          </div>
          {summary.secondary.map((k) => (
            <KpiCard key={k.key} kpi={k} compact />
          ))}
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-5">
          <RecentContracts />
          <DispatchOperations today={today} />
        </div>
        <div className="min-w-0 space-y-5">
          <PendingActions today={today} />
          <Section
            title={
              <span className="flex items-center gap-1.5">
                Upcoming Shipment Windows
                {summary && <DefinitionTip text={summary.upcomingDefinition} label="Upcoming Shipment Windows" />}
              </span>
            }
            contentClassName="p-0"
          >
            {summary === undefined ? (
              <div className="space-y-2 p-4">
                <Skeleton className="h-10" />
                <Skeleton className="h-10" />
              </div>
            ) : summary.upcomingShipments.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                No confirmed trades with a shipment period yet.
              </p>
            ) : (
              <ul className="divide-y">
                {summary.upcomingShipments.map((s) => (
                  <li key={s.tradeId}>
                    <Link href={`/physical-trades/${s.tradeId}`} className="flex gap-3 px-4 py-2.5 hover:bg-muted/60">
                      <CalendarClock className="mt-0.5 size-4 shrink-0 text-cyan" />
                      <div className="min-w-0 text-[13px]">
                        <div className="font-medium">
                          {s.tradeNumber} · <span className="font-normal">{s.shipmentPeriod}</span>
                        </div>
                        <div className="truncate text-xs text-muted-foreground">
                          {[s.counterpartyName, s.commodityName].filter(Boolean).join(" · ")}
                          {s.loadingLocation || s.dischargeLocation
                            ? ` · ${s.loadingLocation ?? "?"} → ${s.dischargeLocation ?? "?"}`
                            : ""}
                        </div>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
      </div>

      <FxRatesPanel id="fx-rates" />
    </div>
  );
}
