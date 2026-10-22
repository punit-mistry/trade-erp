"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "convex/react";
import { Building2, ImageUp, Loader2, MoreHorizontal, Pencil, Plus, Power, Star, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { EmptyState } from "@/components/shared/empty-state";
import { FormField } from "@/components/shared/form-field";
import { CountryCombobox, LookupCombobox } from "@/components/shared/lookup-combobox";
import { TableSkeleton } from "@/components/shared/states";
import { StatusBadge, TonePill } from "@/components/shared/status-badge";
import { TableCard } from "@/components/shared/table-parts";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { getErrorMessage } from "@/lib/errors";
import { ACTIVE_STATUS } from "@/lib/status";

type Company = Doc<"companies"> & { logoUrl: string | null };

const optional = z.string().trim().max(500).optional().or(z.literal(""));

const schema = z.object({
  name: z.string().trim().min(2, "Company name is required."),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9-]{2,12}$/, "2–12 characters: A–Z, 0–9 or hyphen."),
  legalName: optional,
  address: optional,
  city: optional,
  country: optional,
  phone: optional,
  email: z.string().trim().email("Enter a valid email address.").optional().or(z.literal("")),
  website: optional,
  taxId: optional,
  registrationNumber: optional,
  baseCurrency: optional,
  signatoryName: optional,
  signatoryTitle: optional,
  bankName: optional,
  bankAddress: optional,
  beneficiaryName: optional,
  accountNumber: optional,
  swift: z
    .string()
    .trim()
    .regex(/^([A-Za-z0-9]{8}|[A-Za-z0-9]{11})$/, "SWIFT/BIC must be 8 or 11 letters/digits.")
    .optional()
    .or(z.literal("")),
  bankInstructions: optional,
});

type FormValues = z.input<typeof schema>;

const FIELDS = Object.keys(schema.shape) as (keyof FormValues)[];

function toForm(c?: Company): FormValues {
  const values = {} as Record<keyof FormValues, string>;
  for (const f of FIELDS) values[f] = ((c?.[f as keyof Company] as string | undefined) ?? "") as string;
  return values;
}

export function CompaniesTab() {
  const companies = useQuery(api.companies.list);
  const setDefault = useMutation(api.companies.setDefault);
  const setActive = useMutation(api.companies.setActive);
  const [editing, setEditing] = useState<Company | "new" | null>(null);

  const run = async (fn: () => Promise<unknown>, success: string) => {
    try {
      await fn();
      toast.success(success);
    } catch (e) {
      toast.error(getErrorMessage(e));
    }
  };

  return (
    <>
      <TableCard
        toolbar={
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              Internal companies (your legal entities) appear on trades and contract headers. The default is preselected
              when booking a trade.
            </p>
            <Button size="sm" onClick={() => setEditing("new")}>
              <Plus /> Add Company
            </Button>
          </div>
        }
      >
        {companies === undefined ? (
          <TableSkeleton rows={3} columns={5} />
        ) : companies.length === 0 ? (
          <EmptyState
            icon={Building2}
            title="No internal companies yet"
            description="Add the company that books trades and issues contracts."
            action={
              <Button size="sm" onClick={() => setEditing("new")}>
                <Plus /> Add Company
              </Button>
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Company</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Country</TableHead>
                <TableHead>Base currency</TableHead>
                <TableHead>Signatory</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {companies.map((c) => (
                <TableRow key={c._id}>
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      {c.logoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={c.logoUrl} alt="" className="size-7 rounded border object-contain" />
                      ) : (
                        <div className="flex size-7 items-center justify-center rounded border bg-muted text-muted-foreground">
                          <Building2 className="size-3.5" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <button type="button" className="font-medium hover:underline" onClick={() => setEditing(c)}>
                          {c.name}
                        </button>
                        {c.isDefault && (
                          <TonePill tone="brand" className="ml-2">
                            <Star className="size-3" /> Default
                          </TonePill>
                        )}
                        {c.legalName && <div className="truncate text-xs text-muted-foreground">{c.legalName}</div>}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{c.code}</TableCell>
                  <TableCell>{c.country || "—"}</TableCell>
                  <TableCell>{c.baseCurrency || "—"}</TableCell>
                  <TableCell>{c.signatoryName ? `${c.signatoryName}${c.signatoryTitle ? `, ${c.signatoryTitle}` : ""}` : "—"}</TableCell>
                  <TableCell>
                    <StatusBadge value={c.active ? "active" : "inactive"} map={ACTIVE_STATUS} />
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${c.name}`}>
                          <MoreHorizontal />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => setEditing(c)}>
                          <Pencil /> Edit
                        </DropdownMenuItem>
                        {!c.isDefault && c.active && (
                          <DropdownMenuItem onSelect={() => run(() => setDefault({ id: c._id }), `${c.name} is now the default`)}>
                            <Star /> Make default
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          disabled={c.isDefault && c.active}
                          onSelect={() =>
                            run(() => setActive({ id: c._id, active: !c.active }), c.active ? "Company deactivated" : "Company activated")
                          }
                        >
                          <Power /> {c.active ? "Deactivate" : "Activate"}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </TableCard>
      {editing && <CompanyDialog company={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function CompanyDialog({ company, onClose }: { company?: Company; onClose: () => void }) {
  const create = useMutation(api.companies.create);
  const update = useMutation(api.companies.update);
  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: toForm(company) });
  const { register, handleSubmit, control, formState } = form;
  const errors = formState.errors;

  const onSubmit = handleSubmit(async (values) => {
    const parsed = schema.parse(values);
    const payload = Object.fromEntries(
      Object.entries(parsed).map(([k, v]) => [k, typeof v === "string" && v.trim() === "" ? undefined : v]),
    ) as { name: string; code: string } & Record<string, string | undefined>;
    try {
      if (company) await update({ id: company._id, ...payload });
      else await create(payload);
      toast.success(company ? "Company updated" : "Company created");
      onClose();
    } catch (e) {
      toast.error(getErrorMessage(e));
    }
  });

  const text = (name: keyof FormValues, label: string, opts: { required?: boolean; placeholder?: string; help?: string } = {}) => (
    <FormField label={label} htmlFor={`co-${name}`} required={opts.required} error={errors[name]?.message} help={opts.help}>
      <Input id={`co-${name}`} placeholder={opts.placeholder} aria-invalid={!!errors[name]} {...register(name)} />
    </FormField>
  );

  return (
    <Dialog open onOpenChange={(o) => !o && !formState.isSubmitting && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{company ? `Edit ${company.name}` : "Add internal company"}</DialogTitle>
          <DialogDescription>These details print on contract headers, bank clauses and signature blocks.</DialogDescription>
        </DialogHeader>
        <form id="company-form" onSubmit={onSubmit} className="space-y-6">
          <fieldset className="grid gap-4 sm:grid-cols-2">
            <legend className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Identity</legend>
            {text("name", "Display name", { required: true })}
            {text("code", "Code", { required: true, placeholder: "e.g. SGP", help: "Short unique code used in filters." })}
            {text("legalName", "Registered legal name")}
            <FormField label="Base currency" htmlFor="co-baseCurrency">
              <Controller
                control={control}
                name="baseCurrency"
                render={({ field }) => (
                  <LookupCombobox id="co-baseCurrency" kind="currency" value={field.value || undefined} onChange={(v) => field.onChange(v ?? "")} />
                )}
              />
            </FormField>
            {text("taxId", "Tax ID")}
            {text("registrationNumber", "Registration number")}
          </fieldset>

          <fieldset className="grid gap-4 sm:grid-cols-2">
            <legend className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Address & contact</legend>
            <FormField label="Address" htmlFor="co-address" className="sm:col-span-2">
              <Textarea id="co-address" rows={2} {...register("address")} />
            </FormField>
            {text("city", "City")}
            <FormField label="Country" htmlFor="co-country">
              <Controller
                control={control}
                name="country"
                render={({ field }) => (
                  <CountryCombobox id="co-country" value={field.value || undefined} onChange={(v) => field.onChange(v ?? "")} />
                )}
              />
            </FormField>
            {text("phone", "Phone", { placeholder: "+65 6123 4567" })}
            {text("email", "Email")}
            {text("website", "Website")}
          </fieldset>

          <fieldset className="grid gap-4 sm:grid-cols-2">
            <legend className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Signatory</legend>
            {text("signatoryName", "Signatory name")}
            {text("signatoryTitle", "Signatory title", { placeholder: "e.g. Director" })}
          </fieldset>

          <fieldset className="grid gap-4 sm:grid-cols-2">
            <legend className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Bank details</legend>
            {text("beneficiaryName", "Beneficiary name")}
            {text("bankName", "Bank name")}
            {text("accountNumber", "Account no. / IBAN")}
            {text("swift", "SWIFT / BIC")}
            <FormField label="Bank address" htmlFor="co-bankAddress" className="sm:col-span-2">
              <Input id="co-bankAddress" {...register("bankAddress")} />
            </FormField>
            <FormField label="Other bank instructions" htmlFor="co-bankInstructions" className="sm:col-span-2">
              <Textarea id="co-bankInstructions" rows={2} {...register("bankInstructions")} />
            </FormField>
          </fieldset>

          {company && <LogoField company={company} />}
        </form>
        <DialogFooter>
          <Button variant="outline" type="button" onClick={onClose} disabled={formState.isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" form="company-form" disabled={formState.isSubmitting}>
            {formState.isSubmitting && <Loader2 className="animate-spin" />}
            {company ? "Save changes" : "Create company"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LogoField({ company }: { company: Company }) {
  const generateUrl = useMutation(api.companies.generateLogoUploadUrl);
  const setLogo = useMutation(api.companies.setLogo);
  const logoUrl = useQuery(api.companies.getLogoUrl, { id: company._id });
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function upload(file: File) {
    if (!["image/png", "image/jpeg", "image/webp", "image/svg+xml"].includes(file.type)) {
      toast.error("Logo must be a PNG, JPEG, WebP or SVG image.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Logo must be 2 MB or smaller.");
      return;
    }
    setBusy(true);
    try {
      const url = await generateUrl();
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": file.type }, body: file });
      if (!res.ok) throw new Error("Upload failed. Please try again.");
      const { storageId } = (await res.json()) as { storageId: Id<"_storage"> };
      await setLogo({ id: company._id, storageId });
      toast.success("Logo updated");
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <fieldset>
      <legend className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Logo</legend>
      <div className="flex items-center gap-4">
        <div className="flex size-16 items-center justify-center rounded-md border bg-muted">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt={`${company.name} logo`} className="max-h-14 max-w-14 object-contain" />
          ) : (
            <Building2 className="size-5 text-muted-foreground" />
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            className="sr-only"
            id="company-logo"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void upload(f);
            }}
          />
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => inputRef.current?.click()}>
            {busy ? <Loader2 className="animate-spin" /> : <ImageUp />} {logoUrl ? "Replace logo" : "Upload logo"}
          </Button>
          {logoUrl && (
            <ConfirmDialog
              trigger={
                <Button type="button" variant="ghost" size="sm">
                  <Trash2 /> Remove
                </Button>
              }
              title="Remove logo?"
              description="Contracts generated from now on will print without a logo."
              confirmLabel="Remove logo"
              destructive
              successMessage="Logo removed"
              onConfirm={() => setLogo({ id: company._id })}
            />
          )}
        </div>
        <p className="text-xs text-muted-foreground">PNG, JPEG, WebP or SVG · max 2 MB. Used on contract and B/L headers.</p>
      </div>
    </fieldset>
  );
}
