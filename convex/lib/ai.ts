/**
 * AI (LLM) helpers. Talks to Groq's free tier through its OpenAI-compatible
 * endpoint (any OpenAI-compatible provider works via AI_BASE_URL). Everything
 * here is real model output — there are no canned answers. Pure helpers
 * (parsing/validation/redaction) are unit-tested.
 *
 * Configuration (Convex deployment env, never exposed to the browser):
 *   NEXT_GROQ_AI_API_KEY  required to enable AI
 *   AI_MODEL              optional, default openai/gpt-oss-120b
 *   AI_BASE_URL           optional, default Groq's OpenAI-compatible base URL
 */
import { z } from "zod";

export const AI_KEY_ENV = "NEXT_GROQ_AI_API_KEY";
export const AI_PROVIDER = "Groq (free tier)";
export const DEFAULT_AI_BASE_URL = "https://api.groq.com/openai/v1/";
export const DEFAULT_AI_MODEL = "openai/gpt-oss-120b";
/** Per-user requests per UTC day, protecting the shared free-tier quota. */
export const AI_DAILY_CAP = 100;
/**
 * Requests per UTC day for the whole workspace. Groq's free tier limits the
 * API key (1,000 requests/day), so one user must not be able to drain it.
 */
export const AI_WORKSPACE_DAILY_CAP = 900;
export const AI_MAX_INPUT_CHARS = 4000;
export const AI_MAX_EXTRACT_CHARS = 8000;

export const AI_DATA_NOTICE =
  "AI runs on Groq's free tier: your question and the ERP records needed to answer it are sent to Groq to generate the reply. " +
  "Internal notes, bank details, emails and phone numbers from the ERP are never sent.";

export type AiConfig = { configured: boolean; apiKey: string; model: string; baseUrl: string };

export function aiConfig(env: Record<string, string | undefined> = process.env): AiConfig {
  const apiKey = (env[AI_KEY_ENV] ?? "").trim();
  const model = (env.AI_MODEL ?? "").trim() || DEFAULT_AI_MODEL;
  let baseUrl = (env.AI_BASE_URL ?? "").trim() || DEFAULT_AI_BASE_URL;
  if (!baseUrl.endsWith("/")) baseUrl += "/";
  return { configured: apiKey.length > 0, apiKey, model, baseUrl };
}

export function utcDay(now = Date.now()): string {
  return new Date(now).toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export type AiErrorKind = "not_configured" | "auth" | "rate_limited" | "bad_request" | "unavailable" | "invalid_output";

export class AiError extends Error {
  constructor(
    public kind: AiErrorKind,
    message: string,
  ) {
    super(message);
  }
}

/** Seconds to wait from a `retry-after` header (seconds or HTTP date); null when absent/invalid. */
export function retryAfterSeconds(header: string | null | undefined, now = Date.now()): number | null {
  if (!header) return null;
  const secs = Number(header.trim());
  if (header.trim() !== "" && Number.isFinite(secs)) return secs >= 0 ? Math.ceil(secs) : null;
  const at = Date.parse(header);
  return Number.isNaN(at) ? null : Math.max(0, Math.ceil((at - now) / 1000));
}

/** Maps an HTTP status from the provider to a friendly, actionable message. */
export function classifyHttpError(status: number, body: string, retryAfter?: string | null): AiError {
  if (status === 401 || status === 403) {
    return new AiError("auth", `The AI provider rejected the API key. An administrator should check ${AI_KEY_ENV}.`);
  }
  if (status === 429) {
    const wait = retryAfterSeconds(retryAfter);
    const when =
      wait === null || wait <= 5
        ? "Please try again in a few seconds."
        : wait <= 120
          ? `Please try again in about ${wait} seconds.`
          : `Please try again in about ${Math.ceil(wait / 60)} minutes.`;
    return new AiError("rate_limited", `Groq's rate limit was reached — the free tier allows only a few requests per minute. ${when}`);
  }
  if (status === 400 || status === 404) {
    const hint = /model/i.test(body) ? " Check the AI_MODEL setting." : "";
    return new AiError("bad_request", `The AI provider could not process this request.${hint}`);
  }
  return new AiError("unavailable", "The AI service is temporarily unavailable. Please try again shortly.");
}

// ---------------------------------------------------------------------------
// Chat completions (OpenAI-compatible)
// ---------------------------------------------------------------------------

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

type CompletionOptions = {
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
};

/** Reasoning models spend output tokens thinking first; keep that short so answers aren't cut off. */
export function reasoningEffort(model: string): "low" | undefined {
  return /gpt-oss|qwen3/i.test(model) ? "low" : undefined;
}

function requestBody(cfg: AiConfig, o: CompletionOptions, stream: boolean) {
  const effort = reasoningEffort(cfg.model);
  return JSON.stringify({
    model: cfg.model,
    messages: o.messages,
    temperature: o.temperature ?? 0.3,
    ...(o.maxTokens ? { max_tokens: o.maxTokens } : {}),
    ...(effort ? { reasoning_effort: effort } : {}),
    ...(o.jsonMode ? { response_format: { type: "json_object" } } : {}),
    ...(stream ? { stream: true } : {}),
  });
}

function headers(cfg: AiConfig) {
  return { "Content-Type": "application/json", Authorization: `Bearer ${cfg.apiKey}` };
}

/** Pulls the assistant text out of a (non-streamed) chat completion response. */
export function completionText(json: unknown): string | null {
  const parsed = z
    .object({
      choices: z
        .array(
          z.object({
            message: z
              .object({ content: z.union([z.string(), z.array(z.object({ text: z.string().optional() }))]).nullish() })
              .optional(),
          }),
        )
        .min(1),
    })
    .safeParse(json);
  if (!parsed.success) return null;
  const content = parsed.data.choices[0].message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((p) => p.text ?? "").join("");
  return null;
}

export async function chatCompletion(cfg: AiConfig, o: CompletionOptions): Promise<string> {
  if (!cfg.configured) throw new AiError("not_configured", "AI is not configured.");
  let res = await fetch(`${cfg.baseUrl}chat/completions`, {
    method: "POST",
    headers: headers(cfg),
    body: requestBody(cfg, o, false),
  });
  // Some providers reject response_format; retry once without it.
  if (res.status === 400 && o.jsonMode) {
    res = await fetch(`${cfg.baseUrl}chat/completions`, {
      method: "POST",
      headers: headers(cfg),
      body: requestBody(cfg, { ...o, jsonMode: false }, false),
    });
  }
  const text = await res.text();
  if (!res.ok) throw classifyHttpError(res.status, text, res.headers.get("retry-after"));
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new AiError("invalid_output", "The AI service returned an unreadable response.");
  }
  const content = completionText(json);
  if (content === null) throw new AiError("invalid_output", "The AI service returned an empty response.");
  return content;
}

/**
 * Incremental SSE parser for OpenAI-style streams. Feed it raw text chunks;
 * it returns the text deltas found and keeps any partial line buffered.
 */
export function createSseParser() {
  let buffer = "";
  let done = false;
  return {
    push(chunk: string): { deltas: string[]; done: boolean } {
      buffer += chunk;
      const deltas: string[] = [];
      let newline: number;
      while ((newline = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newline).replace(/\r$/, "").trim();
        buffer = buffer.slice(newline + 1);
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (data === "[DONE]") {
          done = true;
          continue;
        }
        try {
          const json = JSON.parse(data) as { choices?: { delta?: { content?: unknown } }[] };
          const piece = json.choices?.[0]?.delta?.content;
          if (typeof piece === "string" && piece.length > 0) deltas.push(piece);
        } catch {
          // ignore keep-alives / malformed lines
        }
      }
      return { deltas, done };
    },
    get done() {
      return done;
    },
  };
}

/**
 * Streams a chat completion, calling `onDelta` with the accumulated text.
 * Falls back to a regular completion if the provider doesn't stream.
 * `shouldStop` is polled between chunks so users can cancel.
 */
export async function streamChatCompletion(
  cfg: AiConfig,
  o: CompletionOptions,
  onDelta: (fullText: string) => Promise<boolean | void>,
): Promise<string> {
  if (!cfg.configured) throw new AiError("not_configured", "AI is not configured.");
  const res = await fetch(`${cfg.baseUrl}chat/completions`, {
    method: "POST",
    headers: headers(cfg),
    body: requestBody(cfg, o, true),
  });
  if (!res.ok) throw classifyHttpError(res.status, await res.text(), res.headers.get("retry-after"));
  const type = res.headers.get("content-type") ?? "";
  if (!res.body || !type.includes("text/event-stream")) {
    // Provider answered without streaming — parse as a normal completion.
    const text = await res.text();
    let content: string | null = null;
    try {
      content = completionText(JSON.parse(text));
    } catch {
      content = null;
    }
    if (content === null) {
      // Maybe it was SSE without the header.
      const parser = createSseParser();
      const { deltas } = parser.push(text + "\n");
      content = deltas.length ? deltas.join("") : null;
    }
    if (content === null) throw new AiError("invalid_output", "The AI service returned an empty response.");
    await onDelta(content);
    return content;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const parser = createSseParser();
  let full = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    const { deltas, done: finished } = parser.push(decoder.decode(value, { stream: true }));
    if (deltas.length) {
      full += deltas.join("");
      const keepGoing = await onDelta(full);
      if (keepGoing === false) {
        await reader.cancel();
        break;
      }
    }
    if (finished) break;
  }
  if (full.trim() === "") throw new AiError("invalid_output", "The AI service returned an empty response.");
  return full;
}

// ---------------------------------------------------------------------------
// JSON extraction & validation
// ---------------------------------------------------------------------------

/** Extracts the first JSON object from model text (handles ```json fences and prose around it). */
export function extractJsonObject(text: string): unknown | null {
  const unfenced = text.replace(/```(?:json)?/gi, "");
  const start = unfenced.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < unfenced.length; i++) {
    const ch = unfenced[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(unfenced.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

const fieldV = z.object({
  value: z.union([z.string(), z.number(), z.boolean(), z.null()]).optional(),
  confidence: z.number().optional(),
});

export type Suggestion<T> = { value: T; confidence: number };

const clampConfidence = (c: number | undefined) => (c === undefined || !Number.isFinite(c) ? 0.5 : Math.max(0, Math.min(1, c)));

function cleanText(value: unknown, max: number): string | undefined {
  if (typeof value === "number") value = String(value);
  if (typeof value !== "string") return undefined;
  const s = value.replace(/\s+/g, " ").trim();
  if (!s || /^(n\/?a|null|none|unknown|-|—)$/i.test(s)) return undefined;
  return s.slice(0, max);
}

function cleanNumber(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value !== "string") return undefined;
  const digits = value.replace(/[, ]/g, "").replace(/[^\d.-]/g, "");
  // No digits at all (e.g. "abc", "TBD") must not become 0.
  if (!/\d/.test(digits)) return undefined;
  const n = Number(digits);
  return Number.isFinite(n) ? n : undefined;
}

export const TRADE_EXTRACT_FIELDS = [
  "direction",
  "counterpartyName",
  "commodityName",
  "quantity",
  "uom",
  "pricePerUom",
  "currency",
  "incoterm",
  "paymentTerm",
  "shipmentPeriod",
  "loadingLocation",
  "dischargeLocation",
  "origin",
  "packing",
  "buyerReference",
  "notes",
] as const;
export type TradeExtractField = (typeof TRADE_EXTRACT_FIELDS)[number];

export type TradeExtraction = {
  fields: Partial<Record<TradeExtractField, Suggestion<string | number>>>;
  dropped: string[];
};

/** Validates and normalises the model's trade extraction. Invalid values are dropped, never guessed. */
export function normaliseTradeExtraction(raw: unknown): TradeExtraction {
  const out: TradeExtraction = { fields: {}, dropped: [] };
  const root = z.object({ fields: z.record(z.string(), fieldV) }).safeParse(raw);
  if (!root.success) throw new AiError("invalid_output", "The AI response could not be understood. Please try again.");
  for (const key of TRADE_EXTRACT_FIELDS) {
    const f = root.data.fields[key];
    if (!f || f.value === undefined || f.value === null || f.value === "") continue;
    const confidence = clampConfidence(f.confidence);
    const set = (value: string | number) => (out.fields[key] = { value, confidence });
    switch (key) {
      case "direction": {
        const v = cleanText(f.value, 20)?.toLowerCase();
        if (v && /^(sale|sales|sell|selling)$/.test(v)) set("sales");
        else if (v && /^(purchase|buy|buying|purchasing)$/.test(v)) set("purchase");
        else out.dropped.push(key);
        break;
      }
      case "quantity": {
        const n = cleanNumber(f.value);
        if (n !== undefined && n > 0) set(Math.round(n * 1000) / 1000);
        else out.dropped.push(key);
        break;
      }
      case "pricePerUom": {
        const n = cleanNumber(f.value);
        if (n !== undefined && n >= 0) set(Math.round(n * 10000) / 10000);
        else out.dropped.push(key);
        break;
      }
      case "currency": {
        const c = cleanText(f.value, 10)?.toUpperCase().replace(/[^A-Z]/g, "");
        if (c && /^[A-Z]{3}$/.test(c)) set(c);
        else out.dropped.push(key);
        break;
      }
      case "uom": {
        const u = cleanText(f.value, 20)?.toUpperCase();
        if (!u) {
          out.dropped.push(key);
          break;
        }
        const map: Record<string, string> = { "METRIC TON": "MT", "METRIC TONS": "MT", TONS: "MT", TON: "MT", MTS: "MT", KGS: "KG", KILOGRAM: "KG", KILOGRAMS: "KG", PIECES: "PCS", PC: "PCS", BAGS: "BAG", BALES: "BALE" };
        set(map[u] ?? u);
        break;
      }
      case "notes":
        if (cleanText(f.value, 1000)) set(cleanText(f.value, 1000)!);
        break;
      default: {
        const s = cleanText(f.value, 200);
        if (s) set(s);
        else out.dropped.push(key);
      }
    }
  }
  return out;
}

export const SUPPLIER_EXTRACT_FIELDS = [
  "name",
  "type",
  "country",
  "contactPerson",
  "email",
  "phone",
  "website",
  "address",
  "city",
  "state",
  "postalCode",
  "taxId",
  "registrationNumber",
] as const;
export type SupplierExtractField = (typeof SUPPLIER_EXTRACT_FIELDS)[number];

export type SupplierExtraction = {
  fields: Partial<Record<SupplierExtractField, Suggestion<string>>>;
  dropped: string[];
};

export function normaliseSupplierExtraction(raw: unknown): SupplierExtraction {
  const out: SupplierExtraction = { fields: {}, dropped: [] };
  const root = z.object({ fields: z.record(z.string(), fieldV) }).safeParse(raw);
  if (!root.success) throw new AiError("invalid_output", "The AI response could not be understood. Please try again.");
  for (const key of SUPPLIER_EXTRACT_FIELDS) {
    const f = root.data.fields[key];
    if (!f || f.value === undefined || f.value === null || f.value === "") continue;
    const confidence = clampConfidence(f.confidence);
    const s = cleanText(f.value, key === "address" ? 300 : 160);
    if (!s) {
      out.dropped.push(key);
      continue;
    }
    if (key === "type") {
      const t = s.toLowerCase();
      if (t.startsWith("dom")) out.fields.type = { value: "domestic", confidence };
      else if (t.startsWith("int")) out.fields.type = { value: "international", confidence };
      else out.dropped.push(key);
      continue;
    }
    if (key === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) {
      out.dropped.push(key);
      continue;
    }
    if (key === "phone") {
      const phone = s.replace(/[^\d+()\s.-]/g, "").trim();
      if (!/^\+?[0-9][0-9\s().-]{5,24}$/.test(phone)) {
        out.dropped.push(key);
        continue;
      }
      out.fields.phone = { value: phone, confidence };
      continue;
    }
    if (key === "website") {
      const url = /^https?:\/\//i.test(s) ? s : `https://${s}`;
      if (!/^https?:\/\/[^\s.]+\.[^\s]+$/i.test(url)) {
        out.dropped.push(key);
        continue;
      }
      out.fields.website = { value: url, confidence };
      continue;
    }
    out.fields[key] = { value: s, confidence };
  }
  return out;
}

// ---------------------------------------------------------------------------
// Prompts & data minimisation
// ---------------------------------------------------------------------------

/**
 * Whitelist of trade fields that may be sent to the model. Internal notes,
 * bank details and anything not listed here is never sent.
 */
export const AI_SAFE_TRADE_FIELDS = [
  "tradeNumber",
  "status",
  "direction",
  "tradeDate",
  "companyName",
  "counterpartyName",
  "commodityName",
  "commodityCode",
  "quantity",
  "uom",
  "priceType",
  "pricePerUom",
  "currency",
  "totalValue",
  "priceNeedsValidation",
  "valueOverridden",
  "incoterm",
  "paymentTerm",
  "pricingTerm",
  "shipmentPeriod",
  "loadingLocation",
  "dischargeLocation",
  "partialShipment",
  "tolerancePct",
  "toleranceOption",
  "origin",
  "manufacturer",
  "freightTerms",
  "buyerReference",
  "printedContractNumber",
  "clonedFromNumber",
] as const;

export function safeTradeFacts(trade: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of AI_SAFE_TRADE_FIELDS) {
    const value = trade[key];
    if (value !== undefined && value !== null && value !== "") out[key] = value;
  }
  return out;
}

/** Words that don't distinguish one company from another. */
const NAME_NOISE = new Set(
  "ltd limited pvt private co company corp corporation inc llc llp plc gmbh sa ag bv pte the and of & international intl".split(" "),
);

function nameTokens(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !NAME_NOISE.has(w));
}

/**
 * How alike two company/commodity names are (0–1), ignoring case, punctuation
 * and legal suffixes. Used to rank search hits; it is not a fuzzy matcher, so
 * unrelated names score 0 rather than "a bit similar".
 */
export function nameSimilarity(candidate: string, wanted: string): number {
  const a = nameTokens(candidate);
  const b = nameTokens(wanted);
  if (a.length === 0 || b.length === 0) return 0;
  const ja = a.join(" ");
  const jb = b.join(" ");
  if (ja === jb) return 1;
  if (ja.includes(jb) || jb.includes(ja)) return 0.9;
  const setA = new Set(a);
  const shared = b.filter((w) => setA.has(w)).length;
  const union = new Set([...a, ...b]).size;
  return Math.round((shared / union) * 100) / 100;
}

export function compactJson(value: unknown, maxChars = 6000): string {
  const s = JSON.stringify(value);
  return s.length > maxChars ? `${s.slice(0, maxChars)}…(truncated)` : s;
}

/** Trade / contract / B/L style references in a free-text question, e.g. TRD-2026-0017. */
export function findRecordNumbers(text: string): string[] {
  const matches = text.toUpperCase().match(/\b[A-Z]{2,8}-\d{4}-\d{3,8}\b/g) ?? [];
  return [...new Set(matches)].slice(0, 5);
}

/** Salient search words from a question (for search-index lookups). */
export function searchTerms(text: string): string {
  const STOP = new Set(
    "the a an and or of for to in on with is are was were what which who how show me my our all any list give tell about please trade trades kya hai ka ki ke ko se me mein batao dikhao".split(
      " ",
    ),
  );
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w))
    .slice(0, 6)
    .join(" ");
}

export function assistantSystemPrompt(input: {
  role: string;
  userName: string;
  today: string;
  page?: string;
  helpText: string;
  dataText: string;
}): string {
  return [
    "You are Tradeline Assist, the built-in assistant of Tradeline ERP, a physical commodity trading ERP (suppliers, physical trades, contracts, B/L & dispatch, documents).",
    `User: ${input.userName} (role: ${input.role}). Today: ${input.today}.${input.page ? ` Current page: ${input.page}.` : ""}`,
    "Rules:",
    "- Answer ONLY from the CONTEXT below and the HELP GUIDE. If the answer is not there, say you don't have that information and suggest where in the app to look.",
    "- Never invent numbers, prices, quantities, exchange rates, statuses, dates, legal terms or record numbers.",
    "- When explaining how to do something, give short numbered steps with the exact menu path (e.g. Trade Operations → Physical Trades → Book Trade).",
    "- Respect the user's role: do not tell Staff they can confirm trades or issue contracts; those need a Manager or Admin.",
    "- Be concise (max ~180 words unless asked for more). Use **bold** for record numbers and key values, and '-' bullet lists.",
    "- Reply in the same language as the user's message (English, Hindi or Hinglish).",
    "- You cannot perform actions or change data; tell the user which button to press instead.",
    "",
    "HELP GUIDE:",
    input.helpText,
    "",
    "CONTEXT (live ERP data visible to this user, JSON):",
    input.dataText,
  ].join("\n");
}

export const TRADE_EXTRACT_PROMPT = `You extract physical commodity trade details from a pasted email, purchase order or chat message.
Return ONLY a JSON object of the form:
{"fields": {"<field>": {"value": <string|number>, "confidence": <0..1>}}}
Allowed fields: ${TRADE_EXTRACT_FIELDS.join(", ")}.
- direction: "sales" if WE are selling to the writer/buyer, "purchase" if we are buying from a supplier. Omit if unclear.
- counterpartyName: the other company's legal name as written.
- quantity: number only; uom: unit such as MT, KG, CBM, PCS, BAG, BALE.
- pricePerUom: number only (unit price, not total); currency: ISO code like USD, EUR, INR.
- incoterm: e.g. FOB, CIF, CFR, EXW. paymentTerm: e.g. "D/P at Sight", "LC 60 days".
- shipmentPeriod: as written (e.g. "October 2026"). Locations as written.
- buyerReference: PO / reference number if present. notes: anything else commercially important, one short sentence.
Only include fields that are explicitly stated. Never guess or calculate missing values. Confidence: 0.9+ when stated verbatim, lower when inferred.`;

export const SUPPLIER_EXTRACT_PROMPT = `You extract company details from a pasted email signature, letterhead or business card text.
Return ONLY a JSON object of the form:
{"fields": {"<field>": {"value": <string>, "confidence": <0..1>}}}
Allowed fields: ${SUPPLIER_EXTRACT_FIELDS.join(", ")}.
- name: the company's legal name. contactPerson: the person's name.
- type: "domestic" or "international" ONLY if the text states it; otherwise omit.
- country, city, state, postalCode, address as written. taxId: GST/VAT/TIN if present. registrationNumber: company registration / CIN if present.
- phone: include the country code if shown.
Only include fields that are explicitly present. Never guess.`;

export function clauseDraftPrompt(allowedVariables: { name: string; description: string }[]): string {
  return `You draft clause wording for a physical commodity trade contract template.
Write neutral, plain commercial English. You may insert placeholders ONLY from this list, written exactly as {{name}}:
${allowedVariables.map((v) => `- {{${v.name}}}: ${v.description}`).join("\n")}
Do not invent other placeholders. Do not cite specific laws, arbitration institutions or jurisdictions unless the user explicitly asks; write [to be confirmed by legal] where such a detail is needed.
Return ONLY a JSON object: {"heading": "<short clause heading>", "body": "<clause text>"}.`;
}

export const TRADE_SUMMARY_PROMPT = `You summarise one physical commodity trade for an operations team, using ONLY the JSON facts provided.
Output (max ~150 words, markdown-lite):
**Status** – one line.
**What's missing** – bullet list (or "Nothing blocking").
**Next steps** – 1–3 numbered steps naming the exact button/tab (Contract tab, B/L & Dispatch tab, Documents tab).
**Risks** – bullets only for concrete risks in the data (e.g. unit price needs validation, blocked or overdue checklist items, contract unsigned). Omit the section if none.
Never invent values, dates or statuses that are not in the facts.`;
