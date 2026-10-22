/**
 * Formatting shared by Convex (contract/B/L snapshots) and the UI.
 * The UI re-exports these from `@/lib/format`.
 */
import { format as formatDateFns, isValid, parseISO } from "date-fns";
import { MONEY_DECIMALS, PRICE_DECIMALS, QUANTITY_DECIMALS } from "./money";

export const DEFAULT_DATE_FORMAT = "dd MMM yyyy";

export function formatDate(value: string | number | undefined | null, pattern = DEFAULT_DATE_FORMAT): string {
  if (value === undefined || value === null || value === "") return "—";
  const date = typeof value === "number" ? new Date(value) : parseISO(value);
  return isValid(date) ? formatDateFns(date, pattern) : "—";
}

export function formatDateTime(value: number | undefined | null): string {
  if (value === undefined || value === null) return "—";
  return formatDateFns(new Date(value), "dd MMM yyyy, HH:mm");
}

export function formatNumber(value: number | undefined | null, maxDecimals = QUANTITY_DECIMALS, minDecimals = 0): string {
  if (value === undefined || value === null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: minDecimals,
    maximumFractionDigits: maxDecimals,
  }).format(value);
}

export function formatQuantity(value: number | undefined | null, uom?: string | null): string {
  if (value === undefined || value === null) return "—";
  return uom ? `${formatNumber(value, QUANTITY_DECIMALS)} ${uom}` : formatNumber(value, QUANTITY_DECIMALS);
}

/** "USD 378,000.00". Unknown ISO codes fall back to plain "CODE 1,234.00". */
export function formatMoney(value: number | undefined | null, currency?: string | null, decimals = MONEY_DECIMALS): string {
  if (value === undefined || value === null || !Number.isFinite(value)) return "—";
  const amount = formatNumber(value, decimals, decimals);
  return currency ? `${currency} ${amount}` : amount;
}

export function formatPrice(value: number | undefined | null, currency?: string | null): string {
  if (value === undefined || value === null) return "—";
  return formatMoney(value, currency, Math.max(MONEY_DECIMALS, Math.min(PRICE_DECIMALS, decimalsOfSafe(value))));
}

function decimalsOfSafe(value: number) {
  const s = value.toString();
  return s.includes(".") ? s.split(".")[1].length : 0;
}

/** Renders a value or an em dash — never the literal "undefined". */
export function display(value: string | number | undefined | null): string {
  if (value === undefined || value === null) return "—";
  const s = String(value).trim();
  return s === "" ? "—" : s;
}

const NUMBER_WORDS_SMALL = [
  "Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
  "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen",
];
const NUMBER_WORDS_TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function wordsBelowThousand(n: number): string {
  const parts: string[] = [];
  if (n >= 100) {
    parts.push(`${NUMBER_WORDS_SMALL[Math.floor(n / 100)]} Hundred`);
    n %= 100;
  }
  if (n >= 20) {
    parts.push(NUMBER_WORDS_TENS[Math.floor(n / 10)] + (n % 10 ? `-${NUMBER_WORDS_SMALL[n % 10]}` : ""));
  } else if (n > 0) {
    parts.push(NUMBER_WORDS_SMALL[n]);
  }
  return parts.join(" ");
}

/** "USD Three Hundred Seventy-Eight Thousand and Cents Fifty Only" — used in contracts. */
export function amountInWords(value: number | undefined, currency?: string): string {
  if (value === undefined || !Number.isFinite(value)) return "—";
  const whole = Math.floor(Math.abs(value));
  const cents = Math.round((Math.abs(value) - whole) * 100);
  const scales: [number, string][] = [
    [1_000_000_000, "Billion"],
    [1_000_000, "Million"],
    [1_000, "Thousand"],
  ];
  let rest = whole;
  const parts: string[] = [];
  for (const [size, name] of scales) {
    if (rest >= size) {
      parts.push(`${wordsBelowThousand(Math.floor(rest / size))} ${name}`);
      rest %= size;
    }
  }
  if (rest > 0 || parts.length === 0) parts.push(wordsBelowThousand(rest) || "Zero");
  const centsText = cents > 0 ? ` and Cents ${wordsBelowThousand(cents)}` : "";
  return `${currency ? `${currency} ` : ""}${parts.join(" ")}${centsText} Only`;
}
