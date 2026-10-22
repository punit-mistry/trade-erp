"use client";

import { useConvex, usePaginatedQuery } from "convex/react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ArrowLeftRight,
  Copy,
  Download,
  Eye,
  FileSignature,
  FilterX,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  ScrollText,
  SlidersHorizontal,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import type { TradeStatus } from "@/convex/lib/validators";
import { canTransitionTrade, EDITABLE_TRADE_STATUSES } from "@/convex/lib/workflow";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/shared/empty-state";
import { FormField } from "@/components/shared/form-field";
import { LookupCombobox } from "@/components/shared/lookup-combobox";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { FilterTabs, PaginationFooter, SearchInput, SortHeader, TableCard } from "@/components/shared/table-parts";
import { TableSkeleton } from "@/components/shared/states";
import { useDebouncedValue } from "@/hooks/use-debounce";
import { useViewer } from "@/hooks/use-viewer";
import { downloadCsv } from "@/lib/csv";
import { getErrorMessage } from "@/lib/errors";
import { formatDate, formatMoney, formatQuantity } from "@/lib/format";
import { DIRECTION_LABEL, TRADE_STATUS } from "@/lib/status";
import { DirectionPill } from "./direction-pill";
import { CommodityPicker, CompanySelect, CounterpartyPicker } from "./pickers";
import { CancelTradeDialog, CloneTradeDialog, CreateTemplateDialog } from "./trade-actions";

const PAGE_SIZE = 25;

const STATUS_TABS: { value: TradeStatus | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "draft", label: "Draft" },
  { value: "pending_review", label: "In Review" },
  { value: "confirmed", label: "Confirmed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "closed", label: "Closed" },
];

const DIRECTION_TABS: { value: "all" | "purchase" | "sales"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "purchase", label: "Purchase" },
  { value: "sales", label: "Sales" },
];


function pick<T extends string>(value: string | null, allowed: readonly T[], fallback: T): T {
  return value && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

export function TradesList() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const convex = useConvex();
  const { can } = useViewer();

  const status = pick(params.get("status"), STATUS_TABS.map((t) => t.value), "all");
  const direction = pick(params.get("direction"), ["all", "purchase", "sales"] as const, "all");
  const order = pick(params.get("order"), ["desc", "asc"] as const, "desc");
  const dateFrom = params.get("from") ?? undefined;
  const dateTo = params.get("to") ?? undefined;
  const counterpartyId = (params.get("counterpartyId") ?? undefined) as Id<"counterparties"> | undefined;
  const commodityId = (params.get("commodityId") ?? undefined) as Id<"commodities"> | undefined;
  const companyId = (params.get("companyId") ?? undefined) as Id<"companies"> | undefined;
  const currency = params.get("currency") ?? undefined;

  const [search, setSearch] = useState(params.get("q") ?? "");
  const debouncedSearch = useDebouncedValue(search.trim(), 300);

  const setParams = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined || v === "" || v === "all") next.delete(k);
      else next.set(k, v);
    }
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  // Keep the search term in the URL (debounced) so filtered views are shareable.
  useEffect(() => {
    if ((params.get("q") ?? "") !== debouncedSearch) setParams({ q: debouncedSearch || undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  const filters = {
    status,
    direction,
    search: debouncedSearch || undefined,
    dateFrom,
    dateTo,
    counterpartyId,
    commodityId,
    companyId,
    currency,
    order,
  };
  const { results, status: pageStatus, loadMore } = usePaginatedQuery(api.trades.list, filters, { initialNumItems: PAGE_SIZE });

  const advancedCount = [dateFrom, dateTo, counterpartyId, commodityId, companyId, currency].filter(Boolean).length;
  const anyFilter = advancedCount > 0 || status !== "all" || direction !== "all" || debouncedSearch !== "";
  const [exporting, setExporting] = useState(false);

  async function exportCsv() {
    setExporting(true);
    try {
      const rows = await convex.query(api.trades.exportRows, filters);
      downloadCsv(`trades-${new Date().toISOString().slice(0, 10)}`, rows, [
        { header: "Trade No.", value: (t) => t.tradeNumber },
        { header: "Trade Date", value: (t) => t.tradeDate },
        { header: "Direction", value: (t) => (t.direction ? DIRECTION_LABEL[t.direction] : "") },
        { header: "Status", value: (t) => TRADE_STATUS[t.status].label },
        { header: "Company", value: (t) => t.companyName },
        { header: "Counterparty", value: (t) => t.counterpartyName },
        { header: "Commodity", value: (t) => t.commodityName },
        { header: "Commodity Code", value: (t) => t.commodityCode },
        { header: "Quantity", value: (t) => t.quantity },
        { header: "UOM", value: (t) => t.uom },
        { header: "Price per UOM", value: (t) => t.pricePerUom },
        { header: "Currency", value: (t) => t.currency },
        { header: "Total Value", value: (t) => t.totalValue },
        { header: "Price Needs Validation", value: (t) => (t.priceNeedsValidation ? "Yes" : "") },
        { header: "Incoterm", value: (t) => t.incoterm },
        { header: "Payment Term", value: (t) => t.paymentTerm },
        { header: "Shipment Period", value: (t) => t.shipmentPeriod },
        { header: "Loading", value: (t) => t.loadingLocation },
        { header: "Discharge", value: (t) => t.dischargeLocation },
        { header: "Buyer Reference", value: (t) => t.buyerReference },
      ]);
      toast.success(`Exported ${rows.length} trade${rows.length === 1 ? "" : "s"}${rows.length === 2000 ? " (first 2,000)" : ""}`);
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setExporting(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Physical Trades"
        description="Purchase and sales trades from draft to close. Clone a previous trade to book a similar one in seconds."
        actions={
          <>
            <Button variant="outline" onClick={exportCsv} disabled={exporting}>
              {exporting ? <Loader2 className="animate-spin" /> : <Download />} Export CSV
            </Button>
            {can("trade.create") && (
              <Button asChild>
                <Link href="/physical-trades/new">
                  <Plus /> Book Trade
                </Link>
              </Button>
            )}
          </>
        }
      />

      <TableCard
        toolbar={
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <SearchInput value={search} onChange={setSearch} placeholder="Trade no., counterparty or commodity…" />
              <FilterTabs ariaLabel="Filter by status" value={status} onChange={(v) => setParams({ status: v })} options={STATUS_TABS} />
              <FilterTabs ariaLabel="Filter by direction" value={direction} onChange={(v) => setParams({ direction: v })} options={DIRECTION_TABS} />
              <MoreFilters
                count={advancedCount}
                values={{ dateFrom, dateTo, counterpartyId, commodityId, companyId, currency }}
                onChange={setParams}
              />
              {anyFilter && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSearch("");
                    router.replace(pathname, { scroll: false });
                  }}
                >
                  <FilterX /> Clear Filters
                </Button>
              )}
            </div>
            {debouncedSearch && (
              <p className="text-xs text-muted-foreground">Search results are ranked by relevance.</p>
            )}
          </div>
        }
        footer={<PaginationFooter status={pageStatus} loaded={results.length} onLoadMore={loadMore} pageSize={PAGE_SIZE} noun="trades" />}
      >
        {pageStatus === "LoadingFirstPage" ? (
          <TableSkeleton columns={9} />
        ) : results.length === 0 ? (
          anyFilter ? (
            <EmptyState icon={FilterX} title="No trades match these filters" description="Try a different search or clear the filters." />
          ) : (
            <EmptyState
              icon={ArrowLeftRight}
              title="No trades yet"
              description="Book your first purchase or sales trade. Supplier defaults fill in the terms for you."
              action={
                can("trade.create") ? (
                  <Button asChild>
                    <Link href="/physical-trades/new">
                      <Plus /> Book Trade
                    </Link>
                  </Button>
                ) : undefined
              }
            />
          )
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Trade No.</TableHead>
                <TableHead>
                  {debouncedSearch ? (
                    "Date"
                  ) : (
                    <SortHeader label="Date" active dir={order} onClick={() => setParams({ order: order === "desc" ? "asc" : "desc" })} />
                  )}
                </TableHead>
                <TableHead>Direction</TableHead>
                <TableHead>Counterparty</TableHead>
                <TableHead>Commodity</TableHead>
                <TableHead className="text-right">Quantity</TableHead>
                <TableHead className="text-right">Value</TableHead>
                <TableHead>Incoterm</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-0 text-right">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {results.map((t) => (
                <TradeRow key={t._id} trade={t} />
              ))}
            </TableBody>
          </Table>
        )}
      </TableCard>
    </>
  );
}

function TradeRow({ trade: t }: { trade: Doc<"trades"> }) {
  const router = useRouter();
  const { can } = useViewer();
  const [cloneOpen, setCloneOpen] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const editable = EDITABLE_TRADE_STATUSES.includes(t.status);
  const canEdit = editable && (can("trade.editAny") || (can("trade.editDraft") && t.status === "draft"));
  const canCancel = Boolean(canTransitionTrade(t.status, "cancelled")) && can("trade.cancel");
  const href = `/physical-trades/${t._id}`;

  return (
    <TableRow className="cursor-pointer" onClick={() => router.push(href)}>
      <TableCell className="py-2">
        <Link href={href} className="font-mono text-[13px] font-medium text-primary hover:underline" onClick={(e) => e.stopPropagation()}>
          {t.tradeNumber}
        </Link>
        {t.clonedFromNumber && <div className="text-[11px] text-muted-foreground">from {t.clonedFromNumber}</div>}
      </TableCell>
      <TableCell className="py-2 whitespace-nowrap tabular">{formatDate(t.tradeDate)}</TableCell>
      <TableCell className="py-2">
        <DirectionPill direction={t.direction} />
      </TableCell>
      <TableCell className="max-w-56 py-2">
        <div className="truncate" title={t.counterpartyName}>
          {t.counterpartyName ?? <span className="text-muted-foreground">—</span>}
        </div>
      </TableCell>
      <TableCell className="max-w-64 py-2">
        <div className="truncate" title={t.commodityName}>
          {t.commodityName ?? <span className="text-muted-foreground">—</span>}
        </div>
        {t.commodityCode && <div className="text-[11px] text-muted-foreground">{t.commodityCode}</div>}
      </TableCell>
      <TableCell className="num py-2 whitespace-nowrap">{formatQuantity(t.quantity, t.uom)}</TableCell>
      <TableCell className="num py-2 whitespace-nowrap">
        {formatMoney(t.totalValue, t.currency)}
        {t.priceNeedsValidation && <div className="text-[11px] text-warning">unit price to validate</div>}
      </TableCell>
      <TableCell className="py-2">{t.incoterm ?? <span className="text-muted-foreground">—</span>}</TableCell>
      <TableCell className="py-2">
        <StatusBadge value={t.status} map={TRADE_STATUS} />
      </TableCell>
      <TableCell className="py-2 text-right" onClick={(e) => e.stopPropagation()}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${t.tradeNumber}`}>
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem asChild>
              <Link href={href}>
                <Eye /> View
              </Link>
            </DropdownMenuItem>
            {canEdit && (
              <DropdownMenuItem asChild>
                <Link href={`${href}/edit`}>
                  <Pencil /> Edit
                </Link>
              </DropdownMenuItem>
            )}
            {can("trade.create") && (
              <DropdownMenuItem onSelect={() => setCloneOpen(true)}>
                <Copy /> Clone Trade
              </DropdownMenuItem>
            )}
            <DropdownMenuItem asChild>
              <Link href={`${href}?tab=contract`}>
                <FileSignature /> Contract
              </Link>
            </DropdownMenuItem>
            {(can("tradeTemplate.manage") || canCancel) && <DropdownMenuSeparator />}
            {can("tradeTemplate.manage") && (
              <DropdownMenuItem onSelect={() => setTemplateOpen(true)}>
                <ScrollText /> Create Template from Trade
              </DropdownMenuItem>
            )}
            {canCancel && (
              <DropdownMenuItem variant="destructive" onSelect={() => setCancelOpen(true)}>
                <XCircle /> Cancel Trade
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        <CloneTradeDialog tradeId={t._id} tradeNumber={t.tradeNumber} open={cloneOpen} onOpenChange={setCloneOpen} />
        <CreateTemplateDialog tradeId={t._id} tradeNumber={t.tradeNumber} open={templateOpen} onOpenChange={setTemplateOpen} />
        <CancelTradeDialog tradeId={t._id} tradeNumber={t.tradeNumber} open={cancelOpen} onOpenChange={setCancelOpen} />
      </TableCell>
    </TableRow>
  );
}

function MoreFilters({
  count,
  values,
  onChange,
}: {
  count: number;
  values: {
    dateFrom?: string;
    dateTo?: string;
    counterpartyId?: Id<"counterparties">;
    commodityId?: Id<"commodities">;
    companyId?: Id<"companies">;
    currency?: string;
  };
  onChange: (patch: Record<string, string | undefined>) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          <SlidersHorizontal /> More filters
          {count > 0 && <span className="rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground tabular">{count}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <FormField label="Date from" htmlFor="f-from">
            <Input id="f-from" type="date" value={values.dateFrom ?? ""} onChange={(e) => onChange({ from: e.target.value || undefined })} />
          </FormField>
          <FormField label="Date to" htmlFor="f-to">
            <Input id="f-to" type="date" value={values.dateTo ?? ""} onChange={(e) => onChange({ to: e.target.value || undefined })} />
          </FormField>
        </div>
        <FormField label="Counterparty">
          <CounterpartyPicker value={values.counterpartyId} onChange={(v) => onChange({ counterpartyId: v })} />
        </FormField>
        <FormField label="Commodity">
          <CommodityPicker value={values.commodityId} onChange={(v) => onChange({ commodityId: v })} />
        </FormField>
        <FormField label="Company">
          <CompanySelect value={values.companyId} onChange={(v) => onChange({ companyId: v })} />
        </FormField>
        <FormField label="Currency">
          <LookupCombobox kind="currency" value={values.currency} onChange={(v) => onChange({ currency: v })} allowCustom={false} />
        </FormField>
        {count > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full"
            onClick={() =>
              onChange({ from: undefined, to: undefined, counterpartyId: undefined, commodityId: undefined, companyId: undefined, currency: undefined })
            }
          >
            Reset these filters
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}

