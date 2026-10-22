"use client";

import Link from "next/link";
import { HelpCircle } from "lucide-react";
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

const ACCENTS: Record<string, string> = {
  activeContracts: "bg-primary",
  pendingSignatures: "bg-warning",
  rateFixed: "bg-cyan",
  closedThisMonth: "bg-success",
};

export function KpiCard({ kpi, compact = false }: { kpi: Kpi; compact?: boolean }) {
  return (
    <Link
      href={kpi.href}
      className={cn(
        "group relative flex flex-col justify-between overflow-hidden rounded-lg border bg-card shadow-xs transition-colors hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none",
        compact ? "px-3.5 py-2.5" : "px-4 py-3.5",
      )}
    >
      {!compact && (
        <span className={cn("absolute inset-y-0 left-0 w-0.5", ACCENTS[kpi.key] ?? "bg-border")} aria-hidden />
      )}
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        {kpi.label}
        <DefinitionTip text={kpi.definition} label={kpi.label} />
      </div>
      <div
        className={cn(
          "tabular font-semibold tracking-tight text-foreground",
          compact ? "mt-0.5 text-lg" : "mt-1.5 text-2xl",
        )}
      >
        {formatNumber(kpi.value, 0)}
        {kpi.capped && <span className="text-base text-muted-foreground">+</span>}
      </div>
    </Link>
  );
}

export function KpiSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="h-[86px] rounded-lg" />
      ))}
    </div>
  );
}
