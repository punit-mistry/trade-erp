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
              <SidebarGroupLabel className="text-[10.5px] tracking-wider uppercase text-sidebar-foreground/55">
                {group.label}
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {items.map((item) => {
                    const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                    return (
                      <SidebarMenuItem key={item.href}>
                        <SidebarMenuButton asChild isActive={active} tooltip={item.title}>
                          <Link href={item.href} onClick={() => setOpenMobile(false)}>
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
          <div className="rounded-md px-2 py-1.5 text-xs group-data-[collapsible=icon]:hidden">
            <div className="truncate font-medium text-sidebar-accent-foreground">{viewer.name || viewer.email}</div>
            <div className="text-sidebar-foreground/60">{viewer.role ? ROLE_LABELS[viewer.role] : "—"}</div>
          </div>
        )}
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
