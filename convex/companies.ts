import { v } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { diffFields, logActivity } from "./lib/audit";
import { appError, getOrThrow, requirePermission, requireViewer } from "./lib/auth";

/** Active internal companies for selectors (default first). */
export const listActive = query({
  args: {},
  handler: async (ctx) => {
    await requireViewer(ctx);
    const rows = await ctx.db
      .query("companies")
      .withIndex("by_active", (q) => q.eq("active", true))
      .take(200);
    return rows.sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.name.localeCompare(b.name));
  },
});

export const get = query({
  args: { id: v.id("companies") },
  handler: async (ctx, { id }) => {
    await requireViewer(ctx);
    return await getOrThrow(ctx, id, "Company");
  },
});

/** All companies incl. inactive — Companies & Masters. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    await requirePermission(ctx, "masters.manage");
    const rows = await ctx.db.query("companies").take(500);
    return await Promise.all(
      rows
        .sort((a, b) => Number(b.active) - Number(a.active) || Number(b.isDefault) - Number(a.isDefault) || a.name.localeCompare(b.name))
        .map(async (c) => ({ ...c, logoUrl: c.logoStorageId ? await ctx.storage.getUrl(c.logoStorageId) : null })),
    );
  },
});

const companyFields = {
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
  baseCurrency: v.optional(v.string()),
  signatoryName: v.optional(v.string()),
  signatoryTitle: v.optional(v.string()),
  bankName: v.optional(v.string()),
  bankAddress: v.optional(v.string()),
  beneficiaryName: v.optional(v.string()),
  accountNumber: v.optional(v.string()),
  swift: v.optional(v.string()),
  bankInstructions: v.optional(v.string()),
};

type CompanyInput = {
  name: string;
  code: string;
  [key: string]: string | undefined;
};

function normalise<T extends CompanyInput>(input: T): T {
  const out: Record<string, string | undefined> = {};
  for (const [k, val] of Object.entries(input)) {
    const trimmed = typeof val === "string" ? val.trim() : val;
    out[k] = trimmed === "" ? undefined : trimmed;
  }
  const name = out.name;
  const code = out.code?.toUpperCase();
  if (!name) throw appError("INVALID", "Company name is required.");
  if (!code || !/^[A-Z0-9-]{2,12}$/.test(code)) {
    throw appError("INVALID", "Company code must be 2–12 characters (A–Z, 0–9, hyphen).");
  }
  if (out.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(out.email)) throw appError("INVALID", "Enter a valid email address.");
  return { ...out, name, code } as T;
}

async function assertUniqueCode(ctx: QueryCtx | MutationCtx, code: string, selfId?: Doc<"companies">["_id"]) {
  const clash = await ctx.db
    .query("companies")
    .withIndex("by_code", (q) => q.eq("code", code))
    .first();
  if (clash && clash._id !== selfId) throw appError("CONFLICT", `Company code ${code} is already used by ${clash.name}.`);
}

export const create = mutation({
  args: { ...companyFields, isDefault: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const user = await requirePermission(ctx, "masters.manage");
    const { isDefault, ...rest } = args;
    const data = normalise(rest);
    await assertUniqueCode(ctx, data.code);
    const existing = await ctx.db.query("companies").first();
    const makeDefault = isDefault === true || existing === null;
    if (makeDefault) await clearDefault(ctx);
    const id = await ctx.db.insert("companies", {
      ...data,
      isDefault: makeDefault,
      active: true,
      createdBy: user._id,
      updatedAt: Date.now(),
    });
    await logActivity(ctx, user, {
      entityType: "company",
      entityId: id,
      entityLabel: data.name,
      action: "company.created",
      summary: `Created company ${data.name} (${data.code})`,
    });
    return id;
  },
});

export const update = mutation({
  args: { id: v.id("companies"), ...companyFields },
  handler: async (ctx, { id, ...rest }) => {
    const user = await requirePermission(ctx, "masters.manage");
    const before = await getOrThrow(ctx, id, "Company");
    const data = normalise(rest);
    await assertUniqueCode(ctx, data.code, id);
    // Explicitly clear optional fields the user emptied.
    const patch: Record<string, unknown> = {};
    for (const key of Object.keys(companyFields)) patch[key] = (data as Record<string, unknown>)[key];
    await ctx.db.patch(id, { ...patch, updatedBy: user._id, updatedAt: Date.now() });
    await logActivity(ctx, user, {
      entityType: "company",
      entityId: id,
      entityLabel: data.name,
      action: "company.updated",
      summary: `Updated company ${data.name}`,
      changes: diffFields(before as unknown as Record<string, unknown>, patch),
    });
  },
});

async function clearDefault(ctx: MutationCtx) {
  const rows = await ctx.db.query("companies").take(500);
  for (const c of rows) if (c.isDefault) await ctx.db.patch(c._id, { isDefault: false });
}

export const setDefault = mutation({
  args: { id: v.id("companies") },
  handler: async (ctx, { id }) => {
    const user = await requirePermission(ctx, "masters.manage");
    const company = await getOrThrow(ctx, id, "Company");
    if (!company.active) throw appError("INVALID", "Activate the company before making it the default.");
    const rows = await ctx.db.query("companies").take(500);
    for (const c of rows) if (c.isDefault && c._id !== id) await ctx.db.patch(c._id, { isDefault: false });
    await ctx.db.patch(id, { isDefault: true, updatedBy: user._id, updatedAt: Date.now() });
    await logActivity(ctx, user, {
      entityType: "company",
      entityId: id,
      entityLabel: company.name,
      action: "company.default_set",
      summary: `Set ${company.name} as the default company`,
    });
  },
});

export const setActive = mutation({
  args: { id: v.id("companies"), active: v.boolean() },
  handler: async (ctx, { id, active }) => {
    const user = await requirePermission(ctx, "masters.manage");
    const company = await getOrThrow(ctx, id, "Company");
    if (!active && company.isDefault) {
      throw appError("CONFLICT", "The default company cannot be deactivated. Set another default first.");
    }
    await ctx.db.patch(id, { active, updatedBy: user._id, updatedAt: Date.now() });
    await logActivity(ctx, user, {
      entityType: "company",
      entityId: id,
      entityLabel: company.name,
      action: active ? "company.activated" : "company.deactivated",
      summary: `${active ? "Activated" : "Deactivated"} company ${company.name}`,
    });
  },
});

export const generateLogoUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requirePermission(ctx, "masters.manage");
    return await ctx.storage.generateUploadUrl();
  },
});

const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];

export const setLogo = mutation({
  args: { id: v.id("companies"), storageId: v.optional(v.id("_storage")) },
  handler: async (ctx, { id, storageId }) => {
    const user = await requirePermission(ctx, "masters.manage");
    const company = await getOrThrow(ctx, id, "Company");
    if (storageId) {
      const meta = await ctx.db.system.get(storageId);
      if (!meta) throw appError("INVALID", "Uploaded logo not found. Please upload again.");
      if (!LOGO_TYPES.includes(meta.contentType ?? "") || meta.size > 2 * 1024 * 1024) {
        await ctx.storage.delete(storageId);
        throw appError("INVALID", "Logo must be a PNG, JPEG, WebP or SVG image up to 2 MB.");
      }
    }
    if (company.logoStorageId && company.logoStorageId !== storageId) {
      await ctx.storage.delete(company.logoStorageId);
    }
    await ctx.db.patch(id, { logoStorageId: storageId, updatedBy: user._id, updatedAt: Date.now() });
    await logActivity(ctx, user, {
      entityType: "company",
      entityId: id,
      entityLabel: company.name,
      action: "company.logo_updated",
      summary: storageId ? `Updated logo for ${company.name}` : `Removed logo for ${company.name}`,
    });
  },
});

/** Logo URL for document headers (any active user). */
export const getLogoUrl = query({
  args: { id: v.id("companies") },
  handler: async (ctx, { id }) => {
    await requireViewer(ctx);
    const company = await ctx.db.get(id);
    if (!company?.logoStorageId) return null;
    return await ctx.storage.getUrl(company.logoStorageId);
  },
});
