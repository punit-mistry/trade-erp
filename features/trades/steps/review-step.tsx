"use client";

import { AlertCircle, AlertTriangle, CheckCircle2, Lock, Pencil } from "lucide-react";
import type { ReactNode } from "react";
import { useWatch } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { DetailList } from "@/components/shared/section";
import { computeTradeValue, formatDate, formatMoney, formatNumber, formatPrice, formatQuantity } from "@/lib/format";
import { DIRECTION_LABEL } from "@/lib/status";
import type { StepId } from "../form";
import { STEPS } from "../form";
import { useTradeLabels } from "../use-trade-labels";
import { useWizard } from "../wizard-context";
import { StepHeading } from "./wizard-field";

function ReviewBlock({ title, step, children }: { title: string; step: StepId; children: ReactNode }) {
  const { goTo } = useWizard();
  return (
    <div className="rounded-lg border">
      <div className="flex items-center justify-between border-b bg-muted/40 px-3 py-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        <Button type="button" variant="ghost" size="sm" onClick={() => goTo(step)}>
          <Pencil /> Edit
        </Button>
      </div>
      <div className="p-3">{children}</div>
    </div>
  );
}

const TOLERANCE_LABEL = { buyer: "Buyer's option", seller: "Seller's option", both: "Either party" } as const;

export function ReviewStep() {
  const { form, issues, goTo, meta } = useWizard();
  const v = useWatch({ control: form.control });
  const labels = useTradeLabels(v);
  const computed = computeTradeValue(v.quantity, v.pricePerUom);
  const value = meta.valueOverridden || meta.priceNeedsValidation ? meta.totalValue : computed;
  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");

  return (
    <div>
      <StepHeading title="Review & Save" description="Check everything before saving. Errors must be fixed before the trade can be submitted or confirmed." />

      {errors.length === 0 ? (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-sm">
          <CheckCircle2 className="size-4 text-success" /> All required information is complete.
        </div>
      ) : (
        <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3" role="alert">
          <div className="mb-1.5 flex items-center gap-2 text-sm font-medium text-destructive">
            <AlertCircle className="size-4" /> {errors.length} item{errors.length === 1 ? "" : "s"} to fix before submitting
          </div>
          <ul className="space-y-1 text-sm">
            {errors.map((e) => (
              <li key={`${e.field}-${e.message}`} className="flex items-center justify-between gap-2">
                <span>{e.message}</span>
                <Button type="button" variant="link" size="sm" className="h-auto p-0" onClick={() => goTo(e.step)}>
                  Fix in {STEPS[e.step - 1].short}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {warnings.length > 0 && (
        <div className="mb-4 rounded-lg border border-warning/40 bg-warning/10 p-3">
          <ul className="space-y-1 text-sm">
            {warnings.map((w) => (
              <li key={`${w.field}-${w.message}`} className="flex gap-2">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" /> {w.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="space-y-3">
        <ReviewBlock title="Trade identity & parties" step={1}>
          <DetailList
            items={[
              { label: "Trade number", value: meta.tradeNumber ?? "Assigned on first save", mono: true },
              { label: "Direction", value: v.direction ? DIRECTION_LABEL[v.direction] : undefined },
              { label: "Trade date", value: formatDate(v.tradeDate) },
              { label: "Internal company", value: labels.companyName },
              {
                label: v.direction === "sales" ? "Buyer" : v.direction === "purchase" ? "Seller" : "Counterparty",
                value: labels.counterpartyName ? `${labels.counterpartyName}${labels.counterpartyCountry ? ` (${labels.counterpartyCountry})` : ""}` : undefined,
              },
              { label: "Commodity", value: labels.commodityLabel },
              { label: "Source reference", value: v.sourceReference },
            ]}
          />
        </ReviewBlock>
        <ReviewBlock title="Quantity & price" step={2}>
          <DetailList
            items={[
              { label: "Quantity", value: formatQuantity(v.quantity, v.uom) },
              { label: "Price type", value: v.priceType },
              { label: "Price per UOM", value: v.pricePerUom === undefined ? undefined : formatPrice(v.pricePerUom, v.currency) },
              { label: "Total value", value: value === undefined ? undefined : formatMoney(value, v.currency) },
            ]}
            columns={4}
          />
        </ReviewBlock>
        <ReviewBlock title="Commercial & shipping terms" step={3}>
          <DetailList
            items={[
              { label: "Incoterm", value: v.incoterm },
              { label: "Payment term", value: v.paymentTerm },
              { label: "Pricing term", value: v.pricingTerm },
              { label: "Shipment period", value: v.shipmentPeriod },
              { label: "Loading", value: v.loadingLocation },
              { label: "Discharge", value: v.dischargeLocation },
              { label: "Partial shipment", value: v.partialShipment === undefined ? undefined : v.partialShipment ? "Allowed" : "Not allowed" },
              {
                label: "Tolerance",
                value:
                  v.tolerancePct === undefined
                    ? undefined
                    : `± ${formatNumber(v.tolerancePct, 2)}%${v.toleranceOption ? ` · ${TOLERANCE_LABEL[v.toleranceOption]}` : ""}`,
              },
              { label: "Origin", value: v.origin },
              { label: "Manufacturer", value: v.manufacturer },
              { label: "Container loading", value: v.containerLoading },
              { label: "Freight terms", value: v.freightTerms },
              { label: "Special conditions", value: v.specialConditions, span: 3 },
            ]}
          />
          {v.internalNotes && (
            <div className="mt-3 rounded-md border border-dashed bg-muted/40 p-2 text-sm">
              <div className="mb-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                <Lock className="size-3" /> Internal notes (not printed)
              </div>
              <p className="whitespace-pre-line">{v.internalNotes}</p>
            </div>
          )}
        </ReviewBlock>
        <ReviewBlock title="Contract terms" step={4}>
          <DetailList
            items={[
              { label: "Buyer reference / PO", value: v.buyerReference },
              { label: "Reference date", value: v.buyerReferenceDate ? formatDate(v.buyerReferenceDate) : undefined },
              { label: "Printed contract no.", value: v.printedContractNumber ?? "From numbering sequence" },
              { label: "Template", value: labels.templateLabel ?? "Default template" },
              { label: "Packing", value: v.packingClause, span: 2 },
              { label: "Seller's bank", value: v.sellerBankDetails, mono: true },
              { label: "Buyer's bank", value: v.buyerBankDetails, mono: true },
              { label: "Documents clause", value: v.documentsClause, span: 3 },
              { label: "Arbitration", value: v.arbitrationClause, span: 3 },
              { label: "Other conditions", value: v.otherConditions, span: 3 },
              { label: "Additional terms", value: v.additionalTerms, span: 3 },
            ]}
          />
        </ReviewBlock>
      </div>
    </div>
  );
}
