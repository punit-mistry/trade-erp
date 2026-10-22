import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { query } from "./_generated/server";
import { requirePermission, requireViewer } from "./lib/auth";
import { entityTypeV } from "./lib/validators";

/** Activity for a trade and everything linked to it (contract, B/L, documents, dispatch). */
export const forTrade = query({
  args: { tradeId: v.id("trades") },
  handler: async (ctx, { tradeId }) => {
    await requireViewer(ctx);
    return await ctx.db
      .query("activityLogs")
      .withIndex("by_trade", (q) => q.eq("tradeId", tradeId))
      .order("desc")
      .take(200);
  },
});

export const forEntity = query({
  args: { entityType: entityTypeV, entityId: v.string() },
  handler: async (ctx, { entityType, entityId }) => {
    await requireViewer(ctx);
    return await ctx.db
      .query("activityLogs")
      .withIndex("by_entity", (q) => q.eq("entityType", entityType).eq("entityId", entityId))
      .order("desc")
      .take(200);
  },
});

/**
 * Audit log (Admin/Manager). Filters by entity type or actor via indexes;
 * free-text `search` is applied to each page (summary / label / actor name),
 * so a filtered page may contain fewer rows than requested.
 */
export const list = query({
  args: {
    paginationOpts: paginationOptsValidator,
    entityType: v.optional(entityTypeV),
    actorId: v.optional(v.id("users")),
    search: v.optional(v.string()),
  },
  handler: async (ctx, { paginationOpts, entityType, actorId, search }) => {
    await requirePermission(ctx, "audit.view");
    const base = entityType
      ? ctx.db.query("activityLogs").withIndex("by_entityType", (q) => q.eq("entityType", entityType))
      : actorId
        ? ctx.db.query("activityLogs").withIndex("by_actor", (q) => q.eq("actorId", actorId))
        : ctx.db.query("activityLogs");
    const result = await base.order("desc").paginate(paginationOpts);
    const term = search?.trim().toLowerCase();
    const page = result.page.filter((row) => {
      if (entityType && actorId && row.actorId !== actorId) return false;
      if (!term) return true;
      return [row.summary, row.entityLabel, row.actorName, row.action]
        .filter(Boolean)
        .some((s) => s!.toLowerCase().includes(term));
    });
    return { ...result, page };
  },
});
