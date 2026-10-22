"use client";

import { usePaginatedQuery } from "convex/react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Download, FolderOpen, Upload, X } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { DocumentType } from "@/convex/lib/validators";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { TableSkeleton } from "@/components/shared/states";
import { FilterTabs, PaginationFooter, SearchInput, TableCard } from "@/components/shared/table-parts";
import { useDebouncedValue } from "@/hooks/use-debounce";
import { useViewer } from "@/hooks/use-viewer";
import { downloadCsv } from "@/lib/csv";
import { formatBytes, formatDateTime } from "@/lib/format";
import { DOCUMENT_TYPE_LABEL, REVIEW_STATUS } from "@/lib/status";
import { DocumentRowActions, DocumentVersion, ReviewBadge } from "./document-actions";
import { UploadDocumentDialog } from "./upload-document-dialog";

const PAGE_SIZE = 25;
const DOC_TYPES = Object.keys(DOCUMENT_TYPE_LABEL) as DocumentType[];
type ReviewFilter = "all" | "pending" | "approved" | "rejected";

/** Local-calendar day boundaries as epoch ms. */
function dayStart(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).getTime();
}

export function DocumentCentre() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { can } = useViewer();

  const [search, setSearch] = useState(params.get("search") ?? "");
  const debouncedSearch = useDebouncedValue(search, 300);
  const [docType, setDocType] = useState<DocumentType | "all">((params.get("type") as DocumentType) ?? "all");
  const [review, setReview] = useState<ReviewFilter>((params.get("review") as ReviewFilter) ?? "all");
  const [from, setFrom] = useState(params.get("from") ?? "");
  const [to, setTo] = useState(params.get("to") ?? "");
  const [includeArchived, setIncludeArchived] = useState(false);
  const [allVersions, setAllVersions] = useState(false);

  // "+ New → Upload Document" in the top bar links to /documents?upload=1.
  // Derived during render so a repeat click while already on this page reopens it.
  const uploadParam = params.get("upload") === "1";
  const [uploadOpen, setUploadOpen] = useState(uploadParam);
  const [seenUploadParam, setSeenUploadParam] = useState(uploadParam);
  if (uploadParam !== seenUploadParam) {
    setSeenUploadParam(uploadParam);
    if (uploadParam) setUploadOpen(true);
  }

  // Keep the URL shareable (search/type/review/date) without adding history entries.
  useEffect(() => {
    const next = new URLSearchParams();
    if (debouncedSearch.trim()) next.set("search", debouncedSearch.trim());
    if (docType !== "all") next.set("type", docType);
    if (review !== "all") next.set("review", review);
    if (from) next.set("from", from);
    if (to) next.set("to", to);
    const qs = next.toString();
    if (qs !== params.toString()) router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [debouncedSearch, docType, review, from, to, pathname, params, router]);

  const { results, status, loadMore } = usePaginatedQuery(
    api.documents.list,
    {
      search: debouncedSearch.trim() || undefined,
      docType: docType === "all" ? undefined : docType,
      reviewStatus: review === "all" ? undefined : review,
      dateFrom: from ? dayStart(from) : undefined,
      dateTo: to ? dayStart(to) + 24 * 60 * 60 * 1000 : undefined,
      includeArchived: includeArchived || undefined,
      latestOnly: !allVersions,
    },
    { initialNumItems: PAGE_SIZE },
  );

  const filtersActive = Boolean(search || docType !== "all" || review !== "all" || from || to || includeArchived || allVersions);

  function clearFilters() {
    setSearch("");
    setDocType("all");
    setReview("all");
    setFrom("");
    setTo("");
    setIncludeArchived(false);
    setAllVersions(false);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Document Centre"
        description="Every contract, invoice, packing list, certificate and B/L file in one place. Search by file name, trade number, contract number or supplier."
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              disabled={results.length === 0}
              onClick={() =>
                downloadCsv(`documents-${new Date().toISOString().slice(0, 10)}`, results, [
                  { header: "File name", value: (d) => d.fileName },
                  { header: "Type", value: (d) => DOCUMENT_TYPE_LABEL[d.docType] },
                  { header: "Trade", value: (d) => d.tradeNumber },
                  { header: "Contract", value: (d) => d.contractNumber },
                  { header: "Counterparty", value: (d) => d.counterpartyName },
                  { header: "Version", value: (d) => d.version },
                  { header: "Review status", value: (d) => REVIEW_STATUS[d.reviewStatus].label },
                  { header: "Uploaded by", value: (d) => d.uploadedByName },
                  { header: "Uploaded at", value: (d) => new Date(d._creationTime).toISOString() },
                  { header: "Notes", value: (d) => d.notes },
                ])
              }
            >
              <Download /> Export CSV
            </Button>
            {can("document.upload") && (
              <UploadDocumentDialog
                defaults={{}}
                allowTradeLink
                open={uploadOpen}
                onOpenChange={setUploadOpen}
                trigger={
                  <Button size="sm">
                    <Upload /> Upload Document
                  </Button>
                }
              />
            )}
          </>
        }
      />

      <TableCard
        toolbar={
          <div className="space-y-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <SearchInput value={search} onChange={setSearch} placeholder="File, trade no., contract no., supplier…" />
              <Select value={docType} onValueChange={(v) => setDocType(v as DocumentType | "all")}>
                <SelectTrigger className="h-8 w-48" aria-label="Document type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All document types</SelectItem>
                  {DOC_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {DOCUMENT_TYPE_LABEL[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex items-center gap-1.5">
                <Label htmlFor="doc-from" className="text-xs text-muted-foreground">From</Label>
                <Input id="doc-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-8 w-36" />
                <Label htmlFor="doc-to" className="text-xs text-muted-foreground">To</Label>
                <Input id="doc-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-8 w-36" />
              </div>
              {filtersActive && (
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  <X /> Clear filters
                </Button>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <FilterTabs
                ariaLabel="Review status"
                value={review}
                onChange={setReview}
                options={[
                  { value: "all", label: "All" },
                  { value: "pending", label: "Pending review" },
                  { value: "approved", label: "Approved" },
                  { value: "rejected", label: "Rejected" },
                ]}
              />
              <div className="flex items-center gap-2">
                <Switch id="all-versions" checked={allVersions} onCheckedChange={setAllVersions} />
                <Label htmlFor="all-versions" className="text-xs">Show older versions</Label>
              </div>
              {can("document.archive") && (
                <div className="flex items-center gap-2">
                  <Switch id="archived" checked={includeArchived} onCheckedChange={setIncludeArchived} />
                  <Label htmlFor="archived" className="text-xs">Include archived</Label>
                </div>
              )}
            </div>
          </div>
        }
        footer={<PaginationFooter status={status} loaded={results.length} onLoadMore={loadMore} pageSize={PAGE_SIZE} noun="documents" />}
      >
        {status === "LoadingFirstPage" ? (
          <TableSkeleton rows={8} columns={7} />
        ) : results.length === 0 ? (
          <EmptyState
            icon={FolderOpen}
            title={filtersActive ? "No documents match these filters" : "No documents yet"}
            description={
              filtersActive
                ? "Try a different search or clear the filters."
                : "Upload a document here, or from a trade's Documents tab so it is linked automatically."
            }
            action={
              filtersActive ? (
                <Button variant="outline" size="sm" onClick={clearFilters}>
                  Clear filters
                </Button>
              ) : undefined
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>File</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Trade</TableHead>
                <TableHead>Contract</TableHead>
                <TableHead>Supplier / counterparty</TableHead>
                <TableHead>Ver.</TableHead>
                <TableHead>Review</TableHead>
                <TableHead>Uploaded</TableHead>
                <TableHead className="w-20">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {results.map((d) => (
                <TableRow key={d._id} className={d.archived ? "opacity-60" : undefined}>
                  <TableCell className="max-w-72">
                    <div className="truncate font-medium" title={d.fileName}>
                      {d.fileName}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {formatBytes(d.size)}
                      {d.source === "generated" && " · generated"}
                      {d.notes && ` · ${d.notes}`}
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{DOCUMENT_TYPE_LABEL[d.docType]}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {d.tradeId ? (
                      <Link href={`/physical-trades/${d.tradeId}?tab=documents`} className="font-mono text-primary hover:underline">
                        {d.tradeNumber}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {d.contractId ? (
                      <Link href={`/contracts/${d.contractId}`} className="font-mono text-primary hover:underline">
                        {d.contractNumber}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="max-w-48">
                    {d.counterpartyId ? (
                      <Link href={`/suppliers/${d.counterpartyId}`} className="block truncate hover:underline">
                        {d.counterpartyName}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <DocumentVersion doc={d} />
                  </TableCell>
                  <TableCell>
                    <ReviewBadge doc={d} />
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    <div className="text-xs">{formatDateTime(d._creationTime)}</div>
                    <div className="text-xs text-muted-foreground">{d.uploadedByName}</div>
                  </TableCell>
                  <TableCell>
                    <DocumentRowActions doc={d} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </TableCard>
    </div>
  );
}
