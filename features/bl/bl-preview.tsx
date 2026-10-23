import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { BlPrintData } from "./bl-print-data";

function Cell({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("border-b border-r border-foreground/25 p-2", className)}>
      <div className="text-[9px] font-semibold tracking-wide text-muted-foreground uppercase">{label}</div>
      <div className="mt-0.5 min-h-4 text-[12px] leading-snug whitespace-pre-line">{children || "—"}</div>
    </div>
  );
}

/** HTML B/L-style layout of the saved B/L data (what the PDF will contain). */
export function BlPreview({ data }: { data: BlPrintData }) {
  return (
    <div className="relative overflow-hidden rounded-md border bg-white p-5 text-[oklch(0.2_0.03_262)] shadow-xs">
      {data.watermark && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 flex items-center justify-center text-4xl font-bold tracking-widest text-destructive/10 select-none md:text-5xl"
          style={{ transform: "rotate(-24deg)" }}
        >
          {data.watermark}
        </div>
      )}
      <div className="mb-3 flex items-start justify-between gap-4">
        <div>
          <div className="text-base font-bold tracking-wide">{data.title}</div>
          <div className="text-[11px] text-muted-foreground">Internal ref. {data.blRecordNumber} · Trade {data.tradeNumber}</div>
        </div>
        <div className="text-right text-[11px]">
          <div className="font-semibold">Carrier B/L No.</div>
          <div className="font-mono">{data.externalBlNumber || "— not yet issued —"}</div>
        </div>
      </div>
      <div className="grid grid-cols-2 border-t border-l border-foreground/25">
        <Cell label="Shipper">{data.shipper}</Cell>
        <Cell label="Place and date of issue">{data.issue}</Cell>
        <Cell label="Consignee">{data.consignee}</Cell>
        <Cell label="Notify party">
          {data.notifyParty}
          {data.notifyInstructions && data.notifyInstructions !== "—" ? `\n${data.notifyInstructions}` : ""}
          {data.alsoNotifyParty ? `\n\nALSO NOTIFY:\n${data.alsoNotifyParty}` : ""}
        </Cell>
        <Cell label="Vessel / voyage">{data.vessel}</Cell>
        <Cell label="Place of receipt">{data.placeOfReceipt}</Cell>
        <Cell label="Port of loading">{data.portOfLoading}</Cell>
        <Cell label="Port of discharge">{data.portOfDischarge}</Cell>
        <Cell label="Place of delivery">{data.placeOfDelivery}</Cell>
        <Cell label="Shipment period">{data.shipmentPeriod}</Cell>
      </div>
      <div className="grid grid-cols-[1fr_0.8fr_2fr_0.9fr_0.9fr] border-l border-foreground/25">
        <Cell label="Marks & numbers">{data.marks}</Cell>
        <Cell label="No. of packages">{data.packages}</Cell>
        <Cell label="Description of goods">
          {data.goods}
          {data.quantity && `\nQuantity: ${data.quantity}`}
        </Cell>
        <Cell label="Gross weight">{data.grossWeight}</Cell>
        <Cell label="Net weight">{data.netWeight}</Cell>
      </div>
      <div className="grid grid-cols-2 border-l border-foreground/25">
        <Cell label="Container numbers">{data.containers.join(", ")}</Cell>
        <Cell label="Seal numbers">{data.seals.join(", ")}</Cell>
        <Cell label="Freight">{data.freightTerms}</Cell>
        <Cell label="Number of original B/Ls">{data.originals}</Cell>
      </div>
      {data.specialClauses && (
        <div className="border-x border-b border-foreground/25 p-2">
          <div className="text-[9px] font-semibold tracking-wide text-muted-foreground uppercase">Special clauses</div>
          <div className="mt-0.5 text-[12px] whitespace-pre-line">{data.specialClauses}</div>
        </div>
      )}
      <p className="mt-3 text-[10px] leading-snug text-muted-foreground italic">{data.disclaimer}</p>
    </div>
  );
}
