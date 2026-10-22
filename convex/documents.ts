import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { logActivity } from "./lib/audit";
import { appError, displayName, getOrThrow, requirePermission, requireViewer } from "./lib/auth";
import { insertDocument } from "./lib/documents";
import { hasPermission } from "./lib/roles";
import { documentSearchText } from "./lib/search";
import { documentTypeV, reviewStatusV } from "./lib/validators";

/**
 * Document Centre. Every read goes through `requireViewer` (active, approved
 * user); download URLs are only produced by `getDownloadUrl` after that check.
 * Archived documents are visible to managers/admins only.
 */

async function withUploader(ctx: QueryCtx, docs: Doc<"documents">[]) {
  const names = new Map<string, string>();
  for (const d of docs) {
    if (!names.has(d.uploadedBy)) names.set(d.uploadedBy, displayName(await ctx.db.get(d.uploadedBy)));
  }
  return docs.map((d) => ({
    _id: d._id,
    _creationTime: d._creationTime,
    fileName: d.fileName,
    contentType: d.contentType,
    size: d.size,
    docType: d.docType,
    tradeId: d.tradeId,
    tradeNumber: d.tradeNumber,
    contractId: d.contractId,
    contractNumber: d.contractNumber,
    counterpartyId: d.counterpartyId,
    counterpartyName: d.counterpartyName,
    blDocumentId: d.blDocumentId,
    dispatchItemId: d.dispatchItemId,
    groupKey: d.groupKey,
    version: d.version,
    isLatest: d.isLatest,
    source: d.source,
    reviewStatus: d.reviewStatus,
    reviewedAt: d.reviewedAt,
    notes: d.notes,
    archived: d.archived,
    uploadedBy: d.uploadedBy,
    uploadedByName: names.get(d.uploadedBy) ?? "Unknown user",
  }));
}

export type DocumentRow = Awaited<ReturnType<typeof withUploader>>[number];

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requirePermission(ctx, "document.upload");
    return await ctx.storage.generateUploadUrl();
  },
});

export const create = mutation({
  args: {
    storageId: v.id("_storage"),
    fileName: v.string(),
    docType: documentTypeV,
    tradeId: v.optional(v.id("trades")),
    contractId: v.optional(v.id("contracts")),
    counterpartyId: v.optional(v.id("counterparties")),
    blDocumentId: v.optional(v.id("blDocuments")),
    dispatchItemId: v.optional(v.id("dispatchItems")),
    notes: v.optional(v.string()),
    groupKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requirePermission(ctx, "document.upload");
    let tradeId = args.tradeId;
    // Resolve and validate every linked record; infer the trade from narrower links.
    if (args.tradeId) await getOrThrow(ctx, args.tradeId, "Trade");
    if (args.counterpartyId) await getOrThrow(ctx, args.counterpartyId, "Counterparty");
    if (args.contractId) {
      const c = await getOrThrow(ctx, args.contractId, "Contract");
      tradeId ??= c.tradeId;
    }
    if (args.blDocumentId) {
      const bl = await getOrThrow(ctx, args.blDocumentId, "B/L");
      tradeId ??= bl.tradeId;
    }
    let item: Doc<"dispatchItems"> | null = null;
    if (args.dispatchItemId) {
      item = await getOrThrow(ctx, args.dispatchItemId, "Checklist item");
      tradeId ??= item.tradeId;
    }
    if (args.groupKey) {
      const prev = await ctx.db
        .query("documents")
        .withIndex("by_group", (q) => q.eq("groupKey", args.groupKey!))
        .first();
      if (!prev) throw appError("INVALID", "The document you are adding a version to no longer exists.");
    }
    const id = await insertDocument(ctx, user, {
      storageId: args.storageId,
      fileName: args.fileName,
      docType: args.docType,
      source: "upload",
      tradeId,
      contractId: args.contractId,
      counterpartyId: args.counterpartyId,
      blDocumentId: args.blDocumentId,
      dispatchItemId: args.dispatchItemId,
      notes: args.notes?.trim() || undefined,
      groupKey: args.groupKey,
    });
    if (item) {
      await ctx.db.patch(item._id, {
        documentIds: [...item.documentIds, id],
        updatedBy: user._id,
        updatedAt: Date.now(),
      });
    }
    return id;
  },
});

export const getDownloadUrl = query({
  args: { id: v.id("documents") },
  handler: async (ctx, { id }) => {
    const user = await requireViewer(ctx);
    const doc = await getOrThrow(ctx, id, "Document");
    if (doc.archived && !hasPermission(user, "document.archive")) {
      throw appError("FORBIDDEN", "Access denied: this document has been archived.");
    }
    return await ctx.storage.getUrl(doc.storageId);
  },
});

export const get = query({
  args: { id: v.id("documents") },
  handler: async (ctx, { id }) => {
    const user = await requireViewer(ctx);
    const doc = await getOrThrow(ctx, id, "Document");
    if (doc.archived && !hasPermission(user, "document.archive")) {
      throw appError("FORBIDDEN", "Access denied: this document has been archived.");
    }
    return (await withUploader(ctx, [doc]))[0];
  },
});

/** Bounded list of documents linked to one record (latest versions first). */
export const listFor = query({
  args: {
    tradeId: v.optional(v.id("trades")),
    counterpartyId: v.optional(v.id("counterparties")),
    contractId: v.optional(v.id("contracts")),
    blDocumentId: v.optional(v.id("blDocuments")),
    includeArchived: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await requireViewer(ctx);
    let rows: Doc<"documents">[];
    if (args.tradeId) {
      rows = await ctx.db.query("documents").withIndex("by_trade", (q) => q.eq("tradeId", args.tradeId)).take(300);
    } else if (args.contractId) {
      rows = await ctx.db.query("documents").withIndex("by_contract", (q) => q.eq("contractId", args.contractId)).take(300);
    } else if (args.blDocumentId) {
      rows = await ctx.db.query("documents").withIndex("by_bl", (q) => q.eq("blDocumentId", args.blDocumentId)).take(300);
    } else if (args.counterpartyId) {
      rows = await ctx.db
        .query("documents")
        .withIndex("by_counterparty", (q) => q.eq("counterpartyId", args.counterpartyId))
        .take(300);
    } else {
      throw appError("INVALID", "Specify a record to list documents for.");
    }
    const showArchived = Boolean(args.includeArchived) && hasPermission(user, "document.archive");
    rows = rows.filter((d) => showArchived || !d.archived).sort((a, b) => b._creationTime - a._creationTime);
    return await withUploader(ctx, rows);
  },
});

/** Paginated Document Centre listing with real filters. */
export const list = query({
  args: {
    paginationOpts: paginationOptsValidator,
    search: v.optional(v.string()),
    docType: v.optional(documentTypeV),
    reviewStatus: v.optional(reviewStatusV),
    dateFrom: v.optional(v.number()), // epoch ms, inclusive
    dateTo: v.optional(v.number()), // epoch ms, exclusive
    includeArchived: v.optional(v.boolean()),
    latestOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await requireViewer(ctx);
    const includeArchived = Boolean(args.includeArchived) && hasPermission(user, "document.archive");
    const latestOnly = args.latestOnly ?? true;
    const term = args.search?.trim().toLowerCase();

    let result;
    if (term) {
      result = await ctx.db
        .query("documents")
        .withSearchIndex("search", (q) => {
          let s = q.search("searchText", term);
          if (!includeArchived) s = s.eq("archived", false);
          if (args.docType) s = s.eq("docType", args.docType);
          if (args.reviewStatus) s = s.eq("reviewStatus", args.reviewStatus);
          return s;
        })
        .filter((q) =>
          q.and(
            args.dateFrom !== undefined ? q.gte(q.field("_creationTime"), args.dateFrom) : true,
            args.dateTo !== undefined ? q.lt(q.field("_creationTime"), args.dateTo) : true,
            latestOnly ? q.eq(q.field("isLatest"), true) : true,
          ),
        )
        .paginate(args.paginationOpts);
    } else {
      const base =
        !includeArchived && args.docType
          ? ctx.db
              .query("documents")
              .withIndex("by_archived_and_type", (q) => q.eq("archived", false).eq("docType", args.docType!))
          : !includeArchived && args.reviewStatus
            ? ctx.db
                .query("documents")
                .withIndex("by_archived_and_review", (q) => q.eq("archived", false).eq("reviewStatus", args.reviewStatus!))
            : !includeArchived
              ? ctx.db.query("documents").withIndex("by_archived", (q) => q.eq("archived", false))
              : ctx.db.query("documents");
      result = await base
        .order("desc")
        .filter((q) =>
          q.and(
            args.docType ? q.eq(q.field("docType"), args.docType) : true,
            args.reviewStatus ? q.eq(q.field("reviewStatus"), args.reviewStatus) : true,
            args.dateFrom !== undefined ? q.gte(q.field("_creationTime"), args.dateFrom) : true,
            args.dateTo !== undefined ? q.lt(q.field("_creationTime"), args.dateTo) : true,
            latestOnly ? q.eq(q.field("isLatest"), true) : true,
          ),
        )
        .paginate(args.paginationOpts);
    }
    return { ...result, page: await withUploader(ctx, result.page) };
  },
});

export const versions = query({
  args: { groupKey: v.string() },
  handler: async (ctx, { groupKey }) => {
    const user = await requireViewer(ctx);
    const rows = await ctx.db
      .query("documents")
      .withIndex("by_group", (q) => q.eq("groupKey", groupKey))
      .order("desc")
      .take(100);
    const visible = rows.filter((d) => !d.archived || hasPermission(user, "document.archive"));
    return await withUploader(ctx, visible);
  },
});

export const review = mutation({
  args: { id: v.id("documents"), status: reviewStatusV, note: v.optional(v.string()) },
  handler: async (ctx, { id, status, note }) => {
    const user = await requirePermission(ctx, "document.review");
    const doc = await getOrThrow(ctx, id, "Document");
    if (status === "rejected" && !note?.trim()) throw appError("INVALID", "Give a reason when rejecting a document.");
    await ctx.db.patch(id, { reviewStatus: status, reviewedBy: user._id, reviewedAt: Date.now(), updatedAt: Date.now() });
    await logActivity(ctx, user, {
      entityType: "document",
      entityId: id,
      entityLabel: doc.fileName,
      tradeId: doc.tradeId,
      action: "document.reviewed",
      summary: `Marked ${doc.fileName} as ${status}${note?.trim() ? ` — ${note.trim()}` : ""}`,
      changes: [{ field: "reviewStatus", from: doc.reviewStatus, to: status }],
    });
  },
});

async function setArchived(ctx: MutationCtx, id: Id<"documents">, archived: boolean) {
  const user = await requirePermission(ctx, "document.archive");
  const doc = await getOrThrow(ctx, id, "Document");
  if (doc.archived === archived) return;
  if (archived) {
    // Refuse to archive a file that is the evidence for an issued B/L or signed contract.
    const bl = doc.blDocumentId ? await ctx.db.get(doc.blDocumentId) : null;
    if (bl && bl.status === "issued" && bl.carrierDocumentId === id) {
      throw appError("CONFLICT", "This file is the recorded carrier-issued B/L and cannot be archived.");
    }
    const contract = doc.contractId ? await ctx.db.get(doc.contractId) : null;
    if (contract && contract.signedDocumentId === id) {
      throw appError("CONFLICT", "This file is the recorded signed contract and cannot be archived.");
    }
  }
  await ctx.db.patch(id, { archived, updatedAt: Date.now() });
  return { user, doc };
}

export const archive = mutation({
  args: { id: v.id("documents") },
  handler: async (ctx, { id }) => {
    const res = await setArchived(ctx, id, true);
    if (res)
      await logActivity(ctx, res.user, {
        entityType: "document",
        entityId: id,
        entityLabel: res.doc.fileName,
        tradeId: res.doc.tradeId,
        action: "document.archived",
        summary: `Archived ${res.doc.fileName}`,
      });
  },
});

export const restore = mutation({
  args: { id: v.id("documents") },
  handler: async (ctx, { id }) => {
    const res = await setArchived(ctx, id, false);
    if (res)
      await logActivity(ctx, res.user, {
        entityType: "document",
        entityId: id,
        entityLabel: res.doc.fileName,
        tradeId: res.doc.tradeId,
        action: "document.restored",
        summary: `Restored ${res.doc.fileName}`,
      });
  },
});

export const updateMeta = mutation({
  args: { id: v.id("documents"), docType: v.optional(documentTypeV), notes: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const user = await requireViewer(ctx);
    const doc = await getOrThrow(ctx, args.id, "Document");
    if (doc.uploadedBy !== user._id && !hasPermission(user, "document.review")) {
      throw appError("FORBIDDEN", "Access denied: only the uploader or a manager can edit this document's details.");
    }
    const patch: Partial<Doc<"documents">> = { updatedAt: Date.now() };
    const changes = [];
    if (args.docType && args.docType !== doc.docType) {
      patch.docType = args.docType;
      changes.push({ field: "docType", from: doc.docType, to: args.docType });
    }
    if (args.notes !== undefined && args.notes.trim() !== (doc.notes ?? "")) {
      patch.notes = args.notes.trim() || undefined;
      changes.push({ field: "notes", from: doc.notes, to: args.notes.trim() });
      patch.searchText = documentSearchText({ ...doc, notes: patch.notes });
    }
    if (changes.length === 0) return;
    await ctx.db.patch(doc._id, patch);
    await logActivity(ctx, user, {
      entityType: "document",
      entityId: doc._id,
      entityLabel: doc.fileName,
      tradeId: doc.tradeId,
      action: "document.updated",
      summary: `Updated details of ${doc.fileName}`,
      changes,
    });
  },
});

/** Lightweight trade picker for linking uploads (bounded). */
export const searchTradesForLink = query({
  args: { search: v.optional(v.string()) },
  handler: async (ctx, { search }) => {
    await requireViewer(ctx);
    const term = search?.trim().toLowerCase();
    const rows = term
      ? await ctx.db
          .query("trades")
          .withSearchIndex("search", (q) => q.search("searchText", term))
          .take(20)
      : await ctx.db.query("trades").withIndex("by_tradeDate").order("desc").take(20);
    return rows.map((t) => ({
      _id: t._id,
      tradeNumber: t.tradeNumber,
      counterpartyName: t.counterpartyName,
      commodityName: t.commodityName,
      status: t.status,
    }));
  },
});
