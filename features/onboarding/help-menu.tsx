"use client";

import { CircleHelp, Compass, Keyboard, LifeBuoy, ListChecks, Sparkles } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { onboarding } from "./onboarding-store";
import { tourAvailable } from "./tour-runner";
import { tourForPath } from "./tours";

/**
 * Top-bar help menu: page tour, workspace tour, getting-started checklist and
 * keyboard shortcuts. Tour availability is checked when the menu opens, because
 * the anchors only exist after the page has rendered.
 */
export function HelpMenu() {
  const pathname = usePathname();
  const [pageTourReady, setPageTourReady] = useState(false);
  const pageTour = tourForPath(pathname);

  return (
    <div data-tour="help">
      <DropdownMenu
        onOpenChange={(next) => {
          if (next) setPageTourReady(pageTour ? tourAvailable(pageTour) : false);
        }}
      >
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label="Help, tours and shortcuts" title="Help">
            <CircleHelp />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel>Help</DropdownMenuLabel>
          <DropdownMenuItem
            disabled={!pageTour || !pageTourReady}
            onSelect={() => {
              if (pageTour) onboarding.startTour(pageTour);
            }}
          >
            <Compass /> Take the tour of this page
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onboarding.startTour("workspace")}>
            <Sparkles /> Restart the workspace tour
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => onboarding.showChecklist()}>
            <ListChecks /> Getting started checklist
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onboarding.openShortcuts()}>
            <Keyboard /> Keyboard shortcuts
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href="/help">
              <LifeBuoy /> Help Centre
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
