/**
 * Status machines. Pure module shared by server (enforcement) and UI (which
 * buttons to show). Trade, contract, B/L and dispatch states are independent:
 * a confirmed trade does not imply a signed contract or completed dispatch.
 */
import type { Permission } from "./roles";
import type { BlStatus, ContractStatus, DispatchItemStatus, TradeStatus } from "./validators";

type Transition<S extends string> = { to: S; permission: Permission; label: string };

export const TRADE_TRANSITIONS: Record<TradeStatus, Transition<TradeStatus>[]> = {
  draft: [
    { to: "pending_review", permission: "trade.submit", label: "Submit for Review" },
    { to: "confirmed", permission: "trade.confirm", label: "Confirm Trade" },
    { to: "cancelled", permission: "trade.cancel", label: "Cancel Trade" },
  ],
  pending_review: [
    { to: "confirmed", permission: "trade.confirm", label: "Approve & Confirm" },
    { to: "draft", permission: "trade.review", label: "Return for Correction" },
    { to: "cancelled", permission: "trade.cancel", label: "Cancel Trade" },
  ],
  confirmed: [
    { to: "closed", permission: "trade.close", label: "Close Trade" },
    { to: "cancelled", permission: "trade.cancel", label: "Cancel Trade" },
  ],
  cancelled: [],
  closed: [],
};

export function canTransitionTrade(from: TradeStatus, to: TradeStatus) {
  return TRADE_TRANSITIONS[from].find((t) => t.to === to) ?? null;
}

/** Trades whose commercial data may still be edited. */
export const EDITABLE_TRADE_STATUSES: TradeStatus[] = ["draft", "pending_review"];

export const CONTRACT_TRANSITIONS: Record<ContractStatus, Transition<ContractStatus>[]> = {
  draft: [
    { to: "generated", permission: "contract.issue", label: "Finalise & Issue" },
    { to: "cancelled", permission: "contract.updateStatus", label: "Cancel Contract" },
  ],
  generated: [
    { to: "sent", permission: "contract.updateStatus", label: "Mark as Sent" },
    { to: "cancelled", permission: "contract.updateStatus", label: "Cancel Contract" },
  ],
  sent: [
    { to: "pending_signature", permission: "contract.updateStatus", label: "Awaiting Signature" },
    { to: "cancelled", permission: "contract.updateStatus", label: "Cancel Contract" },
  ],
  pending_signature: [
    { to: "rate_fixed", permission: "contract.updateStatus", label: "Mark Rate Fixed" },
    { to: "closed", permission: "contract.updateStatus", label: "Close Contract" },
    { to: "cancelled", permission: "contract.updateStatus", label: "Cancel Contract" },
  ],
  rate_fixed: [
    { to: "closed", permission: "contract.updateStatus", label: "Close Contract" },
    { to: "cancelled", permission: "contract.updateStatus", label: "Cancel Contract" },
  ],
  closed: [],
  cancelled: [],
  superseded: [],
};

export function canTransitionContract(from: ContractStatus, to: ContractStatus) {
  return CONTRACT_TRANSITIONS[from].find((t) => t.to === to) ?? null;
}

/** Contract states whose snapshot is frozen (issued). Only "draft" is mutable. */
export const ISSUED_CONTRACT_STATUSES: ContractStatus[] = [
  "generated",
  "sent",
  "pending_signature",
  "rate_fixed",
  "closed",
];

/** "Active contract" for dashboard metrics: current, issued, not closed/cancelled. */
export const ACTIVE_CONTRACT_STATUSES: ContractStatus[] = ["generated", "sent", "pending_signature", "rate_fixed"];

export const BL_TRANSITIONS: Record<BlStatus, Transition<BlStatus>[]> = {
  draft: [{ to: "prepared", permission: "bl.prepare", label: "Mark Prepared" }],
  prepared: [
    { to: "under_review", permission: "bl.prepare", label: "Send for Review" },
    { to: "draft", permission: "bl.prepare", label: "Back to Draft" },
  ],
  under_review: [
    { to: "verified", permission: "bl.review", label: "Verify" },
    { to: "draft", permission: "bl.review", label: "Return for Correction" },
  ],
  // verified → issued requires the external B/L number + uploaded carrier document (checked in mutation)
  verified: [{ to: "issued", permission: "bl.recordIssued", label: "Record Carrier-Issued B/L" }],
  issued: [],
  superseded: [],
};

export function canTransitionBl(from: BlStatus, to: BlStatus) {
  return BL_TRANSITIONS[from].find((t) => t.to === to) ?? null;
}

export function checklistProgress(items: { status: DispatchItemStatus }[]) {
  const total = items.length;
  const complete = items.filter((i) => i.status === "complete").length;
  const blocked = items.filter((i) => i.status === "blocked").length;
  return {
    total,
    complete,
    blocked,
    percent: total === 0 ? 0 : Math.round((complete / total) * 100),
  };
}
