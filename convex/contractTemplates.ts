import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { diffFields, logActivity } from "./lib/audit";
import { appError, displayName, getOrThrow, requirePermission, requireViewer } from "./lib/auth";
import { validateTemplateText } from "./lib/templateEngine";
import { templateDirectionV, templateStatusV } from "./lib/validators";

/**
 * Contract templates are versioned. All versions of one template share a
 * `familyId` (the id of version 1, as a string). Only `draft` versions are
 * editable; to change an active template, create a new draft version and
 * activate it — activation deactivates the family's previously active
 * version. Contracts reference the exact template version they were
 * rendered from, so old contracts are never affected by template edits.
 */

const clauseV = v.object({ heading: v.string(), body: v.string() });

const templateFields = {
  name: v.string(),
  description: v.optional(v.string()),
  direction: templateDirectionV,
  companyId: v.optional(v.id("companies")),
  title: v.string(),
  header: v.optional(v.string()),
  footer: v.optional(v.string()),
  intro: v.optional(v.string()),
  clauses: v.array(clauseV),
  numberingFormat: v.string(),
  numberPrefix: v.optional(v.string()),
  defaultPackingClause: v.optional(v.string()),
  defaultDocumentsClause: v.optional(v.string()),
  defaultArbitrationClause: v.optional(v.string()),
  defaultBankClause: v.optional(v.string()),
  defaultShippingClause: v.optional(v.string()),
};

type TemplateInput = {
  name: string;
  description?: string;
  direction: Doc<"contractTemplates">["direction"];
  companyId?: Id<"companies">;
  title: string;
  header?: string;
  footer?: string;
  intro?: string;
  clauses: { heading: string; body: string }[];
  numberingFormat: string;
  numberPrefix?: string;
  defaultPackingClause?: string;
  defaultDocumentsClause?: string;
  defaultArbitrationClause?: string;
  defaultBankClause?: string;
  defaultShippingClause?: string;
};

const OPTIONAL_TEXT = [
  "description",
  "header",
  "footer",
  "intro",
  "numberPrefix",
  "defaultPackingClause",
  "defaultDocumentsClause",
  "defaultArbitrationClause",
  "defaultBankClause",
  "defaultShippingClause",
] as const;

function normalise(input: TemplateInput): TemplateInput {
  const out: TemplateInput = {
    ...input,
    name: input.name.trim(),
    title: input.title.trim(),
    numberingFormat: input.numberingFormat.trim(),
    clauses: input.clauses
      .map((c) => ({ heading: c.heading.trim(), body: c.body.trim() }))
      .filter((c) => c.heading !== "" || c.body !== ""),
  };
  for (const key of OPTIONAL_TEXT) {
    const value = out[key]?.trim();
    out[key] = value ? value : undefined;
  }
  if (out.numberPrefix) out.numberPrefix = out.numberPrefix.toUpperCase();
  if (out.name.length < 2) throw appError("INVALID", "Template name is required.");
  if (out.name.length > 120) throw appError("INVALID", "Template name is too long.");
  if (!out.title) throw appError("INVALID", "Document title is required (e.g. SALES CONTRACT).");
  if (!out.numberingFormat.includes("{seq}")) {
    throw appError("INVALID", "Numbering format must include {seq} so every contract number is unique.");
  }
  if (out.numberPrefix && !/^[A-Z0-9-]{1,12}$/.test(out.numberPrefix)) {
    throw appError("INVALID", "Number prefix may only contain letters, digits and hyphens (max 12).");
  }
  if (out.clauses.length === 0) throw appError("INVALID", "Add at least one clause.");
  if (out.clauses.some((c) => c.heading === "")) throw appError("INVALID", "Every clause needs a heading.");
  return out;
}

/** All template texts that may contain variables. */
export function templateTexts(t: Partial<TemplateInput>): string[] {
  return [
    t.title,
    t.header,
    t.footer,
    t.intro,
    t.defaultPackingClause,
    t.defaultDocumentsClause,
    t.defaultArbitrationClause,
    t.defaultBankClause,
    t.defaultShippingClause,
    ...(t.clauses ?? []).flatMap((c) => [c.heading, c.body]),
  ].filter((s): s is string => typeof s === "string" && s !== "");
}

async function familyVersions(ctx: QueryCtx | MutationCtx, familyId: string) {
  return await ctx.db
    .query("contractTemplates")
    .withIndex("by_family", (q) => q.eq("familyId", familyId))
    .order("desc")
    .take(200);
}

function pickFields(t: Doc<"contractTemplates">): TemplateInput {
  return {
    name: t.name,
    description: t.description,
    direction: t.direction,
    companyId: t.companyId,
    title: t.title,
    header: t.header,
    footer: t.footer,
    intro: t.intro,
    clauses: t.clauses,
    numberingFormat: t.numberingFormat,
    numberPrefix: t.numberPrefix,
    defaultPackingClause: t.defaultPackingClause,
    defaultDocumentsClause: t.defaultDocumentsClause,
    defaultArbitrationClause: t.defaultArbitrationClause,
    defaultBankClause: t.defaultBankClause,
    defaultShippingClause: t.defaultShippingClause,
  };
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/**
 * Without `status`: one row per template family (its latest version), with
 * the family's active version summarised. Inactive families are hidden
 * unless `includeInactive`. With `status`: every version in that status
 * (e.g. `status: "active"` for selectors).
 */
export const list = query({
  args: { status: v.optional(templateStatusV), includeInactive: v.optional(v.boolean()) },
  handler: async (ctx, { status, includeInactive }) => {
    await requireViewer(ctx);
    const rows = status
      ? await ctx.db
          .query("contractTemplates")
          .withIndex("by_status", (q) => q.eq("status", status))
          .take(500)
      : await ctx.db.query("contractTemplates").take(1000);

    const companyNames = new Map<string, string>();
    const companyName = async (id?: Id<"companies">) => {
      if (!id) return undefined;
      if (!companyNames.has(id)) companyNames.set(id, (await ctx.db.get(id))?.name ?? "—");
      return companyNames.get(id);
    };

    let selected: Doc<"contractTemplates">[];
    const activeByFamily = new Map<string, Doc<"contractTemplates">>();
    if (status) {
      selected = rows;
    } else {
      const latest = new Map<string, Doc<"contractTemplates">>();
      for (const r of rows) {
        const cur = latest.get(r.familyId);
        if (!cur || r.version > cur.version) latest.set(r.familyId, r);
        if (r.status === "active") activeByFamily.set(r.familyId, r);
      }
      selected = [...latest.values()].filter(
        (r) => includeInactive || r.status !== "inactive" || activeByFamily.has(r.familyId),
      );
    }

    const out = [];
    for (const t of selected) {
      const active = activeByFamily.get(t.familyId);
      out.push({
        _id: t._id,
        familyId: t.familyId,
        name: t.name,
        description: t.description,
        status: t.status,
        version: t.version,
        isDefault: t.isDefault || Boolean(active?.isDefault),
        direction: t.direction,
        companyId: t.companyId,
        companyName: await companyName(t.companyId),
        updatedAt: t.updatedAt,
        activeVersion: active && active._id !== t._id ? { _id: active._id, version: active.version } : null,
        unknownVariables: validateTemplateText(templateTexts(t)),
      });
    }
    return out.sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.name.localeCompare(b.name));
  },
});

export const get = query({
  args: { id: v.id("contractTemplates") },
  handler: async (ctx, { id }) => {
    await requireViewer(ctx);
    const template = await getOrThrow(ctx, id, "Contract template");
    const versions = await familyVersions(ctx, template.familyId);
    const company = template.companyId ? await ctx.db.get(template.companyId) : null;
    const createdBy = await ctx.db.get(template.createdBy);
    const updatedBy = template.updatedBy ? await ctx.db.get(template.updatedBy) : null;
    const usage = await ctx.db
      .query("contracts")
      .filter((q) => q.eq(q.field("templateId"), id))
      .take(1);
    return {
      template,
      companyName: company?.name,
      createdByName: displayName(createdBy),
      updatedByName: updatedBy ? displayName(updatedBy) : undefined,
      versions: versions.map((x) => ({
        _id: x._id,
        version: x.version,
        status: x.status,
        isDefault: x.isDefault,
        updatedAt: x.updatedAt,
      })),
      hasDraftVersion: versions.some((x) => x.status === "draft"),
      usedByContracts: usage.length > 0,
      unknownVariables: validateTemplateText(templateTexts(template)),
    };
  },
});

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export const create = mutation({
  args: templateFields,
  handler: async (ctx, args) => {
    const user = await requirePermission(ctx, "contractTemplate.manage");
    const data = normalise(args);
    if (data.companyId) await getOrThrow(ctx, data.companyId, "Company");
    const id = await ctx.db.insert("contractTemplates", {
      ...data,
      status: "draft",
      version: 1,
      familyId: "pending",
      isDefault: false,
      createdBy: user._id,
      updatedAt: Date.now(),
    });
    await ctx.db.patch(id, { familyId: id });
    await logActivity(ctx, user, {
      entityType: "contractTemplate",
      entityId: id,
      entityLabel: data.name,
      action: "contractTemplate.created",
      summary: `Created contract template ${data.name} (draft v1)`,
    });
    return id;
  },
});

export const update = mutation({
  args: { id: v.id("contractTemplates"), ...templateFields },
  handler: async (ctx, { id, ...args }) => {
    const user = await requirePermission(ctx, "contractTemplate.manage");
    const before = await getOrThrow(ctx, id, "Contract template");
    if (before.status !== "draft") {
      throw appError("CONFLICT", "Only draft templates can be edited. Create a new version to change an active template.");
    }
    const data = normalise(args);
    if (data.companyId) await getOrThrow(ctx, data.companyId, "Company");
    // Explicitly include optional keys so emptied fields are cleared.
    const patch: Record<string, unknown> = { ...data };
    for (const key of OPTIONAL_TEXT) patch[key] = data[key];
    patch.companyId = data.companyId;
    await ctx.db.patch(id, { ...(patch as Partial<Doc<"contractTemplates">>), updatedBy: user._id, updatedAt: Date.now() });
    const changes = diffFields(before as unknown as Record<string, unknown>, {
      ...patch,
      clauses: data.clauses.map((c) => c.heading),
    }).map((c) => (c.field === "clauses" ? { ...c, from: before.clauses.map((x) => x.heading).join(", ") } : c));
    await logActivity(ctx, user, {
      entityType: "contractTemplate",
      entityId: id,
      entityLabel: data.name,
      action: "contractTemplate.updated",
      summary: `Updated ${data.name} (draft v${before.version})`,
      changes,
    });
  },
});

/** Copies a version into a new draft version of the same family (returns the existing draft if one exists). */
export const createNewVersion = mutation({
  args: { id: v.id("contractTemplates") },
  handler: async (ctx, { id }) => {
    const user = await requirePermission(ctx, "contractTemplate.manage");
    const source = await getOrThrow(ctx, id, "Contract template");
    const versions = await familyVersions(ctx, source.familyId);
    const existingDraft = versions.find((x) => x.status === "draft");
    if (existingDraft) return existingDraft._id;
    const nextVersion = Math.max(...versions.map((x) => x.version)) + 1;
    const newId = await ctx.db.insert("contractTemplates", {
      ...pickFields(source),
      status: "draft",
      version: nextVersion,
      familyId: source.familyId,
      previousVersionId: source._id,
      isDefault: false,
      createdBy: user._id,
      updatedAt: Date.now(),
    });
    await logActivity(ctx, user, {
      entityType: "contractTemplate",
      entityId: newId,
      entityLabel: source.name,
      action: "contractTemplate.version_created",
      summary: `Created draft v${nextVersion} of ${source.name} from v${source.version}`,
    });
    return newId;
  },
});

/** Clone into a brand-new template family. */
export const clone = mutation({
  args: { id: v.id("contractTemplates"), name: v.optional(v.string()) },
  handler: async (ctx, { id, name }) => {
    const user = await requirePermission(ctx, "contractTemplate.manage");
    const source = await getOrThrow(ctx, id, "Contract template");
    const newName = (name?.trim() || `Copy of ${source.name}`).slice(0, 120);
    const newId = await ctx.db.insert("contractTemplates", {
      ...pickFields(source),
      name: newName,
      status: "draft",
      version: 1,
      familyId: "pending",
      isDefault: false,
      createdBy: user._id,
      updatedAt: Date.now(),
    });
    await ctx.db.patch(newId, { familyId: newId });
    await logActivity(ctx, user, {
      entityType: "contractTemplate",
      entityId: newId,
      entityLabel: newName,
      action: "contractTemplate.cloned",
      summary: `Cloned ${source.name} v${source.version} as ${newName}`,
    });
    return newId;
  },
});

export const setStatus = mutation({
  args: { id: v.id("contractTemplates"), status: v.union(v.literal("active"), v.literal("inactive")) },
  handler: async (ctx, { id, status }) => {
    const user = await requirePermission(ctx, "contractTemplate.manage");
    const template = await getOrThrow(ctx, id, "Contract template");
    if (template.status === status) return;
    const now = Date.now();
    if (status === "active") {
      const unknown = validateTemplateText(templateTexts(template));
      if (unknown.length > 0) {
        throw appError("INVALID", `Fix unknown variables before activating: ${unknown.map((u) => `{{${u}}}`).join(", ")}`);
      }
      if (!template.numberingFormat.includes("{seq}")) {
        throw appError("INVALID", "Numbering format must include {seq}.");
      }
      // One active version per family; carry the default flag forward.
      const versions = await familyVersions(ctx, template.familyId);
      let inheritDefault = false;
      for (const other of versions) {
        if (other._id !== id && other.status === "active") {
          inheritDefault ||= other.isDefault;
          await ctx.db.patch(other._id, { status: "inactive", isDefault: false, updatedBy: user._id, updatedAt: now });
        }
      }
      await ctx.db.patch(id, { status: "active", isDefault: template.isDefault || inheritDefault, updatedBy: user._id, updatedAt: now });
    } else {
      await ctx.db.patch(id, { status: "inactive", isDefault: false, updatedBy: user._id, updatedAt: now });
    }
    await logActivity(ctx, user, {
      entityType: "contractTemplate",
      entityId: id,
      entityLabel: template.name,
      action: status === "active" ? "contractTemplate.activated" : "contractTemplate.deactivated",
      summary: `${status === "active" ? "Activated" : "Deactivated"} ${template.name} v${template.version}`,
      changes: [{ field: "status", from: template.status, to: status }],
    });
  },
});

/** One default per scope: (company or "any company", direction). */
export const setDefault = mutation({
  args: { id: v.id("contractTemplates") },
  handler: async (ctx, { id }) => {
    const user = await requirePermission(ctx, "contractTemplate.manage");
    const template = await getOrThrow(ctx, id, "Contract template");
    if (template.status !== "active") throw appError("INVALID", "Only an active template can be the default.");
    const actives = await ctx.db
      .query("contractTemplates")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .take(500);
    const now = Date.now();
    for (const other of actives) {
      if (
        other._id !== id &&
        other.isDefault &&
        other.direction === template.direction &&
        (other.companyId ?? null) === (template.companyId ?? null)
      ) {
        await ctx.db.patch(other._id, { isDefault: false, updatedBy: user._id, updatedAt: now });
      }
    }
    await ctx.db.patch(id, { isDefault: true, updatedBy: user._id, updatedAt: now });
    await logActivity(ctx, user, {
      entityType: "contractTemplate",
      entityId: id,
      entityLabel: template.name,
      action: "contractTemplate.default_set",
      summary: `Set ${template.name} as the default ${template.direction === "any" ? "" : `${template.direction} `}template`,
    });
  },
});
