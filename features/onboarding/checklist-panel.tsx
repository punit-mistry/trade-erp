"use client";

import Link from "next/link";
import { CheckCircle2, ChevronDown, ChevronUp, Circle, PartyPopper, Rocket, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import type { ChecklistItem } from "@/convex/onboarding";

/**
 * Floating "Getting started" card (bottom-right). Items tick themselves from
 * real workspace data. Collapsible to a pill; dismissible (reopen from ? menu).
 */
export function ChecklistPanel({
  items,
  collapsed,
  onToggleCollapsed,
  onDismiss,
}: {
  items: ChecklistItem[];
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onDismiss: () => void;
}) {
  const done = items.filter((i) => i.done).length;
  const total = items.length;
  const percent = total === 0 ? 0 : Math.round((done / total) * 100);
  const allDone = done === total && total > 0;
  const nextItem = items.find((i) => !i.done);

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={onToggleCollapsed}
        className="no-print fixed right-4 bottom-4 z-40 flex items-center gap-2.5 rounded-full border bg-card py-1.5 pr-3 pl-1.5 text-sm shadow-lg transition-shadow hover:shadow-xl focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
        aria-label={`Getting started: ${done} of ${total} done. Expand checklist.`}
      >
        <ProgressRing percent={percent} />
        <span className="font-medium">Getting started</span>
        <span className="text-xs text-muted-foreground tabular">
          {done}/{total}
        </span>
        <ChevronUp className="size-4 text-muted-foreground" />
      </button>
    );
  }

  return (
    <section
      aria-label="Getting started checklist"
      className="no-print fixed right-4 bottom-4 z-40 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-xl border bg-card shadow-2xl"
    >
      <div className="border-b bg-gradient-to-b from-accent/70 to-card px-4 pt-3.5 pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
              {allDone ? <PartyPopper className="size-4" /> : <Rocket className="size-4" />}
            </span>
            <div>
              <h2 className="text-sm font-semibold">{allDone ? "You're all set!" : "Getting started"}</h2>
              <p className="text-xs text-muted-foreground tabular">
                {done} of {total} complete
              </p>
            </div>
          </div>
          <div className="flex items-center">
            <Button variant="ghost" size="icon-sm" onClick={onToggleCollapsed} aria-label="Minimise checklist">
              <ChevronDown />
            </Button>
            <Button variant="ghost" size="icon-sm" onClick={onDismiss} aria-label="Hide checklist">
              <X />
            </Button>
          </div>
        </div>
        <Progress value={percent} className="mt-3 h-1.5" aria-label={`${percent}% complete`} />
      </div>
      <ol className="max-h-[50vh] divide-y overflow-y-auto">
        {items.map((item) => {
          const isNext = item.key === nextItem?.key;
          return (
            <li key={item.key}>
              <Link
                href={item.href}
                onClick={() => !isNext || onToggleCollapsed()}
                className={cn(
                  "group flex items-start gap-3 px-4 py-2.5 transition-colors hover:bg-muted/60",
                  isNext && "bg-accent/40",
                )}
              >
                {item.done ? (
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-label="Done" />
                ) : (
                  <Circle
                    className={cn("mt-0.5 size-4 shrink-0", isNext ? "text-primary" : "text-muted-foreground/50")}
                    aria-label="Not done"
                  />
                )}
                <span className="min-w-0 flex-1">
                  <span
                    className={cn(
                      "block text-sm font-medium",
                      item.done && "text-muted-foreground line-through decoration-muted-foreground/40",
                    )}
                  >
                    {item.label}
                  </span>
                  {!item.done && <span className="block text-xs text-muted-foreground">{item.description}</span>}
                </span>
                {isNext && (
                  <span className="mt-0.5 shrink-0 text-xs font-medium text-primary group-hover:underline">Start →</span>
                )}
              </Link>
            </li>
          );
        })}
      </ol>
      {allDone && (
        <div className="border-t px-4 py-3 text-center">
          <Button size="sm" variant="outline" onClick={onDismiss}>
            Hide checklist
          </Button>
        </div>
      )}
    </section>
  );
}

function ProgressRing({ percent }: { percent: number }) {
  const r = 11;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 28 28" className="size-7 -rotate-90" aria-hidden>
      <circle cx="14" cy="14" r={r} fill="none" strokeWidth="3" className="stroke-muted" />
      <circle
        cx="14"
        cy="14"
        r={r}
        fill="none"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c - (percent / 100) * c}
        className="stroke-primary transition-[stroke-dashoffset] duration-500"
      />
    </svg>
  );
}
