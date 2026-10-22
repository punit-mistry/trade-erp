"use client";

import { useSyncExternalStore } from "react";
import type { TourId } from "@/convex/lib/helpContent";

/**
 * Tiny UI store shared by the top-bar HelpMenu and the OnboardingHost (they
 * live in different parts of the tree). Holds only transient UI state; the
 * persistent preferences are in Convex (`onboarding.updatePrefs`).
 */
type State = {
  welcomeOpen: boolean;
  shortcutsOpen: boolean;
  /** Bumped to ask the host to expand/show the checklist. */
  checklistRequest: number;
  /** Tour to start once `path` (if any) is the current page and anchors exist. */
  pendingTour: { id: TourId; path?: string } | null;
};

let state: State = { welcomeOpen: false, shortcutsOpen: false, checklistRequest: 0, pendingTour: null };
const listeners = new Set<() => void>();

function set(patch: Partial<State>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export const onboarding = {
  openWelcome: () => set({ welcomeOpen: true }),
  closeWelcome: () => set({ welcomeOpen: false }),
  openShortcuts: () => set({ shortcutsOpen: true }),
  closeShortcuts: () => set({ shortcutsOpen: false }),
  showChecklist: () => set({ checklistRequest: state.checklistRequest + 1 }),
  startTour: (id: TourId, path?: string) => set({ pendingTour: { id, path } }),
  clearPendingTour: () => set({ pendingTour: null }),
};

export function useOnboardingState(): State {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
    () => state,
  );
}
