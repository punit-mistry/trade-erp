import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import type { DataModel } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

/**
 * Email + password sign-in. Only `email` and `name` are taken from the
 * client. Role/status are NEVER read from sign-up params — they are assigned
 * in `afterUserCreatedOrUpdated` below.
 */
const PasswordProvider = Password<DataModel>({
  profile(params) {
    const email = String(params.email ?? "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new ConvexError({ code: "INVALID", message: "Enter a valid email address." });
    }
    const name = typeof params.name === "string" ? params.name.trim().slice(0, 120) : undefined;
    return { email, ...(name ? { name } : {}) };
  },
  validatePasswordRequirements(password: string) {
    if (password.length < 10 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      throw new ConvexError({
        code: "INVALID",
        message: "Password must be at least 10 characters and contain letters and numbers.",
      });
    }
  },
});

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [PasswordProvider],
  callbacks: {
    /**
     * Bootstrap rule: the very first account becomes an active Admin. Every
     * later sign-up is created as Staff with status "pending" and cannot use
     * the application until an Admin activates it (Team & Access).
     */
    async afterUserCreatedOrUpdated(genericCtx, { userId, existingUserId }) {
      if (existingUserId !== null) return;
      const ctx = genericCtx as unknown as MutationCtx;
      const user = await ctx.db.get(userId);
      if (!user || user.role) return;
      const anyAdmin = await ctx.db
        .query("users")
        .withIndex("by_role", (q) => q.eq("role", "admin"))
        .first();
      await ctx.db.patch(userId, {
        role: anyAdmin ? "staff" : "admin",
        status: anyAdmin ? "pending" : "active",
        updatedAt: Date.now(),
      });
      await ctx.db.insert("activityLogs", {
        actorId: userId,
        actorName: user.name || user.email || "New user",
        entityType: "user",
        entityId: userId,
        entityLabel: user.email,
        action: "user.registered",
        summary: anyAdmin
          ? "Registered — awaiting administrator approval"
          : "Registered as the first user and granted Admin",
      });
    },
  },
});
