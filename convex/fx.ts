import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { logActivity } from "./lib/audit";
import { appError, displayName, getOrThrow, requirePermission, requireViewer } from "./lib/auth";
import { fxReviewStatusV } from "./lib/validators";

/**
 * Manually recorded FX rates. The system never fetches or invents a rate:
 * each record states who entered it, its source and the rate timestamp, and
 * stays "pending" until a manager verifies or rejects it.
 */

const CURRENCY = /^[A-Z]{3}$/;

async function withNames(ctx: Parameters<typeof requireViewer>[0], rows: Doc<"fxRates">[]) {
  const names = new Map<string, string>();
  const name = async (id: Doc<"users">["_id"] | undefined) => {
    if (!id) return undefined;
    if (!names.has(id)) names.set(id, displayName(await ctx.db.get(id)));
    return names.get(id);
  };
  return await Promise.all(
    rows.map(async (r) => {
      const trade = r.tradeId ? await ctx.db.get(r.tradeId) : null;
      return {
        ...r,
        tradeNumber: trade?.tradeNumber,
        recordedByName: await name(r.createdBy),
        reviewedByName: await name(r.reviewedBy),
      };
    }),
  );
}

export const record = mutation({
  args: {
    baseCurrency: v.string(),
    quoteCurrency: v.string(),
    rate: v.number(),
    source: v.string(),
    rateTimestamp: v.number(),
    tradeId: v.optional(v.id("trades")),
    contractId: v.optional(v.id("contracts")),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requirePermission(ctx, "fx.record");
    const base = args.baseCurrency.trim().toUpperCase();
    const quote = args.quoteCurrency.trim().toUpperCase();
    if (!CURRENCY.test(base) || !CURRENCY.test(quote)) throw appError("INVALID", "Currencies must be 3-letter ISO codes.");
    if (base === quote) throw appError("INVALID", "Base and quote currency must differ.");
    if (!Number.isFinite(args.rate) || args.rate <= 0) throw appError("INVALID", "Rate must be a positive number.");
    const source = args.source.trim();
    if (source.length < 2) throw appError("INVALID", "Enter the source of this rate (e.g. bank confirmation, RBI reference).");
    if (args.rateTimestamp > Date.now() + 24 * 3600 * 1000) throw appError("INVALID", "Rate timestamp cannot be in the future.");
    let tradeId = args.tradeId;
    if (args.contractId) {
      const contract = await getOrThrow(ctx, args.contractId, "Contract");
      tradeId = tradeId ?? contract.tradeId;
    }
    const trade = tradeId ? await getOrThrow(ctx, tradeId, "Trade") : null;
    const id = await ctx.db.insert("fxRates", {
      baseCurrency: base,
      quoteCurrency: quote,
      rate: args.rate,
      source,
      rateTimestamp: args.rateTimestamp,
      tradeId,
      contractId: args.contractId,
      reviewStatus: "pending",
      notes: args.notes?.trim() || undefined,
      createdBy: user._id,
      updatedAt: Date.now(),
    });
    await logActivity(ctx, user, {
      entityType: "fxRate",
      entityId: id,
      entityLabel: `${base}/${quote}`,
      tradeId,
      action: "fx.recorded",
      summary: `Recorded FX rate ${base}/${quote} = ${args.rate} (source: ${source})${trade ? ` for ${trade.tradeNumber}` : ""}`,
    });
    return id;
  },
});

export const review = mutation({
  args: {
    id: v.id("fxRates"),
    status: v.union(v.literal("verified"), v.literal("rejected")),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, { id, status, notes }) => {
    const user = await requirePermission(ctx, "fx.review");
    const row = await getOrThrow(ctx, id, "FX rate");
    if (row.reviewStatus !== "pending") throw appError("CONFLICT", "This rate has already been reviewed.");
    if (row.createdBy === user._id && user.role !== "admin") {
      throw appError("FORBIDDEN", "A rate must be reviewed by someone other than the person who recorded it.");
    }
    await ctx.db.patch(id, {
      reviewStatus: status,
      reviewedBy: user._id,
      reviewedAt: Date.now(),
      notes: notes?.trim() ? [row.notes, `Review: ${notes.trim()}`].filter(Boolean).join("\n") : row.notes,
      updatedBy: user._id,
      updatedAt: Date.now(),
    });
    await logActivity(ctx, user, {
      entityType: "fxRate",
      entityId: id,
      entityLabel: `${row.baseCurrency}/${row.quoteCurrency}`,
      tradeId: row.tradeId,
      action: status === "verified" ? "fx.verified" : "fx.rejected",
      summary: `${status === "verified" ? "Verified" : "Rejected"} FX rate ${row.baseCurrency}/${row.quoteCurrency} = ${row.rate}`,
      changes: [{ field: "reviewStatus", from: row.reviewStatus, to: status }],
    });
  },
});

export const list = query({
  args: { reviewStatus: v.optional(fxReviewStatusV) },
  handler: async (ctx, { reviewStatus }) => {
    await requireViewer(ctx);
    const rows = reviewStatus
      ? await ctx.db
          .query("fxRates")
          .withIndex("by_review", (q) => q.eq("reviewStatus", reviewStatus))
          .order("desc")
          .take(100)
      : await ctx.db.query("fxRates").order("desc").take(100);
    return await withNames(ctx, rows);
  },
});

export const forTrade = query({
  args: { tradeId: v.id("trades") },
  handler: async (ctx, { tradeId }) => {
    await requireViewer(ctx);
    const rows = await ctx.db
      .query("fxRates")
      .withIndex("by_trade", (q) => q.eq("tradeId", tradeId))
      .order("desc")
      .take(50);
    return await withNames(ctx, rows);
  },
});
