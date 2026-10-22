import { paginationOptsValidator } from "convex/server";
import { v, type Infer } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { diffFields, logActivity } from "./lib/audit";
import { appError, assertCanModifyOwned, getOrThrow, requirePermission, requireViewer } from "./lib/auth";
import { nextCounterpartyCode } from "./lib/numbering";
import { counterpartySearchText, tradeSearchText, documentSearchText } from "./lib/search";
import { activeStatusV, counterpartyRoleV, counterpartyTypeV } from "./lib/validators";

/**
 * Counterparties — one row per legal entity, whatever roles it plays
 * (supplier / buyer / seller). The "Suppliers" module manages this table.
 * Default commercial terms stored here are only *suggested* to new trades;
 * changing them never alters existing trades.
 */

/** Editable fields shared by create / update / import. */
export const counterpartyInputV = v.object({
  name: v.string(),
  type: counterpartyTypeV,
  country: v.optional(v.string()),
  roles: v.array(counterpartyRoleV),
  status: v.optional(activeStatusV),
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
  bankName: v.optional(v.string()),
  bankAddress: v.optional(v.string()),
  beneficiaryName: v.optional(v.string()),
  accountNumber: v.optional(v.string()),
  swift: v.optional(v.string()),
  bankInstructions: v.optional(v.string()),
  notes: v.optional(v.string()),
  assignedTo: v.optional(v.id("users")),
});
export type CounterpartyInput = Infer<typeof counterpartyInputV>;

const OPEN_TRADE_STATUSES = new Set(["draft", "pending_review", "confirmed"]);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+?[0-9][0-9\s().-]{5,24}$/;

/** Trims strings, turns blanks into undefined and validates the input server-side. */
function normalizeInput(input: CounterpartyInput): CounterpartyInput & { status: "active" | "inactive" } {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === "string") {
      const trimmed = value.trim();
      out[key] = trimmed === "" ? undefined : trimmed;
    } else {
      out[key] = value;
    }
  }
  const n = out as CounterpartyInput;
  if (!n.name || n.name.length < 2) throw appError("INVALID", "Supplier name must be at least 2 characters.");
  if (n.name.length > 200) throw appError("INVALID", "Supplier name is too long.");
  if (n.roles.length === 0) throw appError("INVALID", "Select at least one role (Supplier, Buyer or Seller).");
  if (n.email && !EMAIL_RE.test(n.email)) throw appError("INVALID", `Invalid email address: ${n.email}`);
  if (n.phone && !PHONE_RE.test(n.phone)) throw appError("INVALID", `Invalid phone number: ${n.phone}`);
  if (n.swift && !/^[A-Za-z0-9]{8}([A-Za-z0-9]{3})?$/.test(n.swift)) {
    throw appError("INVALID", "SWIFT/BIC must be 8 or 11 letters/digits.");
  }
  return {
    ...n,
    roles: [...new Set(n.roles)],
    status: n.status ?? "active",
    swift: n.swift?.toUpperCase(),
    defaultCurrency: n.defaultCurrency?.toUpperCase(),
  };
}

async function findDuplicates(
  ctx: QueryCtx | MutationCtx,
  args: { name: string; taxId?: string; registrationNumber?: string; excludeId?: Id<"counterparties"> },
) {
  const matches: { _id: Id<"counterparties">; name: string; code: string; reason: string; archived: boolean }[] = [];
  const push = (c: Doc<"counterparties">, reason: string) => {
    if (c._id === args.excludeId || matches.some((m) => m._id === c._id)) return;
    matches.push({ _id: c._id, name: c.name, code: c.code, reason, archived: c.archived });
  };
  const nameLower = args.name.trim().toLowerCase();
  if (nameLower.length >= 2) {
    const byName = await ctx.db
      .query("counterparties")
      .withIndex("by_nameLower", (q) => q.eq("nameLower", nameLower))
      .take(5);
    byName.forEach((c) => push(c, "Same name"));
  }
  const taxId = args.taxId?.trim();
  if (taxId) {
    const byTax = await ctx.db
      .query("counterparties")
      .withIndex("by_taxId", (q) => q.eq("taxId", taxId))
      .take(5);
    byTax.forEach((c) => push(c, "Same tax ID"));
  }
  const reg = args.registrationNumber?.trim();
  if (reg) {
    const byReg = await ctx.db
      .query("counterparties")
      .withIndex("by_registrationNumber", (q) => q.eq("registrationNumber", reg))
      .take(5);
    byReg.forEach((c) => push(c, "Same registration number"));
  }
  return matches;
}

/** Denormalised listing labels on trades & documents follow a rename (commercial values never change). */
async function propagateRename(ctx: MutationCtx, cp: Doc<"counterparties">, newName: string) {
  const trades = await ctx.db
    .query("trades")
    .withIndex("by_counterparty", (q) => q.eq("counterpartyId", cp._id))
    .take(500);
  for (const t of trades) {
    await ctx.db.patch(t._id, {
      counterpartyName: newName,
      searchText: tradeSearchText({ ...t, counterpartyName: newName }),
    });
  }
  const docs = await ctx.db
    .query("documents")
    .withIndex("by_counterparty", (q) => q.eq("counterpartyId", cp._id))
    .take(500);
  for (const d of docs) {
    await ctx.db.patch(d._id, {
      counterpartyName: newName,
      searchText: documentSearchText({ ...d, counterpartyName: newName }),
    });
  }
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/**
 * Searchable counterparty picker for trade booking. `role` narrows to
 * sellers/suppliers (purchase) or buyers (sales); records whose roles don't
 * match are still returned last so a user is never blocked.
 */
export const searchForPicker = query({
  args: { search: v.optional(v.string()), preferRoles: v.optional(v.array(counterpartyRoleV)) },
  handler: async (ctx, { search, preferRoles }) => {
    await requireViewer(ctx);
    const term = search?.trim().toLowerCase();
    const rows = term
      ? await ctx.db
          .query("counterparties")
          .withSearchIndex("search", (q) => q.search("searchText", term).eq("archived", false).eq("status", "active"))
          .take(25)
      : await ctx.db
          .query("counterparties")
          .withIndex("by_archived_status_name", (q) => q.eq("archived", false).eq("status", "active"))
          .take(60);
    const score = (roles: string[]) => (preferRoles && preferRoles.some((r) => roles.includes(r)) ? 0 : 1);
    return rows
      .map((c) => ({
        _id: c._id,
        name: c.name,
        code: c.code,
        country: c.country,
        type: c.type,
        roles: c.roles,
        matchesRole: score(c.roles) === 0,
      }))
      .sort((a, b) => Number(!a.matchesRole) - Number(!b.matchesRole));
  },
});

/** Full counterparty record (used for defaults inheritance and detail page). */
export const get = query({
  args: { id: v.id("counterparties") },
  handler: async (ctx, { id }) => {
    await requireViewer(ctx);
    return await getOrThrow(ctx, id, "Counterparty");
  },
});

/** Detail-page payload: record + resolved user names. */
export const getDetail = query({
  args: { id: v.id("counterparties") },
  handler: async (ctx, { id }) => {
    await requireViewer(ctx);
    const cp = await getOrThrow(ctx, id, "Supplier");
    const name = async (uid?: Id<"users">) => {
      if (!uid) return undefined;
      const u = await ctx.db.get(uid);
      return u ? u.name || u.email : undefined;
    };
    return {
      counterparty: cp,
      createdByName: await name(cp.createdBy),
      updatedByName: await name(cp.updatedBy),
      assignedToName: await name(cp.assignedTo),
    };
  },
});

export const list = query({
  args: {
    paginationOpts: paginationOptsValidator,
    search: v.optional(v.string()),
    type: v.optional(counterpartyTypeV),
    status: v.optional(activeStatusV),
    role: v.optional(counterpartyRoleV),
    includeArchived: v.optional(v.boolean()),
    sort: v.optional(v.union(v.literal("asc"), v.literal("desc"))),
  },
  handler: async (ctx, args) => {
    await requireViewer(ctx);
    const term = args.search?.trim().toLowerCase();
    const archivedOnlyActive = !args.includeArchived;
    let result;
    if (term) {
      result = await ctx.db
        .query("counterparties")
        .withSearchIndex("search", (q) => {
          let s = q.search("searchText", term);
          if (archivedOnlyActive) s = s.eq("archived", false);
          if (args.type) s = s.eq("type", args.type);
          if (args.status) s = s.eq("status", args.status);
          return s;
        })
        .paginate(args.paginationOpts);
    } else if (archivedOnlyActive) {
      const order = args.sort ?? "asc";
      if (args.type) {
        const base = ctx.db
          .query("counterparties")
          .withIndex("by_archived_type_name", (q) => q.eq("archived", false).eq("type", args.type!))
          .order(order);
        result = await (args.status
          ? base.filter((q) => q.eq(q.field("status"), args.status!))
          : base
        ).paginate(args.paginationOpts);
      } else if (args.status) {
        result = await ctx.db
          .query("counterparties")
          .withIndex("by_archived_status_name", (q) => q.eq("archived", false).eq("status", args.status!))
          .order(order)
          .paginate(args.paginationOpts);
      } else {
        result = await ctx.db
          .query("counterparties")
          .withIndex("by_archived_and_name", (q) => q.eq("archived", false))
          .order(order)
          .paginate(args.paginationOpts);
      }
    } else {
      result = await ctx.db
        .query("counterparties")
        .withIndex("by_nameLower")
        .order(args.sort ?? "asc")
        .filter((q) =>
          q.and(
            args.type ? q.eq(q.field("type"), args.type) : true,
            args.status ? q.eq(q.field("status"), args.status) : true,
          ),
        )
        .paginate(args.paginationOpts);
    }
    // `roles` is an array, which index/filter expressions can't match — filter the page.
    const page = args.role ? result.page.filter((c) => c.roles.includes(args.role!)) : result.page;
    return { ...result, page };
  },
});

export const checkDuplicates = query({
  args: {
    name: v.string(),
    taxId: v.optional(v.string()),
    registrationNumber: v.optional(v.string()),
    excludeId: v.optional(v.id("counterparties")),
  },
  handler: async (ctx, args) => {
    await requireViewer(ctx);
    return await findDuplicates(ctx, args);
  },
});

/** Bounded export for CSV (current filters applied client-side). */
export const exportRows = query({
  args: { includeArchived: v.optional(v.boolean()), ids: v.optional(v.array(v.id("counterparties"))) },
  handler: async (ctx, args) => {
    await requireViewer(ctx);
    if (args.ids) {
      const rows = await Promise.all(args.ids.slice(0, 2000).map((id) => ctx.db.get(id)));
      return rows.filter((r): r is Doc<"counterparties"> => r !== null);
    }
    if (args.includeArchived) {
      return await ctx.db.query("counterparties").withIndex("by_nameLower").take(2000);
    }
    return await ctx.db
      .query("counterparties")
      .withIndex("by_archived_and_name", (q) => q.eq("archived", false))
      .take(2000);
  },
});

export const relatedTrades = query({
  args: { id: v.id("counterparties") },
  handler: async (ctx, { id }) => {
    await requireViewer(ctx);
    const trades = await ctx.db
      .query("trades")
      .withIndex("by_counterparty", (q) => q.eq("counterpartyId", id))
      .order("desc")
      .take(50);
    return trades.map((t) => ({
      _id: t._id,
      tradeNumber: t.tradeNumber,
      tradeDate: t.tradeDate,
      direction: t.direction,
      commodityName: t.commodityName,
      commodityCode: t.commodityCode,
      quantity: t.quantity,
      uom: t.uom,
      totalValue: t.totalValue,
      currency: t.currency,
      incoterm: t.incoterm,
      status: t.status,
    }));
  },
});

export const relatedContracts = query({
  args: { id: v.id("counterparties") },
  handler: async (ctx, { id }) => {
    await requireViewer(ctx);
    const trades = await ctx.db
      .query("trades")
      .withIndex("by_counterparty", (q) => q.eq("counterpartyId", id))
      .order("desc")
      .take(50);
    const contracts: Doc<"contracts">[] = [];
    for (const t of trades) {
      const rows = await ctx.db
        .query("contracts")
        .withIndex("by_trade", (q) => q.eq("tradeId", t._id))
        .order("desc")
        .take(10);
      const current = rows.find((c) => c.isCurrent);
      if (current) contracts.push(current);
    }
    return contracts.map((c) => ({
      _id: c._id,
      tradeId: c.tradeId,
      tradeNumber: c.tradeNumber,
      contractNumber: c.contractNumber,
      version: c.version,
      status: c.status,
      commodityName: c.commodityName,
      totalValue: c.totalValue,
      currency: c.currency,
      updatedAt: c.updatedAt,
    }));
  },
});

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

async function insertCounterparty(ctx: MutationCtx, user: Doc<"users">, input: CounterpartyInput) {
  const n = normalizeInput(input);
  const code = await nextCounterpartyCode(ctx);
  const now = Date.now();
  const id = await ctx.db.insert("counterparties", {
    ...n,
    code,
    nameLower: n.name.toLowerCase(),
    archived: false,
    searchText: counterpartySearchText({ ...n, code }),
    createdBy: user._id,
    updatedBy: user._id,
    updatedAt: now,
  });
  return { id, code, name: n.name };
}

export const create = mutation({
  args: { input: counterpartyInputV },
  handler: async (ctx, { input }) => {
    const user = await requirePermission(ctx, "counterparty.create");
    if (input.assignedTo) await getOrThrow(ctx, input.assignedTo, "Assigned user");
    const { id, code, name } = await insertCounterparty(ctx, user, input);
    await logActivity(ctx, user, {
      entityType: "counterparty",
      entityId: id,
      entityLabel: name,
      action: "counterparty.created",
      summary: `Created supplier ${name} (${code})`,
    });
    return id;
  },
});

export const update = mutation({
  args: { id: v.id("counterparties"), input: counterpartyInputV },
  handler: async (ctx, { id, input }) => {
    const user = await requirePermission(ctx, "counterparty.edit");
    const cp = await getOrThrow(ctx, id, "Supplier");
    assertCanModifyOwned(user, cp, "supplier");
    if (cp.archived) throw appError("CONFLICT", "Restore this supplier before editing it.");
    const n = normalizeInput(input);
    if (input.assignedTo && input.assignedTo !== cp.assignedTo) {
      if (user.role === "staff") throw appError("FORBIDDEN", "Only managers can reassign a supplier.");
      await getOrThrow(ctx, input.assignedTo, "Assigned user");
    }
    // Patch every editable key so cleared fields are removed (patching undefined deletes a field).
    const patch: Partial<Doc<"counterparties">> = {
      ...Object.fromEntries(Object.keys(counterpartyInputV.fields).map((k) => [k, (n as Record<string, unknown>)[k]])),
      nameLower: n.name.toLowerCase(),
      searchText: counterpartySearchText({ ...n, code: cp.code }),
      updatedBy: user._id,
      updatedAt: Date.now(),
    };
    const changes = diffFields(cp as unknown as Record<string, unknown>, patch as Record<string, unknown>, [
      "updatedAt",
      "updatedBy",
      "searchText",
      "nameLower",
    ]);
    await ctx.db.patch(id, patch);
    if (n.name !== cp.name) await propagateRename(ctx, cp, n.name);
    if (changes.length > 0) {
      await logActivity(ctx, user, {
        entityType: "counterparty",
        entityId: id,
        entityLabel: n.name,
        action: "counterparty.updated",
        summary: `Updated supplier ${n.name} (${changes.length} field${changes.length === 1 ? "" : "s"})`,
        changes,
      });
    }
    return id;
  },
});

export const setStatus = mutation({
  args: { id: v.id("counterparties"), status: activeStatusV },
  handler: async (ctx, { id, status }) => {
    const user = await requirePermission(ctx, "counterparty.edit");
    const cp = await getOrThrow(ctx, id, "Supplier");
    assertCanModifyOwned(user, cp, "supplier");
    if (cp.status === status) return;
    await ctx.db.patch(id, { status, updatedBy: user._id, updatedAt: Date.now() });
    await logActivity(ctx, user, {
      entityType: "counterparty",
      entityId: id,
      entityLabel: cp.name,
      action: "counterparty.status_changed",
      summary: `${status === "active" ? "Activated" : "Deactivated"} supplier ${cp.name}`,
      changes: [{ field: "status", from: cp.status, to: status }],
    });
  },
});

async function archiveOne(ctx: MutationCtx, user: Doc<"users">, id: Id<"counterparties">) {
  const cp = await getOrThrow(ctx, id, "Supplier");
  if (cp.archived) return { ok: true as const, name: cp.name };
  const trades = await ctx.db
    .query("trades")
    .withIndex("by_counterparty", (q) => q.eq("counterpartyId", id))
    .take(500);
  const open = trades.filter((t) => OPEN_TRADE_STATUSES.has(t.status));
  if (open.length > 0) {
    return {
      ok: false as const,
      name: cp.name,
      message: `${cp.name} has ${open.length} open trade${open.length === 1 ? "" : "s"} (${open
        .slice(0, 3)
        .map((t) => t.tradeNumber)
        .join(", ")}${open.length > 3 ? ", …" : ""}). Close or cancel them before archiving.`,
    };
  }
  await ctx.db.patch(id, { archived: true, updatedBy: user._id, updatedAt: Date.now() });
  await logActivity(ctx, user, {
    entityType: "counterparty",
    entityId: id,
    entityLabel: cp.name,
    action: "counterparty.archived",
    summary: `Archived supplier ${cp.name}`,
  });
  return { ok: true as const, name: cp.name };
}

export const archive = mutation({
  args: { id: v.id("counterparties") },
  handler: async (ctx, { id }) => {
    const user = await requirePermission(ctx, "counterparty.archive");
    const res = await archiveOne(ctx, user, id);
    if (!res.ok) throw appError("CONFLICT", res.message);
  },
});

/** Bulk archive — archives what it can and reports the rest. */
export const archiveMany = mutation({
  args: { ids: v.array(v.id("counterparties")) },
  handler: async (ctx, { ids }) => {
    const user = await requirePermission(ctx, "counterparty.archive");
    if (ids.length > 100) throw appError("INVALID", "Archive at most 100 suppliers at a time.");
    const results = [];
    for (const id of ids) results.push(await archiveOne(ctx, user, id));
    return {
      archived: results.filter((r) => r.ok).length,
      blocked: results.flatMap((r) => (r.ok ? [] : [r.message])),
    };
  },
});

export const restore = mutation({
  args: { id: v.id("counterparties") },
  handler: async (ctx, { id }) => {
    const user = await requirePermission(ctx, "counterparty.archive");
    const cp = await getOrThrow(ctx, id, "Supplier");
    if (!cp.archived) return;
    await ctx.db.patch(id, { archived: false, updatedBy: user._id, updatedAt: Date.now() });
    await logActivity(ctx, user, {
      entityType: "counterparty",
      entityId: id,
      entityLabel: cp.name,
      action: "counterparty.restored",
      summary: `Restored supplier ${cp.name}`,
    });
  },
});

export const clone = mutation({
  args: { id: v.id("counterparties") },
  handler: async (ctx, { id }) => {
    const user = await requirePermission(ctx, "counterparty.create");
    const src = await getOrThrow(ctx, id, "Supplier");
    const input = Object.fromEntries(
      Object.keys(counterpartyInputV.fields).map((k) => [k, (src as unknown as Record<string, unknown>)[k]]),
    ) as CounterpartyInput;
    const { id: newId, code, name } = await insertCounterparty(ctx, user, {
      ...input,
      name: `${src.name} (Copy)`.slice(0, 200),
      status: "active",
      // Staff clones are assigned to themselves so they can keep editing.
      assignedTo: user.role === "staff" ? user._id : src.assignedTo,
    });
    await logActivity(ctx, user, {
      entityType: "counterparty",
      entityId: newId,
      entityLabel: name,
      action: "counterparty.cloned",
      summary: `Created ${name} (${code}) as a copy of ${src.name} (${src.code})`,
    });
    return newId;
  },
});

export const importCsv = mutation({
  args: { rows: v.array(counterpartyInputV), skipDuplicates: v.optional(v.boolean()) },
  handler: async (ctx, { rows, skipDuplicates = true }) => {
    const user = await requirePermission(ctx, "counterparty.import");
    if (rows.length > 200) throw appError("INVALID", "Import at most 200 rows per batch.");
    const results: { row: number; status: "created" | "skipped" | "error"; message: string; id?: Id<"counterparties"> }[] = [];
    const seenInBatch = new Set<string>();
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        const key = row.name.trim().toLowerCase();
        const dups = await findDuplicates(ctx, { name: row.name, taxId: row.taxId, registrationNumber: row.registrationNumber });
        if (skipDuplicates && (dups.length > 0 || seenInBatch.has(key))) {
          results.push({
            row: i + 1,
            status: "skipped",
            message: dups.length > 0 ? `Duplicate of ${dups[0].name} (${dups[0].code}): ${dups[0].reason}` : "Duplicate row in file",
          });
          continue;
        }
        const { id, code } = await insertCounterparty(ctx, user, { ...row, assignedTo: undefined });
        seenInBatch.add(key);
        results.push({ row: i + 1, status: "created", message: code, id });
      } catch (e) {
        const data = (e as { data?: { message?: string } }).data;
        results.push({ row: i + 1, status: "error", message: data?.message ?? (e as Error).message });
      }
    }
    const created = results.filter((r) => r.status === "created").length;
    if (created > 0) {
      await logActivity(ctx, user, {
        entityType: "counterparty",
        entityId: "import",
        action: "counterparty.imported",
        summary: `Imported ${created} supplier${created === 1 ? "" : "s"} from CSV`,
      });
    }
    return results;
  },
});
