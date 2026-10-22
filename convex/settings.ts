import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { diffFields, logActivity } from "./lib/audit";
import { appError, requirePermission, requireViewer } from "./lib/auth";
import { getSettings, SETTINGS_KEY } from "./lib/settings";

/** Effective system settings (stored row or defaults). Any active user. */
export const get = query({
  args: {},
  handler: async (ctx) => {
    await requireViewer(ctx);
    return await getSettings(ctx);
  },
});

const PREFIX = /^[A-Z0-9]{1,8}$/;
const MIME = /^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i;

export const update = mutation({
  args: {
    tradeNumberPrefix: v.string(),
    contractNumberPrefix: v.string(),
    blNumberPrefix: v.string(),
    counterpartyCodePrefix: v.string(),
    sequencePadding: v.number(),
    defaultCurrency: v.string(),
    dateFormat: v.string(),
    maxUploadMb: v.number(),
    allowedFileTypes: v.array(v.string()),
    dispatchChecklistTemplate: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requirePermission(ctx, "settings.manage");
    const prefixes = {
      tradeNumberPrefix: args.tradeNumberPrefix.trim().toUpperCase(),
      contractNumberPrefix: args.contractNumberPrefix.trim().toUpperCase(),
      blNumberPrefix: args.blNumberPrefix.trim().toUpperCase(),
      counterpartyCodePrefix: args.counterpartyCodePrefix.trim().toUpperCase(),
    };
    for (const [key, value] of Object.entries(prefixes)) {
      if (!PREFIX.test(value)) throw appError("INVALID", `${key}: prefixes must be 1–8 characters A–Z / 0–9.`);
    }
    if (!Number.isInteger(args.sequencePadding) || args.sequencePadding < 3 || args.sequencePadding > 8) {
      throw appError("INVALID", "Sequence padding must be a whole number between 3 and 8.");
    }
    const defaultCurrency = args.defaultCurrency.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(defaultCurrency)) throw appError("INVALID", "Default currency must be a 3-letter ISO code.");
    const dateFormat = args.dateFormat.trim();
    if (!/^[dMyHhmsEaLo ,./\-']{4,24}$/.test(dateFormat) || !/y/.test(dateFormat) || !/d/.test(dateFormat)) {
      throw appError("INVALID", "Date format must be a date-fns pattern containing day and year, e.g. dd MMM yyyy.");
    }
    if (!Number.isFinite(args.maxUploadMb) || args.maxUploadMb < 1 || args.maxUploadMb > 100) {
      throw appError("INVALID", "Maximum upload size must be between 1 and 100 MB.");
    }
    const allowedFileTypes = [...new Set(args.allowedFileTypes.map((t) => t.trim().toLowerCase()).filter(Boolean))];
    if (allowedFileTypes.length === 0) throw appError("INVALID", "Allow at least one file type.");
    const badType = allowedFileTypes.find((t) => !MIME.test(t));
    if (badType) throw appError("INVALID", `“${badType}” is not a valid MIME type (e.g. application/pdf).`);
    const dispatchChecklistTemplate = args.dispatchChecklistTemplate.map((s) => s.trim()).filter(Boolean);
    if (dispatchChecklistTemplate.length === 0) throw appError("INVALID", "The dispatch checklist needs at least one item.");
    if (dispatchChecklistTemplate.some((s) => s.length > 120)) throw appError("INVALID", "Checklist items are limited to 120 characters.");

    const next = {
      ...prefixes,
      sequencePadding: args.sequencePadding,
      defaultCurrency,
      dateFormat,
      maxUploadMb: args.maxUploadMb,
      allowedFileTypes,
      dispatchChecklistTemplate,
      updatedBy: user._id,
      updatedAt: Date.now(),
    };
    const before = await getSettings(ctx);
    const row = await ctx.db
      .query("settings")
      .withIndex("by_key", (q) => q.eq("key", SETTINGS_KEY))
      .unique();
    if (row) await ctx.db.patch(row._id, next);
    else await ctx.db.insert("settings", { key: SETTINGS_KEY, ...next });
    await logActivity(ctx, user, {
      entityType: "settings",
      entityId: SETTINGS_KEY,
      entityLabel: "System settings",
      action: "settings.updated",
      summary: "Updated system settings",
      changes: diffFields(before as unknown as Record<string, unknown>, next, ["updatedAt", "updatedBy"]),
    });
  },
});
