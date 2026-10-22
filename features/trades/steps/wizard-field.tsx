"use client";

import type { ReactNode } from "react";
import { FormField, InheritedBadge } from "@/components/shared/form-field";
import type { TradeFields } from "@/convex/lib/validators";
import { useWizard } from "../wizard-context";

/** FormField bound to a trade field: shows its error and an "inherited" marker when applicable. */
export function WizardField({
  name,
  label,
  required,
  tip,
  help,
  className,
  children,
}: {
  name: keyof TradeFields;
  label: ReactNode;
  required?: boolean;
  tip?: ReactNode;
  help?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  const { errorFor, inheritedFrom } = useWizard();
  const source = inheritedFrom(name);
  return (
    <FormField
      label={label}
      htmlFor={`trade-${name}`}
      required={required}
      tip={tip}
      help={help}
      error={errorFor(name)}
      className={className}
      badge={source ? <InheritedBadge source={source.label} /> : undefined}
    >
      {children}
    </FormField>
  );
}

export function StepHeading({ title, description }: { title: string; description: ReactNode }) {
  return (
    <div className="mb-5">
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
    </div>
  );
}
