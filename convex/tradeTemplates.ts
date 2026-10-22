import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { logActivity } from "./lib/audit";
import { appError, displayName, getOrThrow, requirePermission, requireViewer } from "./lib/auth";
import { tradeFieldsV, type TradeFields } from "./lib/validators";

/** Record-specific values a reusable trade preset must not carry. */
const EXCLUDED: (keyof TradeFields)[] = [
  "printedContractNumber",
  "buyerReference",
  "buyerReferenceDate",
  "sourceReference",
  "internalNotes",
  "tradeDate",
  "inheritedFields",
];

/** "Create Template from Trade": snapshot the commercial defaults of a trade. */
export const createFromTrade = mutation({
  args: { tradeId: v.id("trades"), name: v.string(), description: v.optional(v.string()) },
  handler: async (ctx, { tradeId, name, description }) => {
    const user = await requirePermission(ctx, "tradeTemplate.manage");
    const trade = await getOrThrow(ctx, tradeId, "Trade");
    const title = name.trim();
    if (title.length < 2 || title.length > 120) throw appError("INVALID", "Template name must be 2–120 characters.");
    const fields: Record<string, unknown> = {};
    for (const key of Object.keys(tradeFieldsV) as (keyof TradeFields)[]) {
      if (EXCLUDED.includes(key)) continue;
      if (trade[key] !== undefined) fields[key] = trade[key];
    }
    const id = await ctx.db.insert("tradeTemplates", {
      name: title,
      description: description?.trim() || undefined,
      sourceTradeId: trade._id,
      sourceTradeNumber: trade.tradeNumber,
      fields: fields as TradeFields,
      active: true,
      createdBy: user._id,
      updatedAt: Date.now(),
    });
    await logActivity(ctx, user, {
      entityType: "tradeTemplate",
      entityId: id,
      entityLabel: title,
      tradeId: trade._id,
      action: "tradeTemplate.created",
      summary: `Created trade template “${title}” from ${trade.tradeNumber}`,
    });
    return id;
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireViewer(ctx);
    const rows = await ctx.db
      .query("tradeTemplates")
      .withIndex("by_active", (q) => q.eq("active", true))
      .take(200);
    const out = [];
    for (const t of rows) {
      const creator = await ctx.db.get(t.createdBy);
      out.push({
        _id: t._id,
        name: t.name,
        description: t.description,
        sourceTradeNumber: t.sourceTradeNumber,
        direction: t.fields.direction,
        commodityId: t.fields.commodityId,
        createdByName: displayName(creator),
        _creationTime: t._creationTime,
      });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  },
});

export const get = query({
  args: { id: v.id("tradeTemplates") },
  handler: async (ctx, { id }) => {
    await requireViewer(ctx);
    const t = await getOrThrow(ctx, id, "Trade template");
    if (!t.active) throw appError("NOT_FOUND", "This trade template has been archived.");
    return t;
  },
});

export const archive = mutation({
  args: { id: v.id("tradeTemplates") },
  handler: async (ctx, { id }) => {
    const user = await requirePermission(ctx, "tradeTemplate.manage");
    const t = await getOrThrow(ctx, id, "Trade template");
    if (!t.active) return;
    await ctx.db.patch(id, { active: false, updatedBy: user._id, updatedAt: Date.now() });
    await logActivity(ctx, user, {
      entityType: "tradeTemplate",
      entityId: id,
      entityLabel: t.name,
      action: "tradeTemplate.archived",
      summary: `Archived trade template “${t.name}”`,
    });
  },
});
