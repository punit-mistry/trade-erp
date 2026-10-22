import { z } from "zod";
import type { Doc } from "@/convex/_generated/dataModel";
import type { CounterpartyInput } from "@/convex/counterparties";
import { downloadCsv, type CsvColumn } from "@/lib/csv";
import { PHONE_PATTERN, ROLE_LABEL, TYPE_LABEL } from "./supplier-schema";

type TextKey = Exclude<keyof CounterpartyInput, "name" | "type" | "roles" | "status" | "assignedTo">;

/** CSV header ↔ field mapping, shared by export, import and the import template. */
export const CSV_TEXT_FIELDS: { header: string; key: TextKey }[] = [
  { header: "Country", key: "country" },
  { header: "Contact Person", key: "contactPerson" },
  { header: "Email", key: "email" },
  { header: "Phone", key: "phone" },
  { header: "Website", key: "website" },
  { header: "Address", key: "address" },
  { header: "City", key: "city" },
  { header: "State", key: "state" },
  { header: "Postal Code", key: "postalCode" },
  { header: "Tax ID", key: "taxId" },
  { header: "Registration Number", key: "registrationNumber" },
  { header: "Default Currency", key: "defaultCurrency" },
  { header: "Default Payment Term", key: "defaultPaymentTerm" },
  { header: "Default Incoterm", key: "defaultIncoterm" },
  { header: "Default Pricing Term", key: "defaultPricingTerm" },
  { header: "Default Origin", key: "defaultOrigin" },
  { header: "Default Manufacturer", key: "defaultManufacturer" },
  { header: "Default Loading Location", key: "defaultLoadingLocation" },
  { header: "Default Discharge Location", key: "defaultDischargeLocation" },
  { header: "Default Freight Terms", key: "defaultFreightTerms" },
  { header: "Shipment Preferences", key: "shipmentPreferences" },
  { header: "Bank Name", key: "bankName" },
  { header: "Bank Address", key: "bankAddress" },
  { header: "Beneficiary Name", key: "beneficiaryName" },
  { header: "Account / IBAN", key: "accountNumber" },
  { header: "SWIFT/BIC", key: "swift" },
  { header: "Bank Instructions", key: "bankInstructions" },
  { header: "Notes", key: "notes" },
];

export const REQUIRED_HEADERS = ["Name", "Type"];

const exportColumns: CsvColumn<Doc<"counterparties">>[] = [
  { header: "Code", value: (r) => r.code },
  { header: "Name", value: (r) => r.name },
  { header: "Type", value: (r) => TYPE_LABEL[r.type] },
  { header: "Roles", value: (r) => r.roles.map((x) => ROLE_LABEL[x]).join("; ") },
  { header: "Status", value: (r) => (r.status === "active" ? "Active" : "Inactive") },
  { header: "Archived", value: (r) => (r.archived ? "Yes" : "No") },
  ...CSV_TEXT_FIELDS.map((f) => ({ header: f.header, value: (r: Doc<"counterparties">) => r[f.key] })),
];

export function exportSuppliersCsv(rows: Doc<"counterparties">[]) {
  const stamp = new Date().toISOString().slice(0, 10);
  downloadCsv(`suppliers-${stamp}.csv`, rows, exportColumns);
}

export function downloadImportTemplate() {
  type Row = Record<string, string>;
  const example: Row = {
    Name: "Example Agro Exports Pte Ltd",
    Type: "International",
    Roles: "Supplier; Seller",
    Status: "Active",
    Country: "Singapore",
    "Contact Person": "Jane Tan",
    Email: "jane@example.com",
    Phone: "+65 6123 4567",
    "Default Currency": "USD",
    "Default Payment Term": "D/P at Sight",
    "Default Incoterm": "CIF",
  };
  const headers = ["Name", "Type", "Roles", "Status", ...CSV_TEXT_FIELDS.map((f) => f.header)];
  downloadCsv(
    "supplier-import-template.csv",
    [example],
    headers.map((h) => ({ header: h, value: (r: Row) => r[h] ?? "" })),
  );
}

const ROLE_ALIASES: Record<string, "supplier" | "buyer" | "seller"> = {
  supplier: "supplier",
  suppliers: "supplier",
  buyer: "buyer",
  buyers: "buyer",
  seller: "seller",
  sellers: "seller",
};

const rowSchema = z.object({
  name: z.string().min(2, "Name is required (min 2 characters)").max(200),
  type: z.enum(["domestic", "international"], { message: "Type must be Domestic or International" }),
  status: z.enum(["active", "inactive"], { message: "Status must be Active or Inactive" }),
  roles: z.array(z.enum(["supplier", "buyer", "seller"])).min(1, "At least one valid role"),
  email: z.string().optional().refine((v) => !v || z.email().safeParse(v).success, "Invalid email"),
  phone: z
    .string()
    .optional()
    .refine((v) => !v || PHONE_PATTERN.test(v), "Phone must include country code, e.g. +91 98765 43210"),
  swift: z
    .string()
    .optional()
    .refine((v) => !v || /^[A-Za-z0-9]{8}([A-Za-z0-9]{3})?$/.test(v), "SWIFT/BIC must be 8 or 11 characters"),
});

export type ParsedImportRow = {
  line: number; // CSV line number (header = 1)
  input: CounterpartyInput | null;
  errors: string[];
  name: string;
};

/** Validates parsed CSV rows client-side; the server validates again on import. */
export function validateImportRows(rows: Record<string, string>[]): ParsedImportRow[] {
  return rows.map((raw, i) => {
    const get = (h: string) => (raw[h] ?? "").trim();
    const rolesRaw = get("Roles");
    const roleTokens = rolesRaw ? rolesRaw.split(/[;,|]/).map((t) => t.trim().toLowerCase()).filter(Boolean) : ["supplier"];
    const unknownRoles = roleTokens.filter((t) => !ROLE_ALIASES[t]);
    const candidate = {
      name: get("Name"),
      type: get("Type").toLowerCase(),
      status: (get("Status") || "active").toLowerCase(),
      roles: [...new Set(roleTokens.map((t) => ROLE_ALIASES[t]).filter(Boolean))],
      email: get("Email") || undefined,
      phone: get("Phone") || undefined,
      swift: get("SWIFT/BIC") || undefined,
    };
    const parsed = rowSchema.safeParse(candidate);
    const errors = parsed.success ? [] : parsed.error.issues.map((iss) => iss.message);
    if (unknownRoles.length) errors.push(`Unknown role(s): ${unknownRoles.join(", ")}`);
    if (errors.length > 0 || !parsed.success) {
      return { line: i + 2, input: null, errors, name: candidate.name || "—" };
    }
    const input: CounterpartyInput = {
      name: parsed.data.name,
      type: parsed.data.type,
      status: parsed.data.status,
      roles: parsed.data.roles,
    };
    for (const f of CSV_TEXT_FIELDS) {
      const value = get(f.header);
      if (value) input[f.key] = value;
    }
    return { line: i + 2, input, errors: [], name: parsed.data.name };
  });
}
