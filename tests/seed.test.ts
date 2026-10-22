import { afterEach, describe, expect, test } from "vitest";
import { internal } from "../convex/_generated/api";
import { asUser, makeTest } from "./helpers";

afterEach(() => {
  delete process.env.ERP_ALLOW_DEMO_SEED;
});

describe("development seed", () => {
  test("demo data refuses to load unless explicitly enabled", async () => {
    const t = makeTest();
    await asUser(t, "admin");
    await expect(t.mutation(internal.seed.loadDemoData, {})).rejects.toThrow(/ERP_ALLOW_DEMO_SEED/);
  });

  test("loads the 17 historical trades without fabricating unit prices, idempotently", async () => {
    process.env.ERP_ALLOW_DEMO_SEED = "true";
    const t = makeTest();
    await asUser(t, "admin");
    await t.mutation(internal.seed.loadDemoData, {});
    await t.mutation(internal.seed.loadDemoData, {}); // second run must not duplicate

    const trades = await t.run((ctx) => ctx.db.query("trades").collect());
    expect(trades).toHaveLength(17);
    const t13 = trades.find((x) => x.tradeNumber === "TRD-2026-0013")!;
    expect(t13.totalValue).toBe(1895040);
    expect(t13.quantity).toBe(806.4);
    expect(t13.pricePerUom).toBeUndefined();
    expect(t13.priceNeedsValidation).toBe(true);
    expect(trades.find((x) => x.tradeNumber === "TRD-2026-0016")?.incoterm).toBe("C.N.F");
    expect(trades.filter((x) => x.status === "cancelled")).toHaveLength(2);
    expect(trades.find((x) => x.tradeNumber === "TRD-2026-0004")?.direction).toBe("purchase");

    const counter = await t.run((ctx) =>
      ctx.db.query("counters").withIndex("by_key", (q) => q.eq("key", "trade:2026")).unique(),
    );
    expect(counter?.value).toBe(17);

    const suppliers = await t.run((ctx) => ctx.db.query("counterparties").collect());
    expect(suppliers.find((s) => s.name === "test")?.contactPerson).toBeUndefined();
    expect(new Set(suppliers.map((s) => s.nameLower)).size).toBe(suppliers.length);
  });
});
