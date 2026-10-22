import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { diffFields, logActivity } from "./lib/audit";
import { appError, displayName, getOrThrow, requirePermission, requireViewer } from "./lib/auth";
import { insertDocument } from "./lib/documents";
import { nextBlRecordNumber } from "./lib/numbering";
import { hasPermission } from "./lib/roles";
import { partyAddress } from "./lib/templateEngine";
import { blStatusV } from "./lib/validators";
import { canTransitionBl } from "./lib/workflow";
import { ensureChecklistForTrade } from "./dispatch";

/**
 * B/L preparation. A B/L record here is our structured shipping data and an
 * internally generated DRAFT document. Status "issued" only means a
 * carrier-issued B/L has been received and recorded: it requires the carrier's
 * B/L number, issue date and an uploaded carrier document (type "bl_issued").
 *
 * Revisions: `createRevision` makes a new current draft version (same internal
 * record number, version + 1). If the previous version was NOT issued it is
 * marked "superseded"; if it WAS issued it keeps status "issued" (the carrier
 * document stays on record) but is no longer current. When a revision is later
 * issued, any earlier issued version becomes "superseded".
 */

/** Fields a user may edit on a draft/prepared B/L. Never touches the trade. */
const editableFieldsV = {
  externalBlNumber: v.optional(v.string()),
  issueDate: v.optional(v.string()),
  issuePlace: v.optional(v.string()),
  shipper: v.optional(v.string()),
  consignee: v.optional(v.string()),
  notifyParty: v.optional(v.string()),
  notifyInstructions: v.optional(v.string()),
  buyerDetails: v.optional(v.string()),
  sellerDetails: v.optional(v.string()),
  vessel: v.optional(v.string()),
  voyage: v.optional(v.string()),
  portOfLoading: v.optional(v.string()),
  portOfDischarge: v.optional(v.string()),
  placeOfReceipt: v.optional(v.string()),
  placeOfDelivery: v.optional(v.string()),
  shipmentPeriod: v.optional(v.string()),
  goodsDescription: v.optional(v.string()),
  commodity: v.optional(v.string()),
  grade: v.optional(v.string()),
  quantity: v.optional(v.number()),
  uom: v.optional(v.string()),
  packages: v.optional(v.string()),
  packingDescription: v.optional(v.string()),
  marksAndNumbers: v.optional(v.string()),
  grossWeight: v.optional(v.number()),
  netWeight: v.optional(v.number()),
  weightUnit: v.optional(v.string()),
  containerNumbers: v.optional(v.array(v.string())),
  sealNumbers: v.optional(v.array(v.string())),
  freightTerms: v.optional(v.string()),
  originalsCount: v.optional(v.number()),
  specialClauses: v.optional(v.string()),
  instructions: v.optional(v.string()),
  hiddenFields: v.optional(v.array(v.string())),
};

const blFieldsObjectV = v.object(editableFieldsV);
type BlEditableFields = typeof blFieldsObjectV.type;
const EDITABLE_KEYS = Object.keys(editableFieldsV) as (keyof BlEditableFields)[];

const EDITABLE_STATUSES: Doc<"blDocuments">["status"][] = ["draft", "prepared"];

function partyBlock(p: { name?: string; address?: string; city?: string; state?: string; postalCode?: string; country?: string } | null) {
  if (!p?.name) return undefined;
  const addr = partyAddress(p);
  return addr ? `${p.name}\n${addr}` : p.name;
}

async function enrich(ctx: QueryCtx, bl: Doc<"blDocuments">) {
  const name = async (id?: Id<"users">) => (id ? displayName(await ctx.db.get(id)) : null);
  const carrierDoc = bl.carrierDocumentId ? await ctx.db.get(bl.carrierDocumentId) : null;
  const draftDoc = bl.draftPdfDocumentId ? await ctx.db.get(bl.draftPdfDocumentId) : null;
  return {
    ...bl,
    createdByName: await name(bl.createdBy),
    updatedByName: await name(bl.updatedBy),
    preparedByName: await name(bl.preparedBy),
    reviewedByName: await name(bl.reviewedBy),
    verifiedByName: await name(bl.verifiedBy),
    issuedRecordedByName: await name(bl.issuedRecordedBy),
    carrierDocument: carrierDoc ? { _id: carrierDoc._id, fileName: carrierDoc.fileName } : null,
    draftPdfDocument: draftDoc ? { _id: draftDoc._id, fileName: draftDoc.fileName, createdAt: draftDoc._creationTime } : null,
  };
}

export type BlRecord = Awaited<ReturnType<typeof enrich>>;

export const forTrade = query({
  args: { tradeId: v.id("trades") },
  handler: async (ctx, { tradeId }) => {
    await requireViewer(ctx);
    const versions = await ctx.db
      .query("blDocuments")
      .withIndex("by_trade", (q) => q.eq("tradeId", tradeId))
      .order("desc")
      .take(50);
    const current = versions.find((b) => b.isCurrent) ?? null;
    return {
      current: current ? await enrich(ctx, current) : null,
      versions: versions.map((b) => ({
        _id: b._id,
        version: b.version,
        status: b.status,
        isCurrent: b.isCurrent,
        externalBlNumber: b.externalBlNumber,
        blRecordNumber: b.blRecordNumber,
        updatedAt: b.updatedAt,
        revisionOf: b.revisionOf,
      })),
    };
  },
});

export const get = query({
  args: { id: v.id("blDocuments") },
  handler: async (ctx, { id }) => {
    await requireViewer(ctx);
    return await enrich(ctx, await getOrThrow(ctx, id, "B/L"));
  },
});

export const createFromTrade = mutation({
  args: { tradeId: v.id("trades") },
  handler: async (ctx, { tradeId }) => {
    const user = await requirePermission(ctx, "bl.prepare");
    const trade = await getOrThrow(ctx, tradeId, "Trade");
    if (trade.status === "cancelled") throw appError("INVALID", "A B/L cannot be prepared for a cancelled trade.");
    const existing = await ctx.db
      .query("blDocuments")
      .withIndex("by_trade", (q) => q.eq("tradeId", tradeId))
      .filter((q) => q.eq(q.field("isCurrent"), true))
      .first();
    if (existing) throw appError("CONFLICT", `This trade already has a B/L record (${existing.blRecordNumber}).`);

    const company = trade.companyId ? await ctx.db.get(trade.companyId) : null;
    const counterparty = trade.counterpartyId ? await ctx.db.get(trade.counterpartyId) : null;
    const commodity = trade.commodityId ? await ctx.db.get(trade.commodityId) : null;
    const contracts = await ctx.db
      .query("contracts")
      .withIndex("by_trade", (q) => q.eq("tradeId", tradeId))
      .order("desc")
      .take(20);
    const contract = contracts.find((c) => c.isCurrent && c.status !== "cancelled");

    const ours = partyBlock(company);
    const theirs = partyBlock(counterparty);
    const isSales = trade.direction === "sales";
    const buyer = isSales ? theirs : ours;
    const seller = isSales ? ours : theirs;
    const goods = [
      commodity?.name,
      commodity?.grade ? `Grade: ${commodity.grade}` : undefined,
      commodity?.hsCode ? `HS Code: ${commodity.hsCode}` : undefined,
      trade.origin ? `Origin: ${trade.origin}` : undefined,
    ]
      .filter(Boolean)
      .join("\n");

    const blRecordNumber = await nextBlRecordNumber(ctx);
    const now = Date.now();
    const id = await ctx.db.insert("blDocuments", {
      tradeId,
      tradeNumber: trade.tradeNumber,
      contractId: contract?._id,
      blRecordNumber,
      version: 1,
      isCurrent: true,
      status: "draft",
      shipper: seller,
      consignee: buyer,
      notifyParty: buyer,
      buyerDetails: buyer,
      sellerDetails: seller,
      portOfLoading: trade.loadingLocation,
      portOfDischarge: trade.dischargeLocation,
      placeOfDelivery: trade.dischargeLocation,
      shipmentPeriod: trade.shipmentPeriod,
      goodsDescription: goods || undefined,
      commodity: commodity?.name ?? trade.commodityName,
      grade: commodity?.grade,
      quantity: trade.quantity,
      uom: trade.uom,
      packingDescription: trade.packingClause,
      freightTerms: trade.freightTerms,
      containerNumbers: [],
      sealNumbers: [],
      hiddenFields: [],
      createdBy: user._id,
      updatedAt: now,
    });
    const checklistId = await ensureChecklistForTrade(ctx, user, trade);
    const checklist = await ctx.db.get(checklistId);
    if (checklist && !checklist.blDocumentId) await ctx.db.patch(checklistId, { blDocumentId: id });
    await logActivity(ctx, user, {
      entityType: "bl",
      entityId: id,
      entityLabel: blRecordNumber,
      tradeId,
      action: "bl.created",
      summary: `B/L record ${blRecordNumber} created from ${trade.tradeNumber}`,
    });
    return id;
  },
});

export const update = mutation({
  args: { id: v.id("blDocuments"), fields: blFieldsObjectV },
  handler: async (ctx, { id, fields }) => {
    const user = await requirePermission(ctx, "bl.prepare");
    const bl = await getOrThrow(ctx, id, "B/L");
    if (!bl.isCurrent || !EDITABLE_STATUSES.includes(bl.status)) {
      throw appError("CONFLICT", "Only the current B/L in Draft or Prepared status can be edited. Create a revision instead.");
    }
    for (const key of ["quantity", "grossWeight", "netWeight", "originalsCount"] as const) {
      const n = fields[key];
      if (n !== undefined && (!Number.isFinite(n) || n < 0)) throw appError("INVALID", `${key} cannot be negative.`);
    }
    if (fields.originalsCount !== undefined && !Number.isInteger(fields.originalsCount)) {
      throw appError("INVALID", "Number of originals must be a whole number.");
    }
    const patch: Record<string, unknown> = {};
    for (const key of EDITABLE_KEYS) {
      if (!(key in fields)) continue;
      const raw = fields[key];
      if (typeof raw === "string") patch[key] = raw.trim() === "" ? undefined : raw.trim();
      else if (Array.isArray(raw)) patch[key] = raw.map((s) => s.trim()).filter(Boolean);
      else patch[key] = raw;
    }
    const changes = diffFields(bl as unknown as Record<string, unknown>, patch);
    if (changes.length === 0) return;
    await ctx.db.patch(id, { ...patch, updatedBy: user._id, updatedAt: Date.now() } as Partial<Doc<"blDocuments">>);
    await logActivity(ctx, user, {
      entityType: "bl",
      entityId: id,
      entityLabel: bl.blRecordNumber,
      tradeId: bl.tradeId,
      action: "bl.updated",
      summary: `Updated B/L ${bl.blRecordNumber} v${bl.version} (${changes.length} field${changes.length === 1 ? "" : "s"})`,
      changes,
    });
  },
});

function requiredForPrepared(bl: Doc<"blDocuments">) {
  const missing: string[] = [];
  if (!bl.shipper) missing.push("Shipper");
  if (!bl.consignee) missing.push("Consignee");
  if (!bl.portOfLoading) missing.push("Port of loading");
  if (!bl.portOfDischarge) missing.push("Port of discharge");
  if (!bl.goodsDescription) missing.push("Goods description");
  if (bl.quantity === undefined) missing.push("Quantity");
  return missing;
}

async function supersedeEarlierIssued(ctx: MutationCtx, bl: Doc<"blDocuments">) {
  const versions = await ctx.db
    .query("blDocuments")
    .withIndex("by_trade", (q) => q.eq("tradeId", bl.tradeId))
    .take(50);
  for (const other of versions) {
    if (other._id !== bl._id && other.blRecordNumber === bl.blRecordNumber && other.status === "issued") {
      await ctx.db.patch(other._id, { status: "superseded", isCurrent: false, updatedAt: Date.now() });
    }
  }
}

async function validateCarrierDocument(ctx: MutationCtx, bl: Doc<"blDocuments">, documentId: Id<"documents">) {
  const doc = await getOrThrow(ctx, documentId, "Carrier B/L document");
  if (doc.docType !== "bl_issued") {
    throw appError("INVALID", "The attached file must be uploaded as document type “Issued B/L (Carrier)”.");
  }
  if (doc.tradeId && doc.tradeId !== bl.tradeId) throw appError("INVALID", "That document belongs to a different trade.");
  if (doc.archived) throw appError("INVALID", "That document is archived.");
  return doc;
}

export const transition = mutation({
  args: { id: v.id("blDocuments"), to: blStatusV, note: v.optional(v.string()) },
  handler: async (ctx, { id, to, note }) => {
    const user = await requireViewer(ctx);
    const bl = await getOrThrow(ctx, id, "B/L");
    if (!bl.isCurrent) throw appError("CONFLICT", "Only the current B/L version can change status.");
    const t = canTransitionBl(bl.status, to);
    if (!t) throw appError("INVALID", `A B/L cannot move from ${bl.status} to ${to}.`);
    if (!hasPermission(user, t.permission)) {
      throw appError("FORBIDDEN", `Access denied: your role (${user.role}) cannot “${t.label}”.`);
    }
    const now = Date.now();
    const patch: Partial<Doc<"blDocuments">> = { status: to, updatedBy: user._id, updatedAt: now };
    if (to === "prepared") {
      const missing = requiredForPrepared(bl);
      if (missing.length) throw appError("INVALID", `Complete these fields first: ${missing.join(", ")}.`);
      patch.preparedBy = user._id;
      patch.preparedAt = now;
    }
    if (to === "draft" && bl.status === "under_review") {
      if (!note?.trim()) throw appError("INVALID", "Explain what needs correcting.");
      patch.reviewedBy = user._id;
      patch.reviewedAt = now;
      patch.reviewNote = note.trim();
    }
    if (to === "verified") {
      patch.reviewedBy = user._id;
      patch.reviewedAt = now;
      patch.verifiedBy = user._id;
      patch.verifiedAt = now;
      patch.reviewNote = note?.trim() || undefined;
    }
    if (to === "issued") {
      if (!bl.externalBlNumber || !bl.issueDate || !bl.carrierDocumentId) {
        throw appError(
          "INVALID",
          "Record the carrier's B/L number, issue date and upload the carrier-issued B/L before marking it issued.",
        );
      }
      await validateCarrierDocument(ctx, bl, bl.carrierDocumentId);
      patch.issuedRecordedBy = user._id;
      patch.issuedRecordedAt = now;
    }
    await ctx.db.patch(id, patch);
    if (to === "issued") await supersedeEarlierIssued(ctx, bl);
    await logActivity(ctx, user, {
      entityType: "bl",
      entityId: id,
      entityLabel: bl.blRecordNumber,
      tradeId: bl.tradeId,
      action: "bl.status_changed",
      summary: `B/L ${bl.blRecordNumber} v${bl.version}: ${t.label}${note?.trim() ? ` — ${note.trim()}` : ""}`,
      changes: [{ field: "status", from: bl.status, to }],
    });
  },
});

/** Records the carrier-issued B/L (number, date, uploaded file) and moves a verified B/L to "issued". */
export const recordCarrierIssued = mutation({
  args: {
    id: v.id("blDocuments"),
    externalBlNumber: v.string(),
    issueDate: v.string(),
    issuePlace: v.optional(v.string()),
    documentId: v.id("documents"),
  },
  handler: async (ctx, args) => {
    const user = await requirePermission(ctx, "bl.recordIssued");
    const bl = await getOrThrow(ctx, args.id, "B/L");
    if (!bl.isCurrent) throw appError("CONFLICT", "Only the current B/L version can be issued.");
    if (bl.status !== "verified") throw appError("INVALID", "The B/L must be internally verified before recording the carrier-issued B/L.");
    const externalBlNumber = args.externalBlNumber.trim();
    if (!externalBlNumber) throw appError("INVALID", "Enter the carrier's B/L number.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(args.issueDate)) throw appError("INVALID", "Enter a valid issue date.");
    const doc = await validateCarrierDocument(ctx, bl, args.documentId);
    if (!doc.blDocumentId) await ctx.db.patch(doc._id, { blDocumentId: bl._id, updatedAt: Date.now() });
    const now = Date.now();
    await ctx.db.patch(bl._id, {
      externalBlNumber,
      issueDate: args.issueDate,
      issuePlace: args.issuePlace?.trim() || bl.issuePlace,
      carrierDocumentId: doc._id,
      status: "issued",
      issuedRecordedBy: user._id,
      issuedRecordedAt: now,
      updatedBy: user._id,
      updatedAt: now,
    });
    await supersedeEarlierIssued(ctx, bl);
    await logActivity(ctx, user, {
      entityType: "bl",
      entityId: bl._id,
      entityLabel: bl.blRecordNumber,
      tradeId: bl.tradeId,
      action: "bl.carrier_issued_recorded",
      summary: `Carrier-issued B/L ${externalBlNumber} recorded against ${bl.blRecordNumber} v${bl.version}`,
      changes: [
        { field: "status", from: bl.status, to: "issued" },
        { field: "externalBlNumber", from: bl.externalBlNumber, to: externalBlNumber },
      ],
    });
  },
});

export const createRevision = mutation({
  args: { id: v.id("blDocuments"), reason: v.string() },
  handler: async (ctx, { id, reason }) => {
    const user = await requirePermission(ctx, "bl.prepare");
    const bl = await getOrThrow(ctx, id, "B/L");
    if (!bl.isCurrent) throw appError("CONFLICT", "Only the current B/L version can be revised.");
    if (bl.status === "draft") throw appError("INVALID", "This B/L is still a draft — edit it directly.");
    const why = reason.trim();
    if (!why) throw appError("INVALID", "Give a reason for the revision.");
    const now = Date.now();
    await ctx.db.patch(bl._id, {
      isCurrent: false,
      ...(bl.status === "issued" ? {} : { status: "superseded" as const }),
      updatedBy: user._id,
      updatedAt: now,
    });
    const {
      _id,
      _creationTime,
      status,
      version,
      isCurrent,
      draftPdfStorageId,
      draftPdfDocumentId,
      carrierDocumentId,
      externalBlNumber,
      issueDate,
      preparedBy,
      preparedAt,
      reviewedBy,
      reviewedAt,
      reviewNote,
      verifiedBy,
      verifiedAt,
      issuedRecordedBy,
      issuedRecordedAt,
      createdBy,
      updatedBy,
      updatedAt,
      revisionOf,
      ...carry
    } = bl;
    void [_creationTime, status, isCurrent, draftPdfStorageId, draftPdfDocumentId, carrierDocumentId, externalBlNumber, issueDate];
    void [preparedBy, preparedAt, reviewedBy, reviewedAt, reviewNote, verifiedBy, verifiedAt, issuedRecordedBy, issuedRecordedAt];
    void [createdBy, updatedBy, updatedAt, revisionOf];
    const newId = await ctx.db.insert("blDocuments", {
      ...carry,
      version: version + 1,
      isCurrent: true,
      status: "draft",
      revisionOf: _id,
      createdBy: user._id,
      updatedAt: now,
    });
    await logActivity(ctx, user, {
      entityType: "bl",
      entityId: newId,
      entityLabel: bl.blRecordNumber,
      tradeId: bl.tradeId,
      action: "bl.revised",
      summary: `Revision v${version + 1} of B/L ${bl.blRecordNumber} created — ${why}`,
    });
    return newId;
  },
});

export const attachDraftPdf = mutation({
  args: { id: v.id("blDocuments"), storageId: v.id("_storage") },
  handler: async (ctx, { id, storageId }) => {
    const user = await requirePermission(ctx, "bl.prepare");
    const bl = await getOrThrow(ctx, id, "B/L");
    const documentId = await insertDocument(ctx, user, {
      storageId,
      fileName: `${bl.blRecordNumber}-v${bl.version}-DRAFT.pdf`,
      docType: "bl_draft",
      source: "generated",
      tradeId: bl.tradeId,
      contractId: bl.contractId,
      blDocumentId: bl._id,
      groupKey: `bl_draft:${bl.blRecordNumber}`,
      notes: "Internally generated draft — not a carrier-issued B/L.",
    });
    await ctx.db.patch(id, { draftPdfStorageId: storageId, draftPdfDocumentId: documentId, updatedAt: Date.now() });
    return documentId;
  },
});

/** Confirmed trades that have no B/L record yet (bounded helper for the dispatch board). */
export const confirmedTradesWithoutBl = query({
  args: {},
  handler: async (ctx) => {
    await requireViewer(ctx);
    const trades = await ctx.db
      .query("trades")
      .withIndex("by_status_and_date", (q) => q.eq("status", "confirmed"))
      .order("desc")
      .take(150);
    const out = [];
    for (const t of trades) {
      const bl = await ctx.db
        .query("blDocuments")
        .withIndex("by_trade", (q) => q.eq("tradeId", t._id))
        .first();
      if (!bl) {
        out.push({
          _id: t._id,
          tradeNumber: t.tradeNumber,
          counterpartyName: t.counterpartyName,
          commodityName: t.commodityName,
          shipmentPeriod: t.shipmentPeriod,
          tradeDate: t.tradeDate,
        });
      }
      if (out.length >= 25) break;
    }
    return out;
  },
});
