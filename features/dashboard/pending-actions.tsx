"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { ChevronRight, CircleCheckBig } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { Section } from "@/components/shared/section";
import { DefinitionTip } from "./kpi-cards";

export function PendingActions({ today }: { today: string }) {
  const queues = useQuery(api.dashboard.pendingActions, { today });

  return (
    <Section title="Pending Actions" description="Work waiting on you and your team" contentClassName="p-0">
      {queues === undefined ? (
        <div className="space-y-3 p-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-12" />
          ))}
        </div>
      ) : queues.length === 0 ? (
        <EmptyState icon={CircleCheckBig} title="All clear" description="No contracts, approvals or documents need attention." />
      ) : (
        <ul className="divide-y">
          {queues.map((q) => (
            <li key={q.key} className="px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-1.5">
                  <Link href={q.href} className="truncate text-sm font-medium hover:underline">
                    {q.label}
                  </Link>
                  <DefinitionTip text={q.description} label={q.label} />
                </div>
                <span className="tabular rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-accent-foreground">
                  {q.count}
                  {q.capped ? "+" : ""}
                </span>
              </div>
              {q.items.length > 0 && (
                <ul className="mt-1.5 space-y-0.5">
                  {q.items.map((item) => (
                    <li key={item.id}>
                      <Link
                        href={item.href}
                        className="group flex items-center gap-2 rounded-md px-1.5 py-1 text-[13px] hover:bg-muted"
                      >
                        <span className="font-medium whitespace-nowrap">{item.label}</span>
                        {item.detail && <span className="min-w-0 truncate text-xs text-muted-foreground">{item.detail}</span>}
                        <ChevronRight className="ml-auto size-3.5 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100" />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
