"use client";

import { ArrowDown, ArrowUp, ArrowUpDown, Loader2, Search, X } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** Rounded bordered container for list tables with a sticky header-friendly scroll area. */
export function TableCard({ toolbar, children, footer }: { toolbar?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-lg border bg-card shadow-xs" data-tour="list-table">
      {toolbar && <div className="border-b px-3 py-2.5">{toolbar}</div>}
      <div className="max-h-[calc(100vh-260px)] min-h-40 overflow-auto [&_thead]:sticky [&_thead]:top-0 [&_thead]:z-10 [&_thead]:bg-muted/80 [&_thead]:backdrop-blur">
        {children}
      </div>
      {footer && <div className="border-t px-3 py-2">{footer}</div>}
    </div>
  );
}

export function SearchInput({
  value,
  onChange,
  placeholder = "Search…",
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={cn("relative w-full sm:w-72", className)} data-tour="list-search">
      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-8 pr-7 pl-8"
        aria-label={placeholder}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          aria-label="Clear search"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}

/** Segmented filter (All / Draft / Confirmed …). */
export function FilterTabs<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string; count?: number }[];
  ariaLabel: string;
}) {
  return (
    <div role="tablist" aria-label={ariaLabel} data-tour="filters" className="inline-flex flex-wrap items-center gap-0.5 rounded-lg bg-muted p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "h-7 rounded-md px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none",
            value === o.value && "bg-background text-foreground shadow-xs",
          )}
        >
          {o.label}
          {o.count !== undefined && <span className="ml-1 text-muted-foreground tabular">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

export type SortDir = "asc" | "desc";

export function SortHeader({
  label,
  active,
  dir,
  onClick,
  align = "left",
}: {
  label: string;
  active: boolean;
  dir: SortDir;
  onClick: () => void;
  align?: "left" | "right";
}) {
  const Icon = !active ? ArrowUpDown : dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 font-medium hover:text-foreground",
        align === "right" && "w-full justify-end",
        active && "text-foreground",
      )}
      aria-label={`Sort by ${label}`}
    >
      {label}
      <Icon className={cn("size-3", !active && "opacity-40")} />
    </button>
  );
}

/**
 * Footer for Convex `usePaginatedQuery` lists (cursor pagination).
 * status: "LoadingFirstPage" | "CanLoadMore" | "LoadingMore" | "Exhausted".
 */
export function PaginationFooter({
  status,
  loaded,
  onLoadMore,
  pageSize,
  noun = "records",
}: {
  status: "LoadingFirstPage" | "CanLoadMore" | "LoadingMore" | "Exhausted";
  loaded: number;
  onLoadMore: (n: number) => void;
  pageSize: number;
  noun?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
      <span className="tabular">
        {status === "LoadingFirstPage" ? "Loading…" : `Showing ${loaded} ${noun}${status === "Exhausted" ? "" : " (more available)"}`}
      </span>
      {(status === "CanLoadMore" || status === "LoadingMore") && (
        <Button variant="outline" size="sm" onClick={() => onLoadMore(pageSize)} disabled={status === "LoadingMore"}>
          {status === "LoadingMore" && <Loader2 className="animate-spin" />}
          Load {pageSize} more
        </Button>
      )}
    </div>
  );
}
