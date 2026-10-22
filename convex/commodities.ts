import { v } from "convex/values";
import { mutation, query, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { diffFields, logActivity } from "./lib/audit";
import { appError, getOrThrow, requirePermission, requireViewer } from "./lib/auth";
import { commoditySearchText, tradeSearchText } from "./lib/search";

/** Searchable commodity picker (active only). */
export const searchForPicker = query({
  args: { search: v.optional(v.string()) },
  handler: async (ctx, { search }) => {
    await requireViewer(ctx);
    const term = search?.trim().toLowerCase();
    const rows = term
      ? await ctx.db
          .query("commodities")
          .withSearchIndex("search", (q) => q.search("searchText", term).eq("active", true))
          .take(20)
      : await ctx.db
          .query("commodities")
          .withIndex("by_active", (q) => q.eq("active", true))
          .take(50);
    return rows.map((c) => ({
      _id: c._id,
      name: c.name,
      code: c.code,
      defaultUom: c.defaultUom,
      hsCode: c.hsCode,
      grade: c.grade,
    }));
  },
});

export const get = query({
  args: { id: v.id("commodities") },
  handler: async (ctx, { id }) => {
    await requireViewer(ctx);
    return await getOrThrow(ctx, id, "Commodity");
  },
});

/** Commodity master list (bounded) — any active user may view; editing requires commodity.manage. */
export const list = query({
  args: { search: v.optional(v.string()), includeInactive: v.optional(v.boolean()) },
  handler: async (ctx, { search, includeInactive }) => {
    await requireViewer(ctx);
    const term = search?.trim().toLowerCase();
    if (term) {
      const rows = await ctx.db
        .query("commodities")
        .withSearchIndex("search", (q) => q.search("searchText", term))
        .take(100);
      return rows.filter((r) => includeInactive || r.active);
    }
    const rows = includeInactive
      ? await ctx.db.query("commodities").take(1000)
      : await ctx.db
          .query("commodities")
          .withIndex("by_active", (q) => q.eq("active", true))
          .take(1000);
    return rows.sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));
  },
});

const commodityFields = {
  name: v.string(),
  code: v.string(),
  hsCode: v.optional(v.string()),
  defaultUom: v.optional(v.string()),
  grade: v.optional(v.string()),
  description: v.optional(v.string()),
};

type CommodityInput = { name: string; code: string; hsCode?: string; defaultUom?: string; grade?: string; description?: string };

function normalise(input: CommodityInput): CommodityInput {
  const clean = (s?: string) => (s === undefined || s.trim() === "" ? undefined : s.trim());
  const name = clean(input.name);
  const code = clean(input.code)?.toUpperCase();
  if (!name) throw appError("INVALID", "Commodity name is required.");
  if (!code || !/^[A-Z0-9_-]{2,20}$/.test(code)) {
    throw appError("INVALID", "Commodity code must be 2–20 characters (A–Z, 0–9, _ or -).");
  }
  return {
    name,
    code,
    hsCode: clean(input.hsCode),
    defaultUom: clean(input.defaultUom),
    grade: clean(input.grade),
    description: clean(input.description),
  };
}

async function assertUniqueCode(ctx: MutationCtx, code: string, selfId?: Id<"commodities">) {
  const clash = await ctx.db
    .query("commodities")
    .withIndex("by_code", (q) => q.eq("code", code))
    .first();
  if (clash && clash._id !== selfId) throw appError("CONFLICT", `Commodity code ${code} already exists (${clash.name}).`);
}

export const create = mutation({
  args: commodityFields,
  handler: async (ctx, args) => {
    const user = await requirePermission(ctx, "commodity.manage");
    const data = normalise(args);
    await assertUniqueCode(ctx, data.code);
    const id = await ctx.db.insert("commodities", {
      ...data,
      active: true,
      searchText: commoditySearchText(data),
      createdBy: user._id,
      updatedAt: Date.now(),
    });
    await logActivity(ctx, user, {
      entityType: "commodity",
      entityId: id,
      entityLabel: `${data.name} (${data.code})`,
      action: "commodity.created",
      summary: `Created commodity ${data.name} (${data.code})`,
    });
    return id;
  },
});

/** Max trades whose denormalised commodity label is refreshed in one rename. */
const RENAME_BATCH = 500;

export const update = mutation({
  args: { id: v.id("commodities"), ...commodityFields },
  handler: async (ctx, { id, ...rest }) => {
    const user = await requirePermission(ctx, "commodity.manage");
    const before = await getOrThrow(ctx, id, "Commodity");
    const data = normalise(rest);
    await assertUniqueCode(ctx, data.code, id);
    await ctx.db.patch(id, {
      ...data,
      searchText: commoditySearchText(data),
      updatedBy: user._id,
      updatedAt: Date.now(),
    });

    let tradesUpdated = 0;
    if (before.name !== data.name || before.code !== data.code) {
      const trades = await ctx.db
        .query("trades")
        .withIndex("by_commodity", (q) => q.eq("commodityId", id))
        .take(RENAME_BATCH);
      for (const t of trades) {
        const next = { ...t, commodityName: data.name, commodityCode: data.code };
        await ctx.db.patch(t._id, {
          commodityName: data.name,
          commodityCode: data.code,
          searchText: tradeSearchText(next),
        });
        tradesUpdated++;
      }
    }
    await logActivity(ctx, user, {
      entityType: "commodity",
      entityId: id,
      entityLabel: `${data.name} (${data.code})`,
      action: "commodity.updated",
      summary: `Updated commodity ${data.name}${tradesUpdated ? ` (labels refreshed on ${tradesUpdated} trades)` : ""}`,
      changes: diffFields(before as unknown as Record<string, unknown>, data),
    });
  },
});

export const setActive = mutation({
  args: { id: v.id("commodities"), active: v.boolean() },
  handler: async (ctx, { id, active }) => {
    const user = await requirePermission(ctx, "commodity.manage");
    const c = await getOrThrow(ctx, id, "Commodity");
    await ctx.db.patch(id, { active, updatedBy: user._id, updatedAt: Date.now() });
    await logActivity(ctx, user, {
      entityType: "commodity",
      entityId: id,
      entityLabel: `${c.name} (${c.code})`,
      action: active ? "commodity.activated" : "commodity.deactivated",
      summary: `${active ? "Activated" : "Deactivated"} commodity ${c.name}`,
    });
  },
});
