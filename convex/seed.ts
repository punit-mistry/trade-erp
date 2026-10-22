/**
 * Development / setup seed procedures. All are INTERNAL functions — they can
 * only be run by an operator with deployment access, never from the browser:
 *
 *   npx convex run seed:ensureMasters '{"adminEmail":"you@example.com"}'
 *   npx convex env set ERP_ALLOW_DEMO_SEED true        # dev/demo deployments only
 *   npx convex run seed:loadDemoData '{"adminEmail":"you@example.com"}'
 *   npx convex run seed:demoStatus
 *
 * Both mutations are idempotent: records whose natural key already exists
 * (lookup kind+value, company code, counterparty name, commodity code, trade
 * number, existing contract for a trade) are skipped, never overwritten.
 */
import { v } from "convex/values";
import { internalMutation, internalQuery, type MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { logActivity } from "./lib/audit";
import { appError } from "./lib/auth";
import { DEFAULT_LOOKUPS } from "./lib/defaults";
import { bumpSequenceTo, nextContractNumber, nextCounterpartyCode } from "./lib/numbering";
import { commoditySearchText, counterpartySearchText, tradeSearchText } from "./lib/search";
import { DEFAULT_SETTINGS, SETTINGS_KEY, getSettings } from "./lib/settings";
import { buildContractVariables, renderContract } from "./lib/templateEngine";
import type { ContractStatus, LookupKind, TradeStatus } from "./lib/validators";
import { materialiseDefaults } from "./lookups";

const DEMO_COMPANY_CODE = "DEMO";

async function resolveAdmin(ctx: MutationCtx, adminEmail?: string): Promise<Doc<"users">> {
  if (adminEmail) {
    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", adminEmail.trim().toLowerCase()))
      .first();
    if (!user) throw appError("NOT_FOUND", `No user with email ${adminEmail}. Sign up in the app first.`);
    if (user.role !== "admin" || user.status !== "active") {
      throw appError("FORBIDDEN", `${adminEmail} is not an active Admin.`);
    }
    return user;
  }
  const admins = await ctx.db
    .query("users")
    .withIndex("by_role", (q) => q.eq("role", "admin"))
    .take(20);
  const admin = admins.find((a) => a.status === "active");
  if (!admin) {
    throw appError(
      "INVALID",
      "No active Admin exists yet. Open the app and sign up — the first account becomes the Admin — then re-run this command.",
    );
  }
  return admin;
}

// ---------------------------------------------------------------------------
// Default contract template (neutral placeholder wording — configure before use)
// ---------------------------------------------------------------------------

const DEFAULT_TEMPLATE = {
  name: "Standard Physical Trade Contract",
  description:
    "Baseline template seeded for setup. Review all wording with your legal counsel before issuing contracts.",
  title: "{{direction}} Contract",
  header: "{{companyName}}\n{{companyAddress}}",
  intro:
    "Contract No. {{contractNumber}} (version {{contractVersion}}) · Trade ref. {{tradeNumber}} dated {{tradeDate}}\n" +
    "Buyer's reference: {{buyerReference}} dated {{buyerReferenceDate}}\n\n" +
    "This contract is made between {{sellerName}}, {{sellerAddress}} (the \"Seller\") and {{buyerName}}, {{buyerAddress}} (the \"Buyer\"). " +
    "The parties confirm the following terms:",
  clauses: [
    {
      heading: "Commodity",
      body: "{{commodity}}\nHS code: {{hsCode}}\nOrigin of goods: {{originOfGoods}}\nManufacturer / approved factory: {{manufacturer}}",
    },
    { heading: "Quantity", body: "{{quantity}}\nQuantity tolerance: {{tolerance}}" },
    { heading: "Price", body: "{{pricePerUom}} ({{priceType}}), {{incoterm}}\nPricing basis: {{pricingTerm}}" },
    { heading: "Total Contract Value", body: "{{totalValue}}\n({{totalValueWords}})" },
    {
      heading: "Shipment",
      body:
        "Shipment period: {{shipmentPeriod}}\nPort / place of loading: {{loadLocation}}\nPort / place of discharge: {{dischargeLocation}}\n" +
        "Partial shipment: {{partialShipment}}\nContainer loading: {{containerLoading}}\nFreight: {{freightTerms}}",
    },
    { heading: "Packing", body: "{{packingClause}}" },
    { heading: "Payment Terms", body: "{{paymentTerms}}" },
    { heading: "Documents", body: "{{documentsClause}}" },
    { heading: "Bank Details", body: "Seller's bank:\n{{sellerBankDetails}}\n\nBuyer's bank:\n{{buyerBankDetails}}" },
    { heading: "Special Conditions", body: "{{specialConditions}}\n{{otherConditions}}\n{{additionalTerms}}" },
    { heading: "Arbitration", body: "{{arbitrationClause}}" },
  ],
  footer: "For and on behalf of {{companyName}} — {{signatoryName}}, {{signatoryTitle}}",
  numberingFormat: "{prefix}-{year}-{seq}",
  defaultPackingClause: "[Packing terms to be confirmed for this commodity.]",
  defaultDocumentsClause:
    "[List of required shipping documents to be confirmed by the trading desk before issue.]",
  defaultArbitrationClause: "[Arbitration / dispute-resolution wording to be confirmed by legal counsel before use.]",
};

async function ensureDefaultTemplate(ctx: MutationCtx, admin: Doc<"users">) {
  const existing = await ctx.db.query("contractTemplates").first();
  if (existing) {
    const def = await ctx.db
      .query("contractTemplates")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .take(100);
    return { created: false, templateId: (def.find((t) => t.isDefault) ?? def[0] ?? existing)._id };
  }
  const now = Date.now();
  const id = await ctx.db.insert("contractTemplates", {
    ...DEFAULT_TEMPLATE,
    status: "active",
    version: 1,
    familyId: "pending",
    isDefault: true,
    direction: "any",
    createdBy: admin._id,
    updatedAt: now,
  });
  await ctx.db.patch(id, { familyId: id });
  await logActivity(ctx, admin, {
    entityType: "contractTemplate",
    entityId: id,
    entityLabel: DEFAULT_TEMPLATE.name,
    action: "seed.template_created",
    summary: `Seeded default contract template “${DEFAULT_TEMPLATE.name}”`,
  });
  return { created: true, templateId: id };
}

async function ensureMastersImpl(ctx: MutationCtx, admin: Doc<"users">) {
  const summary: Record<string, number | string | boolean> = {};

  const settingsRow = await ctx.db
    .query("settings")
    .withIndex("by_key", (q) => q.eq("key", SETTINGS_KEY))
    .unique();
  if (!settingsRow) {
    await ctx.db.insert("settings", { key: SETTINGS_KEY, ...DEFAULT_SETTINGS, updatedBy: admin._id, updatedAt: Date.now() });
  }
  summary.settingsCreated = !settingsRow;

  let lookupsInserted = 0;
  for (const kind of Object.keys(DEFAULT_LOOKUPS) as LookupKind[]) {
    lookupsInserted += await materialiseDefaults(ctx, kind);
  }
  summary.lookupsInserted = lookupsInserted;

  let company = await ctx.db
    .query("companies")
    .withIndex("by_code", (q) => q.eq("code", DEMO_COMPANY_CODE))
    .first();
  const anyCompany = company ?? (await ctx.db.query("companies").first());
  if (!anyCompany) {
    const id = await ctx.db.insert("companies", {
      name: "Demo Trading Co. (configure in Masters)",
      code: DEMO_COMPANY_CODE,
      baseCurrency: "USD",
      isDefault: true,
      active: true,
      createdBy: admin._id,
      updatedAt: Date.now(),
    });
    company = await ctx.db.get(id);
    await logActivity(ctx, admin, {
      entityType: "company",
      entityId: id,
      entityLabel: "Demo Trading Co.",
      action: "seed.company_created",
      summary: "Seeded placeholder internal company — replace its details in Companies & Masters",
    });
    summary.companyCreated = true;
  } else {
    summary.companyCreated = false;
  }

  const template = await ensureDefaultTemplate(ctx, admin);
  summary.templateCreated = template.created;
  return { summary, companyId: (company ?? anyCompany)!._id, templateId: template.templateId };
}

export const ensureMasters = internalMutation({
  args: { adminEmail: v.optional(v.string()) },
  handler: async (ctx, { adminEmail }) => {
    const admin = await resolveAdmin(ctx, adminEmail);
    const { summary } = await ensureMastersImpl(ctx, admin);
    return summary;
  },
});

// ---------------------------------------------------------------------------
// Demo data (section 15 of the brief)
// ---------------------------------------------------------------------------

type SeedCounterparty = {
  name: string;
  type: "domestic" | "international";
  country?: string;
  roles: ("supplier" | "buyer" | "seller")[];
  defaultCurrency?: string;
  defaultPaymentTerm?: string;
};

// The demo business is India-based (Bharat Agri Works is "Domestic, India"),
// so Indian counterparties are domestic. Country is set only where the name /
// brief makes it unambiguous.
const COUNTERPARTIES: SeedCounterparty[] = [
  { name: "Bharat Agri Works Pvt Ltd", type: "domestic", country: "India", roles: ["supplier"], defaultCurrency: "INR", defaultPaymentTerm: "50% Advance" },
  { name: "Golden Agro Exports Pte", type: "international", country: "Singapore", roles: ["supplier"], defaultCurrency: "USD", defaultPaymentTerm: "D/P at Sight" },
  { name: "Meridian Commodities LLC", type: "international", country: "UAE", roles: ["supplier"], defaultCurrency: "USD", defaultPaymentTerm: "Letter of Credit — 60 days" },
  { name: "test", type: "international", country: "India", roles: ["supplier"], defaultCurrency: "INR", defaultPaymentTerm: "D/P at Sight" },
  { name: "SYARIKAT TENAGA (GEMAS) SDN BHD", type: "international", country: "Malaysia", roles: ["buyer"] },
  { name: "TERRA NUTS GROUP JOINT STOCK COMPANY", type: "international", country: "Vietnam", roles: ["buyer"] },
  { name: "DUY CHU CO., LTD", type: "international", country: "Vietnam", roles: ["buyer"] },
  { name: "MAHANSARIA TYRES PVT. LTD.", type: "domestic", country: "India", roles: ["buyer"] },
  { name: "ÖZKA LASTIK VE KAUCUK SAN. TİC. A.Ş", type: "international", country: "Türkiye", roles: ["buyer"] },
  { name: "Agro Africa Trading", type: "international", roles: ["buyer", "seller"] },
  { name: "Rubber Supplier", type: "international", roles: ["seller", "supplier"] },
];

const COMMODITIES = [
  { code: "CUPLUMP65", name: "NATURAL RUBBER CUP LUMP MIN 65% DRC", defaultUom: "MT" },
  { code: "RCN", name: "Raw Cashew Nuts in Shell, New Crops 2026", defaultUom: "MT" },
  { code: "TSR10", name: "Natural Rubber TSR-10", defaultUom: "MT" },
  { code: "ANNATTO", name: "Annatto Seeds", defaultUom: "MT" },
  { code: "RICE", name: "Rice", defaultUom: "MT" },
  { code: "WOOD", name: "Teak Wood Logs", defaultUom: "CBM" },
  { code: "PEPPER", name: "Black Pepper", defaultUom: "MT" },
];

type SeedTrade = {
  n: number;
  date: string;
  dir: "sales" | "purchase";
  cp: string;
  commodity: string;
  qty: number;
  uom: string;
  value: number;
  incoterm: string;
  status: TradeStatus;
};

const OZKA = "ÖZKA LASTIK VE KAUCUK SAN. TİC. A.Ş";
const TRADES: SeedTrade[] = [
  { n: 17, date: "2026-09-18", dir: "sales", cp: "SYARIKAT TENAGA (GEMAS) SDN BHD", commodity: "CUPLUMP65", qty: 200, uom: "MT", value: 378000, incoterm: "CIF", status: "confirmed" },
  { n: 16, date: "2026-09-17", dir: "sales", cp: "TERRA NUTS GROUP JOINT STOCK COMPANY", commodity: "RCN", qty: 250, uom: "MT", value: 392500, incoterm: "C.N.F", status: "confirmed" },
  { n: 15, date: "2026-09-08", dir: "sales", cp: "DUY CHU CO., LTD", commodity: "RCN", qty: 250, uom: "MT", value: 365000, incoterm: "CIF", status: "cancelled" },
  { n: 14, date: "2026-09-03", dir: "sales", cp: "MAHANSARIA TYRES PVT. LTD.", commodity: "TSR10", qty: 100.8, uom: "MT", value: 223272, incoterm: "CIF", status: "confirmed" },
  { n: 13, date: "2026-09-03", dir: "sales", cp: OZKA, commodity: "TSR10", qty: 806.4, uom: "MT", value: 1895040, incoterm: "CIF", status: "confirmed" },
  { n: 12, date: "2026-09-03", dir: "sales", cp: OZKA, commodity: "ANNATTO", qty: 806.4, uom: "MT", value: 1895040, incoterm: "CIF", status: "draft" },
  { n: 11, date: "2026-09-03", dir: "sales", cp: OZKA, commodity: "ANNATTO", qty: 806.4, uom: "MT", value: 1895040, incoterm: "CIF", status: "draft" },
  { n: 10, date: "2026-09-03", dir: "sales", cp: OZKA, commodity: "ANNATTO", qty: 806.4, uom: "MT", value: 1895040, incoterm: "CIF", status: "draft" },
  { n: 9, date: "2026-09-03", dir: "sales", cp: OZKA, commodity: "ANNATTO", qty: 806.4, uom: "MT", value: 1895040, incoterm: "CIF", status: "draft" },
  { n: 8, date: "2026-09-03", dir: "sales", cp: OZKA, commodity: "ANNATTO", qty: 806.4, uom: "MT", value: 1895040, incoterm: "CIF", status: "draft" },
  { n: 7, date: "2026-09-03", dir: "sales", cp: OZKA, commodity: "ANNATTO", qty: 806.4, uom: "MT", value: 1895040, incoterm: "CIF", status: "draft" },
  { n: 6, date: "2026-09-03", dir: "sales", cp: OZKA, commodity: "TSR10", qty: 806.4, uom: "MT", value: 1895040, incoterm: "CIF", status: "cancelled" },
  { n: 5, date: "2026-09-01", dir: "sales", cp: "Agro Africa Trading", commodity: "RICE", qty: 5000, uom: "MT", value: 5000000, incoterm: "EXW", status: "confirmed" },
  { n: 4, date: "2026-09-01", dir: "purchase", cp: "Agro Africa Trading", commodity: "ANNATTO", qty: 5000, uom: "MT", value: 5000000, incoterm: "CIF", status: "confirmed" },
  { n: 3, date: "2026-09-01", dir: "purchase", cp: "Rubber Supplier", commodity: "WOOD", qty: 20, uom: "CBM", value: 20000, incoterm: "CFR", status: "draft" },
  { n: 2, date: "2026-08-20", dir: "purchase", cp: "Agro Africa Trading", commodity: "PEPPER", qty: 65656, uom: "MT", value: 65656000, incoterm: "EXW", status: "draft" },
  { n: 1, date: "2026-08-06", dir: "purchase", cp: "Rubber Supplier", commodity: "PEPPER", qty: 1000, uom: "MT", value: 1000000, incoterm: "CFR", status: "confirmed" },
];

/** Demo contracts on confirmed trades, to exercise contract statuses on the dashboard. */
const DEMO_CONTRACTS: { tradeNumber: string; status: ContractStatus }[] = [
  { tradeNumber: "TRD-2026-0017", status: "pending_signature" },
  { tradeNumber: "TRD-2026-0014", status: "rate_fixed" },
  { tradeNumber: "TRD-2026-0016", status: "draft" },
];

const tradeNumberOf = (n: number) => `TRD-2026-${String(n).padStart(4, "0")}`;

export const loadDemoData = internalMutation({
  args: { adminEmail: v.optional(v.string()) },
  handler: async (ctx, { adminEmail }) => {
    if (process.env.ERP_ALLOW_DEMO_SEED !== "true") {
      throw appError(
        "FORBIDDEN",
        "Demo data is disabled on this deployment. Only on a development/demo deployment, run: npx convex env set ERP_ALLOW_DEMO_SEED true",
      );
    }
    const admin = await resolveAdmin(ctx, adminEmail);
    const masters = await ensureMastersImpl(ctx, admin);
    const company = await ctx.db.get(masters.companyId);
    if (!company) throw appError("NOT_FOUND", "Internal company missing.");
    const now = Date.now();
    const counts = { counterpartiesCreated: 0, counterpartiesSkipped: 0, commoditiesCreated: 0, commoditiesSkipped: 0, tradesCreated: 0, tradesSkipped: 0, contractsCreated: 0, contractsSkipped: 0 };

    // Counterparties (natural key: lower-cased name)
    const cpIds = new Map<string, Id<"counterparties">>();
    for (const cp of COUNTERPARTIES) {
      const nameLower = cp.name.trim().toLowerCase();
      const existing = await ctx.db
        .query("counterparties")
        .withIndex("by_nameLower", (q) => q.eq("nameLower", nameLower))
        .first();
      if (existing) {
        cpIds.set(cp.name, existing._id);
        counts.counterpartiesSkipped++;
        continue;
      }
      const code = await nextCounterpartyCode(ctx);
      const id = await ctx.db.insert("counterparties", {
        name: cp.name,
        nameLower,
        code,
        type: cp.type,
        country: cp.country,
        roles: cp.roles,
        status: "active",
        archived: false,
        defaultCurrency: cp.defaultCurrency,
        defaultPaymentTerm: cp.defaultPaymentTerm,
        searchText: counterpartySearchText({ name: cp.name, code, country: cp.country }),
        createdBy: admin._id,
        updatedAt: now,
      });
      cpIds.set(cp.name, id);
      counts.counterpartiesCreated++;
      await logActivity(ctx, admin, {
        entityType: "counterparty",
        entityId: id,
        entityLabel: cp.name,
        action: "seed.counterparty_created",
        summary: `Seeded counterparty ${cp.name} (${code})`,
      });
    }

    // Commodities (natural key: code)
    const commodities = new Map<string, Doc<"commodities">>();
    for (const c of COMMODITIES) {
      const existing = await ctx.db
        .query("commodities")
        .withIndex("by_code", (q) => q.eq("code", c.code))
        .first();
      if (existing) {
        commodities.set(c.code, existing);
        counts.commoditiesSkipped++;
        continue;
      }
      const id = await ctx.db.insert("commodities", {
        ...c,
        active: true,
        searchText: commoditySearchText(c),
        createdBy: admin._id,
        updatedAt: now,
      });
      commodities.set(c.code, (await ctx.db.get(id))!);
      counts.commoditiesCreated++;
    }

    // Trades (natural key: trade number). Historical totals are preserved as
    // supplied; unit prices were not supplied, so they are left empty and the
    // trade is flagged for price validation — never derived.
    for (const t of TRADES) {
      const tradeNumber = tradeNumberOf(t.n);
      const existing = await ctx.db
        .query("trades")
        .withIndex("by_tradeNumber", (q) => q.eq("tradeNumber", tradeNumber))
        .first();
      if (existing) {
        counts.tradesSkipped++;
        continue;
      }
      const counterpartyId = cpIds.get(t.cp)!;
      const counterparty = (await ctx.db.get(counterpartyId))!;
      const commodity = commodities.get(t.commodity)!;
      const labels = {
        tradeNumber,
        counterpartyName: counterparty.name,
        commodityName: commodity.name,
        commodityCode: commodity.code,
        companyName: company.name,
      };
      const id = await ctx.db.insert("trades", {
        ...labels,
        tradeDate: t.date,
        direction: t.dir,
        companyId: company._id,
        counterpartyId,
        commodityId: commodity._id,
        quantity: t.qty,
        uom: t.uom,
        currency: "USD",
        incoterm: t.incoterm,
        status: t.status,
        totalValue: t.value,
        priceNeedsValidation: true,
        searchText: tradeSearchText(labels),
        ...(t.status === "confirmed" ? { confirmedBy: admin._id, confirmedAt: now } : {}),
        ...(t.status === "cancelled"
          ? { cancelledBy: admin._id, cancelledAt: now, cancelReason: "Imported historical record" }
          : {}),
        createdBy: admin._id,
        updatedAt: now,
      });
      counts.tradesCreated++;
      await logActivity(ctx, admin, {
        entityType: "trade",
        entityId: id,
        entityLabel: tradeNumber,
        tradeId: id,
        action: "seed.trade_imported",
        summary: `Imported historical trade ${tradeNumber} (${t.status}); unit price not supplied — flagged for validation`,
      });
    }
    await bumpSequenceTo(ctx, "trade:2026", 17);

    // Demo contracts
    const template = await ctx.db.get(masters.templateId);
    const settings = await getSettings(ctx);
    if (template) {
      for (const dc of DEMO_CONTRACTS) {
        const trade = await ctx.db
          .query("trades")
          .withIndex("by_tradeNumber", (q) => q.eq("tradeNumber", dc.tradeNumber))
          .first();
        if (!trade || trade.status !== "confirmed") {
          counts.contractsSkipped++;
          continue;
        }
        const existing = await ctx.db
          .query("contracts")
          .withIndex("by_trade", (q) => q.eq("tradeId", trade._id))
          .first();
        if (existing) {
          counts.contractsSkipped++;
          continue;
        }
        const counterparty = trade.counterpartyId ? await ctx.db.get(trade.counterpartyId) : null;
        const commodity = trade.commodityId ? await ctx.db.get(trade.commodityId) : null;
        const contractNumber = await nextContractNumber(ctx, {
          format: template.numberingFormat,
          prefix: template.numberPrefix,
          tradeNumber: trade.tradeNumber,
          tradeDate: trade.tradeDate,
        });
        const variables = buildContractVariables({
          contractNumber,
          contractVersion: 1,
          trade,
          company,
          counterparty,
          commodity,
          dateFormat: settings.dateFormat,
          today: now,
        });
        const rendered = renderContract(template, variables);
        const issued = dc.status !== "draft";
        const id = await ctx.db.insert("contracts", {
          tradeId: trade._id,
          tradeNumber: trade.tradeNumber,
          contractNumber,
          version: 1,
          isCurrent: true,
          status: dc.status,
          templateId: template._id,
          templateVersion: template.version,
          snapshot: {
            title: rendered.title,
            header: rendered.header,
            footer: rendered.footer,
            intro: rendered.intro,
            clauses: rendered.clauses,
            variables,
          },
          unknownVariables: rendered.unknown,
          missingVariables: rendered.missing,
          counterpartyName: trade.counterpartyName,
          commodityName: trade.commodityName,
          direction: trade.direction,
          currency: trade.currency,
          totalValue: trade.totalValue,
          signatureStatus: dc.status === "pending_signature" ? "awaiting" : "none",
          ...(issued ? { issuedBy: admin._id, issuedAt: now, sentAt: now } : {}),
          ...(dc.status === "rate_fixed" ? { rateFixedAt: now } : {}),
          createdBy: admin._id,
          updatedAt: now,
        });
        counts.contractsCreated++;
        await logActivity(ctx, admin, {
          entityType: "contract",
          entityId: id,
          entityLabel: contractNumber,
          tradeId: trade._id,
          action: "seed.contract_created",
          summary: `Seeded demo contract ${contractNumber} (${dc.status.replace("_", " ")}) for ${trade.tradeNumber}`,
        });
      }
    }

    await logActivity(ctx, admin, {
      entityType: "settings",
      entityId: SETTINGS_KEY,
      entityLabel: "Demo data",
      action: "seed.demo_loaded",
      summary: `Loaded development demo data: ${counts.tradesCreated} trades, ${counts.counterpartiesCreated} counterparties, ${counts.contractsCreated} contracts created`,
    });
    return { masters: masters.summary, ...counts };
  },
});

/** Record counts for a quick post-seed check (bounded). */
export const demoStatus = internalQuery({
  args: {},
  handler: async (ctx) => {
    const count = async (table: "companies" | "counterparties" | "commodities" | "trades" | "contracts" | "contractTemplates" | "lookups" | "users") =>
      (await ctx.db.query(table).take(5000)).length;
    return {
      users: await count("users"),
      companies: await count("companies"),
      counterparties: await count("counterparties"),
      commodities: await count("commodities"),
      trades: await count("trades"),
      contracts: await count("contracts"),
      contractTemplates: await count("contractTemplates"),
      lookups: await count("lookups"),
      demoSeedAllowed: process.env.ERP_ALLOW_DEMO_SEED === "true",
    };
  },
});
