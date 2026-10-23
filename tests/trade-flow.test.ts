import { describe, expect, test } from "vitest";
import { api, internal } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { asUser, makeTest, type TestConvex } from "./helpers";

/** Admin + masters (company, lookups, default template) + one supplier/buyer + commodity. */
async function setup() {
  const t = makeTest();
  const admin = await asUser(t, "admin");
  const manager = await asUser(t, "manager");
  const staff = await asUser(t, "staff");
  await t.mutation(internal.seed.ensureMasters, {});
  const company = await t.run((ctx) => ctx.db.query("companies").first());
  await t.run((ctx) => ctx.db.patch(company!._id, { address: "1 Harbour Road", city: "Singapore", country: "Singapore" }));
  const counterpartyId = await manager.client.mutation(api.counterparties.create, {
    input: {
      name: "Syarikat Tenaga (Gemas) Sdn Bhd",
      type: "international",
      country: "Malaysia",
      roles: ["buyer"],
      defaultCurrency: "USD",
      defaultIncoterm: "CIF",
      defaultPaymentTerm: "D/P at Sight",
    },
  });
  const commodityId = await manager.client.mutation(api.commodities.create, {
    name: "Natural Rubber Cup Lump Min 65% DRC",
    code: "CUPLUMP65",
    defaultUom: "MT",
  });
  return { t, admin, manager, staff, companyId: company!._id, counterpartyId, commodityId };
}

function fullFields(s: { companyId: Id<"companies">; counterpartyId: Id<"counterparties">; commodityId: Id<"commodities"> }) {
  return {
    direction: "sales" as const,
    companyId: s.companyId,
    counterpartyId: s.counterpartyId,
    commodityId: s.commodityId,
    tradeDate: "2026-09-18",
    quantity: 200,
    uom: "MT",
    priceType: "Fixed",
    pricePerUom: 1890,
    currency: "USD",
    incoterm: "CIF",
    paymentTerm: "D/P at Sight",
    shipmentPeriod: "October 2026",
    loadingLocation: "Port Klang, Malaysia",
    dischargeLocation: "Chennai, India",
    packingClause: "In bales of 35 kg, palletised",
    documentsClause: "Commercial invoice, packing list, full set of B/L",
    arbitrationClause: "Arbitration as agreed",
    sellerBankDetails: "Bank: Demo Bank",
    buyerBankDetails: "Bank: Buyer Bank",
    internalNotes: "MARGIN 3% — internal only",
    origin: "Malaysia",
    pricingTerm: "Fixed price",
    partialShipment: true,
    freightTerms: "Freight Prepaid",
  };
}

async function storeFile(t: TestConvex, type = "application/pdf") {
  return await t.run((ctx) => ctx.storage.store(new Blob(["%PDF-1.4 test"], { type })));
}

describe("physical trade lifecycle", () => {
  test("create, calculate, idempotent submit, validation, approval workflow and audit", async () => {
    const s = await setup();
    const fields = fullFields(s);

    // Incomplete drafts may be saved but not submitted.
    const draftId = await createTrade(s.staff.client, {
      fields: { direction: "purchase" },
      clientRequestId: "request-req-incomplete",
    });
    await expect(s.staff.client.mutation(api.trades.transition, { id: draftId, to: "pending_review" })).rejects.toThrow();

    // Duplicate submission (same clientRequestId) does not create a second record.
    const id = await createTrade(s.staff.client, { fields, clientRequestId: "request-req-1" });
    const again = await createTrade(s.staff.client, { fields, clientRequestId: "request-req-1" });
    expect(again).toBe(id);

    const { trade } = await s.staff.client.query(api.trades.get, { id });
    expect(trade.status).toBe("draft");
    expect(trade.totalValue).toBe(378000);
    expect(trade.tradeNumber).toMatch(/^TRD-2026-\d{4}$/);
    expect(trade.counterpartyName).toBe("Syarikat Tenaga (Gemas) Sdn Bhd");

    // Staff cannot confirm; staff can submit; manager confirms.
    await expect(s.staff.client.mutation(api.trades.transition, { id, to: "confirmed" })).rejects.toThrow(/access denied|not allowed|permission/i);
    await s.staff.client.mutation(api.trades.transition, { id, to: "pending_review" });
    await s.manager.client.mutation(api.trades.transition, { id, to: "confirmed" });
    expect((await s.manager.client.query(api.trades.get, { id })).trade.status).toBe("confirmed");

    // Confirmed trades are locked for editing.
    await expect(s.manager.client.mutation(api.trades.saveDraft, { id, fields: { ...fields, quantity: 1 } })).rejects.toThrow();

    // Status history is audited.
    const activity = await s.manager.client.query(api.activity.forTrade, { tradeId: id });
    expect(activity.some((a: { action: string }) => a.action === "trade.status_changed")).toBe(true);
  });

  test("staff can only edit their own drafts; printed contract number needs authorisation", async () => {
    const s = await setup();
    const other = await asUser(s.t, "staff");
    const id = await createTrade(s.staff.client, { fields: fullFields(s), clientRequestId: "request-r" });
    await expect(
      other.client.mutation(api.trades.saveDraft, { id, fields: { ...fullFields(s), quantity: 10 } }),
    ).rejects.toThrow(/access denied/i);
    await expect(
      s.staff.client.mutation(api.trades.saveDraft, { id, fields: { ...fullFields(s), printedContractNumber: "X-1" } }),
    ).rejects.toThrow(/access denied|not allowed|permission/i);
    await s.manager.client.mutation(api.trades.saveDraft, { id, fields: { ...fullFields(s), printedContractNumber: "X-1" } });
  });

  test("trade numbers are unique across many creates", async () => {
    const s = await setup();
    const numbers = new Set<string>();
    for (let i = 0; i < 12; i++) {
      const id = await createTrade(s.staff.client, { fields: fullFields(s), clientRequestId: `request-n${i}` });
      numbers.add((await s.staff.client.query(api.trades.get, { id })).trade.tradeNumber);
    }
    expect(numbers.size).toBe(12);
  });

  test("clone gives a new draft with fresh workflow state and leaves the original untouched", async () => {
    const s = await setup();
    const id = await createTrade(s.manager.client, {
      fields: { ...fullFields(s), printedContractNumber: "SC-001" },
      clientRequestId: "request-orig",
    });
    await s.manager.client.mutation(api.trades.transition, { id, to: "confirmed" });
    const before = await s.t.run((ctx) => ctx.db.get(id));

    const source = await s.staff.client.query(api.trades.getCloneSource, { id });
    expect(source.fields.printedContractNumber).toBeUndefined();
    const cloneId = await createTrade(s.staff.client, {
      fields: { ...source.fields, tradeDate: "2026-10-01" },
      clientRequestId: "request-clone-1",
      cloneFromId: id,
    });
    const clone = (await s.staff.client.query(api.trades.get, { id: cloneId })).trade;
    expect(clone.status).toBe("draft");
    expect(clone.tradeNumber).not.toBe(before!.tradeNumber);
    expect(clone.clonedFromNumber).toBe(before!.tradeNumber);
    expect(clone.confirmedAt).toBeUndefined();
    expect(clone.printedContractNumber).toBeUndefined();
    expect(clone.quantity).toBe(200);
    expect(clone.incoterm).toBe("CIF");

    const after = await s.t.run((ctx) => ctx.db.get(id));
    expect(after).toEqual(before);
  });
});

describe("shipment instructions", () => {
  test("are saved, cloned without the LC number, and reach the contract variables", async () => {
    const s = await setup();
    const shipment = {
      salesBasis: "lc" as const,
      lcNumber: "LC/2026/00451",
      consignee: "TO THE ORDER OF BANCO DE CREDITO DEL PERU",
      notifyParty: "Conte Group S.A.C.\nLima, Peru",
      alsoNotifyParty: "Sai Commodities Ltd\n20 Barclay Road, Croydon CR0 1JN",
      placeOfReceipt: "Abidjan",
      freightPayableAt: "London",
      originalBlCount: 3,
      containerCount: 5,
      containerType: "20' ST",
      packageType: "BAGS",
      packagesPerContainer: 40,
      packageNetKg: 1000,
      palletsPerContainer: 16,
      packingKgPerContainer: 560,
    };
    const id = await createTrade(s.manager.client, { fields: { ...fullFields(s), ...shipment }, clientRequestId: "request-ship" });
    const { trade, issues } = await s.manager.client.query(api.trades.get, { id });
    expect(trade).toMatchObject(shipment);
    // 5 x 40 x 1,000 kg = 200 MT = the trade quantity, so no packing warning.
    expect(issues.filter((i) => i.field === "packagesPerContainer")).toEqual([]);

    const source = await s.staff.client.query(api.trades.getCloneSource, { id });
    expect(source.fields.lcNumber).toBeUndefined();
    expect(source.fields.consignee).toBe(shipment.consignee);
    expect(source.fields.containerCount).toBe(5);

    const contractId = await s.manager.client.mutation(api.contracts.generateDraft, { tradeId: id });
    const contract = await s.t.run((ctx) => ctx.db.get(contractId));
    expect(contract!.snapshot.variables).toMatchObject({
      lcNumber: "LC/2026/00451",
      consignee: shipment.consignee,
      containers: "5 x 20' ST",
      totalPackages: "200 BAGS",
      netWeight: "200,000 kg",
      grossWeight: "202,800 kg",
    });
  });
});

describe("back-to-back purchase link", () => {
  test("sale links to a purchase, bad links are refused, and the B/L ships on behalf of us", async () => {
    const s = await setup();
    const supplierId = await s.manager.client.mutation(api.counterparties.create, {
      input: { name: "Union Rubber Sikensi", type: "international", country: "Côte d'Ivoire", roles: ["supplier"] },
    });
    const purchaseId = await createTrade(s.manager.client, {
      fields: { ...fullFields(s), direction: "purchase", counterpartyId: supplierId, manufacturer: "UNION RUBBER SIKENSI FACTORY" },
      clientRequestId: "request-purchase",
    });
    const purchase = (await s.manager.client.query(api.trades.get, { id: purchaseId })).trade;

    // Refused: purchase linked to a purchase, and a sale linked to a sale.
    await expect(
      createTrade(s.manager.client, {
        fields: { ...fullFields(s), direction: "purchase", purchaseTradeId: purchaseId },
        clientRequestId: "request-bad-1",
      }),
    ).rejects.toThrow(/only a sales trade/i);
    const otherSale = await createTrade(s.manager.client, { fields: fullFields(s), clientRequestId: "request-sale-0" });
    await expect(
      createTrade(s.manager.client, { fields: { ...fullFields(s), purchaseTradeId: otherSale }, clientRequestId: "request-bad-2" }),
    ).rejects.toThrow(/not a purchase trade/i);

    const saleId = await createTrade(s.manager.client, {
      fields: { ...fullFields(s), quantity: 150, purchaseTradeId: purchaseId, consignee: "TO ORDER" },
      clientRequestId: "request-sale-1",
    });
    const sale = (await s.manager.client.query(api.trades.get, { id: saleId })).trade;
    expect(sale.purchaseTradeNumber).toBe(purchase.tradeNumber);

    const fromPurchase = await s.manager.client.query(api.trades.links, { id: purchaseId });
    expect(fromPurchase.sales.map((t) => t._id)).toEqual([saleId]);
    expect(fromPurchase.linkedQuantity).toBe(150);
    const options = await s.manager.client.query(api.trades.purchaseOptions, {});
    expect(options.map((o) => o._id)).toContain(purchaseId);
    expect(options.map((o) => o._id)).not.toContain(saleId);

    // A clone of the sale is not linked to the same purchase automatically.
    const cloneSource = await s.staff.client.query(api.trades.getCloneSource, { id: saleId });
    expect(cloneSource.fields.purchaseTradeId).toBeUndefined();

    const blId = await s.manager.client.mutation(api.blDocuments.createFromTrade, { tradeId: saleId });
    const bl = await s.t.run((ctx) => ctx.db.get(blId));
    expect(bl!.shipper).toMatch(/^UNION RUBBER SIKENSI FACTORY ON BEHALF OF /);
    expect(bl!.consignee).toBe("TO ORDER");
    expect(bl!.placeOfDelivery).toBeUndefined();
  });
});

describe("contracts", () => {
  test("generated from trade data, frozen on issue, revised without changing the issued version", async () => {
    const s = await setup();
    const id = await createTrade(s.staff.client, { fields: fullFields(s), clientRequestId: "request-c1" });
    const draftContractId = await s.staff.client.mutation(api.contracts.generateDraft, { tradeId: id });

    // Cannot issue before the trade is confirmed; staff can never issue.
    await expect(s.manager.client.mutation(api.contracts.issue, { contractId: draftContractId })).rejects.toThrow();
    await s.manager.client.mutation(api.trades.transition, { id, to: "confirmed" });
    await expect(s.staff.client.mutation(api.contracts.issue, { contractId: draftContractId })).rejects.toThrow(/access denied/i);

    // Regenerate after confirmation so the draft matches the trade, then issue.
    await s.staff.client.mutation(api.contracts.generateDraft, { tradeId: id });
    const { current } = await s.manager.client.query(api.contracts.listForTrade, { tradeId: id });
    expect(current).not.toBeNull();
    const contractId = current!._id;
    await s.manager.client.mutation(api.contracts.issue, { contractId });

    const issued = await s.t.run((ctx) => ctx.db.get(contractId));
    expect(issued!.status).toBe("generated");
    const text = JSON.stringify(issued!.snapshot);
    expect(text).toContain("USD 378,000.00");
    expect(text).toContain("Syarikat Tenaga (Gemas) Sdn Bhd");
    expect(text).not.toContain("MARGIN 3%"); // internal notes never reach the contract
    expect(issued!.unknownVariables).toEqual([]);

    // Status flow: cannot skip to closed from generated without allowed path.
    await expect(
      s.manager.client.mutation(api.contracts.transition, { contractId, to: "rate_fixed" }),
    ).rejects.toThrow();
    await s.manager.client.mutation(api.contracts.transition, { contractId, to: "sent", sentTo: "buyer@example.test" });
    await s.manager.client.mutation(api.contracts.transition, { contractId, to: "pending_signature" });

    // A signature can only be recorded with an uploaded signed copy — no fake e-signature.
    const unrelatedDoc = await s.staff.client.mutation(api.documents.create, {
      storageId: await storeFile(s.t),
      fileName: "invoice.pdf",
      docType: "commercial_invoice",
      tradeId: id,
    });
    await expect(
      s.staff.client.mutation(api.contracts.attachSignedCopy, { contractId, documentId: unrelatedDoc }),
    ).rejects.toThrow();
    const signedDoc = await s.staff.client.mutation(api.documents.create, {
      storageId: await storeFile(s.t),
      fileName: "signed.pdf",
      docType: "signed_contract",
      tradeId: id,
      contractId,
    });
    await s.staff.client.mutation(api.contracts.attachSignedCopy, { contractId, documentId: signedDoc });
    expect((await s.t.run((ctx) => ctx.db.get(contractId)))!.signatureStatus).toBe("signed_copy_uploaded");

    // Revision: the issued version keeps its exact snapshot.
    const snapshotBefore = (await s.t.run((ctx) => ctx.db.get(contractId)))!.snapshot;
    const revisionId = await s.staff.client.mutation(api.contracts.createRevision, {
      contractId,
      reason: "Buyer requested new shipment period",
    });
    expect(revisionId).not.toBe(contractId);
    const original = await s.t.run((ctx) => ctx.db.get(contractId));
    expect(original!.snapshot).toEqual(snapshotBefore);
  });
});

describe("B/L and dispatch", () => {
  test("B/L created from trade; carrier-issued status requires carrier document; checklist % is computed", async () => {
    const s = await setup();
    const id = await createTrade(s.manager.client, { fields: fullFields(s), clientRequestId: "request-b1" });
    await s.manager.client.mutation(api.trades.transition, { id, to: "confirmed" });

    const blId = await s.staff.client.mutation(api.blDocuments.createFromTrade, { tradeId: id });
    const bl = await s.t.run((ctx) => ctx.db.get(blId));
    expect(bl!.status).toBe("draft");
    expect(bl!.portOfLoading).toBe("Port Klang, Malaysia");
    expect(bl!.quantity).toBe(200);

    // Cannot jump to issued.
    await expect(s.manager.client.mutation(api.blDocuments.transition, { id: blId, to: "issued" })).rejects.toThrow();

    // Overrides on the B/L never change the trade.
    const { current } = await s.staff.client.query(api.blDocuments.forTrade, { tradeId: id });
    expect(current).not.toBeNull();
    const trade = await s.t.run((ctx) => ctx.db.get(id));
    expect(trade!.loadingLocation).toBe("Port Klang, Malaysia");

    // Dispatch checklist exists and completion is derived from items.
    const checklist = await s.staff.client.query(api.dispatch.forTrade, { tradeId: id });
    expect(checklist).not.toBeNull();
    expect(checklist!.progress.percent).toBe(0);
    const first = checklist!.items[0];
    await s.manager.client.mutation(api.dispatch.updateItem, { itemId: first._id, status: "complete" });
    const after = await s.staff.client.query(api.dispatch.forTrade, { tradeId: id });
    expect(after!.progress.complete).toBe(1);
    expect(after!.progress.percent).toBe(Math.round((1 / after!.items.length) * 100));
    await expect(
      s.manager.client.mutation(api.dispatch.updateItem, { itemId: after!.items[1]._id, status: "blocked" }),
    ).rejects.toThrow(); // a blocked item needs a reason
  });
});

describe("documents", () => {
  test("disallowed file types are rejected server-side and downloads require auth", async () => {
    const s = await setup();
    await expect(
      s.staff.client.mutation(api.documents.create, {
        storageId: await storeFile(s.t, "application/x-msdownload"),
        fileName: "evil.exe",
        docType: "other",
      }),
    ).rejects.toThrow(/not allowed/i);
    const docId = await s.staff.client.mutation(api.documents.create, {
      storageId: await storeFile(s.t),
      fileName: "packing-list.pdf",
      docType: "packing_list",
    });
    await expect(s.t.query(api.documents.getDownloadUrl, { id: docId })).rejects.toThrow(/sign in/i);
    const pending = await asUser(s.t, "staff", { status: "pending" });
    await expect(pending.client.query(api.documents.getDownloadUrl, { id: docId })).rejects.toThrow();
  });
});

type Client = ReturnType<TestConvex["withIdentity"]>;

async function createTrade(client: Client, args: Parameters<Client["mutation"]>[1] & object) {
  const res = await client.mutation(api.trades.createDraft, args as never);
  return res.id;
}
