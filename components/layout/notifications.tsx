"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { Bell, CheckCircle2, ChevronRight } from "lucide-react";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { todayIso } from "@/lib/format";

/** Bell with the real pending-action queues (same source as the dashboard). */
export function Notifications() {
  const [open, setOpen] = useState(false);
  const queues = useQuery(api.dashboard.pendingActions, { today: todayIso() });
  const total = queues?.reduce((sum, q) => sum + q.count, 0) ?? 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={total > 0 ? `${total} pending actions` : "No pending actions"}
          data-tour="notifications"
        >
          <Bell />
          {total > 0 && (
            <span className="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] leading-none font-semibold text-white tabular">
              {total > 99 ? "99+" : total}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[22rem] p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <p className="text-sm font-semibold">Pending actions</p>
            <p className="text-xs text-muted-foreground">Work waiting on you and your team</p>
          </div>
          <Link
            href="/dashboard"
            onClick={() => setOpen(false)}
            className="text-xs font-medium text-primary hover:underline"
          >
            Dashboard
          </Link>
        </div>
        {queues === undefined ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">Loading…</p>
        ) : queues.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
            <CheckCircle2 className="size-6 text-success" />
            <p className="text-sm font-medium">You&apos;re all caught up</p>
            <p className="text-xs text-muted-foreground">No contracts, approvals or checklists need attention.</p>
          </div>
        ) : (
          <ScrollArea className="max-h-96">
            <ul className="divide-y">
              {queues.map((q) => (
                <li key={q.key}>
                  <Link
                    href={q.href}
                    onClick={() => setOpen(false)}
                    className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-muted/60"
                  >
                    <span className="mt-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-[11px] font-semibold text-accent-foreground tabular">
                      {q.capped ? `${q.count}+` : q.count}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">{q.label}</span>
                      <span className="line-clamp-2 block text-xs text-muted-foreground">{q.description}</span>
                    </span>
                    <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  </Link>
                </li>
              ))}
            </ul>
          </ScrollArea>
        )}
      </PopoverContent>
    </Popover>
  );
}
