"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { PageHeader } from "@/components/shared/page-header";
import { AccessDenied, PageSkeleton } from "@/components/shared/states";
import { useViewer } from "@/hooks/use-viewer";
import { SupplierForm } from "./supplier-form";
import { fromCounterparty } from "./supplier-schema";

export function NewSupplierPage({ cloneFrom }: { cloneFrom?: string }) {
  const { can, isLoading } = useViewer();
  const source = useQuery(api.counterparties.get, cloneFrom ? { id: cloneFrom as Id<"counterparties"> } : "skip");

  if (isLoading || (cloneFrom && source === undefined)) return <PageSkeleton />;
  if (!can("counterparty.create")) return <AccessDenied />;

  const initial = source
    ? { ...fromCounterparty(source), name: `${source.name} (Copy)`, status: "active" as const }
    : undefined;

  return (
    <>
      <PageHeader
        title={source ? "Clone Supplier" : "Add Supplier"}
        description="Save a company once and reuse its contacts, default terms and bank details on every trade."
        back={{ href: "/suppliers", label: "Suppliers" }}
      />
      <SupplierForm
        key={source?._id ?? "new"}
        mode="create"
        initial={initial}
        clonedFrom={source ? { name: source.name, code: source.code } : undefined}
      />
    </>
  );
}

export function EditSupplierPage({ id }: { id: Id<"counterparties"> }) {
  const { viewer, can, isLoading } = useViewer();
  const detail = useQuery(api.counterparties.getDetail, { id });

  if (isLoading || detail === undefined) return <PageSkeleton />;
  const cp = detail.counterparty;
  const ownsRecord =
    viewer?.role !== "staff" || cp.createdBy === viewer._id || cp.assignedTo === viewer._id;
  if (!can("counterparty.edit") || !ownsRecord) {
    return <AccessDenied message="Staff can only edit suppliers they created or are assigned to." />;
  }
  if (cp.archived) {
    return <AccessDenied message="This supplier is archived. Restore it from its detail page before editing." />;
  }

  return (
    <>
      <PageHeader
        title={`Edit ${cp.name}`}
        description={<span className="font-mono text-xs">{cp.code}</span>}
        back={{ href: `/suppliers/${cp._id}`, label: cp.name }}
      />
      <SupplierForm key={cp._id} mode="edit" counterparty={cp} initial={fromCounterparty(cp)} />
    </>
  );
}
