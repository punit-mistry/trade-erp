"use client";

import Link from "next/link";
import { usePaginatedQuery, useQuery } from "convex/react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Eye, FileSignature, ScrollText } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { ContractStatus } from "@/convex/lib/validators";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge, TonePill } from "@/components/shared/status-badge";
import { TableSkeleton } from "@/components/shared/states";
import { FilterTabs, PaginationFooter, SearchInput, TableCard } from "@/components/shared/table-parts";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useDebouncedValue } from "@/hooks/use-debounce";
import { formatMoney, formatRelative } from "@/lib/format";
import { CONTRACT_STATUS } from "@/lib/status";
import { toDocData } from "./contract-document";
import { ContractPreview } from "./contract-preview";
import { SIGNATURE_LABEL } from "./trade-contract-tab";

type Filter = "all" | "active" | ContractStatus;

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "draft", label: "Draft" },
  { value: "generated", label: "Generated" },
  { value: "sent", label: "Sent" },
  { value: "pending_signature", label: "Pending Signature" },
  { value: "rate_fixed", label: "Rate Fixed" },
  { value: "closed", label: "Closed" },
  { value: "cancelled", label: "Cancelled" },
];

const PAGE_SIZE = 25;

function parseFilter(value: string | null): Filter {
  return FILTERS.some((f) => f.value === value) ? (value as Filter) : "all";
}

export function ContractsList() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const filter = parseFilter(params.get("status"));
  const [search, setSearch] = useState(params.get("q") ?? "");
  const debounced = useDebouncedValue(search.trim(), 300);
  const [quickView, setQuickView] = useState<Id<"contracts"> | null>(null);

  const { results, status, loadMore } = usePaginatedQuery(
    api.contracts.list,
    { status: filter === "all" ? undefined : filter, search: debounced || undefined },
    { initialNumItems: PAGE_SIZE },
  );

  function setFilter(next: Filter) {
    const sp = new URLSearchParams(params.toString());
    if (next === "all") sp.delete("status");
    else sp.set("status", next);
    router.replace(`${pathname}${sp.toString() ? `?${sp}` : ""}`, { scroll: false });
  }

  return (
    <>
      <PageHeader
        title="Contracts"
        description="Contracts are generated from trade data — open a trade to prepare its contract. Only the version currently in force is listed."
        actions={
          <Button variant="outline" asChild>
            <Link href="/contract-templates">
              <ScrollText /> Contract Templates
            </Link>
          </Button>
        }
      />
      <TableCard
        toolbar={
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <FilterTabs ariaLabel="Contract status" value={filter} onChange={setFilter} options={FILTERS} />
            <SearchInput value={search} onChange={setSearch} placeholder="Search contract, trade or counterparty…" />
          </div>
        }
        footer={
          <PaginationFooter status={status} loaded={results.length} onLoadMore={loadMore} pageSize={PAGE_SIZE} noun="contracts" />
        }
      >
        {status === "LoadingFirstPage" ? (
          <TableSkeleton columns={8} />
        ) : results.length === 0 ? (
          <EmptyState
            icon={FileSignature}
            title={debounced || filter !== "all" ? "No contracts match these filters" : "No contracts yet"}
            description={
              debounced || filter !== "all"
                ? "Try a different status or search term."
                : "Open a trade and use its Contract tab to generate the first draft from the trade data."
            }
            action={
              <Button asChild variant="outline">
                <Link href="/physical-trades">Go to Physical Trades</Link>
              </Button>
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Contract No.</TableHead>
                <TableHead>Trade No.</TableHead>
                <TableHead>Counterparty</TableHead>
                <TableHead>Product</TableHead>
                <TableHead className="text-right">Value</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Signature</TableHead>
                <TableHead>Last updated</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {results.map((c) => (
                <TableRow key={c._id}>
                  <TableCell className="font-medium">
                    <Link href={`/contracts/${c._id}`} className="hover:underline">
                      {c.contractNumber}
                    </Link>
                    <span className="ml-1 text-xs text-muted-foreground">v{c.version}</span>
                  </TableCell>
                  <TableCell>
                    <Link href={`/physical-trades/${c.tradeId}?tab=contract`} className="text-primary hover:underline">
                      {c.tradeNumber}
                    </Link>
                  </TableCell>
                  <TableCell className="max-w-56 truncate" title={c.counterpartyName}>
                    {c.counterpartyName ?? "—"}
                  </TableCell>
                  <TableCell className="max-w-56 truncate" title={c.commodityName}>
                    {c.commodityName ?? "—"}
                  </TableCell>
                  <TableCell className="num">{formatMoney(c.totalValue, c.currency)}</TableCell>
                  <TableCell>
                    <StatusBadge value={c.status} map={CONTRACT_STATUS} />
                  </TableCell>
                  <TableCell>
                    <TonePill tone={SIGNATURE_LABEL[c.signatureStatus].tone}>{SIGNATURE_LABEL[c.signatureStatus].label}</TonePill>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{formatRelative(c.updatedAt)}</TableCell>
                  <TableCell className="text-right">
                    <Button size="xs" variant="ghost" onClick={() => setQuickView(c._id)}>
                      <Eye /> Quick View
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </TableCard>
      <QuickView id={quickView} onClose={() => setQuickView(null)} />
    </>
  );
}

function QuickView({ id, onClose }: { id: Id<"contracts"> | null; onClose: () => void }) {
  const data = useQuery(api.contracts.get, id ? { id } : "skip");
  return (
    <Sheet open={id !== null} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-3xl">
        <SheetHeader>
          <SheetTitle>{data ? `${data.contract.contractNumber} · v${data.contract.version}` : "Contract"}</SheetTitle>
          <SheetDescription asChild>
            <div className="flex flex-wrap items-center gap-2">
              {data && <StatusBadge value={data.contract.status} map={CONTRACT_STATUS} />}
              {data?.trade && <span>Trade {data.trade.tradeNumber}</span>}
            </div>
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-3 px-4 pb-6">
          {data === undefined ? (
            <Skeleton className="h-[480px]" />
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" asChild>
                  <Link href={`/contracts/${data.contract._id}`}>Open contract</Link>
                </Button>
                {data.trade && (
                  <Button size="sm" variant="outline" asChild>
                    <Link href={`/physical-trades/${data.trade._id}?tab=contract`}>Open trade</Link>
                  </Button>
                )}
                {data.pdfUrl && (
                  <Button size="sm" variant="outline" asChild>
                    <a href={data.pdfUrl} target="_blank" rel="noreferrer">
                      Download PDF
                    </a>
                  </Button>
                )}
              </div>
              <ContractPreview data={toDocData(data.contract)} className="px-5 py-6 text-xs sm:px-8" />
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
