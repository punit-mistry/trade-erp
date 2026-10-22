"use client";

import { useQuery } from "convex/react";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Combobox } from "@/components/shared/combobox";
import { useDebouncedValue } from "@/hooks/use-debounce";

type Role = "supplier" | "buyer" | "seller";

/** Server-searched counterparty selector. Purchases prefer suppliers/sellers, sales prefer buyers. */
export function CounterpartyPicker({
  id,
  value,
  onChange,
  direction,
  invalid,
  disabled,
}: {
  id?: string;
  value: Id<"counterparties"> | undefined;
  onChange: (value: Id<"counterparties"> | undefined) => void;
  direction?: "purchase" | "sales";
  invalid?: boolean;
  disabled?: boolean;
}) {
  const [search, setSearch] = useState("");
  const debounced = useDebouncedValue(search, 200);
  const preferRoles: Role[] | undefined =
    direction === "purchase" ? ["supplier", "seller"] : direction === "sales" ? ["buyer"] : undefined;
  const results = useQuery(api.counterparties.searchForPicker, { search: debounced, preferRoles });
  const selected = useQuery(api.counterparties.get, value ? { id: value } : "skip");
  const roleWord = direction === "purchase" ? "seller/supplier" : "buyer";

  return (
    <Combobox
      id={id}
      value={value}
      onChange={(v) => onChange(v as Id<"counterparties"> | undefined)}
      onSearchChange={setSearch}
      loading={results === undefined}
      selectedLabel={selected?.name}
      placeholder={direction === "sales" ? "Search buyers…" : direction === "purchase" ? "Search suppliers / sellers…" : "Search counterparties…"}
      searchPlaceholder="Name, code, country or contact…"
      emptyText="No matching counterparty. Add it under Suppliers first."
      invalid={invalid}
      disabled={disabled}
      options={(results ?? []).map((c) => ({
        value: c._id,
        label: c.name,
        description: [c.code, c.country, c.type === "domestic" ? "Domestic" : "International"].filter(Boolean).join(" · "),
        hint: direction && !c.matchesRole ? `not a ${roleWord}` : c.roles.join(", "),
      }))}
    />
  );
}

export function CommodityPicker({
  id,
  value,
  onChange,
  invalid,
  disabled,
}: {
  id?: string;
  value: Id<"commodities"> | undefined;
  onChange: (value: Id<"commodities"> | undefined, defaultUom?: string) => void;
  invalid?: boolean;
  disabled?: boolean;
}) {
  const [search, setSearch] = useState("");
  const debounced = useDebouncedValue(search, 200);
  const results = useQuery(api.commodities.searchForPicker, { search: debounced });
  const selected = useQuery(api.commodities.get, value ? { id: value } : "skip");
  return (
    <Combobox
      id={id}
      value={value}
      onChange={(v) => {
        const match = results?.find((r) => r._id === v);
        onChange(v as Id<"commodities"> | undefined, match?.defaultUom);
      }}
      onSearchChange={setSearch}
      loading={results === undefined}
      selectedLabel={selected ? `${selected.name} (${selected.code})` : undefined}
      placeholder="Search commodities…"
      searchPlaceholder="Commodity name, code or HS code…"
      emptyText="No matching commodity. Ask an admin to add it under Companies & Masters."
      invalid={invalid}
      disabled={disabled}
      options={(results ?? []).map((c) => ({
        value: c._id,
        label: `${c.name} (${c.code})`,
        description: [c.hsCode && `HS ${c.hsCode}`, c.grade].filter(Boolean).join(" · ") || undefined,
        hint: c.defaultUom,
      }))}
    />
  );
}

export function CompanySelect({
  id,
  value,
  onChange,
  invalid,
  disabled,
}: {
  id?: string;
  value: Id<"companies"> | undefined;
  onChange: (value: Id<"companies"> | undefined) => void;
  invalid?: boolean;
  disabled?: boolean;
}) {
  const companies = useQuery(api.companies.listActive);
  return (
    <Combobox
      id={id}
      value={value}
      onChange={(v) => onChange(v as Id<"companies"> | undefined)}
      loading={companies === undefined}
      placeholder="Select internal company"
      searchPlaceholder="Search companies…"
      emptyText="No active company. An admin can add one under Companies & Masters."
      invalid={invalid}
      disabled={disabled}
      options={(companies ?? []).map((c) => ({
        value: c._id,
        label: c.name,
        description: [c.code, c.country].filter(Boolean).join(" · "),
        hint: c.isDefault ? "default" : undefined,
      }))}
    />
  );
}

export function ContractTemplateSelect({
  id,
  value,
  onChange,
  direction,
  companyId,
  disabled,
}: {
  id?: string;
  value: Id<"contractTemplates"> | undefined;
  onChange: (value: Id<"contractTemplates"> | undefined) => void;
  direction?: "purchase" | "sales";
  companyId?: Id<"companies">;
  disabled?: boolean;
}) {
  const templates = useQuery(api.contractTemplates.list, { status: "active" });
  const usable = (templates ?? []).filter(
    (t) =>
      (t.direction === "any" || !direction || t.direction === direction) &&
      (!t.companyId || !companyId || t.companyId === companyId),
  );
  return (
    <Combobox
      id={id}
      value={value}
      onChange={(v) => onChange(v as Id<"contractTemplates"> | undefined)}
      loading={templates === undefined}
      placeholder="Use the default template"
      searchPlaceholder="Search templates…"
      emptyText="No active contract template for this trade type."
      disabled={disabled}
      selectedLabel={value && !usable.some((t) => t._id === value) ? "Template not active for this trade" : undefined}
      options={usable.map((t) => ({
        value: t._id,
        label: `${t.name} · v${t.version}`,
        description: [t.direction === "any" ? "Purchase & Sales" : t.direction === "sales" ? "Sales" : "Purchase", t.companyName]
          .filter(Boolean)
          .join(" · "),
        hint: t.isDefault ? "default" : undefined,
      }))}
    />
  );
}
