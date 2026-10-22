"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { Check, ChevronDown, LogOut, Monitor, Moon, Sun, UserRound } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { AiAssistantButton } from "@/features/ai/ai-assistant-button";
import { HelpMenu } from "@/features/onboarding/help-menu";
import { useViewer } from "@/hooks/use-viewer";
import { ROLE_LABELS } from "@/convex/lib/roles";
import { Breadcrumbs } from "./breadcrumbs";
import { CommandPalette } from "./command-palette";
import { Notifications } from "./notifications";
import { QuickCreate } from "./quick-create";

function initials(name?: string | null) {
  if (!name) return "?";
  return name
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

const THEMES = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
] as const;

/**
 * Top bar: sidebar toggle · breadcrumbs (section › record) on the left;
 * search · quick create · AI assistant · notifications · help · account on the right.
 */
export function Topbar() {
  const router = useRouter();
  const { signOut } = useAuthActions();
  const { viewer } = useViewer();
  const { theme, setTheme } = useTheme();
  const displayName = viewer?.name || viewer?.email || "";

  return (
    <header className="no-print sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b bg-background/85 px-3 backdrop-blur-md supports-[backdrop-filter]:bg-background/70 md:px-5">
      <SidebarTrigger className="-ml-1 text-muted-foreground hover:text-foreground" />
      <Separator orientation="vertical" className="mx-1 data-[orientation=vertical]:h-5" />
      <div className="min-w-0 flex-1">
        <Breadcrumbs />
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <div data-tour="global-search">
          <CommandPalette />
        </div>
        <QuickCreate />
        <Separator orientation="vertical" className="mx-1 data-[orientation=vertical]:h-5 max-sm:hidden" />
        <AiAssistantButton />
        <Notifications />
        <HelpMenu />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="h-9 gap-2 rounded-full pr-2 pl-1 md:rounded-lg"
              aria-label="Account menu"
              data-tour="user-menu"
            >
              <Avatar className="size-7">
                <AvatarFallback className="bg-primary/10 text-[11px] font-semibold text-primary">
                  {initials(displayName)}
                </AvatarFallback>
              </Avatar>
              <span className="hidden max-w-36 flex-col items-start leading-tight lg:flex">
                <span className="truncate text-[13px] font-medium">{viewer?.name || viewer?.email}</span>
                <span className="text-[11px] text-muted-foreground">
                  {viewer?.role ? ROLE_LABELS[viewer.role] : "—"}
                </span>
              </span>
              <ChevronDown className="size-3.5 text-muted-foreground max-lg:hidden" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            <DropdownMenuLabel className="font-normal">
              <div className="flex items-center gap-2.5">
                <Avatar className="size-9">
                  <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
                    {initials(displayName)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{viewer?.name || "—"}</div>
                  <div className="truncate text-xs text-muted-foreground">{viewer?.email}</div>
                </div>
              </div>
              {viewer?.role && (
                <div className="mt-2 inline-flex rounded-full bg-accent px-2 py-0.5 text-[11px] font-medium text-accent-foreground">
                  {ROLE_LABELS[viewer.role]}
                </div>
              )}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem asChild>
                <Link href="/profile">
                  <UserRound /> My profile
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  {theme === "dark" ? <Moon /> : theme === "system" ? <Monitor /> : <Sun />}
                  Appearance
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  {THEMES.map((t) => (
                    <DropdownMenuItem key={t.value} onSelect={() => setTheme(t.value)}>
                      <t.icon /> {t.label}
                      {theme === t.value && <Check className="ml-auto" />}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
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
