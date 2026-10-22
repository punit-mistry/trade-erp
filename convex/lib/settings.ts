import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

export const SETTINGS_KEY = "global";

export const DEFAULT_DISPATCH_CHECKLIST = [
  "Commercial invoice prepared",
  "Packing list prepared",
  "Contract checked",
  "Shipping instructions verified",
  "B/L draft reviewed",
  "Final B/L received",
  "Customs documentation completed",
  "Required shipping documents uploaded",
  "Dispatch approval completed",
];

export const DEFAULT_ALLOWED_FILE_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "text/csv",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

export type AppSettings = Omit<Doc<"settings">, "_id" | "_creationTime" | "key">;

export const DEFAULT_SETTINGS: AppSettings = {
  tradeNumberPrefix: "TRD",
  contractNumberPrefix: "CTR",
  blNumberPrefix: "BL",
  counterpartyCodePrefix: "CP",
  sequencePadding: 4,
  defaultCurrency: "USD",
  dateFormat: "dd MMM yyyy",
  maxUploadMb: 20,
  allowedFileTypes: DEFAULT_ALLOWED_FILE_TYPES,
  dispatchChecklistTemplate: DEFAULT_DISPATCH_CHECKLIST,
  updatedAt: 0,
};

/** Returns the stored settings or defaults (settings row is created lazily by admins/seed). */
export async function getSettings(ctx: QueryCtx | MutationCtx): Promise<AppSettings> {
  const row = await ctx.db
    .query("settings")
    .withIndex("by_key", (q) => q.eq("key", SETTINGS_KEY))
    .unique();
  if (!row) return DEFAULT_SETTINGS;
  const { _id, _creationTime, key, ...rest } = row;
  void _id;
  void _creationTime;
  void key;
  return rest;
}
