import { paginationOptsValidator, type NamedTableInfo, type OrderedQuery } from "convex/server";
import { v } from "convex/values";
import type { DataModel, Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { diffFields, logActivity } from "./lib/audit";
import {
  appError,
  assertCanModifyOwned,
  displayName,
  getOrThrow,
  requirePermission,
  requireViewer,
} from "./lib/auth";
import { computeTradeValue, MONEY_DECIMALS, roundTo } from "./lib/money";
import { nextTradeNumber } from "./lib/numbering";
import { hasPermission } from "./lib/roles";
import { tradeSearchText } from "./lib/search";
import { blockingIssues, resolveTotalValue, validateTrade } from "./lib/tradeValidation";
import { canTransitionTrade, checklistProgress, EDITABLE_TRADE_STATUSES } from "./lib/workflow";
import { directionV, tradeFieldsV, tradeStatusV, type TradeFields } from "./lib/validators";

/** Every editable trade field. Saves send the complete snapshot so cleared fields are removed. */
const TRADE_FIELD_KEYS = Object.keys(tradeFieldsV) as (keyof TradeFields)[];

/** Never carried into a clone or a trade template — record-specific. */
const RECORD_SPECIFIC_FIELDS: (keyof TradeFields)[] = [
  "printedContractNumber",
  "buyerReference",
  "buyerReferenceDate",
  "sourceReference",
  "internalNotes",
  "lcNumber", // every LC is opened for one specific sale
  "purchaseTradeId", // a clone is a new sale; link it to its own purchase
];

const tradeFieldsArg = v.object(tradeFieldsV);

const listFilterArgs = {
  status: v.optional(v.union(tradeStatusV, v.literal("all"))),
  direction: v.optional(v.union(directionV, v.literal("all"))),
  search: v.optional(v.string()),
  dateFrom: v.optional(v.string()),
  dateTo: v.optional(v.string()),
  counterpartyId: v.optional(v.id("counterparties")),
  commodityId: v.optional(v.id("commodities")),
  companyId: v.optional(v.id("companies")),
  currency: v.optional(v.string()),
  order: v.optional(v.union(v.literal("desc"), v.literal("asc"))),
};

type ListFilters = {
  status?: Doc<"trades">["status"] | "all";
  direction?: "purchase" | "sales" | "all";
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  counterpartyId?: Id<"counterparties">;
  commodityId?: Id<"commodities">;
  companyId?: Id<"companies">;
  currency?: string;
  order?: "desc" | "asc";
};

type TradeQuery = OrderedQuery<NamedTableInfo<DataModel, "trades">>;

/**
 * Picks the most selective index for the filter combination and applies the
 * remaining filters in-query. Status/direction filters always use stored values.
 */
function buildTradeQuery(ctx: QueryCtx, f: ListFilters): TradeQuery {
  const status = f.status && f.status !== "all" ? f.status : undefined;
  const direction = f.direction && f.direction !== "all" ? f.direction : undefined;
  const order = f.order ?? "desc";
  const term = f.search?.trim().toLowerCase();
  let usedCounterpartyIndex = false;
  let usedDateRange = false;

  let q: TradeQuery;
  if (term) {
    q = ctx.db.query("trades").withSearchIndex("search", (s) => {
      let sq = s.search("searchText", term);
      if (status) sq = sq.eq("status", status);
      if (direction) sq = sq.eq("direction", direction);
      return sq;
    });
  } else if (status && direction) {
    usedDateRange = true;
    q = ctx.db
      .query("trades")
      .withIndex("by_status_direction_date", (i) => {
        const base = i.eq("status", status).eq("direction", direction);
        if (f.dateFrom && f.dateTo) return base.gte("tradeDate", f.dateFrom).lte("tradeDate", f.dateTo);
        if (f.dateFrom) return base.gte("tradeDate", f.dateFrom);
        if (f.dateTo) return base.lte("tradeDate", f.dateTo);
        return base;
      })
      .order(order);
  } else if (status) {
    usedDateRange = true;
    q = ctx.db
      .query("trades")
      .withIndex("by_status_and_date", (i) => {
        const base = i.eq("status", status);
        if (f.dateFrom && f.dateTo) return base.gte("tradeDate", f.dateFrom).lte("tradeDate", f.dateTo);
        if (f.dateFrom) return base.gte("tradeDate", f.dateFrom);
        if (f.dateTo) return base.lte("tradeDate", f.dateTo);
        return base;
      })
      .order(order);
  } else if (direction) {
    usedDateRange = true;
    q = ctx.db
      .query("trades")
      .withIndex("by_direction_and_date", (i) => {
        const base = i.eq("direction", direction);
        if (f.dateFrom && f.dateTo) return base.gte("tradeDate", f.dateFrom).lte("tradeDate", f.dateTo);
        if (f.dateFrom) return base.gte("tradeDate", f.dateFrom);
        if (f.dateTo) return base.lte("tradeDate", f.dateTo);
        return base;
      })
      .order(order);
  } else if (f.counterpartyId) {
    usedCounterpartyIndex = true;
    usedDateRange = true;
    const cpId = f.counterpartyId;
    q = ctx.db
      .query("trades")
      .withIndex("by_counterparty", (i) => {
        const base = i.eq("counterpartyId", cpId);
        if (f.dateFrom && f.dateTo) return base.gte("tradeDate", f.dateFrom).lte("tradeDate", f.dateTo);
        if (f.dateFrom) return base.gte("tradeDate", f.dateFrom);
        if (f.dateTo) return base.lte("tradeDate", f.dateTo);
        return base;
      })
      .order(order);
  } else {
    usedDateRange = true;
    q = ctx.db
      .query("trades")
      .withIndex("by_tradeDate", (i) => {
        if (f.dateFrom && f.dateTo) return i.gte("tradeDate", f.dateFrom).lte("tradeDate", f.dateTo);
        if (f.dateFrom) return i.gte("tradeDate", f.dateFrom);
        if (f.dateTo) return i.lte("tradeDate", f.dateTo);
        return i;
      })
      .order(order);
  }

  const needsFilter =
    (f.counterpartyId && !usedCounterpartyIndex) ||
    f.commodityId ||
    f.companyId ||
    f.currency ||
    (!usedDateRange && (f.dateFrom || f.dateTo));
  if (!needsFilter) return q;

  return q.filter((x) => {
    const conds = [];
    if (f.counterpartyId && !usedCounterpartyIndex) conds.push(x.eq(x.field("counterpartyId"), f.counterpartyId));
    if (f.commodityId) conds.push(x.eq(x.field("commodityId"), f.commodityId));
    if (f.companyId) conds.push(x.eq(x.field("companyId"), f.companyId));
    if (f.currency) conds.push(x.eq(x.field("currency"), f.currency));
    if (!usedDateRange && f.dateFrom) conds.push(x.gte(x.field("tradeDate"), f.dateFrom));
    if (!usedDateRange && f.dateTo) conds.push(x.lte(x.field("tradeDate"), f.dateTo));
    return x.and(...conds);
  });
}

export const list = query({
  args: { paginationOpts: paginationOptsValidator, ...listFilterArgs },
  handler: async (ctx, { paginationOpts, ...filters }) => {
    await requireViewer(ctx);
    return await buildTradeQuery(ctx, filters).paginate(paginationOpts);
  },
});

/** Bounded export of the current filter set (CSV). */
export const exportRows = query({
  args: listFilterArgs,
  handler: async (ctx, filters) => {
    await requireViewer(ctx);
    return await buildTradeQuery(ctx, filters).take(2000);
  },
});

export type NextAction = {
  label: string;
  description: string;
  tab?: "overview" | "terms" | "contract" | "bl" | "documents" | "activity";
  href?: string;
};

export async function computeNextAction(ctx: QueryCtx, trade: Doc<"trades">, hasBlockingIssues: boolean): Promise<NextAction | null> {
  const editHref = `/physical-trades/${trade._id}/edit`;
  switch (trade.status) {
    case "draft":
      return hasBlockingIssues
        ? {
            label: "Complete trade details",
            description: trade.reviewNote
              ? `Returned for correction: ${trade.reviewNote}`
              : "Some required fields are still missing. Complete them, then submit for review.",
            href: editHref,
          }
        : {
            label: "Submit for review",
            description: "All required details are present. Submit the trade for approval (or confirm it if you are a manager).",
            href: `${editHref}?step=5`,
          };
    case "pending_review":
      return {
        label: "Awaiting manager review",
        description: "A manager or admin needs to approve and confirm this trade, or return it for correction.",
      };
    case "cancelled":
    case "closed":
      return null;
    case "confirmed":
      break;
  }

  const contracts = await ctx.db
    .query("contracts")
    .withIndex("by_trade", (q) => q.eq("tradeId", trade._id))
    .order("desc")
    .take(20);
  const contract = contracts.find((c) => c.isCurrent);
  if (!contract) {
    return { label: "Generate Contract", description: "The trade is confirmed. Generate the contract from the trade data.", tab: "contract" };
  }
  if (contract.status === "draft") {
    return { label: "Complete Contract", description: `Review draft ${contract.contractNumber} and issue it.`, tab: "contract" };
  }

  const bls = await ctx.db
    .query("blDocuments")
    .withIndex("by_trade", (q) => q.eq("tradeId", trade._id))
    .order("desc")
    .take(20);
  const bl = bls.find((b) => b.isCurrent);
  if (!bl) {
    return { label: "Prepare B/L", description: "Create the B/L draft from this trade's shipment details.", tab: "bl" };
  }
  if (bl.status !== "issued") {
    const labels: Record<string, string> = {
      draft: "Complete the B/L draft and mark it prepared.",
      prepared: "Send the prepared B/L for review.",
      under_review: "The B/L is under review by a manager.",
      verified: "Record the carrier-issued B/L once received.",
    };
    return { label: "Progress B/L", description: labels[bl.status] ?? "Review the B/L.", tab: "bl" };
  }

  const checklist = await ctx.db
    .query("dispatchChecklists")
    .withIndex("by_trade", (q) => q.eq("tradeId", trade._id))
    .first();
  if (!checklist) {
    return { label: "Start Dispatch Checklist", description: "Create the dispatch checklist to track shipping documents.", tab: "bl" };
  }
  const items = await ctx.db
    .query("dispatchItems")
    .withIndex("by_checklist", (q) => q.eq("checklistId", checklist._id))
    .take(100);
  const progress = checklistProgress(items);
  if (progress.complete < progress.total) {
    return {
      label: "Review Dispatch Checklist",
      description: `${progress.complete}/${progress.total} items complete${progress.blocked ? `, ${progress.blocked} blocked` : ""}.`,
      tab: "bl",
    };
  }
  return {
    label: "Close Trade",
    description: "Contract, B/L and dispatch checklist are complete. Close the trade when commercially settled.",
  };
}

export const get = query({
  args: { id: v.id("trades") },
  handler: async (ctx, { id }) => {
    await requireViewer(ctx);
    const trade = await getOrThrow(ctx, id, "Trade");
    const [company, counterparty, commodity, createdBy, updatedBy] = await Promise.all([
      trade.companyId ? ctx.db.get(trade.companyId) : null,
      trade.counterpartyId ? ctx.db.get(trade.counterpartyId) : null,
      trade.commodityId ? ctx.db.get(trade.commodityId) : null,
      ctx.db.get(trade.createdBy),
      trade.updatedBy ? ctx.db.get(trade.updatedBy) : null,
    ]);
    const issues = validateTrade(trade);
    const nextAction = await computeNextAction(ctx, trade, issues.some((i) => i.severity === "error"));
    const nameOf = async (userId?: Id<"users">) => (userId ? displayName(await ctx.db.get(userId)) : null);
    const [submittedByName, confirmedByName, cancelledByName, closedByName] = await Promise.all([
      nameOf(trade.submittedBy),
      nameOf(trade.confirmedBy),
      nameOf(trade.cancelledBy),
      nameOf(trade.closedBy),
    ]);
    return {
      trade,
      company,
      counterparty,
      commodity,
      createdByName: displayName(createdBy),
      updatedByName: updatedBy ? displayName(updatedBy) : null,
      workflow: { submittedByName, confirmedByName, cancelledByName, closedByName },
      issues,
      nextAction,
    };
  },
});

type LinkedTradeSummary = {
  _id: Id<"trades">;
  tradeNumber: string;
  status: Doc<"trades">["status"];
  tradeDate?: string;
  counterpartyName?: string;
  commodityName?: string;
  manufacturer?: string;
  quantity?: number;
  uom?: string;
};

const linkedSummary = (t: Doc<"trades">): LinkedTradeSummary => ({
  _id: t._id,
  tradeNumber: t.tradeNumber,
  status: t.status,
  tradeDate: t.tradeDate,
  counterpartyName: t.counterpartyName,
  commodityName: t.commodityName,
  manufacturer: t.manufacturer,
  quantity: t.quantity,
  uom: t.uom,
});

/** Purchase trades a sale can be linked to (newest first, cancelled excluded). */
export const purchaseOptions = query({
  args: {},
  handler: async (ctx): Promise<LinkedTradeSummary[]> => {
    await requireViewer(ctx);
    const rows = await ctx.db
      .query("trades")
      .withIndex("by_direction_and_date", (q) => q.eq("direction", "purchase"))
      .order("desc")
      .take(300);
    return rows.filter((t) => t.status !== "cancelled").map(linkedSummary);
  },
});

/** The purchase a sale is linked to, or the sales linked to a purchase. */
export const links = query({
  args: { id: v.id("trades") },
  handler: async (ctx, { id }) => {
    await requireViewer(ctx);
    const trade = await getOrThrow(ctx, id, "Trade");
    const purchase = trade.purchaseTradeId ? await ctx.db.get(trade.purchaseTradeId) : null;
    const sales =
      trade.direction === "purchase"
        ? (
            await ctx.db
              .query("trades")
              .withIndex("by_purchaseTrade", (q) => q.eq("purchaseTradeId", id))
              .take(100)
          ).filter((t) => t.status !== "cancelled")
        : [];
    const linkedQuantity = sales.reduce((sum, s) => sum + (s.uom === trade.uom ? (s.quantity ?? 0) : 0), 0);
    return {
      purchase: purchase ? linkedSummary(purchase) : null,
      sales: sales.map(linkedSummary),
      // Only sales in the same unit are summed; others are listed but not added.
      linkedQuantity,
    };
  },
});

/** Editable fields of a trade for "Clone Trade" — record-specific fields removed. */
export const getCloneSource = query({
  args: { id: v.id("trades") },
  handler: async (ctx, { id }) => {
    await requirePermission(ctx, "trade.create");
    const trade = await getOrThrow(ctx, id, "Trade");
    const fields: Partial<TradeFields> = {};
    for (const key of TRADE_FIELD_KEYS) {
      if (RECORD_SPECIFIC_FIELDS.includes(key)) continue;
      (fields as Record<string, unknown>)[key] = trade[key];
    }
    // A clone starts today; it is a new commercial event.
    delete fields.tradeDate;
    return { tradeId: trade._id, tradeNumber: trade.tradeNumber, fields };
  },
});

// ---------------------------------------------------------------- writes

function cleanFields(fields: TradeFields): TradeFields {
  const out: Record<string, unknown> = {};
  for (const key of TRADE_FIELD_KEYS) {
    let value = fields[key] as unknown;
    if (typeof value === "string") {
      value = value.trim();
      if (value === "") value = undefined;
    }
    out[key] = value;
  }
  const f = out as TradeFields;
  if (f.quantity !== undefined && (!Number.isFinite(f.quantity) || f.quantity < 0)) {
    throw appError("INVALID", "Quantity cannot be negative.");
  }
  if (f.pricePerUom !== undefined && (!Number.isFinite(f.pricePerUom) || f.pricePerUom < 0)) {
    throw appError("INVALID", "Price per UOM cannot be negative.");
  }
  if (f.tolerancePct !== undefined && (f.tolerancePct < 0 || f.tolerancePct > 100)) {
    throw appError("INVALID", "Tolerance must be between 0 and 100%.");
  }
  if (f.tradeDate !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(f.tradeDate)) {
    throw appError("INVALID", "Trade date must be a valid date.");
  }
  if (f.buyerReferenceDate !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(f.buyerReferenceDate)) {
    throw appError("INVALID", "Buyer reference date must be a valid date.");
  }
  return f;
}

/** Resolves related records and the denormalised labels used by listing/search. */
async function resolveDenorm(ctx: MutationCtx, f: TradeFields) {
  const [company, counterparty, commodity] = await Promise.all([
    f.companyId ? ctx.db.get(f.companyId) : null,
    f.counterpartyId ? ctx.db.get(f.counterpartyId) : null,
    f.commodityId ? ctx.db.get(f.commodityId) : null,
  ]);
  if (f.companyId && !company) throw appError("INVALID", "Selected company no longer exists.");
  if (f.counterpartyId && !counterparty) throw appError("INVALID", "Selected counterparty no longer exists.");
  if (f.commodityId && !commodity) throw appError("INVALID", "Selected commodity no longer exists.");
  if (f.contractTemplateId && !(await ctx.db.get(f.contractTemplateId))) {
    throw appError("INVALID", "Selected contract template no longer exists.");
  }
  let purchaseTradeNumber: string | undefined;
  if (f.purchaseTradeId) {
    if (f.direction !== "sales") throw appError("INVALID", "Only a sales trade can be linked to a back-to-back purchase.");
    const purchase = await ctx.db.get(f.purchaseTradeId);
    if (!purchase) throw appError("INVALID", "The linked purchase trade no longer exists.");
    if (purchase.direction !== "purchase") throw appError("INVALID", `${purchase.tradeNumber} is not a purchase trade.`);
    if (purchase.status === "cancelled") throw appError("INVALID", `${purchase.tradeNumber} is cancelled and cannot be linked.`);
    purchaseTradeNumber = purchase.tradeNumber;
  }
  return {
    companyName: company?.name,
    counterpartyName: counterparty?.name,
    commodityName: commodity?.name,
    commodityCode: commodity?.code,
    purchaseTradeNumber,
  };
}

function assertCanSetContractNumber(user: Doc<"users">, before: string | undefined, after: string | undefined) {
  if ((before ?? "") !== (after ?? "") && !hasPermission(user, "contract.overrideNumber")) {
    throw appError(
      "FORBIDDEN",
      "Access denied: only managers and admins can set a printed contract number. Leave it blank to use the numbering sequence.",
    );
  }
}

export const createDraft = mutation({
  args: {
    fields: tradeFieldsArg,
    clientRequestId: v.string(),
    cloneFromId: v.optional(v.id("trades")),
    templateId: v.optional(v.id("tradeTemplates")),
  },
  handler: async (ctx, { fields, clientRequestId, cloneFromId, templateId }) => {
    const user = await requirePermission(ctx, "trade.create");
    if (clientRequestId.length < 8 || clientRequestId.length > 100) throw appError("INVALID", "Invalid request id.");

    // Idempotency: a retried / double-clicked create returns the same trade.
    const existing = await ctx.db
      .query("trades")
      .withIndex("by_clientRequestId", (q) => q.eq("clientRequestId", clientRequestId))
      .first();
    if (existing) {
      if (existing.createdBy !== user._id) throw appError("CONFLICT", "Duplicate request id.");
      return { id: existing._id, tradeNumber: existing.tradeNumber, created: false };
    }

    const f = cleanFields(fields);
    assertCanSetContractNumber(user, undefined, f.printedContractNumber);
    const source = cloneFromId ? await getOrThrow(ctx, cloneFromId, "Source trade") : null;
    const template = templateId ? await getOrThrow(ctx, templateId, "Trade template") : null;
    const denorm = await resolveDenorm(ctx, f);
    const tradeNumber = await nextTradeNumber(ctx, f.tradeDate);
    const now = Date.now();
    const doc = {
      ...f,
      ...denorm,
      tradeNumber,
      status: "draft" as const,
      totalValue: computeTradeValue(f.quantity, f.pricePerUom),
      searchText: tradeSearchText({ tradeNumber, ...denorm, ...f }),
      clonedFromId: source?._id,
      clonedFromNumber: source?.tradeNumber,
      clientRequestId,
      createdBy: user._id,
      updatedAt: now,
    };
    const id = await ctx.db.insert("trades", doc);

    if (source) {
      await logActivity(ctx, user, {
        entityType: "trade",
        entityId: id,
        entityLabel: tradeNumber,
        tradeId: id,
        action: "trade.cloned",
        summary: `Created ${tradeNumber} as a copy of ${source.tradeNumber}`,
      });
      await logActivity(ctx, user, {
        entityType: "trade",
        entityId: source._id,
        entityLabel: source.tradeNumber,
        tradeId: source._id,
        action: "trade.cloned",
        summary: `Cloned into new draft ${tradeNumber} (this trade was not changed)`,
      });
    } else {
      await logActivity(ctx, user, {
        entityType: "trade",
        entityId: id,
        entityLabel: tradeNumber,
        tradeId: id,
        action: "trade.created",
        summary: template ? `Created draft ${tradeNumber} from trade template “${template.name}”` : `Created draft ${tradeNumber}`,
      });
    }
    return { id, tradeNumber, created: true };
  },
});

export const saveDraft = mutation({
  args: { id: v.id("trades"), fields: tradeFieldsArg },
  handler: async (ctx, { id, fields }) => {
    const user = await requireViewer(ctx);
    const trade = await getOrThrow(ctx, id, "Trade");
    if (!EDITABLE_TRADE_STATUSES.includes(trade.status)) {
      throw appError("CONFLICT", `Trade ${trade.tradeNumber} is ${trade.status.replace("_", " ")} and can no longer be edited.`);
    }
    if (!hasPermission(user, "trade.editAny")) {
      if (!hasPermission(user, "trade.editDraft")) throw appError("FORBIDDEN", "Access denied: you cannot edit trades.");
      if (trade.status !== "draft") throw appError("FORBIDDEN", "Access denied: a trade in review can only be edited by a manager.");
      assertCanModifyOwned(user, trade, "trade");
    }
    const f = cleanFields(fields);
    assertCanSetContractNumber(user, trade.printedContractNumber, f.printedContractNumber);
    const denorm = await resolveDenorm(ctx, f);

    const merged = { ...trade, ...f };
    const totalValue = resolveTotalValue(merged);
    const patch: Record<string, unknown> = {};
    for (const key of TRADE_FIELD_KEYS) patch[key] = f[key];
    Object.assign(patch, denorm, {
      totalValue,
      searchText: tradeSearchText({ tradeNumber: trade.tradeNumber, ...denorm, ...f }),
    });

    const changes = diffFields(trade as unknown as Record<string, unknown>, patch, [
      "updatedAt",
      "updatedBy",
      "searchText",
      "inheritedFields",
      "companyName",
      "counterpartyName",
      "commodityName",
      "commodityCode",
      "purchaseTradeNumber",
    ]);
    if (changes.length === 0) return { changed: false };

    await ctx.db.patch(id, { ...patch, updatedBy: user._id, updatedAt: Date.now() });

    // Autosave runs often: fold consecutive edits by the same user within 10 minutes into one entry.
    const last = await ctx.db
      .query("activityLogs")
      .withIndex("by_trade", (q) => q.eq("tradeId", id))
      .order("desc")
      .first();
    if (last && last.action === "trade.updated" && last.actorId === user._id && Date.now() - last._creationTime < 10 * 60_000) {
      const byField = new Map((last.changes ?? []).map((c) => [c.field, c]));
      for (const c of changes) {
        const prev = byField.get(c.field);
        byField.set(c.field, { field: c.field, from: prev ? prev.from : c.from, to: c.to });
      }
      const folded = [...byField.values()].filter((c) => c.from !== c.to);
      await ctx.db.patch(last._id, {
        changes: folded.length ? folded : undefined,
        summary: `Edited ${folded.length} field${folded.length === 1 ? "" : "s"}`,
      });
    } else {
      await logActivity(ctx, user, {
        entityType: "trade",
        entityId: id,
        entityLabel: trade.tradeNumber,
        tradeId: id,
        action: "trade.updated",
        summary: `Edited ${changes.length} field${changes.length === 1 ? "" : "s"}`,
        changes,
      });
    }
    return { changed: true };
  },
});

/**
 * Authorised value override (historical value or commercial adjustment), or
 * `recalculate` to return to quantity × price. Always audited with a reason.
 */
export const overrideValue = mutation({
  args: {
    id: v.id("trades"),
    mode: v.union(v.literal("set"), v.literal("recalculate")),
    totalValue: v.optional(v.number()),
    reason: v.string(),
  },
  handler: async (ctx, { id, mode, totalValue, reason }) => {
    const user = await requirePermission(ctx, "trade.valueOverride");
    const trade = await getOrThrow(ctx, id, "Trade");
    if (!EDITABLE_TRADE_STATUSES.includes(trade.status)) {
      throw appError("CONFLICT", "The value of a confirmed, cancelled or closed trade cannot be changed.");
    }
    const why = reason.trim();
    if (!why) throw appError("INVALID", "A reason is required for a value override.");
    let patch: Partial<Doc<"trades">>;
    if (mode === "set") {
      if (totalValue === undefined || !Number.isFinite(totalValue) || totalValue < 0) {
        throw appError("INVALID", "Enter a valid non-negative total value.");
      }
      patch = { totalValue: roundTo(totalValue, MONEY_DECIMALS), valueOverridden: true, valueOverrideReason: why };
    } else {
      const computed = computeTradeValue(trade.quantity, trade.pricePerUom);
      if (computed === undefined) throw appError("INVALID", "Quantity and price per UOM are required to recalculate.");
      patch = { totalValue: computed, valueOverridden: false, valueOverrideReason: undefined, priceNeedsValidation: false };
    }
    await ctx.db.patch(id, { ...patch, updatedBy: user._id, updatedAt: Date.now() });
    await logActivity(ctx, user, {
      entityType: "trade",
      entityId: id,
      entityLabel: trade.tradeNumber,
      tradeId: id,
      action: mode === "set" ? "trade.value_overridden" : "trade.value_recalculated",
      summary: mode === "set" ? `Overrode total value — ${why}` : `Recalculated total value from quantity × price — ${why}`,
      changes: [{ field: "totalValue", from: trade.totalValue?.toString(), to: patch.totalValue?.toString() }],
    });
  },
});

export const transition = mutation({
  args: { id: v.id("trades"), to: tradeStatusV, note: v.optional(v.string()) },
  handler: async (ctx, { id, to, note }) => {
    const user = await requireViewer(ctx);
    const trade = await getOrThrow(ctx, id, "Trade");
    const rule = canTransitionTrade(trade.status, to);
    if (!rule) {
      throw appError("CONFLICT", `A ${trade.status.replace("_", " ")} trade cannot be moved to ${to.replace("_", " ")}.`);
    }
    if (!hasPermission(user, rule.permission)) {
      throw appError("FORBIDDEN", `Access denied: your role (${user.role}) cannot ${rule.label.toLowerCase()}.`);
    }
    if (to === "pending_review" && user.role === "staff") assertCanModifyOwned(user, trade, "trade");

    if (to === "pending_review" || to === "confirmed") {
      const problems = blockingIssues(trade);
      if (problems.length > 0) {
        throw appError("INVALID", `Cannot ${to === "confirmed" ? "confirm" : "submit"} yet: ${problems.map((p) => p.message).join(" ")}`);
      }
    }
    const reason = note?.trim();
    const now = Date.now();
    const patch: Partial<Doc<"trades">> = { status: to, updatedBy: user._id, updatedAt: now };
    if (to === "pending_review") Object.assign(patch, { submittedBy: user._id, submittedAt: now, reviewNote: undefined });
    if (to === "confirmed") Object.assign(patch, { confirmedBy: user._id, confirmedAt: now, reviewNote: undefined });
    if (to === "closed") Object.assign(patch, { closedBy: user._id, closedAt: now });
    if (to === "cancelled") {
      if (!reason) throw appError("INVALID", "A cancellation reason is required.");
      Object.assign(patch, { cancelledBy: user._id, cancelledAt: now, cancelReason: reason });
    }
    if (to === "draft") {
      if (!reason) throw appError("INVALID", "Explain what needs correcting when returning a trade.");
      patch.reviewNote = reason;
    }
    await ctx.db.patch(id, patch);
    await logActivity(ctx, user, {
      entityType: "trade",
      entityId: id,
      entityLabel: trade.tradeNumber,
      tradeId: id,
      action: "trade.status_changed",
      summary: `${rule.label}${reason ? ` — ${reason}` : ""}`,
      changes: [{ field: "status", from: trade.status, to }],
    });
  },
});
