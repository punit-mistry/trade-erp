import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { logActivity } from "./audit";
import { appError } from "./auth";
import { documentSearchText } from "./search";
import { getSettings } from "./settings";
import type { DocumentType } from "./validators";

export type NewDocument = {
  storageId: Id<"_storage">;
  fileName: string;
  docType: DocumentType;
  source: "upload" | "generated";
  tradeId?: Id<"trades">;
  contractId?: Id<"contracts">;
  counterpartyId?: Id<"counterparties">;
  blDocumentId?: Id<"blDocuments">;
  dispatchItemId?: Id<"dispatchItems">;
  notes?: string;
  /** Pass to add a new version of an existing logical document. */
  groupKey?: string;
};

/**
 * Validates the stored file (type/size from `_storage` system metadata — not
 * client-provided values), resolves denormalised labels, handles versioning
 * and writes the activity entry. Shared by uploads and generated PDFs.
 */
export async function insertDocument(ctx: MutationCtx, user: Doc<"users">, input: NewDocument): Promise<Id<"documents">> {
  const meta = await ctx.db.system.get(input.storageId);
  if (!meta) throw appError("INVALID", "Uploaded file not found. Please upload again.");
  const settings = await getSettings(ctx);
  const contentType = meta.contentType ?? "application/octet-stream";
  if (!settings.allowedFileTypes.includes(contentType)) {
    await ctx.storage.delete(input.storageId);
    throw appError("INVALID", `File type ${contentType} is not allowed.`);
  }
  if (meta.size > settings.maxUploadMb * 1024 * 1024) {
    await ctx.storage.delete(input.storageId);
    throw appError("INVALID", `File exceeds the ${settings.maxUploadMb} MB limit.`);
  }

  const trade = input.tradeId ? await ctx.db.get(input.tradeId) : null;
  const contract = input.contractId ? await ctx.db.get(input.contractId) : null;
  const counterpartyId = input.counterpartyId ?? trade?.counterpartyId;
  const counterparty = counterpartyId ? await ctx.db.get(counterpartyId) : null;

  let version = 1;
  const groupKey = input.groupKey ?? `${input.docType}:${input.storageId}`;
  if (input.groupKey) {
    const previous = await ctx.db
      .query("documents")
      .withIndex("by_group", (q) => q.eq("groupKey", input.groupKey!))
      .order("desc")
      .first();
    if (previous) {
      version = previous.version + 1;
      await ctx.db.patch(previous._id, { isLatest: false, updatedAt: Date.now() });
    }
  }

  const fileName = input.fileName.trim().slice(0, 200) || "document";
  const labels = {
    tradeNumber: trade?.tradeNumber,
    contractNumber: contract?.contractNumber,
    counterpartyName: counterparty?.name,
  };
  const id = await ctx.db.insert("documents", {
    storageId: input.storageId,
    fileName,
    contentType,
    size: meta.size,
    docType: input.docType,
    tradeId: input.tradeId,
    contractId: input.contractId,
    counterpartyId: counterparty?._id,
    blDocumentId: input.blDocumentId,
    dispatchItemId: input.dispatchItemId,
    ...labels,
    groupKey,
    version,
    isLatest: true,
    source: input.source,
    reviewStatus: input.source === "generated" ? "approved" : "pending",
    notes: input.notes,
    archived: false,
    searchText: documentSearchText({ fileName, notes: input.notes, ...labels }),
    uploadedBy: user._id,
    updatedAt: Date.now(),
  });
  await logActivity(ctx, user, {
    entityType: "document",
    entityId: id,
    entityLabel: fileName,
    tradeId: input.tradeId,
    action: input.source === "generated" ? "document.generated" : "document.uploaded",
    summary: `${input.source === "generated" ? "Generated" : "Uploaded"} ${fileName}${version > 1 ? ` (v${version})` : ""}`,
  });
  return id;
}
