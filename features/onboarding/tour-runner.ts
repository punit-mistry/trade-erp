"use client";

import { driver, type DriveStep } from "driver.js";
import "driver.js/dist/driver.css";
import "./tour.css";
import type { TourId } from "@/convex/lib/helpContent";
import { TOURS, type TourTarget } from "./tours";

function resolveTarget(target: TourTarget): Element | null | undefined {
  if (target === null) return undefined; // centred popover
  if ("anchor" in target) {
    const nodes = document.querySelectorAll(`[data-tour="${target.anchor}"]`);
    // Prefer a visible match (e.g. the desktop sidebar over a hidden mobile copy).
    for (const n of nodes) if ((n as HTMLElement).offsetParent !== null || n.getClientRects().length > 0) return n;
    return null;
  }
  const headings = document.querySelectorAll("section h2, section h3");
  for (const h of headings) {
    if (h.textContent?.trim() === target.sectionTitle) return h.closest("section");
  }
  return null;
}

/** Whether at least one step of the tour has a target on the current page. */
export function tourAvailable(id: TourId): boolean {
  return TOURS[id].steps.some((s) => s.target !== null && resolveTarget(s.target));
}

/**
 * Starts a tour, skipping steps whose element isn't on the page (role-hidden
 * items, inactive tabs, collapsed mobile sidebar). Returns false when nothing
 * on this page can be shown.
 */
export function runTour(id: TourId, onFinished?: (completed: boolean) => void): boolean {
  const def = TOURS[id];
  const steps: DriveStep[] = [];
  for (const s of def.steps) {
    const element = resolveTarget(s.target);
    if (element === null) continue;
    steps.push({
      element: element ?? undefined,
      popover: {
        title: s.title,
        description: s.description,
        side: s.side,
        align: "start",
      },
    });
  }
  if (!steps.some((s) => s.element)) return false;

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let reachedEnd = false;
  const d = driver({
    steps,
    showProgress: true,
    progressText: "{{current}} of {{total}}",
    nextBtnText: "Next →",
    prevBtnText: "← Back",
    doneBtnText: "Done",
    allowKeyboardControl: true,
    allowClose: true,
    animate: !reduceMotion,
    smoothScroll: !reduceMotion,
    stagePadding: 6,
    stageRadius: 8,
    overlayOpacity: 0.55,
    popoverClass: "erp-tour",
    onHighlightStarted: () => {
      if (d.isLastStep()) reachedEnd = true;
    },
    onDestroyed: () => onFinished?.(reachedEnd),
  });
  d.drive();
  return true;
}
