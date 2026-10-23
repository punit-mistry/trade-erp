import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { logActivity } from "./lib/audit";
import {
  appError,
  assertCanModifyOwned,
  displayName,
  getOrThrow,
  requirePermission,
  requireViewer,
} from "./lib/auth";
import { insertDocument } from "./lib/documents";
import { nextContractNumber } from "./lib/numbering";
import { hasPermission } from "./lib/roles";
import { getSettings } from "./lib/settings";
import {
  buildContractVariables,
  renderContract,
  type ContractVariableInput,
  type RenderedContract,
} from "./lib/templateEngine";
import { contractStatusV, type ContractStatus } from "./lib/validators";
import { ACTIVE_CONTRACT_STATUSES, ISSUED_CONTRACT_STATUSES, canTransitionContract } from "./lib/workflow";

/**
 * Contracts — one row per contract *version*.
 *
 * Versioning semantics (deliberate):
 *  - `isCurrent` marks the version currently in force for the trade (shown in
 *    listings and dashboard metrics). A trade's first draft is current.
 *  - Once issued (status "generated" and later) a version's `snapshot` is
 *    frozen. Trade edits never change it; PDFs of issued versions always
 *    re-render that same snapshot.
 *  - Corrections to an issued contract go through `createRevision`, which
 *    creates a new DRAFT version from the current trade data with
 *    `isCurrent: false` and `revisionOf` set (the "pending revision"). The
 *    issued version stays current — it is still the document in force —
 *    until a manager issues the revision. At that point the old version
 *    becomes `superseded`/not current and the revision becomes current.
 *  - Only drafts are ever regenerated in place.
 */

type ContractDoc = Doc<"contracts">;

const ISSUED = new Set<ContractStatus>(ISSUED_CONTRACT_STATUSES);
const ACTIVE = new Set<ContractStatus>(ACTIVE_CONTRACT_STATUSES);
const REVISABLE = new Set<ContractStatus>(["generated", "sent", "pending_signature", "rate_fixed"]);

/** Trade fields allowed into an external document. `internalNotes` is intentionally absent. */
function contractTradeInput(trade: Doc<"trades">): ContractVariableInput["trade"] {
  return {
    tradeNumber: trade.tradeNumber,
    tradeDate: trade.tradeDate,
    direction: trade.direction,
    buyerReference: trade.buyerReference,
    buyerReferenceDate: trade.buyerReferenceDate,
    quantity: trade.quantity,
    uom: trade.uom,
    tolerancePct: trade.tolerancePct,
    toleranceOption: trade.toleranceOption,
    priceType: trade.priceType,
    pricePerUom: trade.pricePerUom,
    currency: trade.currency,
    totalValue: trade.totalValue,
    priceNeedsValidation: trade.priceNeedsValidation,
    incoterm: trade.incoterm,
    paymentTerm: trade.paymentTerm,
    pricingTerm: trade.pricingTerm,
    shipmentPeriod: trade.shipmentPeriod,
    loadingLocation: trade.loadingLocation,
    dischargeLocation: trade.dischargeLocation,
    partialShipment: trade.partialShipment,
    origin: trade.origin,
    manufacturer: trade.manufacturer,
    containerLoading: trade.containerLoading,
    freightTerms: trade.freightTerms,
    packingClause: trade.packingClause,
    documentsClause: trade.documentsClause,
    arbitrationClause: trade.arbitrationClause,
    sellerBankDetails: trade.sellerBankDetails,
    buyerBankDetails: trade.buyerBankDetails,
    specialConditions: trade.specialConditions,
    otherConditions: trade.otherConditions,
    additionalTerms: trade.additionalTerms,
    consignee: trade.consignee,
    notifyParty: trade.notifyParty,
    alsoNotifyParty: trade.alsoNotifyParty,
    salesBasis: trade.salesBasis,
    lcNumber: trade.lcNumber,
    placeOfReceipt: trade.placeOfReceipt,
    placeOfDelivery: trade.placeOfDelivery,
    freightPayableAt: trade.freightPayableAt,
    freightPayableBy: trade.freightPayableBy,
    packageType: trade.packageType,
    palletType: trade.palletType,
    originalBlCount: trade.originalBlCount,
    containerCount: trade.containerCount,
    containerType: trade.containerType,
    packagesPerContainer: trade.packagesPerContainer,
    packageNetKg: trade.packageNetKg,
    palletsPerContainer: trade.palletsPerContainer,
    packingKgPerContainer: trade.packingKgPerContainer,
  };
}

async function tradeParties(ctx: QueryCtx | MutationCtx, trade: Doc<"trades">) {
  const [company, counterparty, commodity] = await Promise.all([
    trade.companyId ? ctx.db.get(trade.companyId) : null,
    trade.counterpartyId ? ctx.db.get(trade.counterpartyId) : null,
    trade.commodityId ? ctx.db.get(trade.commodityId) : null,
  ]);
  return { company, counterparty, commodity };
}

/** Variables computed from the REAL stored trade/company/counterparty/commodity. */
async function variablesForTrade(
  ctx: QueryCtx | MutationCtx,
  trade: Doc<"trades">,
  contractNumber: string,
  version: number,
  today = Date.now(),
): Promise<Record<string, string>> {
  const settings = await getSettings(ctx);
  const { company, counterparty, commodity } = await tradeParties(ctx, trade);
  return buildContractVariables({
    contractNumber,
    contractVersion: version,
    trade: contractTradeInput(trade),
    company,
    counterparty,
    commodity,
    dateFormat: settings.dateFormat,
    today,
  });
}

function snapshotOf(rendered: RenderedContract, variables: Record<string, string>): ContractDoc["snapshot"] {
  return {
    title: rendered.title,
    header: rendered.header,
    footer: rendered.footer,
    intro: rendered.intro,
    clauses: rendered.clauses,
    variables,
  };
}

/** True when the trade data now produces different variables than the stored draft snapshot. */
async function isStale(ctx: QueryCtx | MutationCtx, contract: ContractDoc, trade: Doc<"trades">) {
  if (contract.status !== "draft") return false;
  const now = await variablesForTrade(ctx, trade, contract.contractNumber, contract.version);
  const stored = contract.snapshot.variables;
  return Object.keys({ ...now, ...stored }).some((k) => k !== "today" && (now[k] ?? "") !== (stored[k] ?? ""));
}

/**
 * Template resolution: explicit id → trade's template → most specific active
 * default (company+direction, company+any, direction, any) → any active one.
 * Inactive versions resolve to their family's active version when one exists.
 */
async function resolveTemplate(
  ctx: QueryCtx | MutationCtx,
  trade: Doc<"trades">,
  templateId?: Id<"contractTemplates">,
  strictExplicit = true,
): Promise<Doc<"contractTemplates"> | null> {
  const activeInFamily = async (t: Doc<"contractTemplates">) => {
    if (t.status === "active") return t;
    const fam = await ctx.db
      .query("contractTemplates")
      .withIndex("by_family", (q) => q.eq("familyId", t.familyId))
      .take(200);
    return fam.find((x) => x.status === "active") ?? null;
  };
  if (templateId) {
    const t = await ctx.db.get(templateId);
    if (!t) throw appError("NOT_FOUND", "Contract template not found.");
    const active = await activeInFamily(t);
    if (active) return active;
    if (strictExplicit) throw appError("INVALID", `Template “${t.name}” has no active version. Activate it first.`);
  }
  if (trade.contractTemplateId) {
    const t = await ctx.db.get(trade.contractTemplateId);
    if (t) {
      const active = await activeInFamily(t);
      if (active) return active;
    }
  }
  const actives = await ctx.db
    .query("contractTemplates")
    .withIndex("by_status", (q) => q.eq("status", "active"))
    .take(500);
  if (actives.length === 0) return null;
  const dir = trade.direction;
  const score = (t: Doc<"contractTemplates">) => {
    const companyMatch = t.companyId ? (t.companyId === trade.companyId ? 2 : -100) : 0;
    const dirMatch = t.direction === dir ? 1 : t.direction === "any" ? 0 : -100;
    return companyMatch * 10 + dirMatch * 5 + (t.isDefault ? 3 : 0);
  };
  const ranked = actives.map((t) => ({ t, s: score(t) })).sort((a, b) => b.s - a.s);
  return ranked[0].s > -50 ? ranked[0].t : (actives.find((t) => t.isDefault) ?? actives[0]);
}

async function versionsForTrade(ctx: QueryCtx | MutationCtx, tradeId: Id<"trades">) {
  return await ctx.db
    .query("contracts")
    .withIndex("by_trade", (q) => q.eq("tradeId", tradeId))
    .order("desc")
    .take(100);
}

function pendingRevisionOf(versions: ContractDoc[]) {
  return versions.find((c) => c.status === "draft" && !c.isCurrent && c.revisionOf !== undefined) ?? null;
}

const nameCache = () => {
  const cache = new Map<string, string>();
  return async (ctx: QueryCtx, id?: Id<"users">) => {
    if (!id) return undefined;
    if (!cache.has(id)) cache.set(id, displayName(await ctx.db.get(id)));
    return cache.get(id);
  };
};

function listRow(c: ContractDoc) {
  const { snapshot, ...rest } = c;
  void snapshot;
  return rest;
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/** All versions of a trade's contract (newest first) + current & pending revision. */
export const listForTrade = query({
  args: { tradeId: v.id("trades") },
  handler: async (ctx, { tradeId }) => {
    await requireViewer(ctx);
    const trade = await getOrThrow(ctx, tradeId, "Trade");
    const versions = await versionsForTrade(ctx, tradeId);
    const userName = nameCache();
    const rows = [];
    for (const c of versions) {
      const template = await ctx.db.get(c.templateId);
      rows.push({
        ...c,
        templateName: template?.name,
        createdByName: await userName(ctx, c.createdBy),
        issuedByName: await userName(ctx, c.issuedBy),
        revisionApprovedByName: await userName(ctx, c.revisionApprovedBy),
        pdfUrl: c.pdfStorageId ? await ctx.storage.getUrl(c.pdfStorageId) : null,
      });
    }
    const current = rows.find((c) => c.isCurrent) ?? null;
    const pendingRevision = pendingRevisionOf(versions);
    const working = pendingRevision ?? (current?.status === "draft" ? current : null);
    return {
      trade: {
        _id: trade._id,
        tradeNumber: trade.tradeNumber,
        status: trade.status,
        direction: trade.direction,
        contractTemplateId: trade.contractTemplateId,
        printedContractNumber: trade.printedContractNumber,
        counterpartyId: trade.counterpartyId,
      },
      versions: rows,
      current,
      pendingRevision: pendingRevision ? (rows.find((r) => r._id === pendingRevision._id) ?? null) : null,
      workingDraftStale: working ? await isStale(ctx, working, trade) : false,
    };
  },
});

/**
 * What a draft for this trade would contain right now (not saved). Rendered
 * on the server with the exact same code path as `generateDraft`.
 */
export const previewForTrade = query({
  args: { tradeId: v.id("trades"), templateId: v.optional(v.id("contractTemplates")) },
  handler: async (ctx, { tradeId, templateId }) => {
    await requireViewer(ctx);
    const trade = await getOrThrow(ctx, tradeId, "Trade");
    const template = await resolveTemplate(ctx, trade, templateId, false);
    if (!template) return { template: null, contractNumber: null, rendered: null };
    const settings = await getSettings(ctx);
    const contractNumber =
      trade.printedContractNumber ||
      `${template.numberPrefix || settings.contractNumberPrefix}-…  (assigned when the draft is generated)`;
    const variables = await variablesForTrade(ctx, trade, contractNumber, 1);
    const rendered = renderContract(template, variables);
    return {
      template: { _id: template._id, name: template.name, version: template.version },
      contractNumber,
      rendered: { ...rendered, variables },
    };
  },
});

export const get = query({
  args: { id: v.id("contracts") },
  handler: async (ctx, { id }) => {
    await requireViewer(ctx);
    const contract = await getOrThrow(ctx, id, "Contract");
    const trade = await ctx.db.get(contract.tradeId);
    const template = await ctx.db.get(contract.templateId);
    const userName = nameCache();
    const signedDocument = contract.signedDocumentId ? await ctx.db.get(contract.signedDocumentId) : null;
    return {
      contract,
      trade: trade
        ? {
            _id: trade._id,
            tradeNumber: trade.tradeNumber,
            status: trade.status,
            direction: trade.direction,
            counterpartyId: trade.counterpartyId,
          }
        : null,
      template: template ? { _id: template._id, name: template.name, version: template.version, status: template.status } : null,
      createdByName: await userName(ctx, contract.createdBy),
      updatedByName: await userName(ctx, contract.updatedBy),
      issuedByName: await userName(ctx, contract.issuedBy),
      revisionApprovedByName: await userName(ctx, contract.revisionApprovedBy),
      pdfUrl: contract.pdfStorageId ? await ctx.storage.getUrl(contract.pdfStorageId) : null,
      signedDocument: signedDocument ? { _id: signedDocument._id, fileName: signedDocument.fileName } : null,
      stale: trade ? await isStale(ctx, contract, trade) : false,
    };
  },
});

/**
 * Contract register. Current versions only (unless `includeAllVersions`).
 * `status: "active"` is a pseudo-status = ACTIVE_CONTRACT_STATUSES (issued,
 * not closed/cancelled) — the same definition as the dashboard KPI.
 * With `search`, a bounded scan of the 500 most recently updated contracts is
 * filtered in memory and returned as a single page.
 */
export const list = query({
  args: {
    paginationOpts: paginationOptsValidator,
    status: v.optional(v.union(contractStatusV, v.literal("active"))),
    search: v.optional(v.string()),
    includeAllVersions: v.optional(v.boolean()),
  },
  handler: async (ctx, { paginationOpts, status, search, includeAllVersions }) => {
    await requireViewer(ctx);
    const term = search?.trim().toLowerCase();
    const matchesStatus = (s: ContractStatus) =>
      !status || (status === "active" ? ACTIVE.has(s) : s === status);
    if (term) {
      if (paginationOpts.cursor) return { page: [], isDone: true, continueCursor: "" };
      const recent = await ctx.db.query("contracts").withIndex("by_updatedAt").order("desc").take(500);
      const page = recent
        .filter((c) => (includeAllVersions || c.isCurrent) && matchesStatus(c.status))
        .filter((c) =>
          [c.contractNumber, c.tradeNumber, c.counterpartyName, c.commodityName]
            .filter(Boolean)
            .some((s) => s!.toLowerCase().includes(term)),
        )
        .slice(0, 200)
        .map(listRow);
      return { page, isDone: true, continueCursor: "" };
    }
    if (status && status !== "active" && !includeAllVersions) {
      const result = await ctx.db
        .query("contracts")
        .withIndex("by_current_and_status", (q) => q.eq("isCurrent", true).eq("status", status))
        .order("desc")
        .paginate(paginationOpts);
      return { ...result, page: result.page.map(listRow) };
    }
    const result = await ctx.db
      .query("contracts")
      .withIndex("by_updatedAt")
      .order("desc")
      .filter((q) =>
        q.and(
          includeAllVersions ? true : q.eq(q.field("isCurrent"), true),
          status === "active"
            ? q.or(...ACTIVE_CONTRACT_STATUSES.map((st) => q.eq(q.field("status"), st)))
            : status
              ? q.eq(q.field("status"), status)
              : true,
        ),
      )
      .paginate(paginationOpts);
    return { ...result, page: result.page.map(listRow) };
  },
});

export const getPdfUrl = query({
  args: { contractId: v.id("contracts") },
  handler: async (ctx, { contractId }) => {
    await requireViewer(ctx);
    const contract = await getOrThrow(ctx, contractId, "Contract");
    return contract.pdfStorageId ? await ctx.storage.getUrl(contract.pdfStorageId) : null;
  },
});

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/**
 * Creates (or safely regenerates) the working DRAFT for a trade from its
 * current data. Issued versions are never touched — use createRevision.
 */
export const generateDraft = mutation({
  args: { tradeId: v.id("trades"), templateId: v.optional(v.id("contractTemplates")) },
  handler: async (ctx, { tradeId, templateId }) => {
    const user = await requirePermission(ctx, "contract.prepare");
    const trade = await getOrThrow(ctx, tradeId, "Trade");
    assertCanModifyOwned(user, trade, "trade");
    if (trade.status === "cancelled") throw appError("INVALID", "Cannot prepare a contract for a cancelled trade.");
    const versions = await versionsForTrade(ctx, tradeId);
    const current = versions.find((c) => c.isCurrent) ?? null;
    const pending = pendingRevisionOf(versions);

    let target: ContractDoc | null = null;
    if (pending) target = pending;
    else if (current?.status === "draft") target = current;
    else if (current && current.status !== "cancelled" && current.status !== "superseded") {
      throw appError("CONFLICT", `Contract ${current.contractNumber} v${current.version} is issued and frozen. Create a revision to make changes.`);
    }

    // Only an explicitly chosen template must be active; a previous draft's template falls back to defaults.
    const template = await resolveTemplate(ctx, trade, templateId ?? target?.templateId, templateId !== undefined);
    if (!template) {
      throw appError("INVALID", "No active contract template is available. Create and activate one under Contract Templates.");
    }

    const contractNumber =
      trade.printedContractNumber?.trim() ||
      target?.contractNumber ||
      (current && current.status !== "cancelled" ? current.contractNumber : undefined) ||
      (await nextContractNumber(ctx, {
        format: template.numberingFormat,
        prefix: template.numberPrefix,
        tradeNumber: trade.tradeNumber,
        tradeDate: trade.tradeDate,
      }));
    const version = target ? target.version : (versions[0]?.version ?? 0) + 1;
    const variables = await variablesForTrade(ctx, trade, contractNumber, version);
    const rendered = renderContract(template, variables);
    const { counterparty, commodity } = await tradeParties(ctx, trade);
    const now = Date.now();
    const fields = {
      contractNumber,
      templateId: template._id,
      templateVersion: template.version,
      snapshot: snapshotOf(rendered, variables),
      unknownVariables: rendered.unknown,
      missingVariables: rendered.missing,
      counterpartyName: trade.counterpartyName ?? counterparty?.name,
      commodityName: trade.commodityName ?? commodity?.name,
      direction: trade.direction,
      currency: trade.currency,
      totalValue: trade.totalValue,
      updatedBy: user._id,
      updatedAt: now,
    };

    if (target) {
      // The previous draft PDF no longer matches — detach it (the document row keeps its history).
      await ctx.db.patch(target._id, { ...fields, pdfStorageId: undefined, pdfDocumentId: undefined, pdfGeneratedAt: undefined });
      await logActivity(ctx, user, {
        entityType: "contract",
        entityId: target._id,
        entityLabel: contractNumber,
        tradeId,
        action: "contract.draft_regenerated",
        summary: `Regenerated draft ${contractNumber} v${version} from current trade data (template ${template.name} v${template.version})`,
      });
      return target._id;
    }

    if (current) await ctx.db.patch(current._id, { isCurrent: false, updatedAt: now });
    const id = await ctx.db.insert("contracts", {
      tradeId,
      tradeNumber: trade.tradeNumber,
      version,
      isCurrent: true,
      status: "draft",
      signatureStatus: "none",
      createdBy: user._id,
      ...fields,
    });
    await logActivity(ctx, user, {
      entityType: "contract",
      entityId: id,
      entityLabel: contractNumber,
      tradeId,
      action: "contract.draft_generated",
      summary: `Generated draft contract ${contractNumber} v${version} (template ${template.name} v${template.version})`,
    });
    return id;
  },
});

/** Starts a correction of an issued contract as a new draft version; the issued version stays untouched. */
export const createRevision = mutation({
  args: { contractId: v.id("contracts"), reason: v.string() },
  handler: async (ctx, { contractId, reason }) => {
    const user = await requirePermission(ctx, "contract.prepare");
    const source = await getOrThrow(ctx, contractId, "Contract");
    const trade = await getOrThrow(ctx, source.tradeId, "Trade");
    assertCanModifyOwned(user, trade, "trade");
    const why = reason.trim();
    if (why.length < 3) throw appError("INVALID", "Give a reason for the revision.");
    if (!source.isCurrent || !REVISABLE.has(source.status)) {
      throw appError("INVALID", "Only the current, issued (not closed or cancelled) contract can be revised.");
    }
    if (trade.status === "cancelled") throw appError("INVALID", "The trade is cancelled.");
    const versions = await versionsForTrade(ctx, trade._id);
    if (pendingRevisionOf(versions)) throw appError("CONFLICT", "A revision draft already exists for this contract.");
    const template = await resolveTemplate(ctx, trade, source.templateId, false);
    if (!template) throw appError("INVALID", "No active contract template is available.");
    const contractNumber = trade.printedContractNumber?.trim() || source.contractNumber;
    const version = (versions[0]?.version ?? source.version) + 1;
    const variables = await variablesForTrade(ctx, trade, contractNumber, version);
    const rendered = renderContract(template, variables);
    const now = Date.now();
    const id = await ctx.db.insert("contracts", {
      tradeId: trade._id,
      tradeNumber: trade.tradeNumber,
      contractNumber,
      version,
      isCurrent: false,
      status: "draft",
      templateId: template._id,
      templateVersion: template.version,
      snapshot: snapshotOf(rendered, variables),
      unknownVariables: rendered.unknown,
      missingVariables: rendered.missing,
      counterpartyName: trade.counterpartyName,
      commodityName: trade.commodityName,
      direction: trade.direction,
      currency: trade.currency,
      totalValue: trade.totalValue,
      revisionOf: source._id,
      revisionReason: why,
      signatureStatus: "none",
      createdBy: user._id,
      updatedBy: user._id,
      updatedAt: now,
    });
    await logActivity(ctx, user, {
      entityType: "contract",
      entityId: id,
      entityLabel: contractNumber,
      tradeId: trade._id,
      action: "contract.revision_created",
      summary: `Started revision v${version} of ${contractNumber} (v${source.version} remains in force until issued): ${why}`,
    });
    return id;
  },
});

/** Draft → Generated (issued). Freezes the snapshot. Managers/admins only. */
export const issue = mutation({
  args: { contractId: v.id("contracts") },
  handler: async (ctx, { contractId }) => {
    const user = await requirePermission(ctx, "contract.issue");
    const contract = await getOrThrow(ctx, contractId, "Contract");
    if (contract.status !== "draft") throw appError("INVALID", "Only a draft contract can be issued.");
    const trade = await getOrThrow(ctx, contract.tradeId, "Trade");
    if (trade.status !== "confirmed") {
      throw appError("INVALID", "The trade must be Confirmed before its contract can be issued.");
    }
    if (contract.unknownVariables.length > 0) {
      throw appError("INVALID", `Unknown template variables: ${contract.unknownVariables.join(", ")}. Fix the template and regenerate.`);
    }
    if (contract.missingVariables.length > 0) {
      throw appError("INVALID", `Missing values: ${contract.missingVariables.join(", ")}. Complete the trade and regenerate the draft.`);
    }
    if (await isStale(ctx, contract, trade)) {
      throw appError("CONFLICT", "The trade changed after this draft was generated. Regenerate the draft and review it before issuing.");
    }
    const now = Date.now();
    if (contract.revisionOf) {
      const previous = await ctx.db.get(contract.revisionOf);
      if (previous && previous.isCurrent) {
        await ctx.db.patch(previous._id, { isCurrent: false, status: "superseded", updatedBy: user._id, updatedAt: now });
        await logActivity(ctx, user, {
          entityType: "contract",
          entityId: previous._id,
          entityLabel: previous.contractNumber,
          tradeId: trade._id,
          action: "contract.superseded",
          summary: `v${previous.version} superseded by v${contract.version}`,
          changes: [{ field: "status", from: previous.status, to: "superseded" }],
        });
      }
    }
    await ctx.db.patch(contract._id, {
      status: "generated",
      isCurrent: true,
      issuedBy: user._id,
      issuedAt: now,
      ...(contract.revisionOf ? { revisionApprovedBy: user._id, revisionApprovedAt: now } : {}),
      updatedBy: user._id,
      updatedAt: now,
    });
    await logActivity(ctx, user, {
      entityType: "contract",
      entityId: contract._id,
      entityLabel: contract.contractNumber,
      tradeId: trade._id,
      action: contract.revisionOf ? "contract.revision_issued" : "contract.issued",
      summary: contract.revisionOf
        ? `Approved and issued revision v${contract.version} of ${contract.contractNumber}`
        : `Issued contract ${contract.contractNumber} v${contract.version}`,
      changes: [{ field: "status", from: "draft", to: "generated" }],
    });
  },
});

/** Post-issue lifecycle (sent → pending signature → rate fixed → closed, or cancelled). */
export const transition = mutation({
  args: {
    contractId: v.id("contracts"),
    to: contractStatusV,
    sentTo: v.optional(v.string()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, { contractId, to, sentTo, note }) => {
    const user = await requireViewer(ctx);
    const contract = await getOrThrow(ctx, contractId, "Contract");
    if (to === "generated") throw appError("INVALID", "Use “Finalise & Issue” to issue a draft.");
    const rule = canTransitionContract(contract.status, to);
    if (!rule) throw appError("INVALID", `A ${contract.status.replace("_", " ")} contract cannot move to ${to.replace("_", " ")}.`);
    if (!hasPermission(user, rule.permission)) {
      throw appError("FORBIDDEN", `Access denied: your role (${user.role}) cannot ${rule.label.toLowerCase()}.`);
    }
    if (!contract.isCurrent && !(contract.status === "draft" && to === "cancelled")) {
      throw appError("INVALID", "Only the current contract version can change status.");
    }
    const now = Date.now();
    const patch: Partial<ContractDoc> = { status: to, updatedBy: user._id, updatedAt: now };
    if (to === "sent") {
      patch.sentAt = now;
      if (sentTo?.trim()) patch.sentTo = sentTo.trim().slice(0, 200);
    }
    if (to === "pending_signature" && contract.signatureStatus === "none") patch.signatureStatus = "awaiting";
    if (to === "rate_fixed") patch.rateFixedAt = now;
    if (to === "closed") patch.closedAt = now;
    if (to === "cancelled") patch.cancelledAt = now;
    await ctx.db.patch(contract._id, patch);
    const trimmedNote = note?.trim();
    await logActivity(ctx, user, {
      entityType: "contract",
      entityId: contract._id,
      entityLabel: contract.contractNumber,
      tradeId: contract.tradeId,
      action: "contract.status_changed",
      summary: `${rule.label}: ${contract.contractNumber} v${contract.version}${patch.sentTo ? ` (to ${patch.sentTo})` : ""}${trimmedNote ? ` — ${trimmedNote}` : ""}`,
      changes: [{ field: "status", from: contract.status, to }],
    });
  },
});

/**
 * Links an uploaded counter-signed copy. This records that a signed document
 * exists — it is NOT a verified digital signature (no e-sign integration).
 */
export const attachSignedCopy = mutation({
  args: { contractId: v.id("contracts"), documentId: v.id("documents") },
  handler: async (ctx, { contractId, documentId }) => {
    const user = await requirePermission(ctx, "contract.prepare");
    const contract = await getOrThrow(ctx, contractId, "Contract");
    if (!ISSUED.has(contract.status)) throw appError("INVALID", "A signed copy can only be attached to an issued contract.");
    const doc = await getOrThrow(ctx, documentId, "Document");
    if (doc.docType !== "signed_contract" || doc.contractId !== contract._id || doc.archived) {
      throw appError("INVALID", "The document must be a Signed Contract uploaded against this contract.");
    }
    await ctx.db.patch(contract._id, {
      signedDocumentId: doc._id,
      signatureStatus: "signed_copy_uploaded",
      updatedBy: user._id,
      updatedAt: Date.now(),
    });
    await logActivity(ctx, user, {
      entityType: "contract",
      entityId: contract._id,
      entityLabel: contract.contractNumber,
      tradeId: contract.tradeId,
      action: "contract.signed_copy_attached",
      summary: `Signed copy “${doc.fileName}” attached to ${contract.contractNumber} v${contract.version} (uploaded document, not a verified e-signature)`,
      changes: [{ field: "signatureStatus", from: contract.signatureStatus, to: "signed_copy_uploaded" }],
    });
  },
});

export const generatePdfUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requirePermission(ctx, "contract.prepare");
    return await ctx.storage.generateUploadUrl();
  },
});

/** Stores a generated PDF in file storage + Document Centre (versioned by contract number). */
export const attachPdf = mutation({
  args: { contractId: v.id("contracts"), storageId: v.id("_storage") },
  handler: async (ctx, { contractId, storageId }) => {
    const user = await requirePermission(ctx, "contract.prepare");
    const contract = await getOrThrow(ctx, contractId, "Contract");
    if (contract.status !== "draft" && contract.pdfStorageId) {
      await ctx.storage.delete(storageId);
      throw appError("CONFLICT", "This issued version already has its PDF. Issued documents are not replaced.");
    }
    const documentId = await insertDocument(ctx, user, {
      storageId,
      fileName: `${contract.contractNumber}-v${contract.version}${contract.status === "draft" ? "-DRAFT" : ""}.pdf`,
      docType: "contract",
      source: "generated",
      tradeId: contract.tradeId,
      contractId: contract._id,
      groupKey: `contract:${contract.contractNumber}`,
      notes: `Generated from template v${contract.templateVersion}; contract status ${contract.status}.`,
    });
    await ctx.db.patch(contract._id, {
      pdfStorageId: storageId,
      pdfDocumentId: documentId,
      pdfGeneratedAt: Date.now(),
      updatedBy: user._id,
      updatedAt: Date.now(),
    });
    return documentId;
  },
});
