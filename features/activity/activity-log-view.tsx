"use client";

import Link from "next/link";
import { usePaginatedQuery } from "convex/react";
import { useState } from "react";
import { History } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { EntityType } from "@/convex/lib/validators";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { AccessDenied, TableSkeleton } from "@/components/shared/states";
import { PaginationFooter, SearchInput, TableCard } from "@/components/shared/table-parts";
import { useDebouncedValue } from "@/hooks/use-debounce";
import { useViewer } from "@/hooks/use-viewer";
import { formatDateTime, formatRelative } from "@/lib/format";
import { ENTITY_TYPE_LABEL, entityHref, humanizeField } from "./activity-labels";

const PAGE_SIZE = 50;

export function ActivityLogView() {
  const { can, isLoading } = useViewer();
  const [entityType, setEntityType] = useState<EntityType | "all">("all");
  const [search, setSearch] = useState("");
  const debounced = useDebouncedValue(search.trim(), 300);
  const allowed = can("audit.view");
  const { results, status, loadMore } = usePaginatedQuery(
    api.activity.list,
    allowed
      ? { entityType: entityType === "all" ? undefined : entityType, search: debounced || undefined }
      : "skip",
    { initialNumItems: PAGE_SIZE },
  );

  if (!isLoading && !allowed) {
    return <AccessDenied message="The activity log is available to Admins and Managers." />;
  }

  return (
    <div>
      <PageHeader
        title="Activity Log"
        description="Audit trail of record changes, approvals and status transitions across the workspace."
      />
      <TableCard
        toolbar={
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <SearchInput value={search} onChange={setSearch} placeholder="Search summary, record or user…" />
            <Select value={entityType} onValueChange={(v) => setEntityType(v as EntityType | "all")}>
              <SelectTrigger className="h-8 w-full sm:w-56" aria-label="Filter by record type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All record types</SelectItem>
                {(Object.keys(ENTITY_TYPE_LABEL) as EntityType[]).map((t) => (
                  <SelectItem key={t} value={t}>
                    {ENTITY_TYPE_LABEL[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {debounced && (
              <span className="text-xs text-muted-foreground">Search filters each loaded page; load more to search further back.</span>
            )}
          </div>
        }
        footer={<PaginationFooter status={status} loaded={results.length} onLoadMore={loadMore} pageSize={PAGE_SIZE} noun="entries" />}
      >
        {status === "LoadingFirstPage" ? (
          <TableSkeleton rows={10} columns={5} />
        ) : results.length === 0 ? (
          <EmptyState icon={History} title="No activity found" description="Try a different filter or search term." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="text-xs">
                <TableHead className="h-8 w-44">When</TableHead>
                <TableHead className="h-8 w-40">User</TableHead>
                <TableHead className="h-8 w-44">Record</TableHead>
                <TableHead className="h-8">What happened</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {results.map((row) => {
                const href = entityHref(row);
                const label = row.entityLabel ?? ENTITY_TYPE_LABEL[row.entityType];
                return (
                  <TableRow key={row._id} className="align-top text-[13px]">
                    <TableCell className="py-2 whitespace-nowrap">
                      <div>{formatRelative(row._creationTime)}</div>
                      <div className="text-xs text-muted-foreground">{formatDateTime(row._creationTime)}</div>
                    </TableCell>
                    <TableCell className="py-2">{row.actorName}</TableCell>
                    <TableCell className="py-2">
                      <div className="text-xs text-muted-foreground">{ENTITY_TYPE_LABEL[row.entityType]}</div>
                      {href ? (
                        <Link href={href} className="font-medium text-primary hover:underline">
                          {label}
                        </Link>
                      ) : (
                        <span className="font-medium">{label}</span>
                      )}
                    </TableCell>
                    <TableCell className="py-2">
                      <div>{row.summary}</div>
                      {row.changes && row.changes.length > 0 && (
                        <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                          {row.changes.slice(0, 4).map((c, i) => (
                            <li key={`${c.field}-${i}`} className="truncate">
                              <span className="font-medium text-foreground/80">{humanizeField(c.field)}:</span>{" "}
                              {c.from ?? "—"} → {c.to ?? "—"}
                            </li>
                          ))}
                          {row.changes.length > 4 && <li>+{row.changes.length - 4} more changes</li>}
                        </ul>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </TableCard>
    </div>
  );
}
