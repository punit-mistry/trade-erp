import { describe, expect, test } from "vitest";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { tradeSearchText } from "../convex/lib/search";
import { asUser, makeTest, type TestConvex } from "./helpers";

const baseInput = {
  name: "Golden Agro Exports Pte",
  type: "international" as const,
  country: "Singapore",
  roles: ["supplier" as const, "seller" as const],
  defaultCurrency: "USD",
  defaultPaymentTerm: "D/P at Sight",
  defaultIncoterm: "CIF",
};

async function insertTradeFor(t: TestConvex, userId: Id<"users">, counterpartyId: Id<"counterparties">, status: "draft" | "closed") {
  return await t.run((ctx) =>
    ctx.db.insert("trades", {
      tradeNumber: `TRD-2026-${Math.floor(Math.random() * 9000 + 1000)}`,
      status,
      direction: "purchase",
      counterpartyId,
      counterpartyName: baseInput.name,
      currency: "USD",
      incoterm: "CIF",
      paymentTerm: "D/P at Sight",
      searchText: tradeSearchText({ tradeNumber: "x", counterpartyName: baseInput.name }),
      createdBy: userId,
      updatedAt: Date.now(),
    }),
  );
}

describe("suppliers / counterparties", () => {
  test("create assigns a code and appears in the listing and search", async () => {
    const t = makeTest();
    const { client } = await asUser(t, "staff");
    const id = await client.mutation(api.counterparties.create, { input: baseInput });
    const cp = await client.query(api.counterparties.get, { id });
    expect(cp.code).toMatch(/^CP-\d{4}$/);
    expect(cp.status).toBe("active");

    const page = await client.query(api.counterparties.list, { paginationOpts: { numItems: 25, cursor: null } });
    expect(page.page.map((r: { _id: string }) => r._id)).toContain(id);

    const found = await client.query(api.counterparties.searchForPicker, { search: "golden" });
    expect(found.map((r) => r._id)).toContain(id);
  });

  test("duplicate names are reported", async () => {
    const t = makeTest();
    const { client } = await asUser(t, "manager");
    await client.mutation(api.counterparties.create, { input: baseInput });
    const dups = await client.query(api.counterparties.checkDuplicates, { name: "golden agro exports pte" });
    expect(dups.length).toBe(1);
  });

  test("staff cannot edit a supplier created by someone else; managers can", async () => {
    const t = makeTest();
    const { client: staffA } = await asUser(t, "staff");
    const { client: staffB } = await asUser(t, "staff");
    const { client: manager } = await asUser(t, "manager");
    const id = await staffA.mutation(api.counterparties.create, { input: baseInput });
    await expect(
      staffB.mutation(api.counterparties.update, { id, input: { ...baseInput, defaultCurrency: "EUR" } }),
    ).rejects.toThrow(/access denied/i);
    await manager.mutation(api.counterparties.update, { id, input: { ...baseInput, defaultCurrency: "EUR" } });
    expect((await manager.query(api.counterparties.get, { id })).defaultCurrency).toBe("EUR");
  });

  test("changing supplier defaults never changes existing trades; renames refresh labels only", async () => {
    const t = makeTest();
    const { client, userId } = await asUser(t, "manager");
    const id = await client.mutation(api.counterparties.create, { input: baseInput });
    const tradeId = await insertTradeFor(t, userId, id, "closed");
    await client.mutation(api.counterparties.update, {
      id,
      input: { ...baseInput, name: "Golden Agro Exports Pte Ltd", defaultCurrency: "EUR", defaultIncoterm: "FOB" },
    });
    const trade = await t.run((ctx) => ctx.db.get(tradeId));
    expect(trade?.currency).toBe("USD");
    expect(trade?.incoterm).toBe("CIF");
    expect(trade?.counterpartyName).toBe("Golden Agro Exports Pte Ltd");
  });

  test("archive is manager-only and blocked while open trades exist", async () => {
    const t = makeTest();
    const { client: staff } = await asUser(t, "staff");
    const { client: manager, userId } = await asUser(t, "manager");
    const id = await manager.mutation(api.counterparties.create, { input: baseInput });
    await expect(staff.mutation(api.counterparties.archive, { id })).rejects.toThrow(/access denied/i);
    await insertTradeFor(t, userId, id, "draft");
    await expect(manager.mutation(api.counterparties.archive, { id })).rejects.toThrow();
  });

  test("CSV import skips duplicates and reports per-row results", async () => {
    const t = makeTest();
    const { client } = await asUser(t, "manager");
    await client.mutation(api.counterparties.create, { input: baseInput });
    const result = await client.mutation(api.counterparties.importCsv, {
      rows: [baseInput, { ...baseInput, name: "Meridian Commodities LLC", country: "UAE" }],
    });
    const statuses = result.map((r) => r.status);
    expect(statuses).toContain("created");
    expect(statuses.some((s) => s !== "created")).toBe(true);
  });
});
