"use client";

import { useMutation, useQuery } from "convex/react";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { api } from "@/convex/_generated/api";
import { useViewer } from "@/hooks/use-viewer";
import { ChecklistPanel } from "./checklist-panel";
import { onboarding, useOnboardingState } from "./onboarding-store";
import { ShortcutsDialog } from "./shortcuts-dialog";
import { runTour, tourAvailable } from "./tour-runner";
import { WelcomeDialog } from "./welcome-dialog";

/**
 * Mounts the first-run experience: welcome dialog, getting-started checklist,
 * keyboard-shortcut sheet and queued guided tours. Preferences live in Convex
 * (`onboarding.updatePrefs`); transient UI state comes from the shared store so
 * the top-bar help menu can drive it.
 */
export function OnboardingHost() {
  const pathname = usePathname();
  const { viewer } = useViewer();
  const progress = useQuery(api.onboarding.progress);
  const updatePrefs = useMutation(api.onboarding.updatePrefs);
  const state = useOnboardingState();

  const autoWelcomeDone = useRef(false);
  const lastChecklistRequest = useRef(state.checklistRequest);

  const role = viewer?.role;
  const prefs = progress?.prefs;

  // Show the welcome dialog once for a first-time user.
  useEffect(() => {
    if (autoWelcomeDone.current || !progress || !role) return;
    autoWelcomeDone.current = true;
    if (progress.prefs.welcomeSeenAt === null) onboarding.openWelcome();
  }, [progress, role]);

  // "Getting started checklist" from the help menu: reveal it even if hidden.
  useEffect(() => {
    if (state.checklistRequest === lastChecklistRequest.current) return;
    lastChecklistRequest.current = state.checklistRequest;
    void updatePrefs({ checklistCollapsed: false, checklistDismissed: false });
  }, [state.checklistRequest, updatePrefs]);

  // Run a tour requested by the welcome dialog or help menu, once its anchors
  // have rendered. Tours that cannot run on this page are dropped silently.
  const pendingTour = state.pendingTour;
  useEffect(() => {
    if (!pendingTour) return;
    if (pendingTour.path && pendingTour.path !== pathname) return;
    const timer = window.setTimeout(() => {
      onboarding.clearPendingTour();
      if (!tourAvailable(pendingTour.id)) return;
      runTour(pendingTour.id, (completed) => {
        if (completed) void updatePrefs({ tourCompleted: pendingTour.id });
      });
    }, 350);
    return () => window.clearTimeout(timer);
  }, [pendingTour, pathname, updatePrefs]);

  // "?" opens the shortcut list, except while typing or with modifiers held.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "?" || e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      e.preventDefault();
      onboarding.openShortcuts();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  if (!progress || !prefs || !role) return null;

  return (
    <>
      <WelcomeDialog
        open={state.welcomeOpen}
        role={role}
        name={viewer?.name}
        onStartTour={() => {
          onboarding.closeWelcome();
          void updatePrefs({ welcomeSeen: true });
          onboarding.startTour("workspace");
        }}
        onSkip={() => {
          onboarding.closeWelcome();
          void updatePrefs({ welcomeSeen: true });
        }}
      />

      {!prefs.checklistDismissed && (
        <ChecklistPanel
          items={progress.items}
          collapsed={prefs.checklistCollapsed}
          onToggleCollapsed={() => void updatePrefs({ checklistCollapsed: !prefs.checklistCollapsed })}
          onDismiss={() => void updatePrefs({ checklistDismissed: true })}
        />
      )}

      <ShortcutsDialog
        open={state.shortcutsOpen}
        onOpenChange={(next) => (next ? onboarding.openShortcuts() : onboarding.closeShortcuts())}
      />
    </>
  );
}
