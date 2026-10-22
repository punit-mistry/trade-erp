import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { logActivity } from "./lib/audit";
import { appError, displayName, getOrThrow, getViewer, requirePermission, requireViewer } from "./lib/auth";
import { GRANTABLE } from "./lib/roles";
import { roleV, userStatusV } from "./lib/validators";

/** Current viewer profile (null when signed out). Safe fields only. */
export const me = query({
  args: {},
  handler: async (ctx) => {
    const user = await getViewer(ctx);
    if (!user) return null;
    return {
      _id: user._id,
      name: user.name,
      email: user.email,
      title: user.title,
      role: user.role ?? null,
      status: user.status ?? "pending",
      grants: user.grants ?? [],
    };
  },
});

/** Minimal directory of active users for assignee pickers (any active user). */
export const directory = query({
  args: {},
  handler: async (ctx) => {
    await requireViewer(ctx);
    const users = await ctx.db
      .query("users")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .take(500);
    return users.map((u) => ({ _id: u._id, name: displayName(u), role: u.role ?? null }));
  },
});

/** Full user list — admin only. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    await requirePermission(ctx, "users.manage");
    const users = await ctx.db.query("users").take(1000);
    return users
      .map((u) => ({
        _id: u._id,
        _creationTime: u._creationTime,
        name: u.name,
        email: u.email,
        title: u.title,
        role: u.role ?? null,
        status: u.status ?? "pending",
        grants: u.grants ?? [],
      }))
      .sort((a, b) => (a.status === "pending" ? -1 : 0) - (b.status === "pending" ? -1 : 0) || a._creationTime - b._creationTime);
  },
});

/**
 * Self-service profile update. Deliberately accepts only name/title — role,
 * status and grants can never be changed through this path.
 */
export const updateProfile = mutation({
  args: { name: v.optional(v.string()), title: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const user = await requireViewer(ctx);
    const patch = {
      ...(args.name !== undefined ? { name: args.name.trim().slice(0, 120) } : {}),
      ...(args.title !== undefined ? { title: args.title.trim().slice(0, 120) } : {}),
      updatedAt: Date.now(),
    };
    await ctx.db.patch(user._id, patch);
  },
});

/** Admin-only: change another user's role/status/grants. */
export const setAccess = mutation({
  args: {
    userId: v.id("users"),
    role: v.optional(roleV),
    status: v.optional(userStatusV),
    grants: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const admin = await requirePermission(ctx, "users.manage");
    const target = await getOrThrow(ctx, args.userId, "User");
    if (target._id === admin._id && (args.role !== undefined || args.status !== undefined)) {
      throw appError("FORBIDDEN", "You cannot change your own role or status. Ask another administrator.");
    }
    if (args.grants && args.grants.some((g) => !(GRANTABLE as string[]).includes(g))) {
      throw appError("INVALID", "Unknown permission grant.");
    }
    // Never allow the last active admin to be demoted/disabled.
    const demotingAdmin =
      target.role === "admin" &&
      ((args.role !== undefined && args.role !== "admin") || (args.status !== undefined && args.status !== "active"));
    if (demotingAdmin) {
      const admins = await ctx.db
        .query("users")
        .withIndex("by_role", (q) => q.eq("role", "admin"))
        .take(50);
      if (admins.filter((a) => a.status === "active").length <= 1) {
        throw appError("CONFLICT", "At least one active administrator is required.");
      }
    }
    const patch = {
      ...(args.role !== undefined ? { role: args.role } : {}),
      ...(args.status !== undefined ? { status: args.status } : {}),
      ...(args.grants !== undefined ? { grants: args.grants } : {}),
      updatedAt: Date.now(),
    };
    await ctx.db.patch(target._id, patch);
    await logActivity(ctx, admin, {
      entityType: "user",
      entityId: target._id,
      entityLabel: target.email,
      action: "user.access_changed",
      summary: `Access updated for ${displayName(target)}`,
      changes: [
        ...(args.role !== undefined ? [{ field: "role", from: target.role, to: args.role }] : []),
        ...(args.status !== undefined ? [{ field: "status", from: target.status, to: args.status }] : []),
        ...(args.grants !== undefined ? [{ field: "grants", from: (target.grants ?? []).join(", "), to: args.grants.join(", ") }] : []),
      ],
    });
  },
});
