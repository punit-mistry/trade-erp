"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { hasPermission, type Permission } from "@/convex/lib/roles";

/**
 * Current user + permission helper for the UI. Hiding buttons is only a UX
 * nicety — Convex functions enforce the same matrix server-side.
 */
export function useViewer() {
  const viewer = useQuery(api.users.me);
  return {
    viewer,
    isLoading: viewer === undefined,
    can: (permission: Permission) => hasPermission(viewer ?? null, permission),
  };
}
