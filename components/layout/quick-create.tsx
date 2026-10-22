"use client";

import Link from "next/link";
import { ArrowLeftRight, Building2, ChevronDown, Plus, ScrollText, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useViewer } from "@/hooks/use-viewer";

/** "+ New" menu: the most common create actions, filtered by role. */
export function QuickCreate() {
  const { can } = useViewer();
  const items = [
    { label: "Book Trade", href: "/physical-trades/new", icon: ArrowLeftRight, show: can("trade.create"), hint: "Most used" },
    { label: "Add Supplier", href: "/suppliers/new", icon: Building2, show: can("counterparty.create") },
    { label: "Upload Document", href: "/documents?upload=1", icon: Upload, show: can("document.upload") },
    { label: "Contract Template", href: "/contract-templates/new", icon: ScrollText, show: can("contractTemplate.manage") },
  ].filter((i) => i.show);
  if (items.length === 0) return null;

  return (
    <div className="flex items-center" data-tour="quick-create">
      <Button size="sm" asChild className="rounded-r-none max-md:hidden">
        <Link href={items[0].href}>
          <Plus /> {items[0].label}
        </Link>
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="sm"
            className="rounded-l-none border-l border-primary-foreground/20 px-1.5 max-md:rounded-lg max-md:px-2"
            aria-label="Create new…"
          >
            <Plus className="md:hidden" />
            <ChevronDown className="max-md:hidden" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="text-xs text-muted-foreground">Create new</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {items.map((i) => (
            <DropdownMenuItem key={i.href} asChild>
              <Link href={i.href}>
                <i.icon />
                {i.label}
                {i.hint && <DropdownMenuShortcut>{i.hint}</DropdownMenuShortcut>}
              </Link>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
