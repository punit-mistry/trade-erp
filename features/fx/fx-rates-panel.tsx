"use client";

import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { Check, Coins, X } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { Section } from "@/components/shared/section";
import { StatusBadge } from "@/components/shared/status-badge";
import { FilterTabs } from "@/components/shared/table-parts";
import { TableSkeleton } from "@/components/shared/states";
import { useViewer } from "@/hooks/use-viewer";
import { formatDateTime, formatNumber } from "@/lib/format";
import { FX_REVIEW_STATUS } from "@/lib/status";
import { RecordFxRateDialog } from "./record-fx-rate-dialog";

type Filter = "pending" | "verified" | "rejected" | "all";

/** Manually recorded FX rates with manager verification (dashboard + trade pages). */
export function FxRatesPanel({ tradeId, id }: { tradeId?: Id<"trades">; id?: string }) {
  const { can, viewer } = useViewer();
  const [filter, setFilter] = useState<Filter>("pending");
  const byTrade = useQuery(api.fx.forTrade, tradeId ? { tradeId } : "skip");
  const all = useQuery(api.fx.list, tradeId ? "skip" : filter === "all" ? {} : { reviewStatus: filter });
  const rows = tradeId ? byTrade?.filter((r) => filter === "all" || r.reviewStatus === filter) : all;
  const review = useMutation(api.fx.review);
  const [target, setTarget] = useState<{ id: Id<"fxRates">; status: "verified" | "rejected"; label: string } | null>(null);

  return (
    <Section
      title={<span id={id}>FX Rate Records</span>}
      description="Rates are entered manually with their source and verified by a manager. No rates are fetched or invented."
      contentClassName="p-0"
      actions={can("fx.record") ? <RecordFxRateDialog tradeId={tradeId} /> : undefined}
    >
      <div className="border-b px-3 py-2">
        <FilterTabs
          ariaLabel="FX review status"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "pending", label: "Pending review" },
            { value: "verified", label: "Verified" },
            { value: "rejected", label: "Rejected" },
            { value: "all", label: "All" },
          ]}
        />
      </div>
      {rows === undefined ? (
        <TableSkeleton rows={3} columns={6} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Coins}
          title={filter === "pending" ? "No rates awaiting review" : "No FX rates recorded"}
          description="Record a rate when a trade or payment depends on a currency conversion."
        />
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50 text-xs">
                <TableHead className="h-8">Pair</TableHead>
                <TableHead className="h-8 text-right">Rate</TableHead>
                <TableHead className="h-8">Source</TableHead>
                <TableHead className="h-8">Rate time</TableHead>
                <TableHead className="h-8">Trade</TableHead>
                <TableHead className="h-8">Recorded by</TableHead>
                <TableHead className="h-8">Status</TableHead>
                <TableHead className="h-8 w-24">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const label = `${r.baseCurrency}/${r.quoteCurrency} = ${r.rate}`;
                const ownRecord = viewer?._id === r.createdBy && viewer?.role !== "admin";
                return (
                  <TableRow key={r._id} className="text-[13px]">
                    <TableCell className="py-2 font-medium whitespace-nowrap">
                      {r.baseCurrency}/{r.quoteCurrency}
                    </TableCell>
                    <TableCell className="num py-2">{formatNumber(r.rate, 8)}</TableCell>
                    <TableCell className="max-w-48 truncate py-2" title={r.notes ?? r.source}>
                      {r.source}
                    </TableCell>
                    <TableCell className="py-2 whitespace-nowrap">{formatDateTime(r.rateTimestamp)}</TableCell>
                    <TableCell className="py-2">
                      {r.tradeId ? (
                        <Link href={`/physical-trades/${r.tradeId}`} className="text-primary hover:underline">
                          {r.tradeNumber ?? "Trade"}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="py-2 whitespace-nowrap">
                      {r.recordedByName}
                      {r.reviewedByName && (
                        <div className="text-xs text-muted-foreground">Reviewed by {r.reviewedByName}</div>
                      )}
                    </TableCell>
                    <TableCell className="py-2">
                      <StatusBadge value={r.reviewStatus} map={FX_REVIEW_STATUS} />
                    </TableCell>
                    <TableCell className="py-2">
                      {r.reviewStatus === "pending" && can("fx.review") && !ownRecord && (
                        <div className="flex gap-1">
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            aria-label={`Verify ${label}`}
                            onClick={() => setTarget({ id: r._id, status: "verified", label })}
                          >
                            <Check className="text-success" />
                          </Button>
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            aria-label={`Reject ${label}`}
                            onClick={() => setTarget({ id: r._id, status: "rejected", label })}
                          >
                            <X className="text-destructive" />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
      <ConfirmDialog
        open={target !== null}
        onOpenChange={(o) => !o && setTarget(null)}
        title={target?.status === "verified" ? "Verify FX rate?" : "Reject FX rate?"}
        description={
          target
            ? `${target.label}. ${target.status === "verified" ? "Confirm you have checked this rate against its stated source." : "The rate will be marked as rejected and kept for the audit trail."}`
            : undefined
        }
        confirmLabel={target?.status === "verified" ? "Verify" : "Reject"}
        destructive={target?.status === "rejected"}
        reason={{ label: "Review note", required: target?.status === "rejected", placeholder: "Optional for verification" }}
        successMessage={target?.status === "verified" ? "FX rate verified" : "FX rate rejected"}
        onConfirm={async (note) => {
          if (!target) return;
          await review({ id: target.id, status: target.status, notes: note || undefined });
        }}
      />
    </Section>
  );
}
