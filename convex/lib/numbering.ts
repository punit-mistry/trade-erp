import type { MutationCtx } from "../_generated/server";
import { getSettings } from "./settings";

/**
 * Atomically increments and returns a named sequence. Convex mutations are
 * serializable transactions, so two concurrent callers can never receive the
 * same value (the loser is retried by Convex with the updated counter).
 */
export async function nextSequence(ctx: MutationCtx, key: string): Promise<number> {
  const counter = await ctx.db
    .query("counters")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();
  if (!counter) {
    await ctx.db.insert("counters", { key, value: 1 });
    return 1;
  }
  const value = counter.value + 1;
  await ctx.db.patch(counter._id, { value });
  return value;
}

/** Ensures a counter is at least `value` (used by seeding/imports of historical numbers). */
export async function bumpSequenceTo(ctx: MutationCtx, key: string, value: number) {
  const counter = await ctx.db
    .query("counters")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();
  if (!counter) await ctx.db.insert("counters", { key, value });
  else if (counter.value < value) await ctx.db.patch(counter._id, { value });
}

function pad(n: number, width: number) {
  return String(n).padStart(width, "0");
}

export function yearOf(isoDate?: string, now = Date.now()): number {
  if (isoDate && /^\d{4}-/.test(isoDate)) return Number(isoDate.slice(0, 4));
  return new Date(now).getUTCFullYear();
}

/** TRD-2026-0001 — unique per year; checked against the by_tradeNumber index by callers. */
export async function nextTradeNumber(ctx: MutationCtx, tradeDate?: string): Promise<string> {
  const settings = await getSettings(ctx);
  const year = yearOf(tradeDate);
  for (;;) {
    const seq = await nextSequence(ctx, `trade:${year}`);
    const candidate = `${settings.tradeNumberPrefix}-${year}-${pad(seq, settings.sequencePadding)}`;
    const clash = await ctx.db
      .query("trades")
      .withIndex("by_tradeNumber", (q) => q.eq("tradeNumber", candidate))
      .first();
    if (!clash) return candidate;
  }
}

/**
 * Contract number from a template numbering format.
 * Tokens: {prefix} {year} {seq} {tradeNumber}. Example: "{prefix}-{year}-{seq}".
 */
export async function nextContractNumber(
  ctx: MutationCtx,
  opts: { format: string; prefix?: string; tradeNumber: string; tradeDate?: string },
): Promise<string> {
  const settings = await getSettings(ctx);
  const year = yearOf(opts.tradeDate);
  const prefix = opts.prefix || settings.contractNumberPrefix;
  for (;;) {
    const seq = await nextSequence(ctx, `contract:${prefix}:${year}`);
    const candidate = opts.format
      .replaceAll("{prefix}", prefix)
      .replaceAll("{year}", String(year))
      .replaceAll("{seq}", pad(seq, settings.sequencePadding))
      .replaceAll("{tradeNumber}", opts.tradeNumber);
    const clash = await ctx.db
      .query("contracts")
      .withIndex("by_contractNumber", (q) => q.eq("contractNumber", candidate))
      .first();
    if (!clash) return candidate;
  }
}

export async function nextBlRecordNumber(ctx: MutationCtx): Promise<string> {
  const settings = await getSettings(ctx);
  const year = yearOf(undefined);
  const seq = await nextSequence(ctx, `bl:${year}`);
  return `${settings.blNumberPrefix}-${year}-${pad(seq, settings.sequencePadding)}`;
}

export async function nextCounterpartyCode(ctx: MutationCtx): Promise<string> {
  const settings = await getSettings(ctx);
  for (;;) {
    const seq = await nextSequence(ctx, "counterparty");
    const candidate = `${settings.counterpartyCodePrefix}-${pad(seq, settings.sequencePadding)}`;
    const clash = await ctx.db
      .query("counterparties")
      .withIndex("by_code", (q) => q.eq("code", candidate))
      .first();
    if (!clash) return candidate;
  }
}
