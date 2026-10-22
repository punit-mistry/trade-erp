import { v } from "convex/values";
import { query, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { displayName, requireViewer } from "./lib/auth";
import { ACTIVE_CONTRACT_STATUSES, checklistProgress } from "./lib/workflow";
import type { ContractStatus, DocumentType } from "./lib/validators";

/**
 * Dashboard metrics — every number is derived from stored records via
 * indexes. Counts are read with a bounded `.take(CAP)`; when a count reaches
 * the cap the UI shows "CAP+" and the definition says so.
 */
const CAP = 1000;

type Kpi = {
  key: string;
  label: string;
  value: number;
  capped: boolean;
  definition: string;
  href: string;
};

async function countCurrentContracts(ctx: QueryCtx, status: ContractStatus) {
  const rows = await ctx.db
    .query("contracts")
    .withIndex("by_current_and_status", (q) => q.eq("isCurrent", true).eq("status", status))
    .take(CAP);
  return rows;
}

function monthRange(now: number) {
  const d = new Date(now);
  const start = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
  const end = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
  return { start, end };
}

export const summary = query({
  args: {
    // Optional client-local month boundaries (ms). Defaults to the UTC calendar month.
    monthStart: v.optional(v.number()),
    monthEnd: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireViewer(ctx);
    const utc = monthRange(Date.now());
    const monthStart = args.monthStart ?? utc.start;
    const monthEnd = args.monthEnd ?? utc.end;

    const activeByStatus = await Promise.all(ACTIVE_CONTRACT_STATUSES.map((s) => countCurrentContracts(ctx, s)));
    const activeCount = activeByStatus.reduce((n, rows) => n + rows.length, 0);
    const activeCapped = activeByStatus.some((rows) => rows.length >= CAP);
    const pendingSignature = activeByStatus[ACTIVE_CONTRACT_STATUSES.indexOf("pending_signature")];
    const rateFixed = activeByStatus[ACTIVE_CONTRACT_STATUSES.indexOf("rate_fixed")];

    const closedThisMonth = await ctx.db
      .query("trades")
      .withIndex("by_status_and_closedAt", (q) =>
        q.eq("status", "closed").gte("closedAt", monthStart).lt("closedAt", monthEnd),
      )
      .take(CAP);

    const confirmed = await ctx.db
      .query("trades")
      .withIndex("by_status_and_date", (q) => q.eq("status", "confirmed"))
      .order("desc")
      .take(CAP);
    const inReview = await ctx.db
      .query("trades")
      .withIndex("by_status_and_date", (q) => q.eq("status", "pending_review"))
      .take(CAP);
    const drafts = await ctx.db
      .query("trades")
      .withIndex("by_status_and_date", (q) => q.eq("status", "draft"))
      .take(CAP);

    const openValue = new Map<string, number>();
    let openWithoutValue = 0;
    for (const t of [...confirmed, ...inReview]) {
      if (t.totalValue === undefined || !t.currency) {
        openWithoutValue++;
        continue;
      }
      openValue.set(t.currency, (openValue.get(t.currency) ?? 0) + t.totalValue);
    }

    const blReviews = await ctx.db
      .query("blDocuments")
      .withIndex("by_current_and_status", (q) => q.eq("isCurrent", true).eq("status", "under_review"))
      .take(CAP);
    const openChecklists = await ctx.db
      .query("dispatchChecklists")
      .withIndex("by_status", (q) => q.eq("status", "open"))
      .take(CAP);

    const upcomingShipments = confirmed
      .filter((t) => t.shipmentPeriod && t.shipmentPeriod.trim() !== "")
      .slice(0, 5)
      .map((t) => ({
        tradeId: t._id,
        tradeNumber: t.tradeNumber,
        counterpartyName: t.counterpartyName,
        commodityName: t.commodityName,
        shipmentPeriod: t.shipmentPeriod!,
        loadingLocation: t.loadingLocation,
        dischargeLocation: t.dischargeLocation,
      }));

    const capNote = (rows: unknown[]) => (rows.length >= CAP ? ` Count is capped at ${CAP}.` : "");

    const primary: Kpi[] = [
      {
        key: "activeContracts",
        label: "Active Contracts",
        value: activeCount,
        capped: activeCapped,
        definition:
          "Current contract versions that have been issued and are still running: Generated, Sent, Pending Signature or Rate Fixed. Drafts, closed, cancelled and superseded versions are excluded." +
          (activeCapped ? ` Each status is capped at ${CAP}.` : ""),
        href: "/contracts?status=active",
      },
      {
        key: "pendingSignatures",
        label: "Pending Signatures",
        value: pendingSignature.length,
        capped: pendingSignature.length >= CAP,
        definition: "Current contract versions with status Pending Signature." + capNote(pendingSignature),
        href: "/contracts?status=pending_signature",
      },
      {
        key: "rateFixed",
        label: "Contracts — Rate Fixed",
        value: rateFixed.length,
        capped: rateFixed.length >= CAP,
        definition: "Current contract versions with status Rate Fixed (price/rate agreed, not yet closed)." + capNote(rateFixed),
        href: "/contracts?status=rate_fixed",
      },
      {
        key: "closedThisMonth",
        label: "Trades Closed This Month",
        value: closedThisMonth.length,
        capped: closedThisMonth.length >= CAP,
        definition:
          "Trades with status Closed whose closing date falls in the current calendar month. Cancelled trades are never counted." +
          capNote(closedThisMonth),
        href: "/physical-trades?status=closed",
      },
    ];

    const secondary: Kpi[] = [
      {
        key: "draftTrades",
        label: "Draft Trades",
        value: drafts.length,
        capped: drafts.length >= CAP,
        definition: "Trades still in Draft (not yet submitted or confirmed)." + capNote(drafts),
        href: "/physical-trades?status=draft",
      },
      {
        key: "pendingBlReviews",
        label: "Pending B/L Reviews",
        value: blReviews.length,
        capped: blReviews.length >= CAP,
        definition: "Current B/L records with status Under Review." + capNote(blReviews),
        href: "/dispatch?blStatus=under_review",
      },
      {
        key: "openChecklists",
        label: "Incomplete Dispatch Checklists",
        value: openChecklists.length,
        capped: openChecklists.length >= CAP,
        definition: "Dispatch checklists that are still open (at least one item not complete)." + capNote(openChecklists),
        href: "/dispatch",
      },
    ];

    return {
      primary,
      secondary,
      openTradeValue: {
        byCurrency: [...openValue.entries()]
          .map(([currency, total]) => ({ currency, total: Math.round(total * 100) / 100 }))
          .sort((a, b) => b.total - a.total),
        tradeCount: confirmed.length + inReview.length,
        withoutValue: openWithoutValue,
        capped: confirmed.length >= CAP || inReview.length >= CAP,
        definition:
          "Sum of total value of Confirmed and In Review trades, shown separately per currency (currencies are never converted or mixed). Draft, cancelled and closed trades are excluded." +
          (openWithoutValue ? ` ${openWithoutValue} open trade(s) without a stored value are not included.` : ""),
      },
      upcomingShipments,
      upcomingDefinition:
        "Most recent confirmed trades that have a shipment period recorded (shipment periods are free text, so they are listed, not date-sorted).",
    };
  },
});

/** Latest current contract versions by last update. */
export const recentContracts = query({
  args: {},
  handler: async (ctx) => {
    await requireViewer(ctx);
    const rows = await ctx.db.query("contracts").withIndex("by_updatedAt").order("desc").take(60);
    return rows
      .filter((c) => c.isCurrent)
      .slice(0, 10)
      .map((c) => ({
        _id: c._id,
        tradeId: c.tradeId,
        contractNumber: c.contractNumber,
        tradeNumber: c.tradeNumber,
        version: c.version,
        buyer: c.snapshot.variables.buyerName || c.counterpartyName,
        counterpartyName: c.counterpartyName,
        direction: c.direction,
        product: c.commodityName,
        totalValue: c.totalValue,
        currency: c.currency,
        status: c.status,
        updatedAt: c.updatedAt,
      }));
  },
});

type QueueItem = { id: string; label: string; detail?: string; href: string };
type Queue = { key: string; label: string; description: string; count: number; capped: boolean; items: QueueItem[]; href: string };

const SHIPPING_DOC_REQUIREMENTS: { label: string; types: DocumentType[] }[] = [
  { label: "Commercial invoice", types: ["commercial_invoice"] },
  { label: "Packing list", types: ["packing_list"] },
  { label: "B/L", types: ["bl_draft", "bl_issued"] },
];

/** Real work queues. Only queues with at least one item are returned. */
export const pendingActions = query({
  args: { today: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await requireViewer(ctx);
    const today = args.today ?? new Date().toISOString().slice(0, 10);
    const queues: Queue[] = [];

    const awaiting = await countCurrentContracts(ctx, "pending_signature");
    queues.push({
      key: "awaitingSignature",
      label: "Awaiting Signature",
      description: "Contracts sent and waiting for the counterparty's signed copy.",
      count: awaiting.length,
      capped: awaiting.length >= CAP,
      href: "/contracts?status=pending_signature",
      items: awaiting.slice(0, 5).map((c) => ({
        id: c._id,
        label: c.contractNumber,
        detail: [c.counterpartyName, c.tradeNumber].filter(Boolean).join(" · "),
        href: `/contracts/${c._id}`,
      })),
    });

    const pendingFx = await ctx.db
      .query("fxRates")
      .withIndex("by_review", (q) => q.eq("reviewStatus", "pending"))
      .order("desc")
      .take(200);
    const recentTrades = await ctx.db.query("trades").withIndex("by_tradeDate").order("desc").take(500);
    const priceValidation = recentTrades.filter((t) => t.priceNeedsValidation && t.status !== "cancelled");
    queues.push({
      key: "currencyRateValidation",
      label: "Currency Rate Validation",
      description:
        "Manually recorded FX rates awaiting review, plus trades whose unit price is unavailable and needs validation (checked over the 500 most recent trades).",
      count: pendingFx.length + priceValidation.length,
      capped: pendingFx.length >= 200,
      href: "/dashboard#fx-rates",
      items: [
        ...pendingFx.slice(0, 3).map((r) => ({
          id: r._id,
          label: `${r.baseCurrency}/${r.quoteCurrency} = ${r.rate}`,
          detail: `FX rate · source: ${r.source}`,
          href: r.tradeId ? `/physical-trades/${r.tradeId}` : "/dashboard#fx-rates",
        })),
        ...priceValidation.slice(0, 3).map((t) => ({
          id: t._id,
          label: t.tradeNumber,
          detail: `Unit price needs validation · ${t.counterpartyName ?? "—"}`,
          href: `/physical-trades/${t._id}?tab=terms`,
        })),
      ].slice(0, 5),
    });

    const openChecklists = await ctx.db
      .query("dispatchChecklists")
      .withIndex("by_status", (q) => q.eq("status", "open"))
      .take(100);
    const checklistIssues: QueueItem[] = [];
    for (const cl of openChecklists) {
      const items = await ctx.db
        .query("dispatchItems")
        .withIndex("by_checklist", (q) => q.eq("checklistId", cl._id))
        .take(100);
      const blocked = items.filter((i) => i.status === "blocked").length;
      const overdue = items.filter((i) => i.status !== "complete" && i.dueDate && i.dueDate < today).length;
      if (blocked || overdue) {
        checklistIssues.push({
          id: cl._id,
          label: cl.tradeNumber,
          detail: [blocked && `${blocked} blocked`, overdue && `${overdue} overdue`, cl.counterpartyName]
            .filter(Boolean)
            .join(" · "),
          href: `/physical-trades/${cl.tradeId}?tab=bl`,
        });
      }
    }
    queues.push({
      key: "dispatchChecklists",
      label: "Dispatch Checklists",
      description: "Open dispatch checklists with blocked or overdue items (first 100 open checklists checked).",
      count: checklistIssues.length,
      capped: openChecklists.length >= 100,
      href: "/dispatch",
      items: checklistIssues.slice(0, 5),
    });

    const draftContracts = await countCurrentContracts(ctx, "draft");
    queues.push({
      key: "draftContracts",
      label: "Draft Contracts",
      description: "Current contract versions still in Draft — review and issue.",
      count: draftContracts.length,
      capped: draftContracts.length >= CAP,
      href: "/contracts?status=draft",
      items: draftContracts.slice(0, 5).map((c) => ({
        id: c._id,
        label: c.contractNumber,
        detail: [c.counterpartyName, c.tradeNumber].filter(Boolean).join(" · "),
        href: `/contracts/${c._id}`,
      })),
    });

    const approvals = await ctx.db
      .query("trades")
      .withIndex("by_status_and_date", (q) => q.eq("status", "pending_review"))
      .order("desc")
      .take(CAP);
    queues.push({
      key: "pendingTradeApprovals",
      label: "Pending Trade Approvals",
      description: "Trades submitted for review and awaiting a manager's decision.",
      count: approvals.length,
      capped: approvals.length >= CAP,
      href: "/physical-trades?status=pending_review",
      items: approvals.slice(0, 5).map((t) => ({
        id: t._id,
        label: t.tradeNumber,
        detail: [t.counterpartyName, t.commodityName].filter(Boolean).join(" · "),
        href: `/physical-trades/${t._id}`,
      })),
    });

    const confirmed = await ctx.db
      .query("trades")
      .withIndex("by_status_and_date", (q) => q.eq("status", "confirmed"))
      .order("desc")
      .take(100);
    const missing: QueueItem[] = [];
    for (const t of confirmed) {
      const docs = await ctx.db
        .query("documents")
        .withIndex("by_trade", (q) => q.eq("tradeId", t._id))
        .take(200);
      const types = new Set(docs.filter((d) => !d.archived).map((d) => d.docType));
      const lacking = SHIPPING_DOC_REQUIREMENTS.filter((r) => !r.types.some((ty) => types.has(ty))).map((r) => r.label);
      if (lacking.length) {
        missing.push({
          id: t._id,
          label: t.tradeNumber,
          detail: `Missing: ${lacking.join(", ")}`,
          href: `/physical-trades/${t._id}?tab=documents`,
        });
      }
    }
    queues.push({
      key: "missingShippingDocuments",
      label: "Missing Shipping Documents",
      description:
        "Confirmed trades without an uploaded commercial invoice, packing list or B/L (100 most recent confirmed trades checked).",
      count: missing.length,
      capped: confirmed.length >= 100,
      href: "/documents",
      items: missing.slice(0, 5),
    });

    return queues.filter((q) => q.count > 0);
  },
});

/** Open dispatch checklists that need attention, worst first. */
export const dispatchOperations = query({
  args: { today: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await requireViewer(ctx);
    const today = args.today ?? new Date().toISOString().slice(0, 10);
    const checklists = await ctx.db
      .query("dispatchChecklists")
      .withIndex("by_status", (q) => q.eq("status", "open"))
      .take(50);
    const names = new Map<Id<"users">, string>();
    const nameOf = async (id: Id<"users"> | undefined) => {
      if (!id) return undefined;
      if (!names.has(id)) names.set(id, displayName(await ctx.db.get(id)));
      return names.get(id);
    };

    const rows = await Promise.all(
      checklists.map(async (cl: Doc<"dispatchChecklists">) => {
        const items = await ctx.db
          .query("dispatchItems")
          .withIndex("by_checklist", (q) => q.eq("checklistId", cl._id))
          .take(100);
        const progress = checklistProgress(items);
        const overdue = items.filter((i) => i.status !== "complete" && i.dueDate && i.dueDate < today).length;
        const blockedItem = items.find((i) => i.status === "blocked");
        const current = items.find((i) => i.status !== "complete");
        const nextItem = blockedItem ?? current;
        return {
          checklistId: cl._id,
          tradeId: cl.tradeId,
          tradeNumber: cl.tradeNumber,
          counterpartyName: cl.counterpartyName,
          currentStep: current?.label,
          percent: progress.percent,
          complete: progress.complete,
          total: progress.total,
          blocked: progress.blocked,
          blockedReason: blockedItem?.blockedReason,
          overdue,
          nextAction: blockedItem
            ? `Resolve blocker: ${blockedItem.label}`
            : current
              ? current.label
              : "Mark checklist complete",
          responsible: await nameOf(nextItem?.assignedTo),
          dueDate: nextItem?.dueDate,
        };
      }),
    );
    return rows
      .sort((a, b) => b.blocked - a.blocked || b.overdue - a.overdue || a.percent - b.percent)
      .slice(0, 10);
  },
});
