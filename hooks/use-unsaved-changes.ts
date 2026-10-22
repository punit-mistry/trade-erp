"use client";

import { useEffect } from "react";

/**
 * Warns before closing/reloading the tab while `dirty`. For in-app link
 * navigation, pair with a confirm dialog on your Cancel/back buttons.
 */
export function useUnsavedChangesWarning(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);
}
