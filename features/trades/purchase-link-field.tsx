"use client";

import { useQuery } from "convex/react";
import { AlertTriangle, Link2 } from "lucide-react";
import { Controller, useWatch } from "react-hook-form";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Combobox } from "@/components/shared/combobox";
import { formatQuantity } from "@/lib/format";
import { useWizard } from "./wizard-context";
import { WizardField } from "./steps/wizard-field";

/**
 * Sales only: the back-to-back purchase this sale ships. The B/L shipper is
 * then the purchase's factory/supplier "on behalf of" our company.
 */
export function PurchaseLinkField() {
  const { form, setField } = useWizard();
  const [direction, purchaseTradeId, commodityId] = useWatch({
    control: form.control,
    name: ["direction", "purchaseTradeId", "commodityId"],
  });
  const options = useQuery(api.trades.purchaseOptions, direction === "sales" ? {} : "skip");
  const commodity = useQuery(api.commodities.get, commodityId ? { id: commodityId } : "skip");
  if (direction !== "sales") return null;

  const selected = options?.find((o) => o._id === purchaseTradeId);
  const localShipper = selected ? selected.manufacturer?.trim() || selected.counterpartyName : undefined;
  const commodityMismatch = selected && commodity && selected.commodityName && selected.commodityName !== commodity.name;

  return (
    <WizardField
      name="purchaseTradeId"
      label={
        <span className="inline-flex items-center gap-1.5">
          <Link2 className="size-3.5" /> Back-to-back purchase
        </span>
      }
      tip="Link the purchase this sale is shipped from. Its supplier or factory becomes the B/L shipper, “on behalf of” our company."
      help={
        localShipper
          ? `B/L shipper: ${localShipper} on behalf of our company.`
          : "Optional — leave blank if this sale is not back-to-back."
      }
    >
      <Controller
        control={form.control}
        name="purchaseTradeId"
        render={({ field }) => (
          <Combobox
            id="trade-purchaseTradeId"
            loading={options === undefined}
            options={(options ?? []).map((o) => ({
              value: o._id,
              label: `${o.tradeNumber} · ${o.counterpartyName ?? "No supplier"}`,
              description: [o.commodityName, o.quantity !== undefined ? formatQuantity(o.quantity, o.uom) : undefined, o.status.replace("_", " ")]
                .filter(Boolean)
                .join(" · "),
            }))}
            value={field.value}
            onChange={(v) => setField("purchaseTradeId", v as Id<"trades"> | undefined)}
            placeholder="Search purchase trades"
            searchPlaceholder="Trade number or supplier…"
            emptyText="No open purchase trades."
          />
        )}
      />
      {commodityMismatch && (
        <p className="mt-1 flex items-center gap-1 text-xs text-warning">
          <AlertTriangle className="size-3.5" /> The purchase is for {selected.commodityName}, not {commodity.name}.
        </p>
      )}
    </WizardField>
  );
}
