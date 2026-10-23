import { describe, expect, test } from "vitest";
import { normaliseContainerType, normaliseTradeExtraction } from "../convex/lib/ai";
import { buildBlDraft } from "../convex/lib/blDraft";
import { defaultsFromCompany, defaultsFromCounterparty } from "../convex/lib/inheritance";
import { containersText, packingBreakdown, quantityInMt } from "../convex/lib/shipment";
import { buildContractVariables, renderTemplate } from "../convex/lib/templateEngine";
import { validateTrade, type TradeForValidation } from "../convex/lib/tradeValidation";

// The SI template from the shipment-document index: 5 x 20' with 576 bales of 35 kg,
// 16 pallets and a 560 kg packing add-on per container.
const SI_EXAMPLE = {
  containerCount: 5,
  containerType: "20' ST",
  packagesPerContainer: 576,
  packageNetKg: 35,
  palletsPerContainer: 16,
  packingKgPerContainer: 560,
};

describe("packing breakdown", () => {
  test("matches the SI arithmetic (bales x kg, + packing add-on, / 1000)", () => {
    expect(packingBreakdown(SI_EXAMPLE)).toEqual({
      totalPackages: 2880,
      totalPallets: 80,
      netKgPerContainer: 20160,
      grossKgPerContainer: 20720,
      totalNetKg: 100800,
      totalGrossKg: 103600,
      netMt: 100.8,
    });
  });
  test("only derives values whose inputs are present", () => {
    expect(packingBreakdown({ containerCount: 2 })).toEqual({});
    expect(packingBreakdown({ packagesPerContainer: 576, packageNetKg: 35 })).toEqual({ netKgPerContainer: 20160 });
  });
  test("container text and MT conversion", () => {
    expect(containersText(SI_EXAMPLE)).toBe("5 x 20' ST");
    expect(containersText({})).toBe("");
    expect(quantityInMt(100.8, "MT")).toBe(100.8);
    expect(quantityInMt(100800, "kg")).toBe(100.8);
    expect(quantityInMt(10, "BALE")).toBeUndefined();
  });
});

const base: TradeForValidation = {
  direction: "sales",
  quantity: 100.8,
  uom: "MT",
  dischargeLocation: "Callao, Peru",
  contractTemplateId: "x" as never,
};
const warningsFor = (t: TradeForValidation, field: string) =>
  validateTrade(t).filter((i) => i.field === field && i.severity === "warning");

describe("shipment validation (warnings only)", () => {
  test("packing that matches the quantity raises nothing", () => {
    expect(warningsFor({ ...base, ...SI_EXAMPLE }, "packagesPerContainer")).toEqual([]);
  });
  test("packing that disagrees with the quantity is flagged, noting tolerance", () => {
    const off = warningsFor({ ...base, ...SI_EXAMPLE, containerCount: 4 }, "packagesPerContainer");
    expect(off).toHaveLength(1);
    expect(off[0].message).toContain("80.64 MT");
    expect(off[0].message).not.toContain("tolerance");
    const within = warningsFor({ ...base, ...SI_EXAMPLE, quantity: 100, tolerancePct: 5 }, "packagesPerContainer");
    expect(within[0].message).toContain("within the agreed tolerance");
  });
  test("LC sale needs an LC number; sales basis is for sales trades", () => {
    expect(warningsFor({ ...base, salesBasis: "lc" }, "lcNumber")).toHaveLength(1);
    expect(warningsFor({ ...base, salesBasis: "lc", lcNumber: "LC-1" }, "lcNumber")).toHaveLength(0);
    expect(warningsFor({ ...base, direction: "purchase", salesBasis: "non_lc" }, "salesBasis")).toHaveLength(1);
  });
  test("place of delivery equal to the discharge port is flagged", () => {
    expect(warningsFor({ ...base, placeOfDelivery: "callao, peru " }, "placeOfDelivery")).toHaveLength(1);
    expect(warningsFor({ ...base, placeOfDelivery: "Lima" }, "placeOfDelivery")).toHaveLength(0);
  });
  test("none of the new rules block submission", () => {
    const issues = validateTrade({ ...base, ...SI_EXAMPLE, containerCount: 1, salesBasis: "lc", placeOfDelivery: "Callao, Peru" });
    const newFields = ["packagesPerContainer", "lcNumber", "placeOfDelivery", "salesBasis"];
    expect(issues.filter((i) => newFields.includes(i.field) && i.severity === "error")).toEqual([]);
  });
});

describe("B/L party defaults", () => {
  const buyer = { name: "Conte Group S.A.C.", address: "Av. Separadora Industrial 2160", city: "Lima", country: "Peru" };
  const us = { name: "Sai Commodities Ltd", address: "20 Barclay Road", city: "Croydon", postalCode: "CR0 1JN", country: "United Kingdom" };
  test("on sales the buyer is consignee and notify, and we are also notified", () => {
    const cp = defaultsFromCounterparty(buyer, "sales");
    expect(cp.consignee).toMatch(/^Conte Group S\.A\.C\.\n.*Lima/);
    expect(cp.notifyParty).toBe(cp.consignee);
    expect(defaultsFromCompany(us, "sales").alsoNotifyParty).toMatch(/^Sai Commodities Ltd\n.*Croydon/);
    expect(defaultsFromCompany(us, "sales").freightPayableBy).toBe("Sai Commodities Ltd");
  });
  test("purchases get no party defaults", () => {
    expect(defaultsFromCounterparty(buyer, "purchase").consignee).toBeUndefined();
    expect(defaultsFromCompany(us, "purchase").alsoNotifyParty).toBeUndefined();
  });
});

describe("contract variables", () => {
  test("shipment variables render, and stay optional when blank", () => {
    const input = {
      contractNumber: "SAI/TSR/001/2026",
      contractVersion: 1,
      company: { name: "Sai Commodities Ltd" },
      counterparty: { name: "Conte Group S.A.C." },
      commodity: { name: "Natural Rubber TSR10" },
    };
    const vars = buildContractVariables({
      ...input,
      trade: { tradeNumber: "TRD-2026-0001", direction: "sales", salesBasis: "lc", lcNumber: "LC-9", consignee: "TO ORDER", packageType: "bales", ...SI_EXAMPLE },
    });
    expect(vars).toMatchObject({
      salesBasis: "Letter of credit (LC)",
      lcNumber: "LC-9",
      consignee: "TO ORDER",
      containers: "5 x 20' ST",
      totalPackages: "2,880 BALES",
      packageType: "BALES",
      netWeight: "100,800 kg",
      grossWeight: "103,600 kg",
    });
    const empty = buildContractVariables({ ...input, trade: { tradeNumber: "TRD-2026-0002" } });
    const r = renderTemplate("{{containers}} {{consignee}} {{lcNumber}}", empty);
    expect(r.missing).toEqual([]);
    expect(r.unknown).toEqual([]);
  });
});

describe("B/L draft from a trade (SI box rules)", () => {
  const company = { name: "Sai Commodities Ltd", address: "20 Barclay Road", city: "Croydon", postalCode: "CR0 1JN", country: "United Kingdom" };
  const buyer = { name: "Conte Group S.A.C.", city: "Lima", country: "Peru" };
  const commodity = { name: "NATURAL RUBBER TSR10", hsCode: "40012200" };
  const trade = {
    direction: "sales" as const,
    loadingLocation: "Abidjan",
    dischargeLocation: "Callao",
    placeOfReceipt: "Abidjan",
    placeOfDelivery: "callao ",
    origin: "Ivory Coast",
    quantity: 100.8,
    uom: "MT",
    freightTerms: "Freight Prepaid",
    freightPayableAt: "London",
    originalBlCount: 3,
    ...SI_EXAMPLE,
  };

  test("back-to-back sale: factory ships on behalf of us; buyer is consignee and notify", () => {
    const d = buildBlDraft({
      trade,
      company,
      counterparty: buyer,
      commodity,
      purchase: { supplier: { name: "Union Rubber" }, manufacturer: "UNION RUBBER SIKENSI" },
      contractNumber: "SAI/TSR/001/2026",
    });
    expect(d.shipper).toMatch(/^UNION RUBBER SIKENSI ON BEHALF OF Sai Commodities Ltd\n20 Barclay Road/);
    expect(d.consignee).toMatch(/^Conte Group S\.A\.C\./);
    expect(d.notifyParty).toBe(d.consignee);
    expect(d.placeOfReceipt).toBe("Abidjan");
    expect(d.placeOfDelivery).toBeUndefined(); // same as POD → blank
    expect(d.goodsDescription).toContain("5 x 20' ST SAID TO CONTAIN 2,880 PACKAGES OF NATURAL RUBBER TSR10");
    expect(d.goodsDescription).toContain("IN 80 PALLETS");
    expect(d.goodsDescription).toContain("CONTRACT NO.: SAI/TSR/001/2026");
    expect(d).toMatchObject({ netWeight: 100800, grossWeight: 103600, weightUnit: "KGS", packages: "2,880 PACKAGES" });
    expect(d).toMatchObject({ freightTerms: "Freight Prepaid", freightPayableAt: "London", originalsCount: 3 });
  });

  test("package and pallet wording and freight payer follow the SI", () => {
    const d = buildBlDraft({
      trade: { ...trade, packageType: "Bales", palletType: "shrink wrapped plastic pallet base", freightPayableBy: "SAI COMMODITIES LTD" },
      company,
      counterparty: buyer,
      commodity,
      purchase: null,
    });
    expect(d.goodsDescription).toContain("5 x 20' ST SAID TO CONTAIN 2,880 BALES OF NATURAL RUBBER TSR10");
    expect(d.goodsDescription).toContain("IN 80 SHRINK WRAPPED PLASTIC PALLET BASE");
    expect(d.packages).toBe("2,880 BALES");
    expect(d.freightPayableBy).toBe("SAI COMMODITIES LTD");
  });

  test("trade parties win over defaults; LC number is quoted on LC sales", () => {
    const d = buildBlDraft({
      trade: { ...trade, consignee: "TO ORDER OF BCP", alsoNotifyParty: "Sai Commodities Ltd", salesBasis: "lc", lcNumber: "LC-9", buyerReference: "PO-1", placeOfDelivery: "Lima" },
      company,
      counterparty: buyer,
      commodity,
      purchase: null,
    });
    expect(d.consignee).toBe("TO ORDER OF BCP");
    expect(d.alsoNotifyParty).toBe("Sai Commodities Ltd");
    expect(d.goodsDescription).toContain("LC NO.: LC-9");
    expect(d.goodsDescription).not.toContain("PO NO.");
    expect(d.placeOfDelivery).toBe("Lima");
    expect(d.shipper).toMatch(/^Sai Commodities Ltd/); // no linked purchase → seller (us)
  });

  test("purchase trade: supplier is the shipper, we are consignee", () => {
    const d = buildBlDraft({ trade: { direction: "purchase" }, company, counterparty: { name: "Union Rubber" }, commodity: null, purchase: null });
    expect(d.shipper).toBe("Union Rubber");
    expect(d.consignee).toMatch(/^Sai Commodities Ltd/);
    expect(d.weightUnit).toBeUndefined();
  });
});

describe("AI extraction of shipment fields", () => {
  test("container types are normalised to the picker values", () => {
    expect(normaliseContainerType("20ft")).toBe("20' ST");
    expect(normaliseContainerType("40' HQ")).toBe("40' HC");
    expect(normaliseContainerType("1 x 20 GP")).toBe("20' ST");
    expect(normaliseContainerType("40 reefer")).toBe("40' RF");
    expect(normaliseContainerType("container")).toBeUndefined();
  });
  test("counts must be whole numbers; package weight positive; freight mapped", () => {
    const out = normaliseTradeExtraction({
      fields: {
        containerCount: { value: "5", confidence: 0.9 },
        packagesPerContainer: { value: "576.5" },
        packageNetKg: { value: "35 kg" },
        originalBlCount: { value: "3/3" },
        freightTerms: { value: "FREIGHT PREPAID" },
        containerType: { value: "20ft" },
        consignee: { value: "TO ORDER OF  BANCO\nDE CREDITO" },
        packageType: { value: "bale" },
        palletType: { value: "Plastic pallet base" },
      },
    });
    expect(out.fields.containerCount?.value).toBe(5);
    expect(out.fields.packagesPerContainer).toBeUndefined();
    expect(out.fields.packageNetKg?.value).toBe(35);
    expect(out.fields.freightTerms?.value).toBe("Freight Prepaid");
    expect(out.fields.containerType?.value).toBe("20' ST");
    expect(out.fields.consignee?.value).toBe("TO ORDER OF BANCO DE CREDITO");
    expect(out.fields.packageType?.value).toBe("BALES");
    expect(out.fields.palletType?.value).toBe("PLASTIC PALLET BASE");
    expect(out.dropped).toContain("packagesPerContainer");
    // "3/3" has no single number → dropped rather than guessed as 33
    expect(out.fields.originalBlCount).toBeUndefined();
  });
});
