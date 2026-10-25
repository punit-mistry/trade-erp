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
        aria-label={
          total > 0 ? `${total} pending actions` : "No pending actions"
        }
        data-tour="notifications"
      >
        <Bell className="size-5" />

        {total > 0 && (
          <span className="absolute -right-1 -top-1 z-10 flex h-4 min-w-4 items-center justify-center rounded-full border-2 border-background bg-destructive px-1 text-[10px] leading-none font-semibold text-white tabular-nums">
            {total > 99 ? "99+" : total}
          </span>
        )}
      </Button>
    </PopoverTrigger>

    <PopoverContent
      align="end"
      sideOffset={8}
      className="flex h-[min(32rem,calc(100dvh-6rem))] w-[22rem] max-w-[calc(100vw-2rem)] flex-col overflow-hidden p-0"
    >
      <div className="flex shrink-0 items-center justify-between border-b px-4 py-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold">Pending actions</p>
          <p className="text-xs text-muted-foreground">
            Work waiting on you and your team
          </p>
        </div>

        <Link
          href="/dashboard"
          onClick={() => setOpen(false)}
          className="shrink-0 text-xs font-medium text-primary hover:underline"
        >
          Dashboard
        </Link>
      </div>

      {queues === undefined ? (
        <div className="flex flex-1 items-center justify-center px-4 py-6">
          <p className="text-center text-sm text-muted-foreground">
            Loading…
          </p>
        </div>
      ) : queues.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 py-8 text-center">
          <CheckCircle2 className="size-6 text-success" />
          <p className="text-sm font-medium">You&apos;re all caught up</p>
          <p className="text-xs text-muted-foreground">
            No contracts, approvals or checklists need attention.
          </p>
        </div>
      ) : (
        <ScrollArea className="min-h-0 w-full flex-1 overscroll-contain">
          <ul className="divide-y">
            {queues.map((q) => (
              <li key={q.key}>
                <Link
                  href={q.href}
                  onClick={() => setOpen(false)}
                  className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-muted/60"
                >
                  <span className="mt-0.5 flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-accent px-1.5 text-[11px] font-semibold text-accent-foreground tabular-nums">
                    {q.capped ? `${q.count}+` : q.count}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">
                      {q.label}
                    </span>
                    <span className="line-clamp-2 block text-xs text-muted-foreground">
                      {q.description}
                    </span>
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
