import { describe, expect, test } from "vitest";
import { computeTradeValue, roundTo, valueDiscrepancy } from "../convex/lib/money";
import { amountInWords, display, formatMoney, formatQuantity } from "../convex/lib/format";
import { hasPermission } from "../convex/lib/roles";
import { canTransitionContract, canTransitionTrade, checklistProgress } from "../convex/lib/workflow";
import {
  buildContractVariables,
  renderContract,
  renderTemplate,
  validateTemplateText,
} from "../convex/lib/templateEngine";
import { applyDefaults, defaultsFromCounterparty, markOverridden } from "../convex/lib/inheritance";
import { blockingIssues, resolveTotalValue } from "../convex/lib/tradeValidation";

describe("money", () => {
  test("trade value = quantity × price, rounded to cents", () => {
    expect(computeTradeValue(200, 1890)).toBe(378000);
    expect(computeTradeValue(100.8, 2215)).toBe(223272);
    expect(computeTradeValue(0.1, 0.2)).toBe(0.02);
    expect(computeTradeValue(undefined, 5)).toBeUndefined();
  });
  test("rounding avoids float drift", () => {
    expect(roundTo(1.005, 2)).toBe(1.01);
    expect(roundTo(806.4 * 2350, 2)).toBe(1895040);
  });
  test("flags discrepancies between stored value and qty × price", () => {
    expect(valueDiscrepancy(200, 1890, 378000)).toBeNull();
    expect(valueDiscrepancy(200, 1890, 380000)).toBe(2000);
  });
});

describe("formatting", () => {
  test("never renders undefined", () => {
    expect(display(undefined)).toBe("—");
    expect(display("  ")).toBe("—");
    expect(formatMoney(undefined, "USD")).toBe("—");
  });
  test("currency and quantity", () => {
    expect(formatMoney(378000, "USD")).toBe("USD 378,000.00");
    expect(formatQuantity(100.8, "MT")).toBe("100.8 MT");
    expect(amountInWords(378000.5, "USD")).toBe("USD Three Hundred Seventy-Eight Thousand and Cents Fifty Only");
  });
});

describe("permissions", () => {
  test("role matrix", () => {
    const staff = { role: "staff" as const, status: "active" as const };
    const manager = { role: "manager" as const, status: "active" as const };
    expect(hasPermission(staff, "trade.create")).toBe(true);
    expect(hasPermission(staff, "trade.confirm")).toBe(false);
    expect(hasPermission(manager, "trade.confirm")).toBe(true);
    expect(hasPermission(manager, "users.manage")).toBe(false);
    expect(hasPermission({ ...manager, grants: ["masters.manage"] }, "masters.manage")).toBe(true);
    expect(hasPermission({ ...manager, grants: ["users.manage"] }, "users.manage")).toBe(false);
  });
  test("inactive or pending users have no permissions", () => {
    expect(hasPermission({ role: "admin", status: "pending" }, "trade.create")).toBe(false);
    expect(hasPermission({ role: "admin", status: "disabled" }, "trade.create")).toBe(false);
    expect(hasPermission(null, "trade.create")).toBe(false);
  });
});

describe("workflow", () => {
  test("trade transitions", () => {
    expect(canTransitionTrade("draft", "confirmed")?.permission).toBe("trade.confirm");
    expect(canTransitionTrade("cancelled", "confirmed")).toBeNull();
    expect(canTransitionTrade("closed", "draft")).toBeNull();
  });
  test("contracts cannot skip issue", () => {
    expect(canTransitionContract("draft", "sent")).toBeNull();
    expect(canTransitionContract("generated", "sent")).not.toBeNull();
  });
  test("checklist completion is computed from items", () => {
    expect(
      checklistProgress([{ status: "complete" }, { status: "blocked" }, { status: "pending" }, { status: "complete" }]),
    ).toEqual({ total: 4, complete: 2, blocked: 1, percent: 50 });
    expect(checklistProgress([]).percent).toBe(0);
  });
});

describe("template engine", () => {
  test("renders known variables and flags unknown/missing ones", () => {
    const r = renderTemplate("{{commodity}} / {{foo}} / {{incoterm}}", { commodity: "Rice", incoterm: "" });
    expect(r.output).toBe("Rice / [[unknown: foo]] / [[missing: incoterm]]");
    expect(r.unknown).toEqual(["foo"]);
    expect(r.missing).toEqual(["incoterm"]);
  });
  test("optional variables render as a dash", () => {
    expect(renderTemplate("{{otherConditions}}", {}).output).toBe("—");
  });
  test("validateTemplateText", () => {
    expect(validateTemplateText(["{{tradeNumber}} {{nope}}"])).toEqual(["nope"]);
  });
  test("contract variables come from trade data and exclude internal notes", () => {
    const vars = buildContractVariables({
      contractNumber: "CTR-2026-0001",
      contractVersion: 1,
      trade: {
        tradeNumber: "TRD-2026-0017",
        tradeDate: "2026-09-18",
        direction: "sales",
        quantity: 200,
        uom: "MT",
        pricePerUom: 1890,
        currency: "USD",
        totalValue: 378000,
        incoterm: "CIF",
        // @ts-expect-error internal notes are not part of the contract input type
        internalNotes: "secret margin note",
      },
      company: { name: "Demo Trading Co." },
      counterparty: { name: "Buyer Ltd", country: "Malaysia" },
      commodity: { name: "Natural Rubber", code: "CUPLUMP65" },
    });
    expect(vars.buyerName).toBe("Buyer Ltd");
    expect(vars.sellerName).toBe("Demo Trading Co.");
    expect(vars.totalValue).toBe("USD 378,000.00");
    expect(vars.tradeDate).toBe("18 Sep 2026");
    expect(Object.values(vars).join(" ")).not.toContain("secret margin note");
    const rendered = renderContract(
      { title: "SALES CONTRACT {{contractNumber}}", clauses: [{ heading: "Quantity", body: "{{quantity}}" }] },
      vars,
    );
    expect(rendered.title).toBe("SALES CONTRACT CTR-2026-0001");
    expect(rendered.clauses[0].body).toBe("200 MT");
  });
});

describe("supplier default inheritance", () => {
  test("fills empty fields and never clobbers user-typed values", () => {
    const suggested = defaultsFromCounterparty(
      { defaultCurrency: "USD", defaultIncoterm: "CIF", defaultPaymentTerm: "D/P at Sight", bankName: "DBS" },
      "purchase",
    );
    const { patch, inheritedFields } = applyDefaults({ incoterm: "FOB" }, suggested);
    expect(patch.currency).toBe("USD");
    expect(patch.incoterm).toBeUndefined();
    expect(patch.sellerBankDetails).toContain("DBS");
    expect(inheritedFields).toContain("currency");
    expect(markOverridden(inheritedFields, "currency")).not.toContain("currency");
  });
  test("re-applies to previously inherited fields when the supplier changes", () => {
    const first = applyDefaults({}, { currency: "INR" });
    const second = applyDefaults({ ...first.patch, inheritedFields: first.inheritedFields }, { currency: "USD" });
    expect(second.patch.currency).toBe("USD");
  });
});

describe("trade validation", () => {
  test("incomplete drafts cannot pass", () => {
    expect(blockingIssues({}).length).toBeGreaterThan(5);
  });
  test("historical totals are preserved when unit price needs validation", () => {
    expect(resolveTotalValue({ priceNeedsValidation: true, totalValue: 5_000_000, quantity: 5000 })).toBe(5_000_000);
    expect(resolveTotalValue({ quantity: 10, pricePerUom: 2.5 })).toBe(25);
  });
});
