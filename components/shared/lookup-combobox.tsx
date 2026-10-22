"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { LookupKind } from "@/convex/lib/validators";
import { COUNTRY_OPTIONS } from "@/lib/countries";
import { Combobox } from "./combobox";

const PLACEHOLDERS: Record<LookupKind, string> = {
  currency: "Select currency",
  incoterm: "Select Incoterm",
  paymentTerm: "Select payment term",
  pricingTerm: "Select pricing term",
  priceType: "Select price type",
  uom: "Select unit",
  port: "Select or type a location",
  freightTerm: "Select freight terms",
  packing: "Select or type packing",
};

/** Searchable selector backed by the configurable `lookups` master list. */
export function LookupCombobox({
  kind,
  value,
  onChange,
  allowCustom,
  id,
  disabled,
  invalid,
  placeholder,
}: {
  kind: LookupKind;
  value: string | undefined;
  onChange: (value: string | undefined) => void;
  allowCustom?: boolean;
  id?: string;
  disabled?: boolean;
  invalid?: boolean;
  placeholder?: string;
}) {
  const options = useQuery(api.lookups.list, { kind });
  return (
    <Combobox
      id={id}
      options={(options ?? []).map((o) => ({ value: o.value, label: o.label, description: o.description }))}
      value={value}
      onChange={(v) => onChange(v)}
      loading={options === undefined}
      allowCustom={allowCustom ?? (kind === "port" || kind === "packing" || kind === "pricingTerm" || kind === "paymentTerm")}
      placeholder={placeholder ?? PLACEHOLDERS[kind]}
      disabled={disabled}
      invalid={invalid}
    />
  );
}

export function CountryCombobox({
  value,
  onChange,
  id,
  disabled,
  invalid,
}: {
  value: string | undefined;
  onChange: (value: string | undefined) => void;
  id?: string;
  disabled?: boolean;
  invalid?: boolean;
}) {
  return (
    <Combobox
      id={id}
      options={COUNTRY_OPTIONS}
      value={value}
      onChange={(v) => onChange(v)}
      allowCustom
      placeholder="Select country"
      searchPlaceholder="Search countries…"
      disabled={disabled}
      invalid={invalid}
    />
  );
}
