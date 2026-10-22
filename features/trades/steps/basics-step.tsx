"use client";

import { useQuery } from "convex/react";
import { ArrowDownLeft, ArrowUpRight, RefreshCw } from "lucide-react";
import { Controller } from "react-hook-form";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { CommodityPicker, CompanySelect, CounterpartyPicker } from "../pickers";
import { useWizard } from "../wizard-context";
import { StepHeading, WizardField } from "./wizard-field";

const DIRECTIONS = [
  {
    value: "purchase" as const,
    title: "Purchase",
    description: "We buy from a supplier / seller.",
    icon: ArrowDownLeft,
  },
  {
    value: "sales" as const,
    title: "Sales",
    description: "We sell to a buyer.",
    icon: ArrowUpRight,
  },
];

export function BasicsStep() {
  const { form, onCounterpartySelected, onCompanySelected, onDirectionChanged, reapplyCounterpartyDefaults, errorFor, setField } =
    useWizard();
  const direction = form.watch("direction");
  const counterpartyId = form.watch("counterpartyId");
  const counterparty = useQuery(api.counterparties.get, counterpartyId ? { id: counterpartyId } : "skip");

  const defaults = counterparty
    ? [
        counterparty.defaultCurrency,
        counterparty.defaultPaymentTerm,
        counterparty.defaultIncoterm,
        counterparty.defaultLoadingLocation && `Load: ${counterparty.defaultLoadingLocation}`,
        counterparty.defaultOrigin && `Origin: ${counterparty.defaultOrigin}`,
      ].filter(Boolean)
    : [];

  return (
    <div>
      <StepHeading
        title="Trade Basics"
        description="Who is trading what, and on which side. Selecting a counterparty fills in its saved commercial defaults — you can still change anything."
      />
      <div className="space-y-5">
        <WizardField name="direction" label="Trade direction" required>
          <div role="radiogroup" aria-label="Trade direction" className="grid gap-2 sm:grid-cols-2">
            {DIRECTIONS.map((d) => {
              const selected = direction === d.value;
              return (
                <button
                  key={d.value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => {
                    if (direction === d.value) return;
                    setField("direction", d.value);
                    void onDirectionChanged(d.value);
                  }}
                  className={cn(
                    "flex items-start gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none",
                    selected && "border-primary bg-accent ring-1 ring-primary",
                    errorFor("direction") && !direction && "border-destructive",
                  )}
                >
                  <span
                    className={cn(
                      "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground",
                      selected && "bg-primary text-primary-foreground",
                    )}
                  >
                    <d.icon className="size-4" />
                  </span>
                  <span>
                    <span className="block text-sm font-medium">{d.title}</span>
                    <span className="block text-xs text-muted-foreground">{d.description}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </WizardField>

        <div className="grid gap-4 md:grid-cols-2">
          <WizardField name="companyId" label="Internal company" required tip="The legal entity of ours that signs this trade.">
            <Controller
              control={form.control}
              name="companyId"
              render={({ field }) => (
                <CompanySelect
                  id="trade-companyId"
                  value={field.value}
                  invalid={Boolean(errorFor("companyId"))}
                  onChange={(id) => {
                    field.onChange(id);
                    void onCompanySelected(id);
                  }}
                />
              )}
            />
          </WizardField>
          <WizardField name="tradeDate" label="Trade date" required>
            <Input
              id="trade-tradeDate"
              type="date"
              aria-invalid={Boolean(errorFor("tradeDate")) || undefined}
              {...form.register("tradeDate")}
            />
          </WizardField>
        </div>

        <WizardField
          name="counterpartyId"
          label={direction === "sales" ? "Buyer" : direction === "purchase" ? "Supplier / Seller" : "Counterparty"}
          required
          help={!direction ? "Choose the trade direction first to see the most relevant counterparties." : undefined}
        >
          <Controller
            control={form.control}
            name="counterpartyId"
            render={({ field }) => (
              <CounterpartyPicker
                id="trade-counterpartyId"
                value={field.value}
                direction={direction}
                invalid={Boolean(errorFor("counterpartyId"))}
                onChange={(id) => {
                  field.onChange(id);
                  void onCounterpartySelected(id);
                }}
              />
            )}
          />
        </WizardField>

        {counterparty && (
          <div className="flex flex-col gap-2 rounded-lg border border-dashed bg-muted/40 p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="font-medium">
                {counterparty.name}{" "}
                <span className="font-normal text-muted-foreground">
                  · {counterparty.country ?? "Country not set"} · {counterparty.code}
                </span>
              </div>
              <div className="text-xs text-muted-foreground">
                {defaults.length > 0 ? `Saved defaults: ${defaults.join(" · ")}` : "No saved commercial defaults for this counterparty."}
              </div>
            </div>
            {defaults.length > 0 && (
              <Button type="button" variant="outline" size="sm" onClick={() => void reapplyCounterpartyDefaults()}>
                <RefreshCw /> Re-apply defaults
              </Button>
            )}
          </div>
        )}

        <WizardField name="commodityId" label="Commodity" required>
          <Controller
            control={form.control}
            name="commodityId"
            render={({ field }) => (
              <CommodityPicker
                id="trade-commodityId"
                value={field.value}
                invalid={Boolean(errorFor("commodityId"))}
                onChange={(id, defaultUom) => {
                  field.onChange(id);
                  if (defaultUom && !form.getValues("uom")) setField("uom", defaultUom);
                }}
              />
            )}
          />
        </WizardField>

        <WizardField
          name="sourceReference"
          label="Source reference"
          help="Optional link to an enquiry, purchase order or other record this trade came from."
        >
          <Input id="trade-sourceReference" placeholder="e.g. Enquiry #4512 or PO-88123" {...form.register("sourceReference")} />
        </WizardField>
      </div>
    </div>
  );
}
