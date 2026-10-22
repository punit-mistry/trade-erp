"use client";

import { ChevronDown, Lock } from "lucide-react";
import { useState } from "react";
import { Controller } from "react-hook-form";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { LookupCombobox } from "@/components/shared/lookup-combobox";
import { cn } from "@/lib/utils";
import { ContractTemplateSelect } from "../pickers";
import { useWizard } from "../wizard-context";
import { StepHeading, WizardField } from "./wizard-field";

export function ContractStep() {
  const { form, can, onTemplateSelected, setField } = useWizard();
  const [direction, companyId] = form.watch(["direction", "companyId"]);
  const canOverrideNumber = can("contract.overrideNumber");
  const clauseValues = form.watch(["otherConditions", "additionalTerms"]);
  const [moreOpen, setMoreOpen] = useState(clauseValues.some((v) => v !== undefined && v !== ""));

  return (
    <div>
      <StepHeading
        title="Contract Information"
        description="References and clauses for the contract. Bank details and standard clauses are pre-filled from the counterparty, your company and the template."
      />
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-3">
          <WizardField name="buyerReference" label="Buyer reference / PO no.">
            <Input id="trade-buyerReference" {...form.register("buyerReference")} />
          </WizardField>
          <WizardField name="buyerReferenceDate" label="Buyer reference date">
            <Input id="trade-buyerReferenceDate" type="date" {...form.register("buyerReferenceDate")} />
          </WizardField>
          <WizardField
            name="printedContractNumber"
            label={
              <span className="inline-flex items-center gap-1">
                Printed contract no. {!canOverrideNumber && <Lock className="size-3" />}
              </span>
            }
            help={
              canOverrideNumber
                ? "Optional. Leave blank to use the configured numbering sequence."
                : "Assigned automatically from the numbering sequence. Only managers can override it."
            }
            tip="Separate from the internal trade number, which never changes."
          >
            <Input id="trade-printedContractNumber" disabled={!canOverrideNumber} {...form.register("printedContractNumber")} />
          </WizardField>
        </div>

        <WizardField name="contractTemplateId" label="Contract template" help="Leave empty to use the default template for this trade type.">
          <Controller
            control={form.control}
            name="contractTemplateId"
            render={({ field }) => (
              <ContractTemplateSelect
                id="trade-contractTemplateId"
                value={field.value}
                direction={direction}
                companyId={companyId}
                onChange={(id) => {
                  field.onChange(id);
                  void onTemplateSelected(id);
                }}
              />
            )}
          />
        </WizardField>

        <WizardField name="packingClause" label="Packing clause">
          <div className="space-y-1.5">
            <LookupCombobox
              kind="packing"
              value={undefined}
              placeholder="Insert a standard packing wording…"
              onChange={(v) => v && setField("packingClause", v)}
            />
            <Textarea id="trade-packingClause" rows={2} {...form.register("packingClause")} />
          </div>
        </WizardField>

        <div className="grid gap-4 md:grid-cols-2">
          <WizardField name="sellerBankDetails" label="Seller's bank details">
            <Textarea id="trade-sellerBankDetails" rows={5} className="font-mono text-xs" {...form.register("sellerBankDetails")} />
          </WizardField>
          <WizardField name="buyerBankDetails" label="Buyer's bank details">
            <Textarea id="trade-buyerBankDetails" rows={5} className="font-mono text-xs" {...form.register("buyerBankDetails")} />
          </WizardField>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <WizardField name="documentsClause" label="Documents clause" tip="The shipping documents the seller must present, e.g. B/L, invoice, packing list, certificates.">
            <Textarea id="trade-documentsClause" rows={4} {...form.register("documentsClause")} />
          </WizardField>
          <WizardField name="arbitrationClause" label="Arbitration clause" tip="Where and under which rules disputes are resolved.">
            <Textarea id="trade-arbitrationClause" rows={4} {...form.register("arbitrationClause")} />
          </WizardField>
        </div>

        <Collapsible open={moreOpen} onOpenChange={setMoreOpen} className="rounded-lg border">
          <CollapsibleTrigger className="flex w-full items-center justify-between px-3 py-2.5 text-sm font-medium hover:bg-muted/50">
            Other conditions & additional terms
            <ChevronDown className={cn("size-4 transition-transform", moreOpen && "rotate-180")} />
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-4 border-t p-3">
            <WizardField name="otherConditions" label="Other conditions">
              <Textarea id="trade-otherConditions" rows={3} {...form.register("otherConditions")} />
            </WizardField>
            <WizardField name="additionalTerms" label="Additional contract-specific terms">
              <Textarea id="trade-additionalTerms" rows={3} {...form.register("additionalTerms")} />
            </WizardField>
          </CollapsibleContent>
        </Collapsible>
      </div>
    </div>
  );
}
