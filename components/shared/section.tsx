import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { display } from "@/lib/format";

/** Bordered content block with an optional title row. */
export function Section({
  title,
  description,
  actions,
  children,
  className,
  contentClassName,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <section className={cn("rounded-lg border bg-card shadow-xs", className)}>
      {(title || actions) && (
        <div className="flex items-start justify-between gap-3 border-b px-4 py-3">
          <div className="min-w-0">
            {title && <h2 className="text-sm font-semibold">{title}</h2>}
            {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={cn("p-4", contentClassName)}>{children}</div>
    </section>
  );
}

export type DetailItem = { label: string; value: ReactNode; span?: 1 | 2 | 3; mono?: boolean };

/** Read-only label/value grid. Strings are passed through `display()` so blanks render as "—". */
export function DetailList({ items, columns = 3, className }: { items: DetailItem[]; columns?: 2 | 3 | 4; className?: string }) {
  return (
    <dl
      className={cn(
        "grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2",
        columns === 3 && "lg:grid-cols-3",
        columns === 4 && "lg:grid-cols-4",
        className,
      )}
    >
      {items.map((item) => (
        <div
          key={item.label}
          className={cn(item.span === 2 && "sm:col-span-2", item.span === 3 && "sm:col-span-2 lg:col-span-3")}
        >
          <dt className="text-xs text-muted-foreground">{item.label}</dt>
          <dd className={cn("mt-0.5 text-sm break-words whitespace-pre-line", item.mono && "font-mono text-[13px]")}>
            {typeof item.value === "string" || typeof item.value === "number" || item.value == null
              ? display(item.value as string | number | null | undefined)
              : item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
