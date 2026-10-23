import { describe, expect, test } from "vitest";
import {
  AI_KEY_ENV,
  AI_SAFE_TRADE_FIELDS,
  aiConfig,
  classifyHttpError,
  completionText,
  createSseParser,
  DEFAULT_AI_BASE_URL,
  DEFAULT_AI_MODEL,
  extractJsonObject,
  findRecordNumbers,
  nameSimilarity,
  normaliseSupplierExtraction,
  normaliseTradeExtraction,
  reasoningEffort,
  retryAfterSeconds,
  safeTradeFacts,
  utcDay,
} from "../convex/lib/ai";

describe("aiConfig", () => {
  test("not configured without the Groq key", () => {
    const cfg = aiConfig({});
    expect(cfg.configured).toBe(false);
    expect(cfg.model).toBe(DEFAULT_AI_MODEL);
    expect(cfg.baseUrl).toBe(DEFAULT_AI_BASE_URL);
  });
  test("reads NEXT_GROQ_AI_API_KEY, trims it and ignores the old Gemini name", () => {
    expect(AI_KEY_ENV).toBe("NEXT_GROQ_AI_API_KEY");
    expect(aiConfig({ GEMINI_API_KEY: "g" }).configured).toBe(false);
    const cfg = aiConfig({ NEXT_GROQ_AI_API_KEY: "  gsk_test  " });
    expect(cfg).toMatchObject({ configured: true, apiKey: "gsk_test" });
  });
  test("model and base URL overrides; base URL always ends with /", () => {
    const cfg = aiConfig({ NEXT_GROQ_AI_API_KEY: "k", AI_MODEL: " openai/gpt-oss-20b ", AI_BASE_URL: "https://x.test/v1" });
    expect(cfg.model).toBe("openai/gpt-oss-20b");
    expect(cfg.baseUrl).toBe("https://x.test/v1/");
  });
  test("defaults point at Groq", () => {
    expect(DEFAULT_AI_BASE_URL).toBe("https://api.groq.com/openai/v1/");
  });
});

describe("reasoningEffort", () => {
  test("keeps reasoning short for thinking models only", () => {
    expect(reasoningEffort("openai/gpt-oss-120b")).toBe("low");
    expect(reasoningEffort("qwen/qwen3.8-27b")).toBe("low");
    expect(reasoningEffort("llama-3.1-8b-instant")).toBeUndefined();
  });
});

describe("classifyHttpError", () => {
  test("auth failures name the Groq key", () => {
    for (const status of [401, 403]) {
      const e = classifyHttpError(status, "");
      expect(e.kind).toBe("auth");
      expect(e.message).toContain("NEXT_GROQ_AI_API_KEY");
    }
  });
  test("429 is retryable and uses retry-after", () => {
    expect(classifyHttpError(429, "").kind).toBe("rate_limited");
    expect(classifyHttpError(429, "").message).toContain("a few seconds");
    expect(classifyHttpError(429, "", "30").message).toContain("30 seconds");
    expect(classifyHttpError(429, "", "600").message).toContain("10 minutes");
    expect(classifyHttpError(429, "").message).not.toMatch(/Pacific|Gemini/);
  });
  test("400/404 hint at AI_MODEL only when the body mentions the model", () => {
    expect(classifyHttpError(404, "model `x` does not exist").message).toContain("AI_MODEL");
    expect(classifyHttpError(400, "bad json").message).not.toContain("AI_MODEL");
    expect(classifyHttpError(400, "").kind).toBe("bad_request");
  });
  test("anything else is 'unavailable'", () => {
    expect(classifyHttpError(500, "").kind).toBe("unavailable");
    expect(classifyHttpError(503, "").kind).toBe("unavailable");
  });
});

describe("retryAfterSeconds", () => {
  test("seconds, HTTP dates and junk", () => {
    expect(retryAfterSeconds(null)).toBeNull();
    expect(retryAfterSeconds("")).toBeNull();
    expect(retryAfterSeconds("2.1")).toBe(3);
    expect(retryAfterSeconds("-1")).toBeNull();
    expect(retryAfterSeconds("soon")).toBeNull();
    const now = Date.parse("2026-10-24T10:00:00Z");
    expect(retryAfterSeconds("Sat, 24 Oct 2026 10:01:00 GMT", now)).toBe(60);
    expect(retryAfterSeconds("Sat, 24 Oct 2026 09:00:00 GMT", now)).toBe(0);
  });
});

describe("utcDay", () => {
  test("UTC calendar day", () => {
    expect(utcDay(Date.parse("2026-10-23T23:59:59Z"))).toBe("2026-10-23");
    expect(utcDay(Date.parse("2026-10-24T00:00:00Z"))).toBe("2026-10-24");
  });
});

describe("completion parsing", () => {
  test("completionText handles string and part arrays", () => {
    expect(completionText({ choices: [{ message: { content: "hi" } }] })).toBe("hi");
    expect(completionText({ choices: [{ message: { content: [{ text: "a" }, { text: "b" }] } }] })).toBe("ab");
    expect(completionText({ choices: [] })).toBeNull();
    expect(completionText("nope")).toBeNull();
  });
  test("SSE parser buffers partial lines and ignores reasoning-only deltas", () => {
    const p = createSseParser();
    const a = p.push('data: {"choices":[{"delta":{"reasoning":"thinking"}}]}\ndata: {"choices":[{"delta":{"content":"Hel');
    expect(a.deltas).toEqual([]);
    const b = p.push('lo"}}]}\n: keep-alive\ndata: {"choices":[{"delta":{"content":" there"}}]}\n');
    expect(b.deltas).toEqual(["Hello", " there"]);
    expect(p.push("data: [DONE]\n").done).toBe(true);
  });
});

describe("extractJsonObject", () => {
  test("finds the first object in fenced or chatty output", () => {
    expect(extractJsonObject('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJsonObject('Sure! {"a":{"b":"}"}} trailing')).toEqual({ a: { b: "}" } });
    expect(extractJsonObject("no json")).toBeNull();
    expect(extractJsonObject('{"a":')).toBeNull();
  });
});

describe("normaliseTradeExtraction", () => {
  test("normalises values and drops invalid ones instead of guessing", () => {
    const out = normaliseTradeExtraction({
      fields: {
        direction: { value: "Buying", confidence: 0.9 },
        quantity: { value: "1,250.5 MT", confidence: 2 },
        uom: { value: "metric tons" },
        pricePerUom: { value: "abc" },
        currency: { value: "usd" },
        incoterm: { value: "N/A" },
        counterpartyName: { value: "  Acme   Foods Ltd " },
        unknownField: { value: "x" },
      },
    });
    expect(out.fields.direction).toEqual({ value: "purchase", confidence: 0.9 });
    expect(out.fields.quantity).toEqual({ value: 1250.5, confidence: 1 });
    expect(out.fields.uom?.value).toBe("MT");
    expect(out.fields.currency?.value).toBe("USD");
    expect(out.fields.counterpartyName).toEqual({ value: "Acme Foods Ltd", confidence: 0.5 });
    expect(out.fields.pricePerUom).toBeUndefined();
    expect(out.fields.incoterm).toBeUndefined();
    expect(out.dropped).toEqual(expect.arrayContaining(["pricePerUom", "incoterm"]));
    expect(out.fields).not.toHaveProperty("unknownField");
  });
  test("rejects output without a fields object", () => {
    expect(() => normaliseTradeExtraction({ foo: 1 })).toThrow(/could not be understood/);
  });
});

describe("normaliseSupplierExtraction", () => {
  test("validates email, phone, website and type", () => {
    const out = normaliseSupplierExtraction({
      fields: {
        name: { value: "Shree Agro Exports Pvt Ltd", confidence: 0.95 },
        type: { value: "International" },
        email: { value: "not-an-email" },
        phone: { value: "Tel: +91 22 4000 1234" },
        website: { value: "shreeagro.com" },
      },
    });
    expect(out.fields.name?.value).toBe("Shree Agro Exports Pvt Ltd");
    expect(out.fields.type?.value).toBe("international");
    expect(out.fields.phone?.value).toBe("+91 22 4000 1234");
    expect(out.fields.website?.value).toBe("https://shreeagro.com");
    expect(out.fields.email).toBeUndefined();
    expect(out.dropped).toContain("email");
  });
});

describe("safeTradeFacts", () => {
  test("only whitelisted, non-empty trade fields are sent to the model", () => {
    const facts = safeTradeFacts({
      tradeNumber: "TRD-2026-0001",
      quantity: 10,
      incoterm: "",
      internalNotes: "do not send",
      bankDetails: { iban: "X" },
      contactEmail: "a@b.co",
      createdBy: "user123",
    });
    expect(facts).toEqual({ tradeNumber: "TRD-2026-0001", quantity: 10 });
    for (const banned of ["internalNotes", "notes", "bankDetails", "contactEmail", "email", "phone"]) {
      expect(AI_SAFE_TRADE_FIELDS as readonly string[]).not.toContain(banned);
    }
  });
});

describe("nameSimilarity", () => {
  test("ignores case, punctuation and legal suffixes", () => {
    expect(nameSimilarity("Shree Agro Exports Pvt. Ltd.", "shree agro exports private limited")).toBe(1);
    expect(nameSimilarity("Golden Agro Exports Pte", "Golden Agro")).toBe(0.9);
  });
  test("unrelated names score 0, partial overlap scores in between", () => {
    expect(nameSimilarity("MAHANSARIA TYRES PVT. LTD.", "Kenya Grain Traders Ltd")).toBe(0);
    const partial = nameSimilarity("Kenya Maize Traders", "Kenya Grain Traders Ltd");
    expect(partial).toBeGreaterThan(0.3);
    expect(partial).toBeLessThan(0.9);
    expect(nameSimilarity("Ltd", "Pvt Ltd")).toBe(0);
  });
});

describe("findRecordNumbers", () => {
  test("finds de-duplicated record references", () => {
    expect(findRecordNumbers("status of trd-2026-0017 and CTR-2026-0003, again TRD-2026-0017?")).toEqual([
      "TRD-2026-0017",
      "CTR-2026-0003",
    ]);
  });
});
