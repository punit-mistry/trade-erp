import { z } from "zod";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import type { CounterpartyInput } from "@/convex/counterparties";

export const SUPPLIER_TYPES = [
  { value: "domestic", label: "Domestic" },
  { value: "international", label: "International" },
] as const;

export const SUPPLIER_ROLES = [
  { value: "supplier", label: "Supplier", help: "Supplies goods to us." },
  { value: "seller", label: "Seller", help: "Sells to us under purchase contracts." },
  { value: "buyer", label: "Buyer", help: "Buys from us under sales contracts." },
] as const;

export const TYPE_LABEL: Record<"domestic" | "international", string> = {
  domestic: "Domestic",
  international: "International",
};

export const ROLE_LABEL: Record<"supplier" | "buyer" | "seller", string> = {
  supplier: "Supplier",
  buyer: "Buyer",
  seller: "Seller",
};

const optionalText = (max = 500) => z.string().trim().max(max, `Maximum ${max} characters.`);

export const PHONE_PATTERN = /^\+[0-9][0-9\s().-]{5,24}$/;
const WEBSITE_PATTERN = /^(https?:\/\/)?([\w-]+\.)+[a-z]{2,}(\/\S*)?$/i;
const SWIFT_PATTERN = /^[A-Za-z0-9]{8}([A-Za-z0-9]{3})?$/;

export const supplierFormSchema = z.object({
  name: z.string().trim().min(2, "Supplier name must be at least 2 characters.").max(200),
  type: z.enum(["domestic", "international"]),
  country: optionalText(100),
  roles: z.array(z.enum(["supplier", "buyer", "seller"])).min(1, "Select at least one role."),
  status: z.enum(["active", "inactive"]),
  contactPerson: optionalText(120),
  email: optionalText(200).refine((v) => v === "" || z.email().safeParse(v).success, "Enter a valid email address."),
  phone: optionalText(40).refine(
    (v) => v === "" || PHONE_PATTERN.test(v),
    "Include the country code, e.g. +91 98765 43210.",
  ),
  website: optionalText(200).refine((v) => v === "" || WEBSITE_PATTERN.test(v), "Enter a valid website, e.g. example.com."),
  address: optionalText(500),
  city: optionalText(100),
  state: optionalText(100),
  postalCode: optionalText(20),
  taxId: optionalText(60),
  registrationNumber: optionalText(60),
  defaultCurrency: optionalText(10),
  defaultPaymentTerm: optionalText(120),
  defaultIncoterm: optionalText(20),
  defaultPricingTerm: optionalText(120),
  defaultOrigin: optionalText(100),
  defaultManufacturer: optionalText(200),
  defaultLoadingLocation: optionalText(200),
  defaultDischargeLocation: optionalText(200),
  defaultFreightTerms: optionalText(120),
  shipmentPreferences: optionalText(1000),
  bankName: optionalText(200),
  bankAddress: optionalText(500),
  beneficiaryName: optionalText(200),
  accountNumber: optionalText(60),
  swift: optionalText(11).refine((v) => v === "" || SWIFT_PATTERN.test(v), "SWIFT/BIC must be 8 or 11 letters/digits."),
  bankInstructions: optionalText(1000),
  notes: optionalText(4000),
  assignedTo: z.string(),
});

export type SupplierFormValues = z.infer<typeof supplierFormSchema>;

export const EMPTY_SUPPLIER: SupplierFormValues = {
  name: "",
  type: "international",
  country: "",
  roles: ["supplier"],
  status: "active",
  contactPerson: "",
  email: "",
  phone: "",
  website: "",
  address: "",
  city: "",
  state: "",
  postalCode: "",
  taxId: "",
  registrationNumber: "",
  defaultCurrency: "",
  defaultPaymentTerm: "",
  defaultIncoterm: "",
  defaultPricingTerm: "",
  defaultOrigin: "",
  defaultManufacturer: "",
  defaultLoadingLocation: "",
  defaultDischargeLocation: "",
  defaultFreightTerms: "",
  shipmentPreferences: "",
  bankName: "",
  bankAddress: "",
  beneficiaryName: "",
  accountNumber: "",
  swift: "",
  bankInstructions: "",
  notes: "",
  assignedTo: "",
};

const TEXT_KEYS = (Object.keys(EMPTY_SUPPLIER) as (keyof SupplierFormValues)[]).filter(
  (k) => !["type", "roles", "status", "assignedTo"].includes(k),
) as Exclude<keyof SupplierFormValues, "type" | "roles" | "status" | "assignedTo">[];

/** Form values → mutation input (blank strings become undefined). */
export function toCounterpartyInput(values: SupplierFormValues): CounterpartyInput {
  const input: Record<string, unknown> = {
    name: values.name.trim(),
    type: values.type,
    roles: values.roles,
    status: values.status,
    assignedTo: values.assignedTo ? (values.assignedTo as Id<"users">) : undefined,
  };
  for (const key of TEXT_KEYS) {
    if (key === "name") continue;
    const v = values[key].trim();
    input[key] = v === "" ? undefined : v;
  }
  return input as CounterpartyInput;
}

/** Stored record → form values. */
export function fromCounterparty(cp: Doc<"counterparties">): SupplierFormValues {
  const values: SupplierFormValues = { ...EMPTY_SUPPLIER };
  for (const key of TEXT_KEYS) values[key] = (cp[key as keyof Doc<"counterparties">] as string | undefined) ?? "";
  values.type = cp.type;
  values.roles = cp.roles;
  values.status = cp.status;
  values.assignedTo = cp.assignedTo ?? "";
  return values;
}

/** "USD · D/P at Sight" — the list's Default Terms cell. */
export function defaultTermsLabel(cp: Pick<Doc<"counterparties">, "defaultCurrency" | "defaultPaymentTerm">): string {
  return [cp.defaultCurrency, cp.defaultPaymentTerm].filter((x) => x && x.trim() !== "").join(" · ") || "—";
}
