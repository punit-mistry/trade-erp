/**
 * Permission matrix. Pure module — imported by Convex functions (enforcement)
 * and by the UI (to hide actions the viewer cannot perform). The UI check is
 * a convenience only; every mutation re-checks on the server.
 */
import type { Role } from "./validators";

export type Permission =
  | "users.manage"
  | "settings.manage"
  | "masters.manage"
  | "audit.view"
  | "counterparty.create"
  | "counterparty.edit"
  | "counterparty.archive"
  | "counterparty.import"
  | "commodity.manage"
  | "trade.create"
  | "trade.editDraft"
  | "trade.editAny"
  | "trade.submit"
  | "trade.review"
  | "trade.confirm"
  | "trade.cancel"
  | "trade.close"
  | "trade.valueOverride"
  | "tradeTemplate.manage"
  | "contract.prepare"
  | "contract.issue"
  | "contract.overrideNumber"
  | "contract.updateStatus"
  | "contractTemplate.manage"
  | "bl.prepare"
  | "bl.review"
  | "bl.recordIssued"
  | "dispatch.update"
  | "dispatch.configure"
  | "document.upload"
  | "document.review"
  | "document.archive"
  | "fx.record"
  | "fx.review"
  | "dashboard.business";

const ALL: Role[] = ["admin", "manager", "staff"];
const MGMT: Role[] = ["admin", "manager"];
const ADMIN: Role[] = ["admin"];

export const PERMISSIONS: Record<Permission, Role[]> = {
  "users.manage": ADMIN,
  "settings.manage": ADMIN,
  "masters.manage": ADMIN, // managers may receive the "masters.manage" grant
  "audit.view": MGMT,
  "counterparty.create": ALL,
  "counterparty.edit": ALL, // staff: only records they created or are assigned to
  "counterparty.archive": MGMT,
  "counterparty.import": MGMT,
  "commodity.manage": MGMT,
  "trade.create": ALL,
  "trade.editDraft": ALL, // staff: only own/assigned drafts
  "trade.editAny": MGMT,
  "trade.submit": ALL,
  "trade.review": MGMT,
  "trade.confirm": MGMT,
  "trade.cancel": MGMT,
  "trade.close": MGMT,
  "trade.valueOverride": MGMT,
  "tradeTemplate.manage": MGMT,
  "contract.prepare": ALL,
  "contract.issue": MGMT,
  "contract.overrideNumber": MGMT,
  "contract.updateStatus": MGMT,
  "contractTemplate.manage": MGMT,
  "bl.prepare": ALL,
  "bl.review": MGMT,
  "bl.recordIssued": MGMT,
  "dispatch.update": ALL,
  "dispatch.configure": MGMT,
  "document.upload": ALL,
  "document.review": MGMT,
  "document.archive": MGMT,
  "fx.record": ALL,
  "fx.review": MGMT,
  "dashboard.business": MGMT,
};

/** Grants that can be given to managers on top of their role. */
export const GRANTABLE: Permission[] = ["masters.manage", "settings.manage"];

export type PermissionSubject = {
  role?: Role | null;
  status?: "active" | "pending" | "disabled";
  grants?: string[];
};

export function hasPermission(user: PermissionSubject | null | undefined, permission: Permission): boolean {
  if (!user || user.status !== "active" || !user.role) return false;
  if (PERMISSIONS[permission].includes(user.role)) return true;
  return user.role === "manager" && GRANTABLE.includes(permission) && (user.grants ?? []).includes(permission);
}

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Admin",
  manager: "Manager",
  staff: "Staff",
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  admin: "Full access, including users, security, masters, templates and audit logs.",
  manager: "Runs operations: confirms trades, issues contracts, reviews B/Ls and approvals.",
  staff: "Prepares drafts: suppliers, trades, contracts, B/L data, uploads and checklists.",
};
