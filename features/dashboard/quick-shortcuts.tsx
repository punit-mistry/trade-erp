"use client";

import Link from "next/link";
import { ArrowLeftRight, Building2, ClipboardCheck, FolderOpen, Ship, type LucideIcon } from "lucide-react";
import { useViewer } from "@/hooks/use-viewer";
import type { Permission } from "@/convex/lib/roles";

type Shortcut = { label: string; hint: string; href: string; icon: LucideIcon; permission?: Permission };

/** Role-aware one-click shortcuts shown under the dashboard greeting. */
const SHORTCUTS: Shortcut[] = [
  { label: "Book a trade", hint: "Guided 5-step form", href: "/physical-trades/new", icon: ArrowLeftRight, permission: "trade.create" },
  { label: "Review approvals", hint: "Trades waiting for you", href: "/physical-trades?status=pending_review", icon: ClipboardCheck, permission: "trade.confirm" },
  { label: "Add a supplier", hint: "Save default terms once", href: "/suppliers/new", icon: Building2, permission: "counterparty.create" },
  { label: "Dispatch board", hint: "B/Ls & checklists", href: "/dispatch", icon: Ship },
  { label: "Documents", hint: "Search & upload files", href: "/documents", icon: FolderOpen },
];

export function QuickShortcuts() {
  const { can } = useViewer();
  const items = SHORTCUTS.filter((s) => !s.permission || can(s.permission)).slice(0, 4);
  return (
    <nav aria-label="Shortcuts" className="grid grid-cols-2 gap-2 md:grid-cols-4">
      {items.map((s) => (
        <Link
          key={s.href}
          href={s.href}
          className="group flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5 shadow-xs transition-colors hover:border-primary/40 hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-accent text-accent-foreground transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
            <s.icon className="size-4" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[13px] font-medium">{s.label}</span>
            <span className="block truncate text-[11px] text-muted-foreground">{s.hint}</span>
          </span>
        </Link>
      ))}
    </nav>
  );
}
