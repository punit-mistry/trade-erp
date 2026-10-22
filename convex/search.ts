import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireViewer } from "./lib/auth";

/**
 * Global search for the command palette. Bounded per group; uses search
 * indexes where they exist. Contracts have no search index, so they are
 * matched against a bounded window of current contracts plus the contracts of
 * any matched trades.
 */
export const global = query({
  args: { term: v.string() },
  handler: async (ctx, { term }) => {
    await requireViewer(ctx);
    const q = term.trim().toLowerCase();
    if (q.length < 2) return { trades: [], counterparties: [], contracts: [], documents: [] };

    const trades = await ctx.db
      .query("trades")
      .withSearchIndex("search", (s) => s.search("searchText", q))
      .take(8);

    const counterparties = await ctx.db
      .query("counterparties")
      .withSearchIndex("search", (s) => s.search("searchText", q).eq("archived", false))
      .take(5);

    const documents = await ctx.db
      .query("documents")
      .withSearchIndex("search", (s) => s.search("searchText", q).eq("archived", false))
      .take(5);

    // Contracts: exact number lookup, contracts of matched trades, then a bounded scan.
    const contractMap = new Map<string, {
      _id: string;
      contractNumber: string;
      tradeNumber: string;
      tradeId: string;
      counterpartyName?: string;
      status: string;
      version: number;
    }>();
    const add = (c: {
      _id: string;
      contractNumber: string;
      tradeNumber: string;
      tradeId: string;
      counterpartyName?: string;
      status: string;
      version: number;
    }) => {
      if (contractMap.size < 6 && !contractMap.has(c._id)) contractMap.set(c._id, c);
    };
    const exact = await ctx.db
      .query("contracts")
      .withIndex("by_contractNumber", (i) => i.eq("contractNumber", term.trim().toUpperCase()))
      .take(3);
    exact.forEach(add);
    for (const t of trades.slice(0, 4)) {
      const forTrade = await ctx.db
        .query("contracts")
        .withIndex("by_trade", (i) => i.eq("tradeId", t._id))
        .order("desc")
        .first();
      if (forTrade) add(forTrade);
    }
    if (contractMap.size < 6) {
      const window = await ctx.db
        .query("contracts")
        .withIndex("by_updatedAt")
        .order("desc")
        .take(300);
      for (const c of window) {
        if (!c.isCurrent) continue;
        const hay = [c.contractNumber, c.tradeNumber, c.counterpartyName, c.commodityName]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (hay.includes(q)) add(c);
        if (contractMap.size >= 6) break;
      }
    }

    return {
      trades: trades.map((t) => ({
        _id: t._id,
        tradeNumber: t.tradeNumber,
        counterpartyName: t.counterpartyName,
        commodityName: t.commodityName,
        status: t.status,
        direction: t.direction,
      })),
      counterparties: counterparties.map((c) => ({
        _id: c._id,
        name: c.name,
        code: c.code,
        country: c.country,
      })),
      contracts: [...contractMap.values()].map((c) => ({
        _id: c._id,
        contractNumber: c.contractNumber,
        tradeNumber: c.tradeNumber,
        tradeId: c.tradeId,
        counterpartyName: c.counterpartyName,
        status: c.status,
        version: c.version,
      })),
      documents: documents.map((d) => ({
        _id: d._id,
        fileName: d.fileName,
        docType: d.docType,
        tradeNumber: d.tradeNumber,
        tradeId: d.tradeId,
      })),
    };
  },
});
