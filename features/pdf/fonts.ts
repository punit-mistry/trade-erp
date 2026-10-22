import { Font } from "@react-pdf/renderer";

/**
 * Unicode font for generated PDFs. The built-in PDF fonts only cover WinAnsi,
 * so names like "ÖZKA LASTİK … TİC. A.Ş" would be mangled. Noto Sans (SIL OFL,
 * files in /public/fonts) covers Latin Extended, Greek, Cyrillic and Vietnamese.
 * Import this module only from code that is already dynamically imported.
 */
export const PDF_FONT = "NotoSans";
export const PDF_FONT_BOLD = "NotoSans-Bold";
export const PDF_FONT_ITALIC = "NotoSans-Italic";

let registered = false;

export function registerPdfFonts() {
  if (registered) return;
  const base = typeof window === "undefined" ? "" : window.location.origin;
  Font.register({ family: PDF_FONT, src: `${base}/fonts/NotoSans-Regular.ttf` });
  Font.register({ family: PDF_FONT_BOLD, src: `${base}/fonts/NotoSans-Bold.ttf` });
  Font.register({ family: PDF_FONT_ITALIC, src: `${base}/fonts/NotoSans-Italic.ttf` });
  // Keep long references (B/L numbers, SWIFT codes, emails) intact instead of hyphenating them.
  Font.registerHyphenationCallback((word) => [word]);
  registered = true;
}

registerPdfFonts();
