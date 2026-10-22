"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { Fragment } from "react";
import { findNavItem } from "./nav-config";
import { usePageTitle } from "./page-title";

const SEGMENT_LABELS: Record<string, string> = {
  new: "New",
  edit: "Edit",
  masters: "Companies & Masters",
  team: "Team & Access",
  profile: "My Profile",
};

const NEW_LABELS: Record<string, string> = {
  "/physical-trades": "Book Trade",
  "/suppliers": "Add Supplier",
  "/contract-templates": "New Template",
};

type Crumb = { label: string; href?: string };

function buildCrumbs(pathname: string, title: string | null): Crumb[] {
  const nav = findNavItem(pathname);
  if (!nav) {
    const last = pathname.split("/").filter(Boolean).pop() ?? "";
    return [{ label: SEGMENT_LABELS[last] ?? "Workspace" }];
  }
  const crumbs: Crumb[] = [{ label: nav.title, href: nav.href }];
  const rest = pathname.slice(nav.href.length).split("/").filter(Boolean);
  if (rest.length === 0) return crumbs;
  if (rest[0] === "new") {
    crumbs.push({ label: NEW_LABELS[nav.href] ?? "New" });
    return crumbs;
  }
  // /module/[id](/edit)
  const recordHref = `${nav.href}/${rest[0]}`;
  crumbs.push({ label: title ?? "Details", href: rest.length > 1 ? recordHref : undefined });
  if (rest[1]) crumbs.push({ label: SEGMENT_LABELS[rest[1]] ?? rest[1] });
  return crumbs;
}

export function Breadcrumbs() {
  const pathname = usePathname();
  const title = usePageTitle();
  const crumbs = buildCrumbs(pathname, title);
  return (
    <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1 text-sm">
      {crumbs.map((c, i) => {
        const last = i === crumbs.length - 1;
        return (
          <Fragment key={`${c.label}-${i}`}>
            {i > 0 && <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/60" aria-hidden />}
            {c.href && !last ? (
              <Link
                href={c.href}
                className="truncate text-muted-foreground transition-colors hover:text-foreground max-sm:hidden"
              >
                {c.label}
              </Link>
            ) : (
              <span
                className={last ? "truncate font-medium text-foreground" : "truncate text-muted-foreground"}
                aria-current={last ? "page" : undefined}
              >
                {c.label}
              </span>
            )}
          </Fragment>
        );
      })}
    </nav>
  );
}
