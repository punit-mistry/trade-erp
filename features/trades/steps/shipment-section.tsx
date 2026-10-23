"use client";

import { AlertTriangle, ChevronDown, Ship } from "lucide-react";
import { useState } from "react";
import { Controller, useWatch } from "react-hook-form";
import { CONTAINER_TYPES, PACKAGE_TYPES, PALLET_TYPES, packingBreakdown, quantityInMt, SALES_BASIS_LABEL, type SalesBasis } from "@/convex/lib/shipment";
import type { TradeFields } from "@/convex/lib/validators";
import { Combobox } from "@/components/shared/combobox";
import { NumberInput } from "@/components/shared/form-field";
import { LookupCombobox } from "@/components/shared/lookup-combobox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useWizard } from "../wizard-context";
import { WizardField } from "./wizard-field";

const SHIPMENT_FIELDS = [
  "consignee",
  "notifyParty",
  "alsoNotifyParty",
  "salesBasis",
  "lcNumber",
  "placeOfReceipt",
  "placeOfDelivery",
  "freightPayableAt",
  "freightPayableBy",
  "originalBlCount",
  "containerCount",
  "containerType",
  "packageType",
  "packagesPerContainer",
  "packageNetKg",
  "palletsPerContainer",
  "palletType",
  "packingKgPerContainer",
] as const satisfies readonly (keyof TradeFields)[];

const CONTAINER_OPTIONS = CONTAINER_TYPES.map((t) => ({ value: t, label: t }));
const PACKAGE_OPTIONS = PACKAGE_TYPES.map((t) => ({ value: t, label: t }));
const PALLET_OPTIONS = PALLET_TYPES.map((t) => ({ value: t, label: t }));

/**
 * Shipment instructions agreed in the contract: who appears on the B/L, LC
 * basis, places, and the container/packing breakdown. These are the baseline
 * the SI, Draft B/L, OBL and CO/Phyto checks compare against.
 */
export function ShipmentSection() {
  const { form, issues } = useWizard();
  const watched = useWatch({ control: form.control, name: [...SHIPMENT_FIELDS, "direction", "quantity", "uom", "dischargeLocation"] });
  const v = Object.fromEntries([...SHIPMENT_FIELDS, "direction", "quantity", "uom", "dischargeLocation"].map((k, i) => [k, watched[i]])) as Partial<TradeFields>;
  const hasAny = SHIPMENT_FIELDS.some((k) => v[k] !== undefined && v[k] !== "");
  const [open, setOpen] = useState(hasAny || v.direction === "sales");
  const isSales = v.direction === "sales";
  const packing = packingBreakdown(v);
  const contractMt = quantityInMt(v.quantity, v.uom);
  const packingIssue = issues.find((i) => i.field === "packagesPerContainer");

  const num = (name: keyof TradeFields, label: string, opts: { decimals?: number; placeholder?: string; help?: string; tip?: string } = {}) => (
    <WizardField name={name} label={label} help={opts.help} tip={opts.tip}>
      <Controller
        control={form.control}
        name={name}
        render={({ field }) => (
          <NumberInput
            id={`trade-${name}`}
            value={field.value as number | undefined}
            onValueChange={field.onChange}
            maxDecimals={opts.decimals ?? 0}
            placeholder={opts.placeholder}
          />
        )}
      />
    </WizardField>
  );

  const picker = (name: "containerType" | "packageType" | "palletType", label: string, options: { value: string; label: string }[], placeholder: string, help?: string) => (
    <WizardField name={name} label={label} help={help}>
      <Controller
        control={form.control}
        name={name}
        render={({ field }) => (
          <Combobox id={`trade-${name}`} options={options} value={field.value} onChange={(val) => field.onChange(val)} allowCustom placeholder={placeholder} />
        )}
      />
    </WizardField>
  );

  const party = (name: "consignee" | "notifyParty" | "alsoNotifyParty", label: string, help: string) => (
    <WizardField name={name} label={label} help={help}>
      <Textarea id={`trade-${name}`} rows={3} placeholder="Company name&#10;Address" {...form.register(name)} />
    </WizardField>
  );

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="rounded-lg border" data-tour="wizard-shipment">
      <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm font-medium hover:bg-muted/50">
        <span className="inline-flex items-center gap-2">
          <Ship className="size-4 text-muted-foreground" /> Shipment instructions — B/L parties, LC, containers & packing
        </span>
        <ChevronDown className={cn("size-4 shrink-0 transition-transform", open && "rotate-180")} />
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-5 border-t p-3">
        <p className="text-xs text-muted-foreground">
          Agreed in the contract and used for the Shipping Instruction and B/L checks. Container and seal numbers, vessel
          and weights after loading are recorded later on the B/L.
        </p>

        {/* B/L parties */}
        <div className="space-y-3">
          <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">B/L parties</h3>
          {isSales && (
            <div className="grid gap-4 sm:grid-cols-3">
              <WizardField name="salesBasis" label="Sales basis" tip="Under an LC, consignee, notify and document wording must follow the LC exactly.">
                <Controller
                  control={form.control}
                  name="salesBasis"
                  render={({ field }) => (
                    <div role="radiogroup" aria-label="Sales basis" className="flex flex-wrap gap-1">
                      {(Object.keys(SALES_BASIS_LABEL) as SalesBasis[]).map((b) => (
                        <button
                          key={b}
                          type="button"
                          role="radio"
                          aria-checked={field.value === b}
                          onClick={() => field.onChange(field.value === b ? undefined : b)}
                          className={cn(
                            "h-8 rounded-md border px-2.5 text-xs font-medium hover:bg-muted",
                            field.value === b && "border-primary bg-accent text-accent-foreground",
                          )}
                        >
                          {SALES_BASIS_LABEL[b]}
                        </button>
                      ))}
                    </div>
                  )}
                />
              </WizardField>
              {v.salesBasis === "lc" && (
                <WizardField name="lcNumber" label="LC number" className="sm:col-span-2">
                  <Input id="trade-lcNumber" placeholder="e.g. LC/2026/00451" {...form.register("lcNumber")} />
                </WizardField>
              )}
            </div>
          )}
          <div className="grid gap-4 md:grid-cols-3">
            {party("consignee", "Consignee", isSales ? "Buyer by default; follow the LC on LC sales." : "As agreed in the contract.")}
            {party("notifyParty", "Notify party", "Usually the same as the consignee.")}
            {party("alsoNotifyParty", "Also notify", isSales ? "Our company by default." : "Optional.")}
          </div>
        </div>

        {/* Places & B/L terms */}
        <div className="space-y-3">
          <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Places & B/L terms</h3>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <WizardField name="placeOfReceipt" label="Place of receipt">
              <Controller
                control={form.control}
                name="placeOfReceipt"
                render={({ field }) => (
                  <LookupCombobox id="trade-placeOfReceipt" kind="port" value={field.value} onChange={field.onChange} placeholder="Port or inland place" />
                )}
              />
            </WizardField>
            <WizardField
              name="placeOfDelivery"
              label="Place of delivery"
              help={v.dischargeLocation ? `Blank = same as ${v.dischargeLocation}.` : "Blank = same as the discharge location."}
            >
              <Controller
                control={form.control}
                name="placeOfDelivery"
                render={({ field }) => (
                  <LookupCombobox id="trade-placeOfDelivery" kind="port" value={field.value} onChange={field.onChange} placeholder="Only if different" />
                )}
              />
            </WizardField>
            <WizardField name="freightPayableBy" label="Freight payable by" help={isSales ? "Our company by default." : undefined}>
              <Input id="trade-freightPayableBy" {...form.register("freightPayableBy")} />
            </WizardField>
            <WizardField name="freightPayableAt" label="Freight payable at" help="e.g. London">
              <Input id="trade-freightPayableAt" {...form.register("freightPayableAt")} />
            </WizardField>
            {num("originalBlCount", "Original B/Ls", { placeholder: "e.g. 3", help: "Number of originals (e.g. 3/3)." })}
          </div>
        </div>

        {/* Containers & packing */}
        <div className="space-y-3">
          <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Containers & packing</h3>
          <div className="grid gap-4 sm:grid-cols-3">
            {num("containerCount", "Number of containers", { placeholder: "e.g. 5" })}
            {picker("containerType", "Container type", CONTAINER_OPTIONS, "e.g. 20' ST")}
            {picker("packageType", "Package type", PACKAGE_OPTIONS, "e.g. BALES", "Wording on the B/L, e.g. 2,880 BALES.")}
            {num("packagesPerContainer", "Packages per container", { placeholder: "e.g. 576" })}
            {num("packageNetKg", "Net kg per package", { decimals: 3, placeholder: "e.g. 35" })}
            {num("palletsPerContainer", "Pallets per container", { placeholder: "e.g. 16" })}
            {picker("palletType", "Pallet type", PALLET_OPTIONS, "e.g. plastic pallet base", "Must match the SI exactly (plastic vs wooden).")}
            {num("packingKgPerContainer", "Packing weight per container (kg)", {
              decimals: 3,
              placeholder: "e.g. 560",
              tip: "Pallets, wrapping etc. added to the net weight to give the gross weight.",
            })}
          </div>

          {(packing.totalPackages !== undefined || packing.netKgPerContainer !== undefined) && (
            <div className="rounded-md border bg-muted/40 p-3 text-sm" aria-live="polite">
              <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-2 lg:grid-cols-4">
                <Calc label="Total packages" value={packing.totalPackages} />
                <Calc label="Total pallets" value={packing.totalPallets} />
                <Calc label="Net / container" value={packing.netKgPerContainer} unit="kg" />
                <Calc label="Gross / container" value={packing.grossKgPerContainer} unit="kg" />
                <Calc label="Total net" value={packing.totalNetKg} unit="kg" />
                <Calc label="Total gross" value={packing.totalGrossKg} unit="kg" />
                <Calc label="Net quantity" value={packing.netMt} unit="MT" decimals={3} />
                <Calc label="Trade quantity" value={contractMt} unit="MT" decimals={3} />
              </dl>
              {packingIssue && (
                <p className="mt-2 flex items-start gap-1.5 text-xs text-warning">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> {packingIssue.message}
                </p>
              )}
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function Calc({ label, value, unit, decimals = 3 }: { label: string; value: number | undefined; unit?: string; decimals?: number }) {
  return (
    <div className="flex justify-between gap-2 sm:block">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium tabular">{value === undefined ? "—" : `${formatNumber(value, decimals)}${unit ? ` ${unit}` : ""}`}</dd>
    </div>
  );
}
