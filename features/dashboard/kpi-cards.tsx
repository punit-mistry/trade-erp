"use client";

import Link from "next/link";
import { ArrowUpRight, CheckCircle2, FileSignature, HelpCircle, PenLine, Percent, type LucideIcon } from "lucide-react";
import type { FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

type Summary = FunctionReturnType<typeof api.dashboard.summary>;
type Kpi = Summary["primary"][number];

export function DefinitionTip({ text, label }: { text: string; label: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="text-muted-foreground/70 hover:text-foreground"
          aria-label={`How "${label}" is calculated`}
          onClick={(e) => e.preventDefault()}
        >
          <HelpCircle className="size-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">{text}</TooltipContent>
    </Tooltip>
  );
}

const ACCENTS: Record<string, { bar: string; icon: LucideIcon; chip: string }> = {
  activeContracts: { bar: "bg-primary", icon: FileSignature, chip: "bg-primary/10 text-primary" },
  pendingSignatures: { bar: "bg-warning", icon: PenLine, chip: "bg-warning/15 text-warning" },
  rateFixed: { bar: "bg-cyan", icon: Percent, chip: "bg-cyan/15 text-cyan" },
  closedThisMonth: { bar: "bg-success", icon: CheckCircle2, chip: "bg-success/10 text-success" },
};

export function KpiCard({ kpi, compact = false }: { kpi: Kpi; compact?: boolean }) {
  const accent = ACCENTS[kpi.key];
  const Icon = accent?.icon;
  return (
    <Link
      href={kpi.href}
      className={cn(
        "group relative flex flex-col justify-between overflow-hidden rounded-lg border bg-card shadow-xs transition-colors hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none",
        compact ? "px-3.5 py-2.5" : "px-4 py-3.5",
      )}
    >
      {!compact && <span className={cn("absolute inset-y-0 left-0 w-0.5", accent?.bar ?? "bg-border")} aria-hidden />}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          {kpi.label}
          <DefinitionTip text={kpi.definition} label={kpi.label} />
        </div>
        {!compact && Icon && (
          <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-md", accent.chip)} aria-hidden>
            <Icon className="size-3.5" />
          </span>
        )}
      </div>
      <div className="flex items-end justify-between gap-2">
        <div
          className={cn(
            "tabular font-semibold tracking-tight text-foreground",
            compact ? "mt-0.5 text-lg" : "mt-1 text-[28px] leading-none",
          )}
        >
          {formatNumber(kpi.value, 0)}
          {kpi.capped && <span className="text-base text-muted-foreground">+</span>}
        </div>
        <span className="flex items-center gap-0.5 text-[11px] font-medium text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 motion-reduce:transition-none">
          View <ArrowUpRight className="size-3" />
        </span>
      </div>
    </Link>
  );
}

export function KpiSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="h-[92px] rounded-lg" />
      ))}
    </div>
  );
}
