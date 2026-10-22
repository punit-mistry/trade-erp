"use client";

import { createContext, useContext } from "react";
import type { UseFormReturn } from "react-hook-form";
import type { Id } from "@/convex/_generated/dataModel";
import type { Permission } from "@/convex/lib/roles";
import type { TradeIssue } from "@/convex/lib/tradeValidation";
import type { TradeFields } from "@/convex/lib/validators";
import type { StepId, TradeFormValues } from "./form";

export type InheritSource = { kind: "counterparty" | "company" | "template" | "commodity"; label: string };

/** Live server-side facts about the trade being edited (not part of the form). */
export type TradeMeta = {
  tradeId?: Id<"trades">;
  tradeNumber?: string;
  status?: "draft" | "pending_review" | "confirmed" | "cancelled" | "closed";
  totalValue?: number;
  valueOverridden?: boolean;
  valueOverrideReason?: string;
  priceNeedsValidation?: boolean;
  reviewNote?: string;
};

export type WizardContextValue = {
  form: UseFormReturn<TradeFormValues>;
  /** Programmatic change made on the user's behalf (marks field as user-set, triggers autosave). */
  setField: <K extends keyof TradeFields>(name: K, value: TradeFields[K]) => void;
  /** Where an inherited value came from, or null when user-set / not inherited. */
  inheritedFrom: (name: keyof TradeFields) => InheritSource | null;
  /** Field error: format errors always, completeness errors once the step was attempted. */
  errorFor: (name: keyof TradeFields | "totalValue") => string | undefined;
  issues: TradeIssue[];
  can: (permission: Permission) => boolean;
  goTo: (step: StepId) => void;
  meta: TradeMeta;
  onCounterpartySelected: (id: Id<"counterparties"> | undefined) => Promise<void>;
  onCompanySelected: (id: Id<"companies"> | undefined) => Promise<void>;
  onTemplateSelected: (id: Id<"contractTemplates"> | undefined) => Promise<void>;
  onDirectionChanged: (direction: "purchase" | "sales") => Promise<void>;
  reapplyCounterpartyDefaults: () => Promise<void>;
};

export const WizardContext = createContext<WizardContextValue | null>(null);

export function useWizard() {
  const ctx = useContext(WizardContext);
  if (!ctx) throw new Error("useWizard must be used inside the trade wizard");
  return ctx;
}
