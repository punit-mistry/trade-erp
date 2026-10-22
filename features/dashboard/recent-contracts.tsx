"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { useState } from "react";
import { ArrowRight, Eye, FileSignature } from "lucide-react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DetailList, Section } from "@/components/shared/section";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { TableSkeleton } from "@/components/shared/states";
import { formatDateTime, formatMoney, formatRelative } from "@/lib/format";
import { CONTRACT_STATUS, DIRECTION_LABEL } from "@/lib/status";
import { useViewer } from "@/hooks/use-viewer";

type Row = FunctionReturnType<typeof api.dashboard.recentContracts>[number];

export function RecentContracts() {
  const rows = useQuery(api.dashboard.recentContracts);
  const [quick, setQuick] = useState<Row | null>(null);
  const { can } = useViewer();

  return (
    <Section
      title="Recent Contracts"
      description="Latest contract versions by last update"
      contentClassName="p-0"
      actions={
        <Button variant="ghost" size="sm" asChild>
          <Link href="/contracts">
            View all <ArrowRight />
          </Link>
        </Button>
      }
    >
      {rows === undefined ? (
        <TableSkeleton rows={5} columns={6} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={FileSignature}
          title="No contracts yet"
          description="Contracts are generated from trades. Book a trade, then generate its contract."
          action={
            can("trade.create") ? (
              <Button asChild size="sm">
                <Link href="/physical-trades/new">Book a trade</Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50 text-xs">
                <TableHead className="h-8">Contract No.</TableHead>
                <TableHead className="h-8">Buyer</TableHead>
                <TableHead className="h-8">Product</TableHead>
                <TableHead className="h-8 text-right">Value</TableHead>
                <TableHead className="h-8">Status</TableHead>
                <TableHead className="h-8">Updated</TableHead>
                <TableHead className="h-8 w-10">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((c) => (
                <TableRow key={c._id} className="text-[13px]">
                  <TableCell className="py-2">
                    <Link href={`/contracts/${c._id}`} className="font-medium text-primary hover:underline">
                      {c.contractNumber}
                    </Link>
                    {c.version > 1 && <span className="ml-1 text-xs text-muted-foreground">v{c.version}</span>}
                  </TableCell>
                  <TableCell className="max-w-48 truncate py-2">{c.buyer || "—"}</TableCell>
                  <TableCell className="max-w-56 truncate py-2">{c.product || "—"}</TableCell>
                  <TableCell className="num py-2 whitespace-nowrap">{formatMoney(c.totalValue, c.currency)}</TableCell>
                  <TableCell className="py-2">
                    <StatusBadge value={c.status} map={CONTRACT_STATUS} />
                  </TableCell>
                  <TableCell className="py-2 whitespace-nowrap text-muted-foreground" title={formatDateTime(c.updatedAt)}>
                    {formatRelative(c.updatedAt)}
                  </TableCell>
                  <TableCell className="py-2">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => setQuick(c)}
                      aria-label={`Quick view ${c.contractNumber}`}
                    >
                      <Eye />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Sheet open={quick !== null} onOpenChange={(o) => !o && setQuick(null)}>
        <SheetContent className="w-full sm:max-w-md">
          {quick && (
            <>
              <SheetHeader>
                <SheetTitle>
                  {quick.contractNumber}
                  <span className="ml-1.5 text-sm font-normal text-muted-foreground">v{quick.version}</span>
                </SheetTitle>
                <SheetDescription asChild>
                  <div>
                    <StatusBadge value={quick.status} map={CONTRACT_STATUS} />
                  </div>
                </SheetDescription>
              </SheetHeader>
              <div className="space-y-5 px-4">
                <DetailList
                  columns={2}
                  items={[
                    { label: "Trade", value: quick.tradeNumber },
                    { label: "Direction", value: quick.direction ? DIRECTION_LABEL[quick.direction as "purchase" | "sales"] : undefined },
                    { label: "Buyer", value: quick.buyer, span: 2 },
                    { label: "Counterparty", value: quick.counterpartyName, span: 2 },
                    { label: "Product", value: quick.product, span: 2 },
                    { label: "Value", value: formatMoney(quick.totalValue, quick.currency) },
                    { label: "Last updated", value: formatDateTime(quick.updatedAt) },
                  ]}
                />
                <div className="flex flex-wrap gap-2">
                  <Button asChild size="sm">
                    <Link href={`/contracts/${quick._id}`}>Open contract</Link>
                  </Button>
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/physical-trades/${quick.tradeId}`}>Open trade</Link>
                  </Button>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </Section>
  );
}
