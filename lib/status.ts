/**
 * Presentation metadata for every status enum. One place for labels + tones,
 * consumed by <StatusBadge>. Tone names map to classes in status-badge.tsx.
 */
import type {
  BlStatus,
  ContractStatus,
  DispatchItemStatus,
  DocumentType,
  TradeStatus,
} from "@/convex/lib/validators";

export type Tone = "neutral" | "info" | "brand" | "success" | "warning" | "danger" | "muted" | "cyan";

export type StatusMeta = { label: string; tone: Tone; description?: string };

export const TRADE_STATUS: Record<TradeStatus, StatusMeta> = {
  draft: { label: "Draft", tone: "neutral", description: "Being prepared; can be edited freely." },
  pending_review: { label: "In Review", tone: "warning", description: "Submitted and awaiting manager approval." },
  confirmed: { label: "Confirmed", tone: "success", description: "Commercially agreed and locked for editing." },
  cancelled: { label: "Cancelled", tone: "danger", description: "Cancelled; excluded from active metrics." },
  closed: { label: "Closed", tone: "muted", description: "Completed and closed." },
};

export const CONTRACT_STATUS: Record<ContractStatus, StatusMeta> = {
  draft: { label: "Draft", tone: "neutral", description: "Editable; regenerates from the trade." },
  generated: { label: "Generated", tone: "info", description: "Finalised and issued — content frozen." },
  sent: { label: "Sent", tone: "brand", description: "Sent to the counterparty." },
  pending_signature: { label: "Pending Signature", tone: "warning", description: "Awaiting counter-signature." },
  rate_fixed: { label: "Rate Fixed", tone: "cyan", description: "Price / rate has been fixed." },
  closed: { label: "Closed", tone: "muted" },
  cancelled: { label: "Cancelled", tone: "danger" },
  superseded: { label: "Superseded", tone: "muted", description: "Replaced by a newer version." },
};

export const BL_STATUS: Record<BlStatus, StatusMeta> = {
  draft: { label: "Draft", tone: "neutral", description: "Internal draft B/L data." },
  prepared: { label: "Prepared", tone: "info" },
  under_review: { label: "Under Review", tone: "warning" },
  verified: { label: "Verified", tone: "brand", description: "Internally verified — not yet carrier-issued." },
  issued: { label: "Carrier Issued", tone: "success", description: "Carrier-issued B/L received and recorded." },
  superseded: { label: "Superseded", tone: "muted" },
};

export const DISPATCH_ITEM_STATUS: Record<DispatchItemStatus, StatusMeta> = {
  pending: { label: "Pending", tone: "neutral" },
  in_progress: { label: "In Progress", tone: "info" },
  complete: { label: "Complete", tone: "success" },
  blocked: { label: "Blocked", tone: "danger" },
};

export const REVIEW_STATUS: Record<"pending" | "approved" | "rejected", StatusMeta> = {
  pending: { label: "Pending Review", tone: "warning" },
  approved: { label: "Approved", tone: "success" },
  rejected: { label: "Rejected", tone: "danger" },
};

export const FX_REVIEW_STATUS: Record<"pending" | "verified" | "rejected", StatusMeta> = {
  pending: { label: "Pending", tone: "warning" },
  verified: { label: "Verified", tone: "success" },
  rejected: { label: "Rejected", tone: "danger" },
};

export const ACTIVE_STATUS: Record<"active" | "inactive", StatusMeta> = {
  active: { label: "Active", tone: "success" },
  inactive: { label: "Inactive", tone: "muted" },
};

export const USER_STATUS: Record<"active" | "pending" | "disabled", StatusMeta> = {
  active: { label: "Active", tone: "success" },
  pending: { label: "Awaiting Approval", tone: "warning" },
  disabled: { label: "Disabled", tone: "muted" },
};

export const TEMPLATE_STATUS: Record<"draft" | "active" | "inactive", StatusMeta> = {
  draft: { label: "Draft", tone: "neutral" },
  active: { label: "Active", tone: "success" },
  inactive: { label: "Inactive", tone: "muted" },
};

export const DIRECTION_LABEL: Record<"purchase" | "sales", string> = {
  purchase: "Purchase",
  sales: "Sales",
};

export const DOCUMENT_TYPE_LABEL: Record<DocumentType, string> = {
  contract: "Trade Contract",
  signed_contract: "Signed Contract",
  commercial_invoice: "Commercial Invoice",
  packing_list: "Packing List",
  bl_draft: "B/L Draft",
  bl_issued: "Issued B/L (Carrier)",
  purchase_order: "Purchase Order",
  shipping_instructions: "Shipping Instructions",
  certificate: "Certificate",
  bank_document: "Bank Document",
  customs: "Customs Document",
  other: "Other",
};
