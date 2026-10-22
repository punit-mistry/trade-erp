"use client";

import { forwardRef } from "react";
import { cn } from "@/lib/utils";
import { headerFacts, isDraftLike, parties, splitMarkers, type ContractDocData } from "./contract-document";

function RichText({ text, className }: { text: string; className?: string }) {
  return (
    <span className={cn("whitespace-pre-line", className)}>
      {splitMarkers(text).map((part, i) =>
        part.marker ? (
          <mark
            key={i}
            className={cn(
              "rounded px-1 font-medium",
              part.marker === "missing" ? "bg-amber-100 text-amber-900" : "bg-red-100 text-red-800",
            )}
            title={part.marker === "missing" ? "Value missing in trade data" : "Unknown template variable"}
          >
            {part.marker === "missing" ? `missing: ${part.text}` : `unknown: {{${part.text}}}`}
          </mark>
        ) : (
          <span key={i}>{part.text}</span>
        ),
      )}
    </span>
  );
}

/**
 * Print-ready HTML rendering of a contract snapshot. Uses fixed light colours
 * so it looks like paper in dark mode and prints correctly.
 */
export const ContractPreview = forwardRef<HTMLDivElement, { data: ContractDocData; className?: string }>(
  function ContractPreview({ data, className }, ref) {
    const vars = data.snapshot.variables;
    const draft = isDraftLike(data.status);
    return (
      <div
        ref={ref}
        className={cn(
          "relative mx-auto w-full max-w-[820px] overflow-hidden rounded-md border border-neutral-200 bg-white px-8 py-10 text-[13px] leading-relaxed text-neutral-900 shadow-sm sm:px-12",
          className,
        )}
      >
        {draft && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 flex items-center justify-center text-[110px] font-bold tracking-widest text-neutral-200/60 select-none"
            style={{ transform: "rotate(-30deg)" }}
          >
            {data.status === "preview" ? "PREVIEW" : "DRAFT"}
          </div>
        )}
        <div className="relative">
          <header className="flex flex-col gap-1 border-b border-neutral-300 pb-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="text-base font-semibold tracking-tight">{vars.companyName || "—"}</div>
              {vars.companyAddress && <div className="text-xs text-neutral-600">{vars.companyAddress}</div>}
            </div>
            {data.snapshot.header && (
              <div className="text-xs text-neutral-600 sm:max-w-[45%] sm:text-right">
                <RichText text={data.snapshot.header} />
              </div>
            )}
          </header>

          <h1 className="mt-6 text-center text-lg font-bold tracking-[0.08em] uppercase">
            <RichText text={data.snapshot.title} />
          </h1>

          <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-1 text-xs sm:grid-cols-5">
            {headerFacts(data).map((f) => (
              <div key={f.label}>
                <dt className="text-neutral-500">{f.label}</dt>
                <dd className="font-medium">{f.value}</dd>
              </div>
            ))}
          </dl>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {parties(data).map((p) => (
              <div key={p.role} className="rounded border border-neutral-200 p-3">
                <div className="text-[11px] font-semibold tracking-wider text-neutral-500 uppercase">{p.role}</div>
                <div className="mt-1 font-semibold">{p.name}</div>
                <div className="text-xs text-neutral-600">{p.address}</div>
              </div>
            ))}
          </div>

          {data.snapshot.intro && (
            <p className="mt-5">
              <RichText text={data.snapshot.intro} />
            </p>
          )}

          <ol className="mt-5 space-y-3">
            {data.snapshot.clauses.map((c, i) => (
              <li key={i} className="break-inside-avoid">
                <div className="font-semibold">
                  {i + 1}. <RichText text={c.heading} className="uppercase" />
                </div>
                <div className="mt-0.5 pl-4">
                  <RichText text={c.body} />
                </div>
              </li>
            ))}
          </ol>

          <div className="mt-10 grid gap-8 break-inside-avoid sm:grid-cols-2">
            {parties(data).map((p) => (
              <div key={p.role}>
                <div className="text-xs text-neutral-500">For and on behalf of the {p.role}</div>
                <div className="mt-12 border-t border-neutral-400 pt-1 text-xs">
                  <div className="font-medium">{p.name}</div>
                  <div className="text-neutral-500">Authorised signatory, name &amp; date</div>
                </div>
              </div>
            ))}
          </div>

          {data.snapshot.footer && (
            <footer className="mt-8 border-t border-neutral-200 pt-3 text-[11px] text-neutral-500">
              <RichText text={data.snapshot.footer} />
            </footer>
          )}
        </div>
      </div>
    );
  },
);
