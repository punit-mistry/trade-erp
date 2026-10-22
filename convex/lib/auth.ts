import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { hasPermission, type Permission } from "./roles";

export type AppErrorCode =
  | "UNAUTHENTICATED"
  | "ACCOUNT_INACTIVE"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "INVALID"
  | "CONFLICT";

/** All user-facing server errors go through this so the UI can show `message`. */
export function appError(code: AppErrorCode, message: string): ConvexError<{ code: AppErrorCode; message: string }> {
  return new ConvexError({ code, message });
}

export async function getViewer(ctx: QueryCtx | MutationCtx): Promise<Doc<"users"> | null> {
  const userId = await getAuthUserId(ctx);
  if (userId === null) return null;
  return await ctx.db.get(userId);
}

/** Authenticated AND active (approved) user — required for every business operation. */
export async function requireViewer(ctx: QueryCtx | MutationCtx): Promise<Doc<"users">> {
  const user = await getViewer(ctx);
  if (!user) throw appError("UNAUTHENTICATED", "Please sign in to continue.");
  if (user.status !== "active" || !user.role) {
    throw appError(
      "ACCOUNT_INACTIVE",
      user.status === "disabled"
        ? "Your account has been disabled. Contact an administrator."
        : "Your account is awaiting approval by an administrator.",
    );
  }
  return user;
}

export async function requirePermission(ctx: QueryCtx | MutationCtx, permission: Permission): Promise<Doc<"users">> {
  const user = await requireViewer(ctx);
  if (!hasPermission(user, permission)) {
    throw appError("FORBIDDEN", `Access denied: your role (${user.role}) cannot perform this action.`);
  }
  return user;
}

/**
 * Staff may only modify records they created or are assigned to; managers and
 * admins may modify any. Use after the base permission check.
 */
export function canModifyOwned(
  user: Doc<"users">,
  record: { createdBy: Id<"users">; assignedTo?: Id<"users"> },
): boolean {
  if (user.role === "admin" || user.role === "manager") return true;
  return record.createdBy === user._id || record.assignedTo === user._id;
}

export function assertCanModifyOwned(
  user: Doc<"users">,
  record: { createdBy: Id<"users">; assignedTo?: Id<"users"> },
  what = "record",
) {
  if (!canModifyOwned(user, record)) {
    throw appError("FORBIDDEN", `Access denied: staff can only edit a ${what} they created or are assigned to.`);
  }
}

export function displayName(user: Pick<Doc<"users">, "name" | "email"> | null | undefined): string {
  return user?.name?.trim() || user?.email || "Unknown user";
}

export async function getOrThrow<T extends "trades" | "counterparties" | "commodities" | "companies" | "contracts" | "contractTemplates" | "blDocuments" | "dispatchChecklists" | "dispatchItems" | "documents" | "tradeTemplates" | "fxRates" | "lookups" | "users">(
  ctx: QueryCtx | MutationCtx,
  id: Id<T>,
  label = "Record",
): Promise<Doc<T>> {
  const doc = await ctx.db.get(id);
  if (!doc) throw appError("NOT_FOUND", `${label} not found.`);
  return doc as Doc<T>;
}
