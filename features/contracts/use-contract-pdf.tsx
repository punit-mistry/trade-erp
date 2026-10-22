"use client";

import { useMutation } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { getErrorMessage } from "@/lib/errors";
import type { ContractDocData } from "./contract-document";

/** Renders the PDF in the browser. The PDF engine is loaded on demand. */
export async function renderContractPdfBlob(data: ContractDocData): Promise<Blob> {
  const [{ pdf }, { ContractPdfDocument }] = await Promise.all([import("@react-pdf/renderer"), import("./contract-pdf")]);
  return await pdf(<ContractPdfDocument data={data} />).toBlob();
}

export function pdfFileName(data: ContractDocData) {
  return `${data.contractNumber}-v${data.version}${data.status === "draft" || data.status === "preview" ? "-DRAFT" : ""}.pdf`;
}

export function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Generate → upload to Convex storage → register as a versioned document on
 * the contract. Issued versions accept their PDF once (server-enforced).
 */
export function useContractPdf() {
  const generateUploadUrl = useMutation(api.contracts.generatePdfUploadUrl);
  const attachPdf = useMutation(api.contracts.attachPdf);
  const [busy, setBusy] = useState<"save" | "download" | null>(null);

  async function saveToStorage(contractId: Id<"contracts">, data: ContractDocData) {
    if (busy) return;
    setBusy("save");
    try {
      const blob = await renderContractPdfBlob(data);
      const uploadUrl = await generateUploadUrl();
      const res = await fetch(uploadUrl, { method: "POST", headers: { "Content-Type": "application/pdf" }, body: blob });
      if (!res.ok) throw new Error(`Upload failed (${res.status}).`);
      const { storageId } = (await res.json()) as { storageId: Id<"_storage"> };
      await attachPdf({ contractId, storageId });
      toast.success("PDF generated and saved to the Document Centre.");
    } catch (e) {
      toast.error(getErrorMessage(e, "Unable to generate the PDF."));
    } finally {
      setBusy(null);
    }
  }

  async function downloadLocal(data: ContractDocData) {
    if (busy) return;
    setBusy("download");
    try {
      saveBlob(await renderContractPdfBlob(data), pdfFileName(data));
    } catch (e) {
      toast.error(getErrorMessage(e, "Unable to render the PDF."));
    } finally {
      setBusy(null);
    }
  }

  return { busy, saveToStorage, downloadLocal };
}

/** Browser print / "Save as PDF" fallback: prints only the given element in a hidden frame. */
export function printElement(element: HTMLElement | null, title: string) {
  if (!element) return;
  const iframe = document.createElement("iframe");
  Object.assign(iframe.style, { position: "fixed", right: "0", bottom: "0", width: "0", height: "0", border: "0" });
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument;
  const win = iframe.contentWindow;
  if (!doc || !win) return;
  const styles = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
    .map((n) => n.outerHTML)
    .join("");
  const safeTitle = title.replace(/[<>&]/g, "");
  doc.open();
  doc.write(
    `<!doctype html><html class="${document.documentElement.className}"><head><title>${safeTitle}</title>${styles}` +
      `<style>@page{size:A4;margin:14mm}body{background:#fff;margin:0}.print-root>div{border:0!important;box-shadow:none!important;max-width:none!important;padding:0!important}</style>` +
      `</head><body><div class="print-root">${element.outerHTML}</div></body></html>`,
  );
  doc.close();
  let printed = false;
  const go = () => {
    if (printed) return;
    printed = true;
    win.focus();
    win.print();
    setTimeout(() => iframe.remove(), 2000);
  };
  iframe.onload = go;
  setTimeout(go, 800);
}
