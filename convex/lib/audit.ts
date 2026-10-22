import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { displayName } from "./auth";
import type { EntityType } from "./validators";

export type FieldChange = { field: string; from?: string; to?: string };

export async function logActivity(
  ctx: MutationCtx,
  actor: Doc<"users"> | null,
  entry: {
    entityType: EntityType;
    entityId: string;
    entityLabel?: string;
    tradeId?: Id<"trades">;
    action: string;
    summary: string;
    changes?: FieldChange[];
  },
) {
  await ctx.db.insert("activityLogs", {
    actorId: actor?._id,
    actorName: actor ? displayName(actor) : "System",
    ...entry,
    changes: entry.changes && entry.changes.length > 0 ? entry.changes : undefined,
  });
}

function stringify(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/** Field-level diff of `patch` against `before` (only keys present in patch). */
export function diffFields(
  before: Record<string, unknown>,
  patch: Record<string, unknown>,
  ignore: string[] = ["updatedAt", "updatedBy", "searchText", "inheritedFields"],
): FieldChange[] {
  const changes: FieldChange[] = [];
  for (const [field, to] of Object.entries(patch)) {
    if (ignore.includes(field)) continue;
    const a = stringify(before[field]);
    const b = stringify(to);
    if (a !== b) changes.push({ field, from: a, to: b });
  }
  return changes;
}
