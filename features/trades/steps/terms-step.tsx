"use client";

import { ChevronDown, Lock } from "lucide-react";
import { useState } from "react";
import { Controller, useWatch } from "react-hook-form";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { NumberInput } from "@/components/shared/form-field";
import { CountryCombobox, LookupCombobox } from "@/components/shared/lookup-combobox";
import { cn } from "@/lib/utils";
import { useWizard } from "../wizard-context";
import { StepHeading, WizardField } from "./wizard-field";

const TOLERANCE_OPTIONS = [
  { value: "seller" as const, label: "Seller's option" },
  { value: "buyer" as const, label: "Buyer's option" },
  { value: "both" as const, label: "Either party" },
];

export function TermsStep() {
  const { form, errorFor } = useWizard();
  const values = useWatch({ control: form.control, name: ["origin", "manufacturer", "containerLoading", "freightTerms", "specialConditions"] });
  const [advancedOpen, setAdvancedOpen] = useState(values.some((v) => v !== undefined && v !== ""));

  return (
    <div>
      <StepHeading
        title="Terms & Logistics"
        description="Delivery, payment and shipment terms. These print on the contract and pre-fill the B/L."
      />
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-3">
          <WizardField
            name="incoterm"
            label="Incoterm"
            required
            tip="Defines who pays freight/insurance and where risk passes, e.g. CIF = seller pays cost, insurance and freight to the destination port."
          >
            <Controller
              control={form.control}
              name="incoterm"
              render={({ field }) => (
                <LookupCombobox id="trade-incoterm" kind="incoterm" value={field.value} onChange={field.onChange} invalid={Boolean(errorFor("incoterm"))} />
              )}
            />
          </WizardField>
          <WizardField name="paymentTerm" label="Payment term" required tip="How and when the buyer pays, e.g. D/P at Sight or Letter of Credit.">
            <Controller
              control={form.control}
              name="paymentTerm"
              render={({ field }) => (
                <LookupCombobox id="trade-paymentTerm" kind="paymentTerm" value={field.value} onChange={field.onChange} invalid={Boolean(errorFor("paymentTerm"))} />
              )}
            />
          </WizardField>
          <WizardField name="pricingTerm" label="Pricing term" tip="Basis on which the final price is determined.">
            <Controller
              control={form.control}
              name="pricingTerm"
              render={({ field }) => <LookupCombobox id="trade-pricingTerm" kind="pricingTerm" value={field.value} onChange={field.onChange} />}
            />
          </WizardField>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <WizardField name="shipmentPeriod" label="Shipment period" required help="e.g. October 2026, or 15 Oct – 15 Nov 2026">
            <Input
              id="trade-shipmentPeriod"
              placeholder="October 2026"
              aria-invalid={Boolean(errorFor("shipmentPeriod")) || undefined}
              {...form.register("shipmentPeriod")}
            />
          </WizardField>
          <WizardField name="loadingLocation" label="Loading location" required>
            <Controller
              control={form.control}
              name="loadingLocation"
              render={({ field }) => (
                <LookupCombobox
                  id="trade-loadingLocation"
                  kind="port"
                  value={field.value}
                  onChange={field.onChange}
                  invalid={Boolean(errorFor("loadingLocation"))}
                  placeholder="Port or place of loading"
                />
              )}
            />
          </WizardField>
          <WizardField name="dischargeLocation" label="Discharge location" required>
            <Controller
              control={form.control}
              name="dischargeLocation"
              render={({ field }) => (
                <LookupCombobox
                  id="trade-dischargeLocation"
                  kind="port"
                  value={field.value}
                  onChange={field.onChange}
                  invalid={Boolean(errorFor("dischargeLocation"))}
                  placeholder="Port or place of discharge"
                />
              )}
            />
          </WizardField>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <WizardField name="partialShipment" label="Partial shipment" tip="Whether the goods may be shipped in more than one lot.">
            <Controller
              control={form.control}
              name="partialShipment"
              render={({ field }) => (
                <div className="flex h-8 items-center gap-2">
                  <Switch id="trade-partialShipment" checked={field.value === true} onCheckedChange={(c) => field.onChange(c)} />
                  <span className="text-sm text-muted-foreground">
                    {field.value === undefined ? "Not specified" : field.value ? "Allowed" : "Not allowed"}
                  </span>
                </div>
              )}
            />
          </WizardField>
          <WizardField name="tolerancePct" label="Quantity tolerance (%)" tip="Allowed deviation from the contract quantity, e.g. ±5%.">
            <Controller
              control={form.control}
              name="tolerancePct"
              render={({ field }) => (
                <NumberInput id="trade-tolerancePct" value={field.value} onValueChange={field.onChange} maxDecimals={2} placeholder="e.g. 5" />
              )}
            />
          </WizardField>
          <WizardField name="toleranceOption" label="Tolerance at">
            <Controller
              control={form.control}
              name="toleranceOption"
              render={({ field }) => (
                <div role="radiogroup" aria-label="Tolerance at whose option" className="flex flex-wrap gap-1">
                  {TOLERANCE_OPTIONS.map((o) => (
                    <button
                      key={o.value}
                      type="button"
                      role="radio"
                      aria-checked={field.value === o.value}
                      onClick={() => field.onChange(field.value === o.value ? undefined : o.value)}
                      className={cn(
                        "h-8 rounded-md border px-2.5 text-xs font-medium hover:bg-muted",
                        field.value === o.value && "border-primary bg-accent text-accent-foreground",
                      )}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              )}
            />
          </WizardField>
        </div>

        <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen} className="rounded-lg border">
          <CollapsibleTrigger className="flex w-full items-center justify-between px-3 py-2.5 text-sm font-medium hover:bg-muted/50">
            Origin, manufacturer, freight & special conditions
            <ChevronDown className={cn("size-4 transition-transform", advancedOpen && "rotate-180")} />
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-4 border-t p-3">
            <div className="grid gap-4 sm:grid-cols-2">
              <WizardField name="origin" label="Origin of goods">
                <Controller
                  control={form.control}
                  name="origin"
                  render={({ field }) => <CountryCombobox id="trade-origin" value={field.value} onChange={field.onChange} />}
                />
              </WizardField>
              <WizardField name="manufacturer" label="Manufacturer / approved factory">
                <Input id="trade-manufacturer" {...form.register("manufacturer")} />
              </WizardField>
              <WizardField name="containerLoading" label="Container loading" help="e.g. 20 MT per 40' container">
                <Input id="trade-containerLoading" {...form.register("containerLoading")} />
              </WizardField>
              <WizardField name="freightTerms" label="Freight terms (for B/L)">
                <Controller
                  control={form.control}
                  name="freightTerms"
                  render={({ field }) => <LookupCombobox id="trade-freightTerms" kind="freightTerm" value={field.value} onChange={field.onChange} />}
                />
              </WizardField>
            </div>
            <WizardField name="specialConditions" label="Special conditions" help="Printed on the contract.">
              <Textarea id="trade-specialConditions" rows={3} {...form.register("specialConditions")} />
            </WizardField>
          </CollapsibleContent>
        </Collapsible>

        <div className="rounded-lg border border-dashed bg-muted/40 p-3">
          <WizardField
            name="internalNotes"
            label={
              <span className="inline-flex items-center gap-1.5">
                <Lock className="size-3.5" /> Internal notes
              </span>
            }
            help="For your team only — never printed on contracts, B/Ls or any external document."
          >
            <Textarea id="trade-internalNotes" rows={3} className="bg-background" {...form.register("internalNotes")} />
          </WizardField>
        </div>
      </div>
    </div>
  );
}
