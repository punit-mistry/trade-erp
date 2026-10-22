"use client";

import { useConvex, useMutation, usePaginatedQuery } from "convex/react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Archive, Building2, Download, Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge, TonePill } from "@/components/shared/status-badge";
import { TableSkeleton } from "@/components/shared/states";
import { FilterTabs, PaginationFooter, SearchInput, SortHeader, TableCard, type SortDir } from "@/components/shared/table-parts";
import { useDebouncedValue } from "@/hooks/use-debounce";
import { useViewer } from "@/hooks/use-viewer";
import { getErrorMessage } from "@/lib/errors";
import { ACTIVE_STATUS } from "@/lib/status";
import { ImportSuppliersDialog } from "./import-suppliers-dialog";
import { SupplierRowActions } from "./supplier-actions";
import { exportSuppliersCsv } from "./supplier-csv";
import { defaultTermsLabel, TYPE_LABEL } from "./supplier-schema";

const PAGE_SIZE = 25;
type TypeFilter = "all" | "domestic" | "international";
type StatusFilter = "all" | "active" | "inactive";

export function SuppliersList() {
  const { can } = useViewer();
  const convex = useConvex();
  const archiveMany = useMutation(api.counterparties.archiveMany);

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search.trim(), 300);
  const [type, setType] = useState<TypeFilter>("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [includeArchived, setIncludeArchived] = useState(false);
  const [sort, setSort] = useState<SortDir>("asc");
  const [selected, setSelected] = useState<Set<Id<"counterparties">>>(new Set());
  const [exporting, setExporting] = useState(false);
  const [bulkArchiveOpen, setBulkArchiveOpen] = useState(false);

  const { results, status: pageStatus, loadMore } = usePaginatedQuery(
    api.counterparties.list,
    {
      search: debouncedSearch || undefined,
      type: type === "all" ? undefined : type,
      status: status === "all" ? undefined : status,
      includeArchived,
      sort,
    },
    { initialNumItems: PAGE_SIZE },
  );

  const filtersActive = debouncedSearch !== "" || type !== "all" || status !== "all" || includeArchived;
  const visibleIds = useMemo(() => results.map((r) => r._id), [results]);
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));

  function toggle(id: Id<"counterparties">) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function exportCsv(ids?: Id<"counterparties">[]) {
    setExporting(true);
    try {
      const rows = await convex.query(api.counterparties.exportRows, ids ? { ids } : { includeArchived });
      if (rows.length === 0) {
        toast.info("Nothing to export.");
        return;
      }
      exportSuppliersCsv(rows);
      toast.success(`Exported ${rows.length} supplier${rows.length === 1 ? "" : "s"}`);
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setExporting(false);
    }
  }

  function clearFilters() {
    setSearch("");
    setType("all");
    setStatus("all");
    setIncludeArchived(false);
  }

  return (
    <>
      <PageHeader
        title="Suppliers"
        description="Companies you buy from and sell to. Saved contacts, default terms and bank details are reused on every trade."
        actions={
          <>
            {can("counterparty.import") && <ImportSuppliersDialog />}
            <Button variant="outline" size="sm" onClick={() => void exportCsv()} disabled={exporting}>
              {exporting ? <Loader2 className="animate-spin" /> : <Download />} Export CSV
            </Button>
            {can("counterparty.create") && (
              <Button asChild size="sm">
                <Link href="/suppliers/new">
                  <Plus /> Add Supplier
                </Link>
              </Button>
            )}
          </>
        }
      />

      <TableCard
        toolbar={
          selected.size > 0 ? (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium tabular">{selected.size} selected</span>
              <Button variant="outline" size="sm" onClick={() => void exportCsv([...selected])} disabled={exporting}>
                <Download /> Export selected
              </Button>
              {can("counterparty.archive") && (
                <Button variant="destructive" size="sm" onClick={() => setBulkArchiveOpen(true)}>
                  <Archive /> Archive selected
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
                <X /> Clear selection
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
              <SearchInput value={search} onChange={setSearch} placeholder="Search name, code, country, contact…" />
              <FilterTabs
                ariaLabel="Supplier type"
                value={type}
                onChange={setType}
                options={[
                  { value: "all", label: "All" },
                  { value: "domestic", label: "Domestic" },
                  { value: "international", label: "International" },
                ]}
              />
              <Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
                <SelectTrigger size="sm" className="w-36" aria-label="Status filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
              <div className="flex items-center gap-2">
                <Switch id="show-archived" checked={includeArchived} onCheckedChange={setIncludeArchived} />
                <Label htmlFor="show-archived" className="text-xs font-normal text-muted-foreground">
                  Show archived
                </Label>
              </div>
              {filtersActive && (
                <Button variant="ghost" size="sm" onClick={clearFilters} className="lg:ml-auto">
                  <X /> Clear filters
                </Button>
              )}
            </div>
          )
        }
        footer={
          pageStatus !== "LoadingFirstPage" && results.length > 0 ? (
            <PaginationFooter status={pageStatus} loaded={results.length} onLoadMore={loadMore} pageSize={PAGE_SIZE} noun="suppliers" />
          ) : undefined
        }
      >
        {pageStatus === "LoadingFirstPage" ? (
          <TableSkeleton columns={7} />
        ) : results.length === 0 ? (
          filtersActive ? (
            <EmptyState
              icon={Building2}
              title="No suppliers match these filters"
              description="Try a different search term or clear the filters."
              action={
                <Button variant="outline" size="sm" onClick={clearFilters}>
                  Clear filters
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={Building2}
              title="No suppliers yet"
              description="Add a supplier once and its contacts, default terms and bank details will be suggested on every new trade."
              action={
                can("counterparty.create") ? (
                  <Button asChild size="sm">
                    <Link href="/suppliers/new">
                      <Plus /> Add your first supplier
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
                <TableHead className="w-9">
                  <Checkbox
                    aria-label="Select all visible suppliers"
                    checked={allSelected ? true : selected.size > 0 ? "indeterminate" : false}
                    onCheckedChange={(c) => setSelected(c ? new Set(visibleIds) : new Set())}
                  />
                </TableHead>
                <TableHead>
                  {debouncedSearch ? (
                    "Name"
                  ) : (
                    <SortHeader label="Name" active dir={sort} onClick={() => setSort(sort === "asc" ? "desc" : "asc")} />
                  )}
                </TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Country</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Default Terms</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-12 text-right">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {results.map((cp) => (
                <TableRow key={cp._id} data-state={selected.has(cp._id) ? "selected" : undefined} className={cp.archived ? "opacity-60" : undefined}>
                  <TableCell>
                    <Checkbox aria-label={`Select ${cp.name}`} checked={selected.has(cp._id)} onCheckedChange={() => toggle(cp._id)} />
                  </TableCell>
                  <TableCell className="max-w-72">
                    <Link href={`/suppliers/${cp._id}`} className="block truncate font-medium text-foreground hover:text-primary hover:underline">
                      {cp.name}
                    </Link>
                    <span className="font-mono text-[11px] text-muted-foreground">{cp.code}</span>
                    {cp.archived && <TonePill tone="muted" className="ml-2">Archived</TonePill>}
                  </TableCell>
                  <TableCell className="text-sm">{TYPE_LABEL[cp.type]}</TableCell>
                  <TableCell className="text-sm">{cp.country || "—"}</TableCell>
                  <TableCell className="max-w-56 text-sm">
                    <div className="truncate">{cp.contactPerson || "—"}</div>
                    {(cp.email || cp.phone) && (
                      <div className="truncate text-xs text-muted-foreground">{cp.email || cp.phone}</div>
                    )}
                  </TableCell>
                  <TableCell className="text-sm whitespace-nowrap">{defaultTermsLabel(cp)}</TableCell>
                  <TableCell>
                    <StatusBadge value={cp.status} map={ACTIVE_STATUS} />
                  </TableCell>
                  <TableCell className="text-right">
                    <SupplierRowActions cp={cp} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </TableCard>

      <ConfirmDialog
        open={bulkArchiveOpen}
        onOpenChange={setBulkArchiveOpen}
        title={`Archive ${selected.size} supplier${selected.size === 1 ? "" : "s"}?`}
        description="Archived suppliers are hidden from lists and trade selectors. Suppliers with open trades are skipped."
        confirmLabel="Archive"
        destructive
        onConfirm={async () => {
          const res = await archiveMany({ ids: [...selected] });
          if (res.archived > 0) toast.success(`Archived ${res.archived} supplier${res.archived === 1 ? "" : "s"}`);
          res.blocked.forEach((m) => toast.warning(m));
          setSelected(new Set());
        }}
      />
    </>
  );
}
