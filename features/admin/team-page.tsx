"use client";

import { useMutation, useQuery } from "convex/react";
import { Check, Minus, Pencil, ShieldCheck, UserCheck, UserX, Users } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { GRANTABLE, PERMISSIONS, ROLE_DESCRIPTIONS, ROLE_LABELS, type Permission } from "@/convex/lib/roles";
import type { Role } from "@/convex/lib/validators";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Section } from "@/components/shared/section";
import { AccessDenied, TableSkeleton } from "@/components/shared/states";
import { StatusBadge } from "@/components/shared/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useViewer } from "@/hooks/use-viewer";
import { getErrorMessage } from "@/lib/errors";
import { formatDate } from "@/lib/format";
import { USER_STATUS } from "@/lib/status";

type UserRow = {
  _id: Id<"users">;
  _creationTime: number;
  name?: string;
  email?: string;
  title?: string;
  role: Role | null;
  status: "active" | "pending" | "disabled";
  grants: string[];
};

const ROLES: Role[] = ["admin", "manager", "staff"];

const GRANT_LABELS: Partial<Record<Permission, string>> = {
  "masters.manage": "Manage companies & master lists",
  "settings.manage": "Manage system settings",
};

const PERMISSION_GROUPS: { label: string; prefix: string }[] = [
  { label: "Administration", prefix: "users|settings|masters|audit|dashboard" },
  { label: "Suppliers & commodities", prefix: "counterparty|commodity" },
  { label: "Trades", prefix: "trade|tradeTemplate" },
  { label: "Contracts", prefix: "contract|contractTemplate" },
  { label: "B/L, dispatch & documents", prefix: "bl|dispatch|document|fx" },
];

const PERMISSION_LABELS: Record<Permission, string> = {
  "users.manage": "Manage users & roles",
  "settings.manage": "Change system settings",
  "masters.manage": "Manage companies & master lists",
  "audit.view": "View activity log",
  "dashboard.business": "Business-wide dashboard metrics",
  "counterparty.create": "Create suppliers",
  "counterparty.edit": "Edit suppliers (staff: own/assigned)",
  "counterparty.archive": "Archive / restore suppliers",
  "counterparty.import": "Import suppliers from CSV",
  "commodity.manage": "Manage commodities",
  "trade.create": "Book trades",
  "trade.editDraft": "Edit draft trades (staff: own/assigned)",
  "trade.editAny": "Edit any trade",
  "trade.submit": "Submit trades for review",
  "trade.review": "Return trades for correction",
  "trade.confirm": "Confirm trades",
  "trade.cancel": "Cancel trades",
  "trade.close": "Close trades",
  "trade.valueOverride": "Override trade value",
  "tradeTemplate.manage": "Create templates from trades",
  "contract.prepare": "Prepare draft contracts",
  "contract.issue": "Finalise & issue contracts",
  "contract.overrideNumber": "Override contract numbers",
  "contract.updateStatus": "Update contract status",
  "contractTemplate.manage": "Manage contract templates",
  "bl.prepare": "Prepare B/L data",
  "bl.review": "Review & verify B/Ls",
  "bl.recordIssued": "Record carrier-issued B/Ls",
  "dispatch.update": "Update dispatch checklist items",
  "dispatch.configure": "Configure dispatch checklists",
  "document.upload": "Upload documents",
  "document.review": "Approve / reject documents",
  "document.archive": "Archive documents",
  "fx.record": "Record FX rates",
  "fx.review": "Verify FX rates",
};

export function TeamPage() {
  const { viewer, can, isLoading } = useViewer();
  const allowed = can("users.manage");
  const users = useQuery(api.users.list, allowed ? {} : "skip");
  const [editing, setEditing] = useState<UserRow | null>(null);

  if (isLoading) return <TableSkeleton />;
  if (!allowed) return <AccessDenied message="Team & Access is available to administrators only." />;

  const pending = (users ?? []).filter((u) => u.status === "pending");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Team & Access"
        description="Approve new accounts, assign roles and manage extra permissions. Roles are enforced on the server for every action."
      />

      {pending.length > 0 && (
        <Section
          title={`Awaiting approval (${pending.length})`}
          description="New sign-ups cannot access any data until you approve them and assign a role."
          className="border-warning/40"
          contentClassName="p-0"
        >
          <ul className="divide-y">
            {pending.map((u) => (
              <PendingRow key={u._id} user={u} />
            ))}
          </ul>
        </Section>
      )}

      <Section title="Users" description="Everyone with an account in this workspace." contentClassName="p-0">
        {users === undefined ? (
          <TableSkeleton rows={5} columns={6} />
        ) : users.length === 0 ? (
          <EmptyState icon={Users} title="No users yet" />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Extra grants</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead className="w-20 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u) => {
                  const isSelf = u._id === viewer?._id;
                  return (
                    <TableRow key={u._id}>
                      <TableCell className="font-medium">
                        {u.name || "—"}
                        {isSelf && <span className="ml-1.5 text-xs text-muted-foreground">(you)</span>}
                        {u.title && <div className="text-xs font-normal text-muted-foreground">{u.title}</div>}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{u.email || "—"}</TableCell>
                      <TableCell>{u.role ? ROLE_LABELS[u.role] : "—"}</TableCell>
                      <TableCell>
                        <StatusBadge value={u.status} map={USER_STATUS} />
                      </TableCell>
                      <TableCell>
                        {u.grants.length === 0 ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {u.grants.map((g) => (
                              <Badge key={g} variant="outline" className="font-normal">
                                {GRANT_LABELS[g as Permission] ?? g}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{formatDate(u._creationTime)}</TableCell>
                      <TableCell className="text-right">
                        {isSelf ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span tabIndex={0}>
                                <Button variant="ghost" size="icon-sm" disabled aria-label="Edit access">
                                  <Pencil />
                                </Button>
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>You can’t change your own access. Ask another administrator.</TooltipContent>
                          </Tooltip>
                        ) : (
                          <Button variant="ghost" size="icon-sm" onClick={() => setEditing(u)} aria-label={`Edit access for ${u.name || u.email}`}>
                            <Pencil />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </Section>

      <PermissionMatrix />

      {editing && <EditAccessDialog user={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function PendingRow({ user }: { user: UserRow }) {
  const setAccess = useMutation(api.users.setAccess);
  const [role, setRole] = useState<Role>("staff");
  const [pending, setPending] = useState(false);

  async function approve() {
    setPending(true);
    try {
      await setAccess({ userId: user._id, role, status: "active" });
      toast.success(`${user.name || user.email} approved as ${ROLE_LABELS[role]}`);
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setPending(false);
    }
  }

  return (
    <li className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="truncate text-sm font-medium">{user.name || "—"}</div>
        <div className="truncate text-xs text-muted-foreground">
          {user.email} · requested {formatDate(user._creationTime)}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Select value={role} onValueChange={(v) => setRole(v as Role)}>
          <SelectTrigger className="h-8 w-32" aria-label="Role to assign">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ROLES.map((r) => (
              <SelectItem key={r} value={r}>
                {ROLE_LABELS[r]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" onClick={approve} disabled={pending}>
          <UserCheck /> Approve
        </Button>
        <ConfirmDialog
          trigger={
            <Button size="sm" variant="outline">
              <UserX /> Reject
            </Button>
          }
          title="Reject this account?"
          description={`${user.email} will be disabled and cannot access the workspace. You can re-activate it later.`}
          confirmLabel="Reject account"
          destructive
          successMessage="Account rejected"
          onConfirm={() => setAccess({ userId: user._id, status: "disabled" })}
        />
      </div>
    </li>
  );
}

function EditAccessDialog({ user, onClose }: { user: UserRow; onClose: () => void }) {
  const setAccess = useMutation(api.users.setAccess);
  const [role, setRole] = useState<Role>(user.role ?? "staff");
  const [status, setStatus] = useState(user.status);
  const [grants, setGrants] = useState<string[]>(user.grants);
  const [pending, setPending] = useState(false);

  async function save() {
    setPending(true);
    try {
      await setAccess({ userId: user._id, role, status, grants: role === "manager" ? grants : [] });
      toast.success("Access updated");
      onClose();
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !pending && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit access</DialogTitle>
          <DialogDescription>
            {user.name || "—"} · {user.email}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          <div className="space-y-2">
            <Label>Role</Label>
            <RadioGroup value={role} onValueChange={(v) => setRole(v as Role)} className="gap-2">
              {ROLES.map((r) => (
                <label
                  key={r}
                  htmlFor={`role-${r}`}
                  className="flex cursor-pointer items-start gap-3 rounded-md border p-3 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-accent/50"
                >
                  <RadioGroupItem id={`role-${r}`} value={r} className="mt-0.5" />
                  <div>
                    <div className="text-sm font-medium">{ROLE_LABELS[r]}</div>
                    <div className="text-xs text-muted-foreground">{ROLE_DESCRIPTIONS[r]}</div>
                  </div>
                </label>
              ))}
            </RadioGroup>
          </div>
          <div className="space-y-2">
            <Label htmlFor="user-status">Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as UserRow["status"])}>
              <SelectTrigger id="user-status" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="pending">Awaiting approval</SelectItem>
                <SelectItem value="disabled">Disabled</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {role === "manager" && (
            <div className="space-y-2">
              <Label>Extra grants for this manager</Label>
              {GRANTABLE.map((g) => (
                <label key={g} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={grants.includes(g)}
                    onCheckedChange={(c) => setGrants(c ? [...grants, g] : grants.filter((x) => x !== g))}
                  />
                  {GRANT_LABELS[g] ?? g}
                </label>
              ))}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={save} disabled={pending}>
            Save access
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PermissionMatrix() {
  const perms = Object.keys(PERMISSIONS) as Permission[];
  return (
    <Section
      title={
        <span className="inline-flex items-center gap-1.5">
          <ShieldCheck className="size-4 text-primary" /> Permission reference
        </span>
      }
      description="What each role can do. Managers can additionally be granted the items marked “grantable”."
      contentClassName="p-0"
    >
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Permission</TableHead>
              {ROLES.map((r) => (
                <TableHead key={r} className="w-24 text-center">
                  {ROLE_LABELS[r]}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {PERMISSION_GROUPS.map((group) => {
              const re = new RegExp(`^(${group.prefix})\\.`);
              const items = perms.filter((p) => re.test(p));
              return [
                <TableRow key={group.label} className="bg-muted/40 hover:bg-muted/40">
                  <TableCell colSpan={4} className="py-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    {group.label}
                  </TableCell>
                </TableRow>,
                ...items.map((p) => (
                  <TableRow key={p}>
                    <TableCell>
                      {PERMISSION_LABELS[p]}
                      {GRANTABLE.includes(p) && (
                        <Badge variant="outline" className="ml-2 font-normal">
                          grantable
                        </Badge>
                      )}
                    </TableCell>
                    {ROLES.map((r) => (
                      <TableCell key={r} className="text-center">
                        {PERMISSIONS[p].includes(r) ? (
                          <Check className="mx-auto size-4 text-success" aria-label="Allowed" />
                        ) : (
                          <Minus className="mx-auto size-4 text-muted-foreground/50" aria-label="Not allowed" />
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                )),
              ];
            })}
          </TableBody>
        </Table>
      </div>
    </Section>
  );
}
