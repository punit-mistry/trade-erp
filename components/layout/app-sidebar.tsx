"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Ship } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import { useViewer } from "@/hooks/use-viewer";
import { ROLE_LABELS } from "@/convex/lib/roles";
import { NAV } from "./nav-config";

export function AppSidebar() {
  const pathname = usePathname();
  const { viewer, can } = useViewer();
  const { setOpenMobile } = useSidebar();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild tooltip="Tradeline ERP">
              <Link href="/dashboard">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
                  <Ship className="size-4" />
                </div>
                <div className="grid text-left leading-tight">
                  <span className="text-sm font-semibold text-sidebar-accent-foreground">Tradeline ERP</span>
                  <span className="text-[11px] text-sidebar-foreground/70">Physical commodities</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        {NAV.map((group) => {
          const items = group.items.filter((i) => !i.permission || can(i.permission));
          if (items.length === 0) return null;
          return (
            <SidebarGroup key={group.label}>
              <SidebarGroupLabel className="text-[10.5px] font-semibold tracking-wider text-sidebar-foreground/50 uppercase">
                {group.label}
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {items.map((item) => {
                    const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                    return (
                      <SidebarMenuItem key={item.href} data-tour={`nav-${item.href.split("/").filter(Boolean).join("-")}`}>
                        <SidebarMenuButton
                          asChild
                          isActive={active}
                          tooltip={item.title}
                          className="relative h-8 text-sidebar-foreground/85 transition-colors hover:text-sidebar-accent-foreground data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium data-[active=true]:text-sidebar-accent-foreground data-[active=true]:[&>svg]:text-sidebar-primary"
                        >
                          <Link href={item.href} onClick={() => setOpenMobile(false)}>
                            {active && (
                              <span
                                aria-hidden
                                className="absolute top-1.5 bottom-1.5 left-0 w-[3px] rounded-r-full bg-sidebar-primary group-data-[collapsible=icon]:hidden"
                              />
                            )}
                            <item.icon />
                            <span>{item.title}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          );
        })}
      </SidebarContent>
      <SidebarFooter>
        {viewer && (
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" asChild tooltip={`${viewer.name || viewer.email} · My profile`}>
                <Link href="/profile" onClick={() => setOpenMobile(false)}>
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-sidebar-accent text-[11px] font-semibold text-sidebar-accent-foreground">
                    {initials(viewer.name || viewer.email)}
                  </span>
                  <span className="grid min-w-0 text-left leading-tight">
                    <span className="truncate text-[13px] font-medium text-sidebar-accent-foreground">
                      {viewer.name || viewer.email}
                    </span>
                    <span className="truncate text-[11px] text-sidebar-foreground/60">
                      {viewer.role ? ROLE_LABELS[viewer.role] : "—"}
                    </span>
                  </span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        )}
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

function initials(name?: string | null) {
  if (!name) return "?";
  return name
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}
