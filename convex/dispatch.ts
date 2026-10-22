import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { logActivity, type FieldChange } from "./lib/audit";
import { appError, displayName, getOrThrow, requirePermission, requireViewer } from "./lib/auth";
import { hasPermission } from "./lib/roles";
import { DEFAULT_DISPATCH_CHECKLIST, getSettings } from "./lib/settings";
import type { BlStatus } from "./lib/validators";
import { checklistProgress } from "./lib/workflow";
import { blStatusV, dispatchItemStatusV } from "./lib/validators";


/**
 * Dispatch checklist per trade. Items are created from the configurable
 * settings template. Completion % is always computed from the real items.
 *
 * Edit rule for an item: managers/admins may update any item; staff may
 * update an item that is assigned to them, is unassigned, or belongs to a
 * checklist they created. Staff may only assign an item to themselves.
 */

export function todayIsoUtc(now = Date.now()) {
  return new Date(now).toISOString().slice(0, 10);
}

export function isOverdue(item: Pick<Doc<"dispatchItems">, "dueDate" | "status">, today = todayIsoUtc()) {
  return Boolean(item.dueDate && item.status !== "complete" && item.dueDate < today);
}

/** Creates the checklist (and its items) for a trade if it does not exist yet. */
export async function ensureChecklistForTrade(
  ctx: MutationCtx,
  user: Doc<"users">,
  trade: Doc<"trades">,
): Promise<Id<"dispatchChecklists">> {
  const existing = await ctx.db
    .query("dispatchChecklists")
    .withIndex("by_trade", (q) => q.eq("tradeId", trade._id))
    .first();
  if (existing) return existing._id;
  const settings = await getSettings(ctx);
  const now = Date.now();
  const checklistId = await ctx.db.insert("dispatchChecklists", {
    tradeId: trade._id,
    tradeNumber: trade.tradeNumber,
    counterpartyName: trade.counterpartyName,
    status: "open",
    createdBy: user._id,
    updatedAt: now,
  });
  const labels = settings.dispatchChecklistTemplate.length > 0 ? settings.dispatchChecklistTemplate : DEFAULT_DISPATCH_CHECKLIST;
  for (const [i, label] of labels.entries()) {
    await ctx.db.insert("dispatchItems", {
      checklistId,
      tradeId: trade._id,
      label,
      sortOrder: i,
      status: "pending",
      documentIds: [],
      createdBy: user._id,
      updatedAt: now,
    });
  }
  await logActivity(ctx, user, {
    entityType: "dispatch",
    entityId: checklistId,
    entityLabel: trade.tradeNumber,
    tradeId: trade._id,
    action: "dispatch.created",
    summary: `Dispatch checklist created with ${labels.length} items`,
  });
  return checklistId;
}

async function loadItems(ctx: QueryCtx, checklistId: Id<"dispatchChecklists">) {
  return await ctx.db
    .query("dispatchItems")
    .withIndex("by_checklist", (q) => q.eq("checklistId", checklistId))
    .take(200);
}

async function nameMap(ctx: QueryCtx, ids: (Id<"users"> | undefined)[]) {
  const map = new Map<string, string>();
  for (const id of ids) if (id && !map.has(id)) map.set(id, displayName(await ctx.db.get(id)));
  return map;
}

function summarise(items: Doc<"dispatchItems">[], names: Map<string, string>, today: string) {
  const sorted = [...items].sort((a, b) => a.sortOrder - b.sortOrder);
  const progress = checklistProgress(sorted);
  const overdue = sorted.filter((i) => isOverdue(i, today)).length;
  const next = sorted.find((i) => i.status === "blocked") ?? sorted.find((i) => i.status !== "complete");
  return {
    sorted,
    progress: { ...progress, overdue },
    nextStep: next
      ? {
          itemId: next._id,
          label: next.label,
          status: next.status,
          responsible: next.assignedTo ? (names.get(next.assignedTo) ?? null) : null,
          dueDate: next.dueDate,
        }
      : null,
  };
}

export const forTrade = query({
  args: { tradeId: v.id("trades") },
  handler: async (ctx, { tradeId }) => {
    const user = await requireViewer(ctx);
    const checklist = await ctx.db
      .query("dispatchChecklists")
      .withIndex("by_trade", (q) => q.eq("tradeId", tradeId))
      .first();
    if (!checklist) return null;
    const items = await loadItems(ctx, checklist._id);
    const names = await nameMap(ctx, [...items.map((i) => i.assignedTo), ...items.map((i) => i.completedBy)]);
    const today = todayIsoUtc();
    const { sorted, progress, nextStep } = summarise(items, names, today);
    const docIds = sorted.flatMap((i) => i.documentIds);
    const docs = new Map<string, { _id: Id<"documents">; fileName: string; archived: boolean }>();
    for (const id of docIds) {
      const d = await ctx.db.get(id);
      if (d) docs.set(id, { _id: d._id, fileName: d.fileName, archived: d.archived });
    }
    const isManager = hasPermission(user, "dispatch.configure");
    return {
      checklist,
      progress,
      nextStep,
      items: sorted.map((i) => ({
        ...i,
        assigneeName: i.assignedTo ? (names.get(i.assignedTo) ?? null) : null,
        completedByName: i.completedBy ? (names.get(i.completedBy) ?? null) : null,
        overdue: isOverdue(i, today),
        documents: i.documentIds.map((id) => docs.get(id)).filter((d): d is NonNullable<typeof d> => Boolean(d)),
        canEdit:
          isManager ||
          !i.assignedTo ||
          i.assignedTo === user._id ||
          checklist.createdBy === user._id,
      })),
    };
  },
});

export const ensureForTrade = mutation({
  args: { tradeId: v.id("trades") },
  handler: async (ctx, { tradeId }) => {
    const user = await requirePermission(ctx, "dispatch.update");
    const trade = await getOrThrow(ctx, tradeId, "Trade");
    if (trade.status === "cancelled") throw appError("INVALID", "Cancelled trades have no dispatch workflow.");
    return await ensureChecklistForTrade(ctx, user, trade);
  },
});

async function syncChecklistStatus(ctx: MutationCtx, user: Doc<"users">, checklist: Doc<"dispatchChecklists">) {
  const items = await loadItems(ctx, checklist._id);
  const allComplete = items.length > 0 && items.every((i) => i.status === "complete");
  if (allComplete && checklist.status !== "completed") {
    await ctx.db.patch(checklist._id, { status: "completed", completedAt: Date.now(), updatedBy: user._id, updatedAt: Date.now() });
    await logActivity(ctx, user, {
      entityType: "dispatch",
      entityId: checklist._id,
      entityLabel: checklist.tradeNumber,
      tradeId: checklist.tradeId,
      action: "dispatch.completed",
      summary: "All dispatch checklist items completed",
    });
  } else if (!allComplete && checklist.status === "completed") {
    await ctx.db.patch(checklist._id, { status: "open", completedAt: undefined, updatedBy: user._id, updatedAt: Date.now() });
    await logActivity(ctx, user, {
      entityType: "dispatch",
      entityId: checklist._id,
      entityLabel: checklist.tradeNumber,
      tradeId: checklist.tradeId,
      action: "dispatch.reopened",
      summary: "Dispatch checklist reopened",
    });
  } else {
    await ctx.db.patch(checklist._id, { updatedBy: user._id, updatedAt: Date.now() });
  }
}

export const updateItem = mutation({
  args: {
    itemId: v.id("dispatchItems"),
    status: v.optional(dispatchItemStatusV),
    assignedTo: v.optional(v.union(v.id("users"), v.null())),
    dueDate: v.optional(v.union(v.string(), v.null())),
    comment: v.optional(v.string()),
    blockedReason: v.optional(v.string()),
    documentIds: v.optional(v.array(v.id("documents"))),
  },
  handler: async (ctx, args) => {
    const user = await requirePermission(ctx, "dispatch.update");
    const item = await getOrThrow(ctx, args.itemId, "Checklist item");
    const checklist = await getOrThrow(ctx, item.checklistId, "Checklist");
    const isManager = hasPermission(user, "dispatch.configure");
    if (!isManager && item.assignedTo && item.assignedTo !== user._id && checklist.createdBy !== user._id) {
      throw appError("FORBIDDEN", "Access denied: this checklist item is assigned to someone else.");
    }
    const patch: Partial<Doc<"dispatchItems">> = {};
    const changes: FieldChange[] = [];

    if (args.assignedTo !== undefined) {
      const next = args.assignedTo ?? undefined;
      if (!isManager && next && next !== user._id) {
        throw appError("FORBIDDEN", "Staff can only assign checklist items to themselves.");
      }
      if (next) {
        const assignee = await getOrThrow(ctx, next, "User");
        if (assignee.status !== "active") throw appError("INVALID", "Items can only be assigned to active users.");
      }
      if (next !== item.assignedTo) {
        patch.assignedTo = next;
        const names = await nameMap(ctx, [item.assignedTo, next]);
        changes.push({
          field: "assignedTo",
          from: item.assignedTo ? names.get(item.assignedTo) : undefined,
          to: next ? names.get(next) : undefined,
        });
      }
    }
    if (args.dueDate !== undefined) {
      const due = args.dueDate ?? undefined;
      if (due && !/^\d{4}-\d{2}-\d{2}$/.test(due)) throw appError("INVALID", "Due date must be a valid date.");
      if (due !== item.dueDate) {
        patch.dueDate = due;
        changes.push({ field: "dueDate", from: item.dueDate, to: due });
      }
    }
    if (args.comment !== undefined && args.comment.trim() !== (item.comment ?? "")) {
      patch.comment = args.comment.trim() || undefined;
      changes.push({ field: "comment", from: item.comment, to: patch.comment });
    }
    if (args.documentIds !== undefined) {
      for (const id of args.documentIds) await getOrThrow(ctx, id, "Document");
      patch.documentIds = args.documentIds;
      changes.push({ field: "documents", from: String(item.documentIds.length), to: String(args.documentIds.length) });
    }
    const status = args.status ?? item.status;
    if (status === "blocked") {
      const reason = (args.blockedReason ?? item.blockedReason ?? "").trim();
      if (!reason) throw appError("INVALID", "Describe what is blocking this item.");
      if (reason !== item.blockedReason) patch.blockedReason = reason;
    } else if (args.status !== undefined && item.blockedReason) {
      patch.blockedReason = undefined;
    }
    if (args.status !== undefined && args.status !== item.status) {
      patch.status = args.status;
      changes.push({ field: "status", from: item.status, to: args.status });
      if (args.status === "complete") {
        patch.completedAt = Date.now();
        patch.completedBy = user._id;
      } else if (item.status === "complete") {
        patch.completedAt = undefined;
        patch.completedBy = undefined;
      }
    }
    if (Object.keys(patch).length === 0) return;
    await ctx.db.patch(item._id, { ...patch, updatedBy: user._id, updatedAt: Date.now() });
    await logActivity(ctx, user, {
      entityType: "dispatch",
      entityId: checklist._id,
      entityLabel: checklist.tradeNumber,
      tradeId: checklist.tradeId,
      action: patch.status ? "dispatch.item_status" : "dispatch.item_updated",
      summary: patch.status
        ? `“${item.label}” → ${patch.status.replace("_", " ")}${patch.status === "blocked" ? `: ${patch.blockedReason ?? item.blockedReason}` : ""}`
        : `Updated “${item.label}”`,
      changes,
    });
    await syncChecklistStatus(ctx, user, checklist);
  },
});

export const addItem = mutation({
  args: { checklistId: v.id("dispatchChecklists"), label: v.string() },
  handler: async (ctx, { checklistId, label }) => {
    const user = await requirePermission(ctx, "dispatch.configure");
    const checklist = await getOrThrow(ctx, checklistId, "Checklist");
    const clean = label.trim().slice(0, 160);
    if (!clean) throw appError("INVALID", "Enter a label for the checklist item.");
    const items = await loadItems(ctx, checklistId);
    await ctx.db.insert("dispatchItems", {
      checklistId,
      tradeId: checklist.tradeId,
      label: clean,
      sortOrder: items.reduce((m, i) => Math.max(m, i.sortOrder), -1) + 1,
      status: "pending",
      documentIds: [],
      createdBy: user._id,
      updatedAt: Date.now(),
    });
    await logActivity(ctx, user, {
      entityType: "dispatch",
      entityId: checklistId,
      entityLabel: checklist.tradeNumber,
      tradeId: checklist.tradeId,
      action: "dispatch.item_added",
      summary: `Added checklist item “${clean}”`,
    });
    await syncChecklistStatus(ctx, user, checklist);
  },
});

export const removeItem = mutation({
  args: { itemId: v.id("dispatchItems") },
  handler: async (ctx, { itemId }) => {
    const user = await requirePermission(ctx, "dispatch.configure");
    const item = await getOrThrow(ctx, itemId, "Checklist item");
    const checklist = await getOrThrow(ctx, item.checklistId, "Checklist");
    if (item.status === "complete" || item.documentIds.length > 0) {
      throw appError("CONFLICT", "Completed items or items with linked documents cannot be removed.");
    }
    await ctx.db.delete(itemId);
    await logActivity(ctx, user, {
      entityType: "dispatch",
      entityId: checklist._id,
      entityLabel: checklist.tradeNumber,
      tradeId: checklist.tradeId,
      action: "dispatch.item_removed",
      summary: `Removed checklist item “${item.label}”`,
    });
    await syncChecklistStatus(ctx, user, checklist);
  },
});

export const reorder = mutation({
  args: { checklistId: v.id("dispatchChecklists"), itemIds: v.array(v.id("dispatchItems")) },
  handler: async (ctx, { checklistId, itemIds }) => {
    const user = await requirePermission(ctx, "dispatch.configure");
    await getOrThrow(ctx, checklistId, "Checklist");
    for (const [i, id] of itemIds.entries()) {
      const item = await getOrThrow(ctx, id, "Checklist item");
      if (item.checklistId !== checklistId) throw appError("INVALID", "Item does not belong to this checklist.");
      if (item.sortOrder !== i) await ctx.db.patch(id, { sortOrder: i, updatedBy: user._id, updatedAt: Date.now() });
    }
  },
});

/**
 * Operations board. Bounded (open checklists are a small working set):
 * filters are evaluated server-side against real item / B/L data.
 */
export const listOpen = query({
  args: {
    hasBlockers: v.optional(v.boolean()),
    overdue: v.optional(v.boolean()),
    blStatus: v.optional(v.union(blStatusV, v.literal("none"))),
    includeCompleted: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireViewer(ctx);
    const open = await ctx.db
      .query("dispatchChecklists")
      .withIndex("by_status", (q) => q.eq("status", "open"))
      .order("desc")
      .take(200);
    const completed = args.includeCompleted
      ? await ctx.db
          .query("dispatchChecklists")
          .withIndex("by_status", (q) => q.eq("status", "completed"))
          .order("desc")
          .take(50)
      : [];
    const today = todayIsoUtc();
    const rows = [];
    for (const checklist of [...open, ...completed]) {
      const trade = await ctx.db.get(checklist.tradeId);
      if (!trade || trade.status === "cancelled") continue;
      const items = await loadItems(ctx, checklist._id);
      const names = await nameMap(ctx, items.map((i) => i.assignedTo));
      const { progress, nextStep } = summarise(items, names, today);
      const bl = await ctx.db
        .query("blDocuments")
        .withIndex("by_trade", (q) => q.eq("tradeId", checklist.tradeId))
        .order("desc")
        .filter((q) => q.eq(q.field("isCurrent"), true))
        .first();
      const blStatus: BlStatus | "none" = bl?.status ?? "none";
      if (args.hasBlockers && progress.blocked === 0) continue;
      if (args.overdue && progress.overdue === 0) continue;
      if (args.blStatus && args.blStatus !== blStatus) continue;
      rows.push({
        checklistId: checklist._id,
        status: checklist.status,
        tradeId: trade._id,
        tradeNumber: trade.tradeNumber,
        tradeStatus: trade.status,
        direction: trade.direction,
        counterpartyName: trade.counterpartyName,
        commodityName: trade.commodityName,
        shipmentPeriod: trade.shipmentPeriod,
        blId: bl?._id,
        blRecordNumber: bl?.blRecordNumber,
        blStatus,
        progress,
        nextStep,
        updatedAt: checklist.updatedAt,
      });
    }
    return rows;
  },
});
