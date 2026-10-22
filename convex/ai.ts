import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { pendingActionsData, summaryData } from "./dashboard";
import { computeNextAction } from "./trades";
import {
  AI_DAILY_CAP,
  AI_DATA_NOTICE,
  AI_MAX_EXTRACT_CHARS,
  AI_MAX_INPUT_CHARS,
  AiError,
  aiConfig,
  assistantSystemPrompt,
  chatCompletion,
  clauseDraftPrompt,
  compactJson,
  extractJsonObject,
  findRecordNumbers,
  normaliseSupplierExtraction,
  normaliseTradeExtraction,
  safeTradeFacts,
  searchTerms,
  streamChatCompletion,
  SUPPLIER_EXTRACT_PROMPT,
  TRADE_EXTRACT_PROMPT,
  TRADE_SUMMARY_PROMPT,
  utcDay,
  type ChatMessage,
  type SupplierExtraction,
  type TradeExtraction,
} from "./lib/ai";
import { appError, displayName, getOrThrow, requirePermission, requireViewer } from "./lib/auth";
import { helpContentAsText } from "./lib/helpContent";
import { hasPermission } from "./lib/roles";
import { getSettings, SETTINGS_KEY, DEFAULT_SETTINGS } from "./lib/settings";
import { TEMPLATE_VARIABLES, validateTemplateText } from "./lib/templateEngine";
import { validateTrade } from "./lib/tradeValidation";
import { checklistProgress } from "./lib/workflow";

/**
 * AI assistant (Google Gemini free tier via its OpenAI-compatible API).
 * All answers come from the model, grounded in data the requesting user is
 * allowed to see. Nothing is fabricated when AI is unavailable — the UI is
 * told it is not configured / disabled instead.
 */

type ContextRef = { type: string; id: string; label: string; href: string };

async function aiAvailability(ctx: QueryCtx | MutationCtx) {
  const cfg = aiConfig();
  const settings = await getSettings(ctx);
  const enabled = settings.aiEnabled !== false;
  return { configured: cfg.configured, enabled, model: cfg.model, available: cfg.configured && enabled };
}

async function assertAvailable(ctx: QueryCtx | MutationCtx) {
  const a = await aiAvailability(ctx);
  if (!a.configured) {
    throw appError("INVALID", "The AI assistant isn't configured — an administrator must add GEMINI_API_KEY.");
  }
  if (!a.enabled) throw appError("INVALID", "The AI assistant has been turned off by an administrator.");
}

/** Counts one AI request against the user's daily cap (throws when exhausted). */
async function consumeQuota(ctx: MutationCtx, userId: Id<"users">) {
  const day = utcDay();
  const row = await ctx.db
    .query("aiUsage")
    .withIndex("by_user_day", (q) => q.eq("userId", userId).eq("day", day))
    .unique();
  if (row && row.count >= AI_DAILY_CAP) {
    throw appError(
      "CONFLICT",
      `You've reached today's AI limit (${AI_DAILY_CAP} requests). It resets at 00:00 UTC — this keeps the shared free quota available for everyone.`,
    );
  }
  if (row) await ctx.db.patch(row._id, { count: row.count + 1 });
  else await ctx.db.insert("aiUsage", { userId, day, count: 1 });
}

function friendlyError(e: unknown): string {
  if (e instanceof AiError) return e.message;
  const data = (e as { data?: { message?: unknown } })?.data;
  if (data && typeof data.message === "string") return data.message;
  return "Something went wrong while contacting the AI service. Please try again.";
}

// ---------------------------------------------------------------------------
// Status & admin switch
// ---------------------------------------------------------------------------

export const status = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireViewer(ctx);
    const a = await aiAvailability(ctx);
    const usage = await ctx.db
      .query("aiUsage")
      .withIndex("by_user_day", (q) => q.eq("userId", user._id).eq("day", utcDay()))
      .unique();
    return {
      configured: a.configured,
      enabled: a.enabled,
      available: a.available,
      model: a.model,
      provider: "Google Gemini (free tier)",
      notice: AI_DATA_NOTICE,
      dailyCap: AI_DAILY_CAP,
      usedToday: usage?.count ?? 0,
      canManage: hasPermission(user, "settings.manage"),
    };
  },
});

export const setEnabled = mutation({
  args: { enabled: v.boolean() },
  handler: async (ctx, { enabled }) => {
    const user = await requirePermission(ctx, "settings.manage");
    const row = await ctx.db
      .query("settings")
      .withIndex("by_key", (q) => q.eq("key", SETTINGS_KEY))
      .unique();
    if (row) await ctx.db.patch(row._id, { aiEnabled: enabled, updatedBy: user._id, updatedAt: Date.now() });
    else
      await ctx.db.insert("settings", {
        ...DEFAULT_SETTINGS,
        key: SETTINGS_KEY,
        aiEnabled: enabled,
        updatedBy: user._id,
        updatedAt: Date.now(),
      });
    await ctx.db.insert("activityLogs", {
      actorId: user._id,
      actorName: displayName(user),
      entityType: "settings",
      entityId: SETTINGS_KEY,
      entityLabel: "AI assistant",
      action: "settings.ai_toggled",
      summary: `${enabled ? "Enabled" : "Disabled"} the AI assistant`,
    });
  },
});

// ---------------------------------------------------------------------------
// Threads & messages
// ---------------------------------------------------------------------------

async function ownThread(ctx: QueryCtx | MutationCtx, userId: Id<"users">, threadId: Id<"aiThreads">) {
  const thread = await ctx.db.get(threadId);
  if (!thread || thread.userId !== userId) throw appError("NOT_FOUND", "Conversation not found.");
  return thread;
}

export const listThreads = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireViewer(ctx);
    return await ctx.db
      .query("aiThreads")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(30);
  },
});

export const messages = query({
  args: { threadId: v.id("aiThreads") },
  handler: async (ctx, { threadId }) => {
    const user = await requireViewer(ctx);
    await ownThread(ctx, user._id, threadId);
    return await ctx.db
      .query("aiMessages")
      .withIndex("by_thread", (q) => q.eq("threadId", threadId))
      .take(200);
  },
});

export const sendMessage = mutation({
  args: {
    threadId: v.optional(v.id("aiThreads")),
    content: v.string(),
    page: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ threadId: Id<"aiThreads">; messageId: Id<"aiMessages"> }> => {
    const user = await requireViewer(ctx);
    await assertAvailable(ctx);
    const content = args.content.trim();
    if (!content) throw appError("INVALID", "Type a question first.");
    if (content.length > AI_MAX_INPUT_CHARS) {
      throw appError("INVALID", `Please keep questions under ${AI_MAX_INPUT_CHARS} characters.`);
    }
    await consumeQuota(ctx, user._id);
    const now = Date.now();
    let threadId = args.threadId;
    if (threadId) {
      await ownThread(ctx, user._id, threadId);
      await ctx.db.patch(threadId, { updatedAt: now });
    } else {
      threadId = await ctx.db.insert("aiThreads", {
        userId: user._id,
        title: content.length > 60 ? `${content.slice(0, 57)}…` : content,
        updatedAt: now,
      });
    }
    await ctx.db.insert("aiMessages", { threadId, userId: user._id, role: "user", content, status: "done" });
    const messageId = await ctx.db.insert("aiMessages", {
      threadId,
      userId: user._id,
      role: "assistant",
      content: "",
      status: "pending",
    });
    await ctx.scheduler.runAfter(0, internal.ai.generateReply, {
      messageId,
      threadId,
      userId: user._id,
      page: args.page?.slice(0, 200),
    });
    return { threadId, messageId };
  },
});

/** Re-runs a failed answer (counts against the daily cap). */
export const retry = mutation({
  args: { messageId: v.id("aiMessages"), page: v.optional(v.string()) },
  handler: async (ctx, { messageId, page }) => {
    const user = await requireViewer(ctx);
    await assertAvailable(ctx);
    const msg = await ctx.db.get(messageId);
    if (!msg || msg.userId !== user._id || msg.role !== "assistant") throw appError("NOT_FOUND", "Message not found.");
    if (msg.status !== "error") throw appError("INVALID", "Only failed answers can be retried.");
    await consumeQuota(ctx, user._id);
    await ctx.db.patch(messageId, { status: "pending", content: "", error: undefined });
    await ctx.scheduler.runAfter(0, internal.ai.generateReply, {
      messageId,
      threadId: msg.threadId,
      userId: user._id,
      page: page?.slice(0, 200),
    });
  },
});

/** Stops a streaming answer; the text received so far is kept. */
export const stop = mutation({
  args: { messageId: v.id("aiMessages") },
  handler: async (ctx, { messageId }) => {
    const user = await requireViewer(ctx);
    const msg = await ctx.db.get(messageId);
    if (!msg || msg.userId !== user._id) throw appError("NOT_FOUND", "Message not found.");
    if (msg.status === "pending" || msg.status === "streaming") {
      await ctx.db.patch(messageId, {
        status: "done",
        content: msg.content ? `${msg.content}\n\n_(stopped)_` : "_(stopped)_",
      });
    }
  },
});

export const deleteThread = mutation({
  args: { threadId: v.id("aiThreads") },
  handler: async (ctx, { threadId }) => {
    const user = await requireViewer(ctx);
    await ownThread(ctx, user._id, threadId);
    const msgs = await ctx.db
      .query("aiMessages")
      .withIndex("by_thread", (q) => q.eq("threadId", threadId))
      .take(500);
    for (const m of msgs) await ctx.db.delete(m._id);
    await ctx.db.delete(threadId);
  },
});

// ---------------------------------------------------------------------------
// Chat generation (scheduled — runs without client auth, so the user is
// passed explicitly and re-validated here)
// ---------------------------------------------------------------------------

async function tradeRef(trade: Doc<"trades">): Promise<ContextRef> {
  return { type: "trade", id: trade._id, label: trade.tradeNumber, href: `/physical-trades/${trade._id}` };
}

async function tradeOperationalState(ctx: QueryCtx, trade: Doc<"trades">) {
  const contracts = await ctx.db
    .query("contracts")
    .withIndex("by_trade", (q) => q.eq("tradeId", trade._id))
    .order("desc")
    .take(10);
  const contract = contracts.find((c) => c.isCurrent) ?? null;
  const bls = await ctx.db
    .query("blDocuments")
    .withIndex("by_trade", (q) => q.eq("tradeId", trade._id))
    .order("desc")
    .take(10);
  const bl = bls.find((b) => b.isCurrent) ?? null;
  const checklist = await ctx.db
    .query("dispatchChecklists")
    .withIndex("by_trade", (q) => q.eq("tradeId", trade._id))
    .first();
  const items = checklist
    ? await ctx.db
        .query("dispatchItems")
        .withIndex("by_checklist", (q) => q.eq("checklistId", checklist._id))
        .take(100)
    : [];
  const today = utcDay();
  const docs = await ctx.db
    .query("documents")
    .withIndex("by_trade", (q) => q.eq("tradeId", trade._id))
    .take(200);
  const issues = validateTrade(trade);
  const nextAction = await computeNextAction(ctx, trade, issues.some((i) => i.severity === "error"));
  return {
    validation: issues.map((i) => `${i.severity}: ${i.message}`),
    nextAction: nextAction ? `${nextAction.label}${nextAction.description ? ` — ${nextAction.description}` : ""}` : null,
    contract: contract
      ? {
          contractNumber: contract.contractNumber,
          version: contract.version,
          status: contract.status,
          signatureStatus: contract.signatureStatus,
          missingValues: contract.missingVariables,
          pdfGenerated: Boolean(contract.pdfStorageId),
        }
      : "No contract generated yet",
    pendingContractRevision: contracts.some((c) => !c.isCurrent && c.status === "draft" && c.revisionOf),
    bl: bl
      ? {
          recordNumber: bl.blRecordNumber,
          status: bl.status,
          version: bl.version,
          carrierBlRecorded: Boolean(bl.externalBlNumber && bl.carrierDocumentId),
        }
      : "No B/L prepared yet",
    dispatchChecklist: checklist
      ? {
          ...checklistProgress(items),
          blocked: items.filter((i) => i.status === "blocked").map((i) => `${i.label}${i.blockedReason ? ` (${i.blockedReason})` : ""}`),
          overdue: items
            .filter((i) => i.status !== "complete" && i.dueDate && i.dueDate < today)
            .map((i) => `${i.label} (due ${i.dueDate})`),
          nextOpenItem: items.sort((a, b) => a.sortOrder - b.sortOrder).find((i) => i.status !== "complete")?.label ?? null,
        }
      : "No dispatch checklist yet",
    documentsOnFile: [...new Set(docs.filter((d) => !d.archived).map((d) => d.docType))],
  };
}

export const buildChatContext = internalQuery({
  args: {
    userId: v.id("users"),
    threadId: v.id("aiThreads"),
    messageId: v.id("aiMessages"),
    page: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ messages: ChatMessage[]; contextRefs: ContextRef[] }> => {
    const user = await ctx.db.get(args.userId);
    if (!user || user.status !== "active" || !user.role) throw appError("FORBIDDEN", "Your account is not active.");
    const thread = await ownThread(ctx, user._id, args.threadId);

    const history = (
      await ctx.db
        .query("aiMessages")
        .withIndex("by_thread", (q) => q.eq("threadId", thread._id))
        .take(200)
    )
      .filter((m) => m._id !== args.messageId && m.status === "done" && m.content.trim() !== "")
      .slice(-12);
    const question = [...history].reverse().find((m) => m.role === "user")?.content ?? "";

    const refs: ContextRef[] = [];
    const data: Record<string, unknown> = {};

    // Dashboard numbers + work queues (same source as the dashboard; all active users may see them).
    const summary = await summaryData(ctx, {});
    data.dashboard = {
      kpis: [...summary.primary, ...summary.secondary].map((k) => ({ metric: k.label, value: k.capped ? `${k.value}+` : k.value })),
      openTradeValueByCurrency: summary.openTradeValue.byCurrency,
    };
    const queues = await pendingActionsData(ctx, { today: utcDay() });
    data.pendingWork = queues.map((q) => ({
      queue: q.label,
      count: q.count,
      examples: q.items.slice(0, 5).map((i) => (i.detail ? `${i.label} — ${i.detail}` : i.label)),
    }));

    // Records referenced by number (e.g. "TRD-2026-0017", contract numbers).
    const numbers = findRecordNumbers(question);
    const referenced: unknown[] = [];
    for (const n of numbers) {
      const trade = await ctx.db
        .query("trades")
        .withIndex("by_tradeNumber", (q) => q.eq("tradeNumber", n))
        .first();
      if (trade) {
        referenced.push({ trade: safeTradeFacts(trade), ...(await tradeOperationalState(ctx, trade)) });
        refs.push(await tradeRef(trade));
        continue;
      }
      const contract = await ctx.db
        .query("contracts")
        .withIndex("by_contractNumber", (q) => q.eq("contractNumber", n))
        .order("desc")
        .first();
      if (contract) {
        referenced.push({
          contract: {
            contractNumber: contract.contractNumber,
            tradeNumber: contract.tradeNumber,
            version: contract.version,
            isCurrentVersion: contract.isCurrent,
            status: contract.status,
            signatureStatus: contract.signatureStatus,
            counterpartyName: contract.counterpartyName,
            commodityName: contract.commodityName,
            totalValue: contract.totalValue,
            currency: contract.currency,
          },
        });
        refs.push({ type: "contract", id: contract._id, label: contract.contractNumber, href: `/contracts/${contract._id}` });
      }
    }
    if (referenced.length) data.referencedRecords = referenced;

    // Keyword search over trades and counterparties.
    const terms = searchTerms(question);
    if (terms) {
      const trades = await ctx.db
        .query("trades")
        .withSearchIndex("search", (q) => q.search("searchText", terms))
        .take(6);
      if (trades.length) {
        data.matchingTrades = trades.map((t) => ({
          tradeNumber: t.tradeNumber,
          status: t.status,
          direction: t.direction,
          tradeDate: t.tradeDate,
          counterpartyName: t.counterpartyName,
          commodityName: t.commodityName,
          quantity: t.quantity,
          uom: t.uom,
          totalValue: t.totalValue,
          currency: t.currency,
          incoterm: t.incoterm,
        }));
        for (const t of trades) if (!refs.some((r) => r.id === t._id)) refs.push(await tradeRef(t));
      }
      const cps = await ctx.db
        .query("counterparties")
        .withSearchIndex("search", (q) => q.search("searchText", terms).eq("archived", false))
        .take(3);
      if (cps.length) {
        // Default terms only — contact and bank details are never sent.
        data.matchingSuppliers = cps.map((c) => ({
          name: c.name,
          code: c.code,
          type: c.type,
          country: c.country,
          roles: c.roles,
          status: c.status,
          defaultCurrency: c.defaultCurrency,
          defaultPaymentTerm: c.defaultPaymentTerm,
          defaultIncoterm: c.defaultIncoterm,
        }));
        for (const c of cps) refs.push({ type: "supplier", id: c._id, label: c.name, href: `/suppliers/${c._id}` });
      }
    }

    const system = assistantSystemPrompt({
      role: user.role,
      userName: displayName(user),
      today: utcDay(),
      page: args.page,
      helpText: helpContentAsText(user.role).slice(0, 9000),
      dataText: compactJson(data, 9000),
    });
    return {
      messages: [
        { role: "system", content: system },
        ...history.map((m) => ({ role: m.role, content: m.content.slice(0, AI_MAX_INPUT_CHARS) }) as ChatMessage),
      ],
      contextRefs: refs.slice(0, 8),
    };
  },
});

/** Writes streamed text. Returns false when the message was stopped/finished (caller should abort). */
export const patchAssistant = internalMutation({
  args: {
    messageId: v.id("aiMessages"),
    content: v.string(),
    status: v.union(v.literal("streaming"), v.literal("done"), v.literal("error")),
    error: v.optional(v.string()),
    model: v.optional(v.string()),
    contextRefs: v.optional(v.array(v.object({ type: v.string(), id: v.string(), label: v.string(), href: v.string() }))),
  },
  handler: async (ctx, args): Promise<boolean> => {
    const msg = await ctx.db.get(args.messageId);
    if (!msg || msg.status === "done" || msg.status === "error") return false;
    await ctx.db.patch(args.messageId, {
      content: args.content,
      status: args.status,
      error: args.error,
      ...(args.model ? { model: args.model } : {}),
      ...(args.contextRefs ? { contextRefs: args.contextRefs } : {}),
    });
    if (args.status !== "streaming") await ctx.db.patch(msg.threadId, { updatedAt: Date.now() });
    return true;
  },
});

export const generateReply = internalAction({
  args: {
    messageId: v.id("aiMessages"),
    threadId: v.id("aiThreads"),
    userId: v.id("users"),
    page: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<void> => {
    const cfg = aiConfig();
    try {
      const built: { messages: ChatMessage[]; contextRefs: ContextRef[] } = await ctx.runQuery(
        internal.ai.buildChatContext,
        args,
      );
      let lastPatch = 0;
      let stopped = false;
      const full = await streamChatCompletion(cfg, { messages: built.messages, temperature: 0.3, maxTokens: 900 }, async (text) => {
        const now = Date.now();
        if (now - lastPatch < 150) return true;
        lastPatch = now;
        const active: boolean = await ctx.runMutation(internal.ai.patchAssistant, {
          messageId: args.messageId,
          content: text,
          status: "streaming",
          model: cfg.model,
          contextRefs: built.contextRefs,
        });
        if (!active) stopped = true;
        return active;
      });
      if (!stopped) {
        await ctx.runMutation(internal.ai.patchAssistant, {
          messageId: args.messageId,
          content: full,
          status: "done",
          model: cfg.model,
          contextRefs: built.contextRefs,
        });
      }
    } catch (e) {
      await ctx.runMutation(internal.ai.patchAssistant, {
        messageId: args.messageId,
        content: "",
        status: "error",
        error: friendlyError(e),
      });
    }
  },
});

// ---------------------------------------------------------------------------
// Smart actions (results are suggestions; the user reviews before saving)
// ---------------------------------------------------------------------------

const permissionArg = v.union(
  v.literal("view"),
  v.literal("trade.create"),
  v.literal("counterparty.create"),
  v.literal("contractTemplate.manage"),
);

/** Auth + availability + quota for one-shot AI calls (auth propagates from the calling action). */
export const beginAiCall = internalMutation({
  args: { permission: permissionArg },
  handler: async (ctx, { permission }): Promise<{ userId: Id<"users"> }> => {
    const user = permission === "view" ? await requireViewer(ctx) : await requirePermission(ctx, permission);
    await assertAvailable(ctx);
    await consumeQuota(ctx, user._id);
    return { userId: user._id };
  },
});

type EntityMatch = { id: string; name: string; code: string; score: number };

export const matchEntities = internalQuery({
  args: { counterpartyName: v.optional(v.string()), commodityName: v.optional(v.string()) },
  handler: async (ctx, args): Promise<{ counterparties: EntityMatch[]; commodities: EntityMatch[] }> => {
    await requireViewer(ctx);
    const score = (candidate: string, wanted: string, rank: number) => {
      const a = candidate.toLowerCase().replace(/[^a-z0-9]/g, "");
      const b = wanted.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (a === b) return 1;
      if (a.includes(b) || b.includes(a)) return 0.85 - rank * 0.05;
      return Math.max(0.3, 0.65 - rank * 0.1);
    };
    const counterparties: EntityMatch[] = [];
    const cpName = args.counterpartyName?.trim();
    if (cpName) {
      const rows = await ctx.db
        .query("counterparties")
        .withSearchIndex("search", (q) => q.search("searchText", cpName.toLowerCase()).eq("archived", false))
        .take(3);
      rows.forEach((c, i) => counterparties.push({ id: c._id, name: c.name, code: c.code, score: score(c.name, cpName, i) }));
    }
    const commodities: EntityMatch[] = [];
    const cName = args.commodityName?.trim();
    if (cName) {
      const rows = await ctx.db
        .query("commodities")
        .withSearchIndex("search", (q) => q.search("searchText", cName.toLowerCase()).eq("active", true))
        .take(3);
      rows.forEach((c, i) =>
        commodities.push({ id: c._id, name: c.name, code: c.code, score: Math.max(score(c.name, cName, i), score(c.code, cName, i)) }),
      );
    }
    return { counterparties, commodities };
  },
});

export const extractTradeFromText = action({
  args: { text: v.string() },
  handler: async (
    ctx,
    { text },
  ): Promise<TradeExtraction & { matches: { counterparties: EntityMatch[]; commodities: EntityMatch[] }; model: string }> => {
    const input = text.trim();
    if (input.length < 10) throw appError("INVALID", "Paste the email or message text first.");
    if (input.length > AI_MAX_EXTRACT_CHARS) throw appError("INVALID", `Please paste at most ${AI_MAX_EXTRACT_CHARS} characters.`);
    await ctx.runMutation(internal.ai.beginAiCall, { permission: "trade.create" });
    const cfg = aiConfig();
    try {
      const raw = await chatCompletion(cfg, {
        messages: [
          { role: "system", content: TRADE_EXTRACT_PROMPT },
          { role: "user", content: input },
        ],
        temperature: 0,
        maxTokens: 900,
        jsonMode: true,
      });
      const parsed = extractJsonObject(raw);
      if (parsed === null) throw new AiError("invalid_output", "The AI response could not be understood. Please try again.");
      const extraction = normaliseTradeExtraction(parsed);
      const matches: { counterparties: EntityMatch[]; commodities: EntityMatch[] } = await ctx.runQuery(
        internal.ai.matchEntities,
        {
          counterpartyName: extraction.fields.counterpartyName?.value as string | undefined,
          commodityName: extraction.fields.commodityName?.value as string | undefined,
        },
      );
      return { ...extraction, matches, model: cfg.model };
    } catch (e) {
      throw appError("INVALID", friendlyError(e));
    }
  },
});

export const extractSupplierFromText = action({
  args: { text: v.string() },
  handler: async (ctx, { text }): Promise<SupplierExtraction & { model: string }> => {
    const input = text.trim();
    if (input.length < 10) throw appError("INVALID", "Paste the signature, letterhead or card text first.");
    if (input.length > AI_MAX_EXTRACT_CHARS) throw appError("INVALID", `Please paste at most ${AI_MAX_EXTRACT_CHARS} characters.`);
    await ctx.runMutation(internal.ai.beginAiCall, { permission: "counterparty.create" });
    const cfg = aiConfig();
    try {
      const raw = await chatCompletion(cfg, {
        messages: [
          { role: "system", content: SUPPLIER_EXTRACT_PROMPT },
          { role: "user", content: input },
        ],
        temperature: 0,
        maxTokens: 700,
        jsonMode: true,
      });
      const parsed = extractJsonObject(raw);
      if (parsed === null) throw new AiError("invalid_output", "The AI response could not be understood. Please try again.");
      return { ...normaliseSupplierExtraction(parsed), model: cfg.model };
    } catch (e) {
      throw appError("INVALID", friendlyError(e));
    }
  },
});

export const tradeSummaryFacts = internalQuery({
  args: { tradeId: v.id("trades") },
  handler: async (ctx, { tradeId }): Promise<{ facts: string; tradeUpdatedAt: number }> => {
    await requireViewer(ctx);
    const trade = await getOrThrow(ctx, tradeId, "Trade");
    const facts = { trade: safeTradeFacts(trade), today: utcDay(), ...(await tradeOperationalState(ctx, trade)) };
    return { facts: compactJson(facts, 8000), tradeUpdatedAt: trade.updatedAt };
  },
});

export const storeTradeSummary = internalMutation({
  args: { tradeId: v.id("trades"), tradeUpdatedAt: v.number(), content: v.string(), model: v.string() },
  handler: async (ctx, args) => {
    const user = await requireViewer(ctx);
    const existing = await ctx.db
      .query("aiTradeSummaries")
      .withIndex("by_trade", (q) => q.eq("tradeId", args.tradeId))
      .take(10);
    for (const e of existing) await ctx.db.delete(e._id);
    await ctx.db.insert("aiTradeSummaries", { ...args, generatedBy: user._id, generatedAt: Date.now() });
  },
});

/** Latest stored AI summary for a trade (null if never generated). */
export const tradeSummary = query({
  args: { tradeId: v.id("trades") },
  handler: async (ctx, { tradeId }) => {
    await requireViewer(ctx);
    const trade = await getOrThrow(ctx, tradeId, "Trade");
    const row = await ctx.db
      .query("aiTradeSummaries")
      .withIndex("by_trade", (q) => q.eq("tradeId", tradeId))
      .first();
    if (!row) return null;
    const by = await ctx.db.get(row.generatedBy);
    return {
      content: row.content,
      model: row.model,
      generatedAt: row.generatedAt,
      generatedByName: displayName(by),
      outdated: row.tradeUpdatedAt !== trade.updatedAt,
    };
  },
});

export const summariseTrade = action({
  args: { tradeId: v.id("trades") },
  handler: async (ctx, { tradeId }): Promise<{ content: string; model: string }> => {
    await ctx.runMutation(internal.ai.beginAiCall, { permission: "view" });
    const cfg = aiConfig();
    const { facts, tradeUpdatedAt }: { facts: string; tradeUpdatedAt: number } = await ctx.runQuery(
      internal.ai.tradeSummaryFacts,
      { tradeId },
    );
    try {
      const content = await chatCompletion(cfg, {
        messages: [
          { role: "system", content: TRADE_SUMMARY_PROMPT },
          { role: "user", content: `FACTS:\n${facts}` },
        ],
        temperature: 0.2,
        maxTokens: 600,
      });
      await ctx.runMutation(internal.ai.storeTradeSummary, { tradeId, tradeUpdatedAt, content: content.trim(), model: cfg.model });
      return { content: content.trim(), model: cfg.model };
    } catch (e) {
      throw appError("INVALID", friendlyError(e));
    }
  },
});

export const draftClause = action({
  args: { instruction: v.string(), heading: v.optional(v.string()) },
  handler: async (
    ctx,
    { instruction, heading },
  ): Promise<{ heading: string; body: string; unknownVariables: string[]; model: string }> => {
    const ask = instruction.trim();
    if (ask.length < 5) throw appError("INVALID", "Describe the clause you need (e.g. 'quality and weight final at loading port').");
    if (ask.length > 1500) throw appError("INVALID", "Please keep the instruction under 1,500 characters.");
    await ctx.runMutation(internal.ai.beginAiCall, { permission: "contractTemplate.manage" });
    const cfg = aiConfig();
    try {
      const raw = await chatCompletion(cfg, {
        messages: [
          { role: "system", content: clauseDraftPrompt(TEMPLATE_VARIABLES) },
          { role: "user", content: `${heading ? `Clause heading: ${heading}\n` : ""}Instruction: ${ask}` },
        ],
        temperature: 0.4,
        maxTokens: 700,
        jsonMode: true,
      });
      const parsed = extractJsonObject(raw) as { heading?: unknown; body?: unknown } | null;
      const body = typeof parsed?.body === "string" ? parsed.body.trim() : raw.trim();
      const outHeading = typeof parsed?.heading === "string" && parsed.heading.trim() ? parsed.heading.trim() : (heading ?? "");
      if (!body) throw new AiError("invalid_output", "The AI returned an empty clause. Please try again.");
      return {
        heading: outHeading.slice(0, 120),
        body: body.slice(0, 5000),
        unknownVariables: validateTemplateText([outHeading, body]),
        model: cfg.model,
      };
    } catch (e) {
      throw appError("INVALID", friendlyError(e));
    }
  },
});
