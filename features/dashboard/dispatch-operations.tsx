"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { AlertOctagon, ArrowRight, Clock, Ship } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/shared/empty-state";
import { Section } from "@/components/shared/section";
import { TonePill } from "@/components/shared/status-badge";
import { TableSkeleton } from "@/components/shared/states";
import { formatDate } from "@/lib/format";

export function DispatchOperations({ today }: { today: string }) {
  const rows = useQuery(api.dashboard.dispatchOperations, { today });

  return (
    <Section
      title="Dispatch Operations"
      description="Open shipments, worst first — blocked, then overdue, then least complete"
      contentClassName="p-0"
      actions={
        <Button variant="ghost" size="sm" asChild>
          <Link href="/dispatch">
            B/L & Dispatch <ArrowRight />
          </Link>
        </Button>
      }
    >
      {rows === undefined ? (
        <TableSkeleton rows={4} columns={6} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Ship}
          title="No open dispatch checklists"
          description="Checklists are created from a trade's B/L & Dispatch tab."
        />
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50 text-xs">
                <TableHead className="h-8">Trade</TableHead>
                <TableHead className="h-8">Counterparty</TableHead>
                <TableHead className="h-8">Current step</TableHead>
                <TableHead className="h-8 w-40">Completion</TableHead>
                <TableHead className="h-8">Attention</TableHead>
                <TableHead className="h-8">Next action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.checklistId} className="text-[13px]">
                  <TableCell className="py-2">
                    <Link
                      href={`/physical-trades/${r.tradeId}?tab=bl`}
                      className="font-medium whitespace-nowrap text-primary hover:underline"
                    >
                      {r.tradeNumber}
                    </Link>
                  </TableCell>
                  <TableCell className="max-w-44 truncate py-2">{r.counterpartyName || "—"}</TableCell>
                  <TableCell className="max-w-48 truncate py-2">{r.currentStep || "—"}</TableCell>
                  <TableCell className="py-2">
                    <div className="flex items-center gap-2">
                      <Progress value={r.percent} className="h-1.5 w-20" aria-label={`${r.percent}% complete`} />
                      <span className="tabular text-xs text-muted-foreground">
                        {r.complete}/{r.total}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="py-2">
                    <div className="flex flex-wrap gap-1">
                      {r.blocked > 0 && (
                        <TonePill tone="danger">
                          <AlertOctagon className="size-3" /> {r.blocked} blocked
                        </TonePill>
                      )}
                      {r.overdue > 0 && (
                        <TonePill tone="warning">
                          <Clock className="size-3" /> {r.overdue} overdue
                        </TonePill>
                      )}
                      {r.blocked === 0 && r.overdue === 0 && <span className="text-xs text-muted-foreground">On track</span>}
                    </div>
                  </TableCell>
                  <TableCell className="py-2">
                    <div className="max-w-60 truncate" title={r.blockedReason ?? r.nextAction}>
                      {r.nextAction}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {r.responsible ?? "Unassigned"}
                      {r.dueDate ? ` · due ${formatDate(r.dueDate)}` : ""}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </Section>
  );
}
