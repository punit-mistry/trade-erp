"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { useWatch } from "react-hook-form";
import { cn } from "@/lib/utils";
import { computeTradeValue, display, formatDate, formatMoney, formatPrice, formatQuantity } from "@/lib/format";
import { DIRECTION_LABEL } from "@/lib/status";
import { useTradeLabels } from "./use-trade-labels";
import { useWizard } from "./wizard-context";

/** Persistent summary next to the wizard: always shows what's been entered so far. */
export function TradeSummaryCard() {
  const { form, meta } = useWizard();
  const values = useWatch({ control: form.control });
  const labels = useTradeLabels(values);
  const [open, setOpen] = useState(false);
  const computed = computeTradeValue(values.quantity, values.pricePerUom);
  const value = meta.valueOverridden || meta.priceNeedsValidation ? meta.totalValue : computed;

  const rows: [string, string][] = [
    ["Direction", values.direction ? DIRECTION_LABEL[values.direction] : "—"],
    ["Company", display(labels.companyName)],
    [values.direction === "sales" ? "Buyer" : values.direction === "purchase" ? "Seller" : "Counterparty", display(labels.counterpartyName)],
    ["Commodity", display(labels.commodityLabel)],
    ["Trade date", formatDate(values.tradeDate)],
    ["Quantity", formatQuantity(values.quantity, values.uom)],
    ["Price", values.pricePerUom === undefined ? "—" : `${formatPrice(values.pricePerUom, values.currency)}${values.uom ? ` / ${values.uom}` : ""}`],
    ["Incoterm", display(values.incoterm)],
    ["Payment", display(values.paymentTerm)],
    ["Shipment", display(values.shipmentPeriod)],
    ["Route", values.loadingLocation || values.dischargeLocation ? `${display(values.loadingLocation)} → ${display(values.dischargeLocation)}` : "—"],
  ];

  return (
    <aside className="rounded-lg border bg-card shadow-xs lg:sticky lg:top-[4.5rem]" aria-label="Trade summary">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between border-b px-4 py-3 text-left lg:pointer-events-none"
        aria-expanded={open}
      >
        <div>
          <div className="text-xs font-medium text-muted-foreground">
            Trade summary{meta.tradeNumber ? ` · ${meta.tradeNumber}` : " · not saved yet"}
          </div>
          <div className="mt-0.5 text-xl font-semibold tracking-tight tabular">{value === undefined ? "—" : formatMoney(value, values.currency)}</div>
          <div className="text-[11px] text-muted-foreground">
            {meta.valueOverridden
              ? "Authorised value override"
              : meta.priceNeedsValidation
                ? "Historical total · unit price needs validation"
                : "Quantity × price per unit"}
          </div>
        </div>
        <ChevronDown className={cn("size-4 text-muted-foreground transition-transform lg:hidden", open && "rotate-180")} />
      </button>
      <dl className={cn("space-y-2 px-4 py-3 text-sm", !open && "hidden lg:block")}>
        {rows.map(([label, v]) => (
          <div key={label} className="flex justify-between gap-3">
            <dt className="shrink-0 text-muted-foreground">{label}</dt>
            <dd className="min-w-0 truncate text-right font-medium" title={v}>
              {v}
            </dd>
          </div>
        ))}
      </dl>
    </aside>
  );
}
