import { defineSchema, defineTable } from "convex/server";
import { authTables } from "@convex-dev/auth/server";
import { v } from "convex/values";
import {
  activeStatusV,
  blStatusV,
  contractStatusV,
  counterpartyRoleV,
  counterpartyTypeV,
  dispatchItemStatusV,
  dispatchStatusV,
  documentTypeV,
  entityTypeV,
  fieldChangeV,
  fxReviewStatusV,
  lookupKindV,
  reviewStatusV,
  roleV,
  signatureStatusV,
  templateDirectionV,
  templateStatusV,
  tradeFieldsV,
  tradeStatusV,
  userStatusV,
} from "./lib/validators";

/** Audit columns shared by business records. `_creationTime` is the created-at. */
const audit = {
  createdBy: v.id("users"),
  updatedBy: v.optional(v.id("users")),
  updatedAt: v.number(),
};

const bankFields = {
  bankName: v.optional(v.string()),
  bankAddress: v.optional(v.string()),
  beneficiaryName: v.optional(v.string()),
  accountNumber: v.optional(v.string()), // account no. or IBAN
  swift: v.optional(v.string()),
  bankInstructions: v.optional(v.string()),
};

export default defineSchema({
  ...authTables,

  /**
   * Convex Auth's `users` table extended with the trusted application profile.
   * `role` and `status` are only ever written server-side (auth callback or
   * admin-only mutations) — never from client-supplied sign-up params.
   */
  users: defineTable({
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),
    role: v.optional(roleV),
    status: v.optional(userStatusV),
    // Extra grants for managers, e.g. "masters.manage".
    grants: v.optional(v.array(v.string())),
    title: v.optional(v.string()),
    updatedAt: v.optional(v.number()),
  })
    .index("email", ["email"])
    .index("phone", ["phone"])
    .index("by_role", ["role"])
    .index("by_status", ["status"]),

  companies: defineTable({
    name: v.string(),
    code: v.string(),
    legalName: v.optional(v.string()),
    address: v.optional(v.string()),
    city: v.optional(v.string()),
    country: v.optional(v.string()),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    website: v.optional(v.string()),
    taxId: v.optional(v.string()),
    registrationNumber: v.optional(v.string()),
    logoStorageId: v.optional(v.id("_storage")),
    baseCurrency: v.optional(v.string()),
    signatoryName: v.optional(v.string()),
    signatoryTitle: v.optional(v.string()),
    ...bankFields,
    isDefault: v.boolean(),
    active: v.boolean(),
    ...audit,
  })
    .index("by_code", ["code"])
    .index("by_active", ["active"]),

  /**
   * One row per legal entity regardless of how many roles it plays
   * (supplier / buyer / seller). The "Suppliers" module manages this table.
   */
  counterparties: defineTable({
    name: v.string(),
    nameLower: v.string(),
    code: v.string(), // CP-0001, generated
    type: counterpartyTypeV,
    country: v.optional(v.string()),
    roles: v.array(counterpartyRoleV),
    status: activeStatusV,
    archived: v.boolean(),
    // contact
    contactPerson: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    website: v.optional(v.string()),
    address: v.optional(v.string()),
    city: v.optional(v.string()),
    state: v.optional(v.string()),
    postalCode: v.optional(v.string()),
    taxId: v.optional(v.string()),
    registrationNumber: v.optional(v.string()),
    // default commercial terms (suggested to new trades, never pushed to existing ones)
    defaultCurrency: v.optional(v.string()),
    defaultPaymentTerm: v.optional(v.string()),
    defaultIncoterm: v.optional(v.string()),
    defaultPricingTerm: v.optional(v.string()),
    defaultOrigin: v.optional(v.string()),
    defaultManufacturer: v.optional(v.string()),
    defaultLoadingLocation: v.optional(v.string()),
    defaultDischargeLocation: v.optional(v.string()),
    defaultFreightTerms: v.optional(v.string()),
    shipmentPreferences: v.optional(v.string()),
    ...bankFields,
    notes: v.optional(v.string()),
    assignedTo: v.optional(v.id("users")),
    // name + code + country + contact + email, lower-cased, for the search index
    searchText: v.string(),
    ...audit,
  })
    .index("by_code", ["code"])
    .index("by_nameLower", ["nameLower"])
    .index("by_taxId", ["taxId"])
    .index("by_registrationNumber", ["registrationNumber"])
    .index("by_archived_and_name", ["archived", "nameLower"])
    .index("by_archived_type_name", ["archived", "type", "nameLower"])
    .index("by_archived_status_name", ["archived", "status", "nameLower"])
    .searchIndex("search", {
      searchField: "searchText",
      filterFields: ["archived", "type", "status"],
    }),

  commodities: defineTable({
    name: v.string(),
    code: v.string(),
    hsCode: v.optional(v.string()),
    defaultUom: v.optional(v.string()),
    grade: v.optional(v.string()),
    description: v.optional(v.string()),
    active: v.boolean(),
    searchText: v.string(),
    ...audit,
  })
    .index("by_code", ["code"])
    .index("by_active", ["active"])
    .searchIndex("search", { searchField: "searchText", filterFields: ["active"] }),

  /** Configurable reference values (currencies, Incoterms, UOMs, ports, …). */
  lookups: defineTable({
    kind: lookupKindV,
    value: v.string(),
    label: v.string(),
    description: v.optional(v.string()),
    sortOrder: v.number(),
    active: v.boolean(),
  })
    .index("by_kind", ["kind", "sortOrder"])
    .index("by_kind_value", ["kind", "value"]),

  /** Singleton (key "global") system preferences. */
  settings: defineTable({
    key: v.string(),
    tradeNumberPrefix: v.string(), // "TRD"
    contractNumberPrefix: v.string(), // "CTR"
    blNumberPrefix: v.string(), // "BL"
    counterpartyCodePrefix: v.string(), // "CP"
    sequencePadding: v.number(), // 4 → 0001
    defaultCurrency: v.string(),
    dateFormat: v.string(), // date-fns pattern, e.g. "dd MMM yyyy"
    maxUploadMb: v.number(),
    allowedFileTypes: v.array(v.string()), // MIME types
    dispatchChecklistTemplate: v.array(v.string()),
    // Admin switch for the AI assistant (undefined = on when GEMINI_API_KEY is configured).
    aiEnabled: v.optional(v.boolean()),
    updatedBy: v.optional(v.id("users")),
    updatedAt: v.number(),
  }).index("by_key", ["key"]),

  /** Transaction-safe sequences. key e.g. "trade:2026", "contract:2026", "counterparty". */
  counters: defineTable({
    key: v.string(),
    value: v.number(),
  }).index("by_key", ["key"]),

  trades: defineTable({
    ...tradeFieldsV,
    tradeNumber: v.string(),
    status: tradeStatusV,
    totalValue: v.optional(v.number()),
    // Authorized manual value (historical import / commercial override)
    valueOverridden: v.optional(v.boolean()),
    valueOverrideReason: v.optional(v.string()),
    // Historical record with a supplied total but no reliable unit price.
    priceNeedsValidation: v.optional(v.boolean()),
    // Denormalised for listing/search (kept in sync by counterparty/commodity updates).
    counterpartyName: v.optional(v.string()),
    commodityName: v.optional(v.string()),
    commodityCode: v.optional(v.string()),
    companyName: v.optional(v.string()),
    searchText: v.string(),
    // lineage
    clonedFromId: v.optional(v.id("trades")),
    clonedFromNumber: v.optional(v.string()),
    // idempotency key for create (prevents duplicate records on double submit)
    clientRequestId: v.optional(v.string()),
    assignedTo: v.optional(v.id("users")),
    // workflow
    submittedBy: v.optional(v.id("users")),
    submittedAt: v.optional(v.number()),
    reviewNote: v.optional(v.string()),
    confirmedBy: v.optional(v.id("users")),
    confirmedAt: v.optional(v.number()),
    cancelledBy: v.optional(v.id("users")),
    cancelledAt: v.optional(v.number()),
    cancelReason: v.optional(v.string()),
    closedBy: v.optional(v.id("users")),
    closedAt: v.optional(v.number()),
    ...audit,
  })
    .index("by_tradeNumber", ["tradeNumber"])
    .index("by_clientRequestId", ["clientRequestId"])
    .index("by_tradeDate", ["tradeDate"])
    .index("by_status_and_date", ["status", "tradeDate"])
    .index("by_direction_and_date", ["direction", "tradeDate"])
    .index("by_status_direction_date", ["status", "direction", "tradeDate"])
    .index("by_counterparty", ["counterpartyId", "tradeDate"])
    .index("by_commodity", ["commodityId"])
    .index("by_company", ["companyId"])
    .index("by_createdBy", ["createdBy"])
    .index("by_status_and_closedAt", ["status", "closedAt"])
    .searchIndex("search", {
      searchField: "searchText",
      filterFields: ["status", "direction"],
    }),

  /** Reusable trade presets created from a trade ("Create Template from Trade"). */
  tradeTemplates: defineTable({
    name: v.string(),
    description: v.optional(v.string()),
    sourceTradeId: v.optional(v.id("trades")),
    sourceTradeNumber: v.optional(v.string()),
    fields: v.object(tradeFieldsV),
    active: v.boolean(),
    ...audit,
  }).index("by_active", ["active"]),

  contractTemplates: defineTable({
    name: v.string(),
    description: v.optional(v.string()),
    status: templateStatusV,
    version: v.number(),
    // All versions of one template share `familyId` (= id of the first version as string).
    familyId: v.string(),
    previousVersionId: v.optional(v.id("contractTemplates")),
    isDefault: v.boolean(),
    companyId: v.optional(v.id("companies")),
    direction: templateDirectionV,
    title: v.string(), // e.g. "SALES CONTRACT"
    header: v.optional(v.string()),
    footer: v.optional(v.string()),
    intro: v.optional(v.string()),
    clauses: v.array(v.object({ heading: v.string(), body: v.string() })),
    // e.g. "{prefix}-{year}-{seq}"; {prefix} falls back to settings.contractNumberPrefix
    numberingFormat: v.string(),
    numberPrefix: v.optional(v.string()),
    defaultPackingClause: v.optional(v.string()),
    defaultDocumentsClause: v.optional(v.string()),
    defaultArbitrationClause: v.optional(v.string()),
    defaultBankClause: v.optional(v.string()),
    defaultShippingClause: v.optional(v.string()),
    ...audit,
  })
    .index("by_family", ["familyId", "version"])
    .index("by_status", ["status"]),

  /**
   * Each row is one contract *version*. Issued versions are immutable: the
   * rendered snapshot is stored, so later trade edits never change them.
   */
  contracts: defineTable({
    tradeId: v.id("trades"),
    tradeNumber: v.string(),
    contractNumber: v.string(),
    version: v.number(),
    isCurrent: v.boolean(),
    status: contractStatusV,
    templateId: v.id("contractTemplates"),
    templateVersion: v.number(),
    snapshot: v.object({
      title: v.string(),
      header: v.optional(v.string()),
      footer: v.optional(v.string()),
      intro: v.optional(v.string()),
      clauses: v.array(v.object({ heading: v.string(), body: v.string() })),
      variables: v.record(v.string(), v.string()),
    }),
    unknownVariables: v.array(v.string()),
    missingVariables: v.array(v.string()),
    // denormalised for listings & dashboard
    counterpartyName: v.optional(v.string()),
    commodityName: v.optional(v.string()),
    direction: v.optional(v.string()),
    currency: v.optional(v.string()),
    totalValue: v.optional(v.number()),
    pdfStorageId: v.optional(v.id("_storage")),
    pdfDocumentId: v.optional(v.id("documents")),
    pdfGeneratedAt: v.optional(v.number()),
    revisionOf: v.optional(v.id("contracts")),
    revisionReason: v.optional(v.string()),
    revisionApprovedBy: v.optional(v.id("users")),
    revisionApprovedAt: v.optional(v.number()),
    issuedBy: v.optional(v.id("users")),
    issuedAt: v.optional(v.number()),
    sentAt: v.optional(v.number()),
    sentTo: v.optional(v.string()),
    signatureStatus: signatureStatusV,
    signedDocumentId: v.optional(v.id("documents")),
    rateFixedAt: v.optional(v.number()),
    closedAt: v.optional(v.number()),
    cancelledAt: v.optional(v.number()),
    ...audit,
  })
    .index("by_trade", ["tradeId", "version"])
    .index("by_contractNumber", ["contractNumber"])
    .index("by_status", ["status"])
    .index("by_current_and_status", ["isCurrent", "status"])
    .index("by_updatedAt", ["updatedAt"]),

  blDocuments: defineTable({
    tradeId: v.id("trades"),
    tradeNumber: v.string(),
    contractId: v.optional(v.id("contracts")),
    blRecordNumber: v.string(), // internal BL-2026-0001
    version: v.number(),
    isCurrent: v.boolean(),
    revisionOf: v.optional(v.id("blDocuments")),
    status: blStatusV,
    externalBlNumber: v.optional(v.string()), // carrier's B/L number
    issueDate: v.optional(v.string()),
    issuePlace: v.optional(v.string()),
    // parties
    shipper: v.optional(v.string()),
    consignee: v.optional(v.string()),
    notifyParty: v.optional(v.string()),
    notifyInstructions: v.optional(v.string()),
    buyerDetails: v.optional(v.string()),
    sellerDetails: v.optional(v.string()),
    // shipment
    vessel: v.optional(v.string()),
    voyage: v.optional(v.string()),
    portOfLoading: v.optional(v.string()),
    portOfDischarge: v.optional(v.string()),
    placeOfReceipt: v.optional(v.string()),
    placeOfDelivery: v.optional(v.string()),
    shipmentPeriod: v.optional(v.string()),
    goodsDescription: v.optional(v.string()),
    commodity: v.optional(v.string()),
    grade: v.optional(v.string()),
    quantity: v.optional(v.number()),
    uom: v.optional(v.string()),
    packages: v.optional(v.string()),
    packingDescription: v.optional(v.string()),
    marksAndNumbers: v.optional(v.string()),
    grossWeight: v.optional(v.number()),
    netWeight: v.optional(v.number()),
    weightUnit: v.optional(v.string()),
    containerNumbers: v.array(v.string()),
    sealNumbers: v.array(v.string()),
    freightTerms: v.optional(v.string()),
    originalsCount: v.optional(v.number()),
    specialClauses: v.optional(v.string()),
    instructions: v.optional(v.string()),
    hiddenFields: v.array(v.string()), // configurable field visibility on the printout
    draftPdfStorageId: v.optional(v.id("_storage")),
    draftPdfDocumentId: v.optional(v.id("documents")),
    carrierDocumentId: v.optional(v.id("documents")), // uploaded carrier-issued B/L
    preparedBy: v.optional(v.id("users")),
    preparedAt: v.optional(v.number()),
    reviewedBy: v.optional(v.id("users")),
    reviewedAt: v.optional(v.number()),
    reviewNote: v.optional(v.string()),
    verifiedBy: v.optional(v.id("users")),
    verifiedAt: v.optional(v.number()),
    issuedRecordedBy: v.optional(v.id("users")),
    issuedRecordedAt: v.optional(v.number()),
    ...audit,
  })
    .index("by_trade", ["tradeId", "version"])
    .index("by_status", ["status"])
    .index("by_current_and_status", ["isCurrent", "status"])
    .index("by_blRecordNumber", ["blRecordNumber"]),

  dispatchChecklists: defineTable({
    tradeId: v.id("trades"),
    tradeNumber: v.string(),
    counterpartyName: v.optional(v.string()),
    blDocumentId: v.optional(v.id("blDocuments")),
    status: dispatchStatusV,
    completedAt: v.optional(v.number()),
    ...audit,
  })
    .index("by_trade", ["tradeId"])
    .index("by_status", ["status"]),

  dispatchItems: defineTable({
    checklistId: v.id("dispatchChecklists"),
    tradeId: v.id("trades"),
    label: v.string(),
    sortOrder: v.number(),
    status: dispatchItemStatusV,
    assignedTo: v.optional(v.id("users")),
    dueDate: v.optional(v.string()), // ISO date
    comment: v.optional(v.string()),
    blockedReason: v.optional(v.string()),
    documentIds: v.array(v.id("documents")),
    completedAt: v.optional(v.number()),
    completedBy: v.optional(v.id("users")),
    ...audit,
  })
    .index("by_checklist", ["checklistId", "sortOrder"])
    .index("by_status", ["status"])
    .index("by_assignee_and_status", ["assignedTo", "status"]),

  documents: defineTable({
    storageId: v.id("_storage"),
    fileName: v.string(),
    contentType: v.string(),
    size: v.number(),
    docType: documentTypeV,
    tradeId: v.optional(v.id("trades")),
    tradeNumber: v.optional(v.string()),
    contractId: v.optional(v.id("contracts")),
    contractNumber: v.optional(v.string()),
    counterpartyId: v.optional(v.id("counterparties")),
    counterpartyName: v.optional(v.string()),
    blDocumentId: v.optional(v.id("blDocuments")),
    dispatchItemId: v.optional(v.id("dispatchItems")),
    // Versioning: all versions of one logical document share `groupKey`.
    groupKey: v.string(),
    version: v.number(),
    isLatest: v.boolean(),
    source: v.union(v.literal("upload"), v.literal("generated")),
    reviewStatus: reviewStatusV,
    reviewedBy: v.optional(v.id("users")),
    reviewedAt: v.optional(v.number()),
    notes: v.optional(v.string()),
    archived: v.boolean(),
    searchText: v.string(),
    uploadedBy: v.id("users"),
    updatedAt: v.number(),
  })
    .index("by_trade", ["tradeId"])
    .index("by_contract", ["contractId"])
    .index("by_counterparty", ["counterpartyId"])
    .index("by_bl", ["blDocumentId"])
    .index("by_group", ["groupKey", "version"])
    .index("by_archived_and_type", ["archived", "docType"])
    .index("by_archived_and_review", ["archived", "reviewStatus"])
    .index("by_archived", ["archived"])
    .searchIndex("search", {
      searchField: "searchText",
      filterFields: ["archived", "docType", "reviewStatus"],
    }),

  /** Manually recorded FX rates — never invented; each has source + timestamp + review. */
  fxRates: defineTable({
    baseCurrency: v.string(),
    quoteCurrency: v.string(),
    rate: v.number(),
    source: v.string(),
    rateTimestamp: v.number(),
    tradeId: v.optional(v.id("trades")),
    contractId: v.optional(v.id("contracts")),
    reviewStatus: fxReviewStatusV,
    reviewedBy: v.optional(v.id("users")),
    reviewedAt: v.optional(v.number()),
    notes: v.optional(v.string()),
    ...audit,
  })
    .index("by_review", ["reviewStatus"])
    .index("by_trade", ["tradeId"]),

  activityLogs: defineTable({
    actorId: v.optional(v.id("users")),
    actorName: v.string(),
    entityType: entityTypeV,
    entityId: v.string(),
    entityLabel: v.optional(v.string()),
    tradeId: v.optional(v.id("trades")), // set for anything related to a trade (activity tab)
    action: v.string(), // e.g. "trade.created", "trade.status_changed"
    summary: v.string(),
    changes: v.optional(v.array(fieldChangeV)),
  })
    .index("by_entity", ["entityType", "entityId"])
    .index("by_trade", ["tradeId"])
    .index("by_actor", ["actorId"])
    .index("by_entityType", ["entityType"]),

  /** AI assistant conversations (private to their owner). */
  aiThreads: defineTable({
    userId: v.id("users"),
    title: v.string(),
    updatedAt: v.number(),
  }).index("by_user", ["userId", "updatedAt"]),

  aiMessages: defineTable({
    threadId: v.id("aiThreads"),
    userId: v.id("users"),
    role: v.union(v.literal("user"), v.literal("assistant")),
    content: v.string(),
    status: v.union(v.literal("pending"), v.literal("streaming"), v.literal("done"), v.literal("error")),
    error: v.optional(v.string()),
    model: v.optional(v.string()),
    contextRefs: v.optional(
      v.array(v.object({ type: v.string(), id: v.string(), label: v.string(), href: v.string() })),
    ),
  }).index("by_thread", ["threadId"]),

  /** Per-user onboarding / tutorial preferences (welcome seen, tours done, checklist state). */
  userPrefs: defineTable({
    userId: v.id("users"),
    welcomeSeenAt: v.optional(v.number()),
    toursCompleted: v.array(v.string()),
    checklistDismissed: v.boolean(),
    checklistCollapsed: v.boolean(),
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),

  /** Per-user daily request counter protecting the free-tier quota. */
  aiUsage: defineTable({
    userId: v.id("users"),
    day: v.string(), // YYYY-MM-DD (UTC)
    count: v.number(),
  }).index("by_user_day", ["userId", "day"]),

  /** Cached AI trade summaries, invalidated when the trade changes. */
  aiTradeSummaries: defineTable({
    tradeId: v.id("trades"),
    tradeUpdatedAt: v.number(),
    content: v.string(),
    model: v.string(),
    generatedBy: v.id("users"),
    generatedAt: v.number(),
  }).index("by_trade", ["tradeId"]),
});
