"use client";

import { useQuery } from "convex/react";
import { useState } from "react";
import { ChevronDown, ChevronRight, History } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import type { EntityType } from "@/convex/lib/validators";
import { EmptyState } from "@/components/shared/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateTime, formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import { actionTone, humanizeField } from "./activity-labels";

type Props = { tradeId: Id<"trades"> } | { entityType: EntityType; entityId: string };

/** Vertical audit timeline for a trade (incl. linked records) or a single entity. */
export function ActivityTimeline(props: Props) {
  const byTrade = useQuery(api.activity.forTrade, "tradeId" in props ? { tradeId: props.tradeId } : "skip");
  const byEntity = useQuery(
    api.activity.forEntity,
    "entityType" in props ? { entityType: props.entityType, entityId: props.entityId } : "skip",
  );
  const rows = "tradeId" in props ? byTrade : byEntity;

  if (rows === undefined) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Loading activity">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex gap-3">
            <Skeleton className="size-2.5 rounded-full" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-40" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={History}
        title="No activity yet"
        description="Changes, approvals and status updates will appear here."
      />
    );
  }

  return (
    <ol className="relative space-y-0">
      {rows.map((row, i) => (
        <TimelineEntry key={row._id} row={row} last={i === rows.length - 1} />
      ))}
    </ol>
  );
}

function TimelineEntry({ row, last }: { row: Doc<"activityLogs">; last: boolean }) {
  const [open, setOpen] = useState(false);
  const changes = row.changes ?? [];
  return (
    <li className="relative flex gap-3 pb-5">
      {!last && <span className="absolute top-3 left-[4.5px] h-full w-px bg-border" aria-hidden />}
      <span className={cn("relative mt-1.5 size-2.5 shrink-0 rounded-full ring-4 ring-card", actionTone(row.action))} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm">
          <span className="font-medium">{row.actorName}</span>{" "}
          <span className="text-foreground/90">{row.summary}</span>
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          <time dateTime={new Date(row._creationTime).toISOString()} title={formatDateTime(row._creationTime)}>
            {formatRelative(row._creationTime)} · {formatDateTime(row._creationTime)}
          </time>
          {row.entityLabel && <span> · {row.entityLabel}</span>}
        </p>
        {changes.length > 0 && (
          <div className="mt-1.5">
            <button
              type="button"
              onClick={() => setOpen(!open)}
              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              aria-expanded={open}
            >
              {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
              {changes.length} field change{changes.length === 1 ? "" : "s"}
            </button>
            {open && (
              <div className="mt-2 overflow-x-auto rounded-md border">
                <table className="w-full text-xs">
                  <thead className="bg-muted/60 text-left text-muted-foreground">
                    <tr>
                      <th className="px-2.5 py-1.5 font-medium">Field</th>
                      <th className="px-2.5 py-1.5 font-medium">From</th>
                      <th className="px-2.5 py-1.5 font-medium">To</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {changes.map((c, idx) => (
                      <tr key={`${c.field}-${idx}`} className="align-top">
                        <td className="px-2.5 py-1.5 font-medium whitespace-nowrap">{humanizeField(c.field)}</td>
                        <td className="max-w-64 px-2.5 py-1.5 break-words whitespace-pre-line text-muted-foreground line-through decoration-muted-foreground/40">
                          {c.from ?? "—"}
                        </td>
                        <td className="max-w-64 px-2.5 py-1.5 break-words whitespace-pre-line">{c.to ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </li>
  );
}
