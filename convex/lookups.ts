import { v } from "convex/values";
import { mutation, query, type MutationCtx } from "./_generated/server";
import { logActivity } from "./lib/audit";
import { appError, getOrThrow, requirePermission, requireViewer } from "./lib/auth";
import { DEFAULT_LOOKUPS } from "./lib/defaults";
import { lookupKindV, type LookupKind } from "./lib/validators";

export type LookupOption = { value: string; label: string; description?: string };

/** Active options for one lookup kind (falls back to built-in defaults when none configured). */
export const list = query({
  args: { kind: lookupKindV, includeInactive: v.optional(v.boolean()) },
  handler: async (ctx, { kind, includeInactive }): Promise<LookupOption[]> => {
    await requireViewer(ctx);
    const rows = await ctx.db
      .query("lookups")
      .withIndex("by_kind", (q) => q.eq("kind", kind))
      .take(500);
    if (rows.length === 0) return DEFAULT_LOOKUPS[kind];
    return rows
      .filter((r) => includeInactive || r.active)
      .map((r) => ({ value: r.value, label: r.label, description: r.description }));
  },
});

/**
 * Admin view of one lookup kind, including inactive rows. `materialised` is
 * false while the kind is still served from built-in defaults (rows have no id).
 */
export const listAll = query({
  args: { kind: lookupKindV },
  handler: async (ctx, { kind }) => {
    await requirePermission(ctx, "masters.manage");
    const rows = await ctx.db
      .query("lookups")
      .withIndex("by_kind", (q) => q.eq("kind", kind))
      .take(500);
    if (rows.length === 0) {
      return {
        materialised: false,
        rows: DEFAULT_LOOKUPS[kind].map((d, i) => ({
          _id: null,
          kind,
          value: d.value,
          label: d.label,
          description: d.description,
          sortOrder: i,
          active: true,
        })),
      };
    }
    return { materialised: true, rows };
  },
});

/** Copies built-in defaults into the table so they become editable. Idempotent. */
export async function materialiseDefaults(ctx: MutationCtx, kind: LookupKind) {
  const existing = await ctx.db
    .query("lookups")
    .withIndex("by_kind", (q) => q.eq("kind", kind))
    .take(500);
  let next = existing.reduce((m, r) => Math.max(m, r.sortOrder + 1), 0);
  let inserted = 0;
  for (const d of DEFAULT_LOOKUPS[kind]) {
    if (existing.some((r) => r.value === d.value)) continue;
    await ctx.db.insert("lookups", {
      kind,
      value: d.value,
      label: d.label,
      description: d.description,
      sortOrder: next++,
      active: true,
    });
    inserted++;
  }
  return inserted;
}

async function ensureMaterialised(ctx: MutationCtx, kind: LookupKind) {
  const any = await ctx.db
    .query("lookups")
    .withIndex("by_kind", (q) => q.eq("kind", kind))
    .first();
  if (!any) await materialiseDefaults(ctx, kind);
}

/** Create or edit a value. `id` omitted = add (or edit a not-yet-materialised default by value). */
export const upsert = mutation({
  args: {
    kind: lookupKindV,
    id: v.optional(v.id("lookups")),
    value: v.string(),
    label: v.optional(v.string()),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requirePermission(ctx, "masters.manage");
    await ensureMaterialised(ctx, args.kind);
    const value = args.value.trim();
    if (!value || value.length > 120) throw appError("INVALID", "Value is required (max 120 characters).");
    if (args.kind === "currency" && !/^[A-Z]{3}$/.test(value)) {
      throw appError("INVALID", "Currency must be a 3-letter ISO code, e.g. USD.");
    }
    const label = args.label?.trim() || value;
    const description = args.description?.trim() || undefined;

    const sameValue = await ctx.db
      .query("lookups")
      .withIndex("by_kind_value", (q) => q.eq("kind", args.kind).eq("value", value))
      .first();

    if (args.id) {
      const row = await getOrThrow(ctx, args.id, "Lookup value");
      if (row.kind !== args.kind) throw appError("INVALID", "Lookup kind mismatch.");
      if (sameValue && sameValue._id !== row._id) throw appError("CONFLICT", `“${value}” already exists.`);
      await ctx.db.patch(row._id, { value, label, description });
      await logActivity(ctx, user, {
        entityType: "lookup",
        entityId: row._id,
        entityLabel: `${args.kind}: ${value}`,
        action: "lookup.updated",
        summary: `Updated ${args.kind} value “${value}”`,
        changes: [
          ...(row.value !== value ? [{ field: "value", from: row.value, to: value }] : []),
          ...(row.label !== label ? [{ field: "label", from: row.label, to: label }] : []),
        ],
      });
      return row._id;
    }

    if (sameValue) {
      // Editing a default that was just materialised (UI had no id yet).
      await ctx.db.patch(sameValue._id, { label, description });
      return sameValue._id;
    }
    const last = await ctx.db
      .query("lookups")
      .withIndex("by_kind", (q) => q.eq("kind", args.kind))
      .order("desc")
      .first();
    const id = await ctx.db.insert("lookups", {
      kind: args.kind,
      value,
      label,
      description,
      sortOrder: (last?.sortOrder ?? -1) + 1,
      active: true,
    });
    await logActivity(ctx, user, {
      entityType: "lookup",
      entityId: id,
      entityLabel: `${args.kind}: ${value}`,
      action: "lookup.created",
      summary: `Added ${args.kind} value “${value}”`,
    });
    return id;
  },
});

export const setActive = mutation({
  args: { kind: lookupKindV, value: v.string(), active: v.boolean() },
  handler: async (ctx, { kind, value, active }) => {
    const user = await requirePermission(ctx, "masters.manage");
    await ensureMaterialised(ctx, kind);
    const row = await ctx.db
      .query("lookups")
      .withIndex("by_kind_value", (q) => q.eq("kind", kind).eq("value", value))
      .first();
    if (!row) throw appError("NOT_FOUND", "Lookup value not found.");
    if (!active) {
      const activeCount = (
        await ctx.db
          .query("lookups")
          .withIndex("by_kind", (q) => q.eq("kind", kind))
          .take(500)
      ).filter((r) => r.active).length;
      if (activeCount <= 1) throw appError("CONFLICT", "At least one active value is required.");
    }
    await ctx.db.patch(row._id, { active });
    await logActivity(ctx, user, {
      entityType: "lookup",
      entityId: row._id,
      entityLabel: `${kind}: ${value}`,
      action: active ? "lookup.activated" : "lookup.deactivated",
      summary: `${active ? "Activated" : "Deactivated"} ${kind} value “${value}”`,
    });
  },
});

/** Moves a value one position up or down within its kind. */
export const reorder = mutation({
  args: { kind: lookupKindV, value: v.string(), direction: v.union(v.literal("up"), v.literal("down")) },
  handler: async (ctx, { kind, value, direction }) => {
    await requirePermission(ctx, "masters.manage");
    await ensureMaterialised(ctx, kind);
    const rows = await ctx.db
      .query("lookups")
      .withIndex("by_kind", (q) => q.eq("kind", kind))
      .take(500);
    const index = rows.findIndex((r) => r.value === value);
    const swapWith = direction === "up" ? index - 1 : index + 1;
    if (index < 0 || swapWith < 0 || swapWith >= rows.length) return;
    // Normalise sort orders to positions, then swap.
    const ordered = [...rows];
    [ordered[index], ordered[swapWith]] = [ordered[swapWith], ordered[index]];
    for (let i = 0; i < ordered.length; i++) {
      if (ordered[i].sortOrder !== i) await ctx.db.patch(ordered[i]._id, { sortOrder: i });
    }
  },
});
