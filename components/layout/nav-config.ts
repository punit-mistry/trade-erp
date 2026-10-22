import {
  Activity,
  Building2,
  FileSignature,
  FileText,
  FolderOpen,
  LayoutDashboard,
  ScrollText,
  Ship,
  ArrowLeftRight,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { Permission } from "@/convex/lib/roles";

export type NavItem = { title: string; href: string; icon: LucideIcon; permission?: Permission };
export type NavGroup = { label: string; items: NavItem[] };

/** Single source of truth for routes shown in the sidebar and breadcrumbs. */
export const NAV: NavGroup[] = [
  { label: "Workspace", items: [{ title: "Dashboard", href: "/dashboard", icon: LayoutDashboard }] },
  {
    label: "Trade Operations",
    items: [
      { title: "Suppliers", href: "/suppliers", icon: Building2 },
      { title: "Physical Trades", href: "/physical-trades", icon: ArrowLeftRight },
      { title: "Contracts", href: "/contracts", icon: FileSignature },
      { title: "B/L & Dispatch", href: "/dispatch", icon: Ship },
      { title: "Document Centre", href: "/documents", icon: FolderOpen },
    ],
  },
  {
    label: "Administration",
    items: [
      { title: "Team & Access", href: "/admin/team", icon: Users, permission: "users.manage" },
      { title: "Companies & Masters", href: "/admin/masters", icon: FileText, permission: "masters.manage" },
      { title: "Contract Templates", href: "/contract-templates", icon: ScrollText },
      { title: "Activity Log", href: "/activity", icon: Activity, permission: "audit.view" },
    ],
  },
];

export function findNavItem(pathname: string): NavItem | undefined {
  return NAV.flatMap((g) => g.items).find((i) => pathname === i.href || pathname.startsWith(`${i.href}/`));
}
