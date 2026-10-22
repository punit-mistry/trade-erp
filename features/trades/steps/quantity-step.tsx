"use client";

import { AlertTriangle, Calculator, Pencil } from "lucide-react";
import { Controller } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { LookupCombobox } from "@/components/shared/lookup-combobox";
import { NumberInput } from "@/components/shared/form-field";
import { computeTradeValue, formatMoney, formatNumber, valueDiscrepancy } from "@/lib/format";
import { PRICE_DECIMALS, QUANTITY_DECIMALS } from "@/convex/lib/money";
import { ValueOverrideDialog } from "../value-override-dialog";
import { useWizard } from "../wizard-context";
import { StepHeading, WizardField } from "./wizard-field";

export function QuantityStep() {
  const { form, meta, can, errorFor } = useWizard();
  const [quantity, pricePerUom, currency, uom] = form.watch(["quantity", "pricePerUom", "currency", "uom"]);
  const computed = computeTradeValue(quantity, pricePerUom);
  const storedIsAuthoritative = Boolean(meta.valueOverridden || meta.priceNeedsValidation);
  const shownValue = storedIsAuthoritative ? meta.totalValue : computed;
  const diff = storedIsAuthoritative ? valueDiscrepancy(quantity, pricePerUom, meta.totalValue) : null;

  return (
    <div>
      <StepHeading
        title="Quantity & Price"
        description="The total trade value is calculated as quantity × price per unit and updates as you type."
      />
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <WizardField name="quantity" label="Quantity" required help={`Up to ${QUANTITY_DECIMALS} decimals.`}>
            <Controller
              control={form.control}
              name="quantity"
              render={({ field }) => (
                <NumberInput
                  id="trade-quantity"
                  value={field.value}
                  onValueChange={field.onChange}
                  maxDecimals={QUANTITY_DECIMALS}
                  placeholder="0"
                  aria-invalid={Boolean(errorFor("quantity")) || undefined}
                />
              )}
            />
          </WizardField>
          <WizardField name="uom" label="Unit of measure" required tip="MT = metric ton (1,000 kg). CBM = cubic metre.">
            <Controller
              control={form.control}
              name="uom"
              render={({ field }) => (
                <LookupCombobox
                  id="trade-uom"
                  kind="uom"
                  value={field.value}
                  onChange={field.onChange}
                  invalid={Boolean(errorFor("uom"))}
                />
              )}
            />
          </WizardField>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <WizardField name="priceType" label="Price type" required tip="Fixed: agreed final price. Provisional/Formula: final price is fixed later.">
            <Controller
              control={form.control}
              name="priceType"
              render={({ field }) => (
                <LookupCombobox
                  id="trade-priceType"
                  kind="priceType"
                  value={field.value}
                  onChange={field.onChange}
                  invalid={Boolean(errorFor("priceType"))}
                />
              )}
            />
          </WizardField>
          <WizardField name="pricePerUom" label={`Price per ${uom || "unit"}`} required help={`Up to ${PRICE_DECIMALS} decimals.`}>
            <Controller
              control={form.control}
              name="pricePerUom"
              render={({ field }) => (
                <NumberInput
                  id="trade-pricePerUom"
                  value={field.value}
                  onValueChange={field.onChange}
                  maxDecimals={PRICE_DECIMALS}
                  placeholder="0.00"
                  aria-invalid={Boolean(errorFor("pricePerUom")) || undefined}
                />
              )}
            />
          </WizardField>
          <WizardField name="currency" label="Currency" required>
            <Controller
              control={form.control}
              name="currency"
              render={({ field }) => (
                <LookupCombobox
                  id="trade-currency"
                  kind="currency"
                  value={field.value}
                  onChange={field.onChange}
                  allowCustom={false}
                  invalid={Boolean(errorFor("currency"))}
                />
              )}
            />
          </WizardField>
        </div>

        <div className="rounded-lg border bg-accent/40 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Calculator className="size-3.5" /> Total trade value
              </div>
              <div className="mt-1 text-2xl font-semibold tracking-tight tabular" aria-live="polite">
                {shownValue === undefined ? "—" : formatMoney(shownValue, currency)}
              </div>
              <div className="mt-1 text-xs text-muted-foreground tabular">
                {formatNumber(quantity)} {uom ?? ""} × {pricePerUom === undefined ? "—" : formatNumber(pricePerUom, PRICE_DECIMALS)}{" "}
                {currency ?? ""}
                {storedIsAuthoritative && computed !== undefined && ` = ${formatMoney(computed, currency)} calculated`}
              </div>
            </div>
            {meta.tradeId && can("trade.valueOverride") && (
              <ValueOverrideDialog
                tradeId={meta.tradeId}
                currency={currency}
                currentValue={meta.totalValue ?? computed}
                computedValue={computed}
                trigger={
                  <Button type="button" variant="outline" size="sm">
                    <Pencil /> Adjust value
                  </Button>
                }
              />
            )}
          </div>
          {meta.priceNeedsValidation && (
            <p className="mt-3 flex gap-2 rounded-md bg-warning/15 px-3 py-2 text-xs">
              <AlertTriangle className="size-4 shrink-0 text-warning" />
              This is a historical record: the total was supplied without a reliable unit price. The stored value is kept
              unchanged until a manager validates it.
            </p>
          )}
          {meta.valueOverridden && (
            <p className="mt-3 flex gap-2 rounded-md bg-warning/15 px-3 py-2 text-xs">
              <AlertTriangle className="size-4 shrink-0 text-warning" />
              Value manually overridden{meta.valueOverrideReason ? `: ${meta.valueOverrideReason}` : "."}
            </p>
          )}
          {diff !== null && (
            <p className="mt-2 text-xs font-medium text-destructive">
              Stored total differs from quantity × price by {formatMoney(diff, currency)}.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
