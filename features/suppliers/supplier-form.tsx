"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Controller, useForm, useWatch, type FieldPath } from "react-hook-form";
import { AlertTriangle, Copy, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Combobox } from "@/components/shared/combobox";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { FormField } from "@/components/shared/form-field";
import { CountryCombobox, LookupCombobox } from "@/components/shared/lookup-combobox";
import { Section } from "@/components/shared/section";
import { useDebouncedValue } from "@/hooks/use-debounce";
import { useUnsavedChangesWarning } from "@/hooks/use-unsaved-changes";
import { useViewer } from "@/hooks/use-viewer";
import { getErrorMessage } from "@/lib/errors";
import {
  EMPTY_SUPPLIER,
  SUPPLIER_ROLES,
  SUPPLIER_TYPES,
  supplierFormSchema,
  toCounterpartyInput,
  type SupplierFormValues,
} from "./supplier-schema";

type Props =
  | { mode: "create"; initial?: SupplierFormValues; clonedFrom?: { name: string; code: string } }
  | { mode: "edit"; counterparty: Doc<"counterparties">; initial: SupplierFormValues };

export function SupplierForm(props: Props) {
  const router = useRouter();
  const { viewer } = useViewer();
  const create = useMutation(api.counterparties.create);
  const update = useMutation(api.counterparties.update);
  const users = useQuery(api.users.directory);
  const editingId = props.mode === "edit" ? props.counterparty._id : undefined;

  const form = useForm<SupplierFormValues>({
    resolver: zodResolver(supplierFormSchema),
    defaultValues: props.initial ?? EMPTY_SUPPLIER,
    mode: "onTouched",
  });
  const {
    register,
    control,
    handleSubmit,
    reset,
    setFocus,
    formState: { errors, isDirty, isSubmitting },
  } = form;

  const [submitting, setSubmitting] = useState(false);
  const busy = submitting || isSubmitting;
  const [cancelOpen, setCancelOpen] = useState(false);
  const [dupConfirm, setDupConfirm] = useState<{ values: SupplierFormValues; addAnother: boolean } | null>(null);
  const submitLock = useRef(false);
  useUnsavedChangesWarning(isDirty && !busy);

  // Duplicate detection (non-blocking warning).
  const [watchedName, watchedTaxId, watchedReg] = useWatch({ control, name: ["name", "taxId", "registrationNumber"] });
  const name = useDebouncedValue(watchedName, 400);
  const taxId = useDebouncedValue(watchedTaxId, 400);
  const registrationNumber = useDebouncedValue(watchedReg, 400);
  const duplicates = useQuery(
    api.counterparties.checkDuplicates,
    name.trim().length >= 2
      ? {
          name,
          taxId: taxId || undefined,
          registrationNumber: registrationNumber || undefined,
          excludeId: editingId,
        }
      : "skip",
  );
  const hasDuplicates = (duplicates?.length ?? 0) > 0;

  const isStaff = viewer?.role === "staff";

  useEffect(() => {
    setFocus("name");
  }, [setFocus]);

  async function save(values: SupplierFormValues, addAnother: boolean) {
    if (submitLock.current) return;
    submitLock.current = true;
    setSubmitting(true);
    try {
      const input = toCounterpartyInput(values);
      if (props.mode === "edit") {
        await update({ id: props.counterparty._id, input });
        toast.success(`Saved ${input.name}`);
        reset(values);
        router.push(`/suppliers/${props.counterparty._id}`);
      } else {
        const id = await create({ input });
        toast.success(`Created ${input.name}`);
        if (addAnother) {
          reset(EMPTY_SUPPLIER);
          window.scrollTo({ top: 0, behavior: "smooth" });
          setTimeout(() => setFocus("name"), 50);
        } else {
          reset(values);
          router.push(`/suppliers/${id}`);
        }
      }
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      submitLock.current = false;
      setSubmitting(false);
    }
  }

  const onSubmit = (addAnother: boolean) =>
    handleSubmit(
      async (values) => {
        if (hasDuplicates) {
          setDupConfirm({ values, addAnother });
          return;
        }
        await save(values, addAnother);
      },
      () => toast.error("Please fix the highlighted fields."),
    );

  const cancelHref = props.mode === "edit" ? `/suppliers/${props.counterparty._id}` : "/suppliers";
  const err = (field: FieldPath<SupplierFormValues>) => {
    const e = field.split(".").reduce<unknown>((acc, k) => (acc as Record<string, unknown> | undefined)?.[k], errors);
    return (e as { message?: string } | undefined)?.message;
  };

  const text = (field: Exclude<FieldPath<SupplierFormValues>, "roles" | `roles.${number}`>, label: string, opts?: { required?: boolean; placeholder?: string; help?: string; tip?: string; type?: string }) => (
    <FormField label={label} htmlFor={field} required={opts?.required} help={opts?.help} tip={opts?.tip} error={err(field)}>
      <Input
        id={field}
        type={opts?.type ?? "text"}
        placeholder={opts?.placeholder}
        aria-invalid={Boolean(err(field)) || undefined}
        {...register(field)}
      />
    </FormField>
  );

  const lookup = (
    field: "defaultCurrency" | "defaultPaymentTerm" | "defaultIncoterm" | "defaultPricingTerm" | "defaultFreightTerms" | "defaultLoadingLocation" | "defaultDischargeLocation",
    kind: "currency" | "paymentTerm" | "incoterm" | "pricingTerm" | "freightTerm" | "port",
    label: string,
    tip?: string,
  ) => (
    <FormField label={label} htmlFor={field} tip={tip} error={err(field)}>
      <Controller
        control={control}
        name={field}
        render={({ field: f }) => (
          <LookupCombobox id={field} kind={kind} value={f.value || undefined} onChange={(v) => f.onChange(v ?? "")} />
        )}
      />
    </FormField>
  );

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void onSubmit(false)();
      }}
      noValidate
      className="space-y-5 pb-4"
    >
      {props.mode === "create" && props.clonedFrom && (
        <div className="flex items-center gap-2 rounded-lg border border-cyan/30 bg-cyan/8 px-3 py-2 text-sm">
          <Copy className="size-4 text-cyan" />
          Copied from {props.clonedFrom.name} ({props.clonedFrom.code}). Update the fields that changed.
        </div>
      )}

      {hasDuplicates && (
        <div role="status" className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2.5 text-sm">
          <div className="flex items-center gap-2 font-medium">
            <AlertTriangle className="size-4 text-warning" /> Possible duplicate
          </div>
          <ul className="mt-1 space-y-0.5 pl-6 text-muted-foreground">
            {duplicates!.map((d) => (
              <li key={d._id}>
                <Link href={`/suppliers/${d._id}`} target="_blank" className="font-medium text-foreground hover:underline">
                  {d.name}
                </Link>{" "}
                ({d.code}) — {d.reason}
                {d.archived && " · archived"}
              </li>
            ))}
          </ul>
          <p className="mt-1 pl-6 text-xs text-muted-foreground">
            The same company should not be created twice just because it plays another role — edit its roles instead.
          </p>
        </div>
      )}

      <Section title="Basic information" description="How this company is identified across trades and contracts.">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <div className="md:col-span-2">{text("name", "Supplier name", { required: true, placeholder: "e.g. Golden Agro Exports Pte" })}</div>
          <FormField label="Supplier code" help="Generated automatically on save.">
            <Input
              value={props.mode === "edit" ? props.counterparty.code : "Auto-generated"}
              disabled
              className="font-mono"
              aria-label="Supplier code"
            />
          </FormField>
          <FormField label="Supplier type" htmlFor="type" required error={err("type")}>
            <Controller
              control={control}
              name="type"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="type" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SUPPLIER_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </FormField>
          <FormField label="Country" htmlFor="country" error={err("country")}>
            <Controller
              control={control}
              name="country"
              render={({ field }) => (
                <CountryCombobox id="country" value={field.value || undefined} onChange={(v) => field.onChange(v ?? "")} />
              )}
            />
          </FormField>
          <FormField label="Status" htmlFor="status" error={err("status")}>
            <Controller
              control={control}
              name="status"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="status" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </FormField>
          <FormField
            label="Roles"
            required
            className="md:col-span-2 lg:col-span-3"
            tip="One company can play several roles. Purchase trades suggest suppliers/sellers; sales trades suggest buyers."
            error={err("roles")}
          >
            <Controller
              control={control}
              name="roles"
              render={({ field }) => (
                <div role="group" aria-label="Roles" className="flex flex-wrap gap-2">
                  {SUPPLIER_ROLES.map((r) => {
                    const checked = field.value.includes(r.value);
                    return (
                      <label
                        key={r.value}
                        className="flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2 text-sm has-[[data-state=checked]]:border-primary/50 has-[[data-state=checked]]:bg-accent"
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(c) =>
                            field.onChange(c ? [...field.value, r.value] : field.value.filter((x) => x !== r.value))
                          }
                          className="mt-0.5"
                        />
                        <span>
                          <span className="font-medium">{r.label}</span>
                          <span className="block text-xs text-muted-foreground">{r.help}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            />
          </FormField>
        </div>
      </Section>

      <Section title="Contact information">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {text("contactPerson", "Primary contact person")}
          {text("email", "Email", { type: "email", placeholder: "name@company.com" })}
          {text("phone", "Phone", { type: "tel", placeholder: "+91 98765 43210", help: "Include the country code." })}
          {text("website", "Website", { placeholder: "company.com" })}
          {text("taxId", "Tax ID", { help: "GSTIN, VAT, TIN or equivalent." })}
          {text("registrationNumber", "Registration number", { help: "Company / trade registration number." })}
          <FormField label="Registered address" htmlFor="address" className="md:col-span-2 lg:col-span-3" error={err("address")}>
            <Textarea id="address" rows={2} {...register("address")} />
          </FormField>
          {text("city", "City")}
          {text("state", "State / region")}
          {text("postalCode", "Postal code")}
        </div>
      </Section>

      <Section
        title="Default commercial terms"
        description="Suggested automatically when this supplier is chosen on a new trade. Users can override them per trade; changing them here never alters existing trades."
      >
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {lookup("defaultCurrency", "currency", "Default currency")}
          {lookup("defaultPaymentTerm", "paymentTerm", "Default payment term", "When and how the buyer pays, e.g. D/P at Sight or a Letter of Credit.")}
          {lookup("defaultIncoterm", "incoterm", "Default Incoterm", "International delivery term defining who pays freight/insurance and where risk passes (e.g. FOB, CIF).")}
          {lookup("defaultPricingTerm", "pricingTerm", "Default pricing term", "Basis of the price — fixed, provisional, or to be fixed later.")}
          <FormField label="Default origin of goods" htmlFor="defaultOrigin">
            <Controller
              control={control}
              name="defaultOrigin"
              render={({ field }) => (
                <CountryCombobox id="defaultOrigin" value={field.value || undefined} onChange={(v) => field.onChange(v ?? "")} />
              )}
            />
          </FormField>
          {text("defaultManufacturer", "Default manufacturer / approved factory")}
          {lookup("defaultLoadingLocation", "port", "Preferred loading location")}
          {lookup("defaultDischargeLocation", "port", "Preferred discharge location")}
          {lookup("defaultFreightTerms", "freightTerm", "Default freight terms", "Freight Prepaid (seller pays) or Freight Collect (buyer pays at destination) — printed on the B/L.")}
          <FormField label="Shipment preferences" htmlFor="shipmentPreferences" className="md:col-span-2 lg:col-span-3">
            <Textarea
              id="shipmentPreferences"
              rows={2}
              placeholder="e.g. Prefers 20' containers, max 25 MT per container, no transhipment"
              {...register("shipmentPreferences")}
            />
          </FormField>
        </div>
      </Section>

      <Section title="Bank details" description="Reused on contracts as this party's bank instructions.">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {text("bankName", "Bank name")}
          {text("beneficiaryName", "Beneficiary name")}
          {text("accountNumber", "Account number / IBAN")}
          {text("swift", "SWIFT / BIC", { placeholder: "8 or 11 characters" })}
          <FormField label="Bank address" htmlFor="bankAddress" className="md:col-span-2">
            <Input id="bankAddress" {...register("bankAddress")} />
          </FormField>
          <FormField label="Other bank instructions" htmlFor="bankInstructions" className="md:col-span-2 lg:col-span-3">
            <Textarea id="bankInstructions" rows={2} placeholder="Intermediary bank, reference format…" {...register("bankInstructions")} />
          </FormField>
        </div>
      </Section>

      <Section title="Internal" description="Visible to your team only — never printed on external documents.">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <FormField
            label="Assigned staff member"
            htmlFor="assignedTo"
            help={isStaff ? "Only managers can change the assignment." : "Staff can edit suppliers assigned to them."}
          >
            <Controller
              control={control}
              name="assignedTo"
              render={({ field }) => (
                <Combobox
                  id="assignedTo"
                  options={(users ?? []).map((u) => ({ value: u._id, label: u.name, hint: u.role ?? undefined }))}
                  loading={users === undefined}
                  value={field.value || undefined}
                  onChange={(v) => field.onChange(v ?? "")}
                  placeholder="Unassigned"
                  disabled={isStaff}
                />
              )}
            />
          </FormField>
          <FormField label="Internal notes" htmlFor="notes" className="md:col-span-2 lg:col-span-3">
            <Textarea id="notes" rows={3} {...register("notes")} />
          </FormField>
          <p className="text-xs text-muted-foreground md:col-span-3">
            Attachments can be uploaded from the supplier’s Documents tab after saving.
          </p>
        </div>
      </Section>

      <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center justify-end gap-2 border-t bg-background/95 px-4 py-3 backdrop-blur md:-mx-6 md:px-6">
        <span className="mr-auto text-xs text-muted-foreground">
          {isDirty ? "Unsaved changes" : props.mode === "edit" ? "No changes" : "Fields marked * are required"}
        </span>
        <Button
          type="button"
          variant="ghost"
          disabled={busy}
          onClick={() => (isDirty ? setCancelOpen(true) : router.push(cancelHref))}
        >
          Cancel
        </Button>
        {props.mode === "create" && (
          <Button type="button" variant="outline" disabled={busy} onClick={() => void onSubmit(true)()}>
            Save and Add Another
          </Button>
        )}
        <Button type="submit" disabled={busy}>
          {busy && <Loader2 className="animate-spin" />}
          {props.mode === "edit" ? "Save Changes" : "Save Supplier"}
        </Button>
      </div>

      <ConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title="Discard unsaved changes?"
        description="Your changes to this supplier will be lost."
        confirmLabel="Discard changes"
        destructive
        onConfirm={() => {
          reset();
          router.push(cancelHref);
        }}
      />
      <ConfirmDialog
        open={dupConfirm !== null}
        onOpenChange={(o) => !o && setDupConfirm(null)}
        title="Save despite possible duplicate?"
        description={`A supplier with the same ${duplicates?.[0]?.reason.replace("Same ", "") ?? "details"} already exists (${duplicates?.[0]?.name ?? ""}). Save anyway?`}
        confirmLabel="Save anyway"
        onConfirm={async () => {
          if (dupConfirm) await save(dupConfirm.values, dupConfirm.addAnother);
        }}
      />
    </form>
  );
}

export type SupplierId = Id<"counterparties">;
