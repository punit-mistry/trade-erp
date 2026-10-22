"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { TradeFields } from "@/convex/lib/validators";

/** Resolves display names for the ids held in the wizard form. */
export function useTradeLabels(values: Pick<TradeFields, "companyId" | "counterpartyId" | "commodityId" | "contractTemplateId">) {
  const company = useQuery(api.companies.get, values.companyId ? { id: values.companyId } : "skip");
  const counterparty = useQuery(api.counterparties.get, values.counterpartyId ? { id: values.counterpartyId } : "skip");
  const commodity = useQuery(api.commodities.get, values.commodityId ? { id: values.commodityId } : "skip");
  const template = useQuery(api.contractTemplates.get, values.contractTemplateId ? { id: values.contractTemplateId } : "skip");
  return {
    companyName: company?.name,
    counterpartyName: counterparty?.name,
    counterpartyCountry: counterparty?.country,
    commodityLabel: commodity ? `${commodity.name} (${commodity.code})` : undefined,
    templateLabel: template ? `${template.template.name} · v${template.template.version}` : undefined,
  };
}
