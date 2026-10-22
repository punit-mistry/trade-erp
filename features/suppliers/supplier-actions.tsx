"use client";

import { useMutation } from "convex/react";
import Link from "next/link";
import { useState } from "react";
import { Archive, ArchiveRestore, Copy, Eye, MoreHorizontal, Pencil, Power } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useViewer } from "@/hooks/use-viewer";

type Cp = Pick<Doc<"counterparties">, "_id" | "name" | "code" | "status" | "archived" | "createdBy" | "assignedTo">;

/** Permission-aware helpers shared by the list rows and the detail header. */
export function useSupplierPermissions(cp: Cp | undefined) {
  const { viewer, can } = useViewer();
  const owns = !!cp && !!viewer && (viewer.role !== "staff" || cp.createdBy === viewer._id || cp.assignedTo === viewer._id);
  return {
    canEdit: !!cp && !cp.archived && can("counterparty.edit") && owns,
    canToggleStatus: !!cp && !cp.archived && can("counterparty.edit") && owns,
    canClone: can("counterparty.create"),
    canArchive: can("counterparty.archive"),
    canBookTrade: can("trade.create"),
  };
}

export function ArchiveSupplierDialog({
  cp,
  open,
  onOpenChange,
}: {
  cp: Cp;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const archive = useMutation(api.counterparties.archive);
  const restore = useMutation(api.counterparties.restore);
  return cp.archived ? (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Restore ${cp.name}?`}
      description="The supplier will appear in lists and trade selectors again."
      confirmLabel="Restore"
      successMessage={`Restored ${cp.name}`}
      onConfirm={() => restore({ id: cp._id })}
    />
  ) : (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Archive ${cp.name}?`}
      description="Archived suppliers are hidden from lists and can't be chosen on new trades. Existing trades, contracts and documents keep their references. Suppliers with open trades can't be archived."
      confirmLabel="Archive"
      destructive
      successMessage={`Archived ${cp.name}`}
      onConfirm={() => archive({ id: cp._id })}
    />
  );
}

export function StatusToggleDialog({
  cp,
  open,
  onOpenChange,
}: {
  cp: Cp;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const setStatus = useMutation(api.counterparties.setStatus);
  const next = cp.status === "active" ? "inactive" : "active";
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`${next === "active" ? "Activate" : "Deactivate"} ${cp.name}?`}
      description={
        next === "inactive"
          ? "Inactive suppliers stay visible in lists but are not suggested on new trades."
          : "The supplier will be suggested on new trades again."
      }
      confirmLabel={next === "active" ? "Activate" : "Deactivate"}
      successMessage={`${cp.name} is now ${next}`}
      onConfirm={() => setStatus({ id: cp._id, status: next })}
    />
  );
}

export function SupplierRowActions({ cp }: { cp: Cp }) {
  const perms = useSupplierPermissions(cp);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${cp.name}`}>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem asChild>
            <Link href={`/suppliers/${cp._id}`}>
              <Eye /> View
            </Link>
          </DropdownMenuItem>
          {perms.canEdit && (
            <DropdownMenuItem asChild>
              <Link href={`/suppliers/${cp._id}/edit`}>
                <Pencil /> Edit
              </Link>
            </DropdownMenuItem>
          )}
          {perms.canClone && (
            <DropdownMenuItem asChild>
              <Link href={`/suppliers/new?cloneFrom=${cp._id}`}>
                <Copy /> Clone
              </Link>
            </DropdownMenuItem>
          )}
          {perms.canToggleStatus && (
            <DropdownMenuItem onSelect={() => setStatusOpen(true)}>
              <Power /> {cp.status === "active" ? "Deactivate" : "Activate"}
            </DropdownMenuItem>
          )}
          {perms.canArchive && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant={cp.archived ? "default" : "destructive"}
                onSelect={() => setArchiveOpen(true)}
              >
                {cp.archived ? <ArchiveRestore /> : <Archive />} {cp.archived ? "Restore" : "Archive"}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <ArchiveSupplierDialog cp={cp} open={archiveOpen} onOpenChange={setArchiveOpen} />
      <StatusToggleDialog cp={cp} open={statusOpen} onOpenChange={setStatusOpen} />
    </>
  );
}
