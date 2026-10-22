"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, Plus, UserRound } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useViewer } from "@/hooks/use-viewer";
import { ROLE_LABELS } from "@/convex/lib/roles";
import { CommandPalette } from "./command-palette";
import { findNavItem } from "./nav-config";

function initials(name?: string | null) {
  if (!name) return "?";
  return name
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

export function Topbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { signOut } = useAuthActions();
  const { viewer, can } = useViewer();
  const current = findNavItem(pathname);

  return (
    <header className="no-print sticky top-0 z-20 flex h-12 shrink-0 items-center gap-2 border-b bg-background/90 px-3 backdrop-blur md:px-4">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-1 data-[orientation=vertical]:h-4" />
      <nav aria-label="Breadcrumb" className="hidden min-w-0 items-center gap-1.5 text-sm sm:flex">
        {current ? (
          <Link href={current.href} className="truncate font-medium text-foreground hover:underline">
            {current.title}
          </Link>
        ) : (
          <span className="text-muted-foreground">Workspace</span>
        )}
      </nav>
      <div className="ml-auto flex items-center gap-2">
        <CommandPalette />
        {can("trade.create") && (
          <Button size="sm" asChild className="hidden md:inline-flex">
            <Link href="/physical-trades/new">
              <Plus /> Book Trade
            </Link>
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="rounded-full" aria-label="Account menu">
              <Avatar className="size-7">
                <AvatarFallback className="bg-accent text-[11px] font-semibold text-accent-foreground">
                  {initials(viewer?.name || viewer?.email)}
                </AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="font-normal">
              <div className="truncate text-sm font-medium">{viewer?.name || "—"}</div>
              <div className="truncate text-xs text-muted-foreground">{viewer?.email}</div>
              {viewer?.role && <div className="mt-1 text-xs text-muted-foreground">Role: {ROLE_LABELS[viewer.role]}</div>}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/profile">
                <UserRound /> My profile
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={async () => {
                await signOut();
                router.replace("/signin");
              }}
            >
              <LogOut /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
