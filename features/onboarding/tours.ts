/**
 * Guided tour definitions (data only — the driver.js runner lives in
 * tour-runner.ts). Steps target `data-tour` anchors placed on shared shell
 * components and key screens; steps whose target is missing (role-hidden,
 * different tab, mobile sidebar closed) are skipped automatically.
 */
import type { TourId } from "@/convex/lib/helpContent";

export type TourTarget =
  | { anchor: string } // [data-tour="…"]
  | { sectionTitle: string } // <section> whose heading text matches
  | null; // centred popover with no highlighted element

export type TourStepDef = {
  target: TourTarget;
  title: string;
  description: string;
  side?: "top" | "right" | "bottom" | "left";
};

export type TourDef = {
  id: TourId;
  title: string;
  /** Page where the tour runs; undefined = any page (shell tour). */
  path?: string;
  steps: TourStepDef[];
};

const a = (anchor: string): TourTarget => ({ anchor });

export const TOURS: Record<TourId, TourDef> = {
  workspace: {
    id: "workspace",
    title: "Workspace tour",
    steps: [
      {
        target: null,
        title: "Welcome to Tradeline ERP 👋",
        description:
          "In two minutes you'll know where everything lives. Use → / ← or the buttons to move, Esc to leave. You can restart this tour any time from the ? menu.",
      },
      { target: a("nav-dashboard"), title: "Dashboard", description: "Your daily starting point: KPIs, pending actions and shipments needing attention — all from live data.", side: "right" },
      { target: a("nav-suppliers"), title: "Suppliers", description: "Counterparties with contacts, bank details and default terms. Set them once; every new trade reuses them.", side: "right" },
      { target: a("nav-physical-trades"), title: "Physical Trades", description: "Book purchase and sales trades with the 5-step wizard, clone previous trades and track approvals.", side: "right" },
      { target: a("nav-contracts"), title: "Contracts", description: "Contracts generated from trade data, with versions, PDFs and signature tracking.", side: "right" },
      { target: a("nav-dispatch"), title: "B/L & Dispatch", description: "Bills of Lading and dispatch checklists for every shipment, with blockers and overdue items.", side: "right" },
      { target: a("nav-documents"), title: "Document Centre", description: "Every invoice, packing list, certificate and B/L — searchable and permission-checked.", side: "right" },
      { target: a("nav-contract-templates"), title: "Contract Templates", description: "Reusable contract wording with {{variables}} filled from each trade.", side: "right" },
      { target: a("nav-admin-team"), title: "Team & Access", description: "Approve new users and assign Admin, Manager or Staff roles.", side: "right" },
      { target: a("nav-admin-masters"), title: "Companies & Masters", description: "Your company details, commodities, reference lists and numbering settings.", side: "right" },
      { target: a("nav-activity"), title: "Activity Log", description: "A full audit trail of who changed what, and when.", side: "right" },
      { target: a("nav-help"), title: "Help Centre", description: "Step-by-step guides for every workflow, filtered to your role.", side: "right" },
      { target: a("global-search"), title: "Search anything — Ctrl/⌘ K", description: "Find trades, suppliers, contracts and documents instantly, or jump to quick actions.", side: "bottom" },
      { target: a("quick-create"), title: "Create quickly", description: "Book a trade in one click; the arrow opens other create actions.", side: "bottom" },
      { target: a("ai-assistant"), title: "AI assistant", description: "Ask how to do something or ask about your trades. Answers come from a real AI model using data you can access.", side: "bottom" },
      { target: a("notifications"), title: "Pending actions", description: "Contracts awaiting signature, trades waiting for approval, blocked checklists and more.", side: "bottom" },
      { target: a("help"), title: "Help menu", description: "Page tours, the getting-started checklist, keyboard shortcuts and the Help Centre.", side: "bottom" },
      { target: a("user-menu"), title: "Your account", description: "Profile, light/dark appearance and sign out.", side: "bottom" },
      {
        target: null,
        title: "You're ready 🎉",
        description:
          "Next: follow the Getting started checklist (bottom-right) — it ticks itself off as you work. Each page also has its own tour under ? → Take the tour of this page.",
      },
    ],
  },
  dashboard: {
    id: "dashboard",
    title: "Dashboard tour",
    path: "/dashboard",
    steps: [
      { target: a("dash-kpis"), title: "Key metrics", description: "Live counts from real records. Hover (?) for the exact definition; click a card to open the filtered list.", side: "bottom" },
      { target: a("dash-pending"), title: "Pending actions", description: "Work queues needing attention. Only queues with items appear; click an item to open it.", side: "left" },
      { target: a("dash-recent-contracts"), title: "Recent contracts", description: "Latest contract activity with status. Use Quick View to preview without leaving the page.", side: "top" },
      { target: a("dash-dispatch"), title: "Dispatch operations", description: "Shipments with their completion %, blockers and the next action.", side: "top" },
    ],
  },
  suppliers: {
    id: "suppliers",
    title: "Suppliers tour",
    path: "/suppliers",
    steps: [
      { target: a("page-actions"), title: "Add, import, export", description: "Add a supplier, import many from CSV (with a downloadable template) or export the current list.", side: "bottom" },
      { target: a("list-search"), title: "Search", description: "Search by name, code, country or contact.", side: "bottom" },
      { target: a("filters"), title: "Filters", description: "Narrow to Domestic or International suppliers; combine with the status filter.", side: "bottom" },
      { target: a("list-table"), title: "Supplier list", description: "Click a name to open the supplier. The ⋯ menu offers Edit, Clone and Archive.", side: "top" },
    ],
  },
  "supplier-form": {
    id: "supplier-form",
    title: "Supplier form tour",
    path: "/suppliers/new",
    steps: [
      { target: { sectionTitle: "Basic information" }, title: "Basic information", description: "Legal name, type, country and roles. One company can be Supplier, Buyer and Seller — no duplicates needed.", side: "bottom" },
      { target: { sectionTitle: "Contact information" }, title: "Contact", description: "Phone numbers need a country code, e.g. +91 98765 43210.", side: "top" },
      { target: { sectionTitle: "Default commercial terms" }, title: "Default terms", description: "Currency, payment term, Incoterm, ports… These pre-fill new trades. Changing them later never alters existing trades.", side: "top" },
      { target: { sectionTitle: "Bank details" }, title: "Bank details", description: "Reused as this party's bank block on contracts.", side: "top" },
      { target: a("form-actions"), title: "Save", description: "Save, or Save and Add Another to enter several quickly. You'll be warned about likely duplicates first.", side: "top" },
    ],
  },
  trades: {
    id: "trades",
    title: "Physical trades tour",
    path: "/physical-trades",
    steps: [
      { target: a("page-actions"), title: "Book or export", description: "Start a new trade with + Book Trade, or export the filtered list to CSV.", side: "bottom" },
      { target: a("list-search"), title: "Search", description: "Search by trade number, counterparty, commodity or code.", side: "bottom" },
      { target: a("filters"), title: "Status filters", description: "Draft, In Review, Confirmed, Cancelled, Closed — based on the real record status. More filters cover dates, counterparty and currency.", side: "bottom" },
      { target: a("list-table"), title: "Trades", description: "Open a trade by its number. The row menu has Edit, Clone Trade, Contract and more — cloning is the fastest way to book a similar trade.", side: "top" },
    ],
  },
  "book-trade": {
    id: "book-trade",
    title: "Book Trade wizard tour",
    path: "/physical-trades/new",
    steps: [
      { target: a("wizard-steps"), title: "Five simple steps", description: "Basics → Quantity & Price → Terms & Logistics → Contract Information → Review. Click any step to jump back — nothing is lost.", side: "bottom" },
      { target: a("wizard-summary"), title: "Live summary", description: "Parties, quantity × price = total value and key terms update as you type.", side: "left" },
      { target: a("wizard-actions"), title: "Autosave & actions", description: "Your draft saves automatically (watch Saving… / Saved). Move between steps here; the Review step offers Submit for Review and, for Managers, Confirm.", side: "top" },
      {
        target: null,
        title: "Tip: let defaults do the typing",
        description:
          "Pick the counterparty in step 1 — its saved currency, terms, ports and bank details fill in automatically and are marked “from supplier default”. Edit any of them freely.",
      },
    ],
  },
  "trade-detail": {
    id: "trade-detail",
    title: "Trade page tour",
    steps: [
      { target: a("page-actions"), title: "Trade actions", description: "Edit (drafts), Clone, and the workflow actions your role allows: Submit, Confirm, Cancel, Close.", side: "bottom" },
      { target: a("next-step"), title: "Next step", description: "What to do next, based on the trade's real state — e.g. Generate Contract or Prepare B/L.", side: "bottom" },
      { target: a("trade-tabs"), title: "Everything about this trade", description: "Overview, Commercial Terms, Contract, B/L & Dispatch, Documents and Activity History — all connected to this one record.", side: "bottom" },
      { target: a("contract-tab"), title: "Contract", description: "Generate the draft from trade data, issue it (Managers), download the PDF and track signature.", side: "top" },
      { target: a("bl-status-banner"), title: "Draft vs carrier-issued", description: "Our B/L is an internal draft until the carrier's B/L number and document are recorded.", side: "bottom" },
      { target: a("dispatch-checklist"), title: "Dispatch checklist", description: "Assign items, set due dates, attach documents. Completion % is calculated from the items.", side: "top" },
    ],
  },
  contracts: {
    id: "contracts",
    title: "Contracts tour",
    path: "/contracts",
    steps: [
      { target: a("filters"), title: "Contract status", description: "Draft → Generated → Sent → Pending Signature → Rate Fixed → Closed.", side: "bottom" },
      { target: a("list-search"), title: "Search", description: "Find by contract number, trade number or counterparty.", side: "bottom" },
      { target: a("list-table"), title: "Contract register", description: "Quick View previews a contract; open it for versions, PDF and actions. New contracts are generated from a trade's Contract tab.", side: "top" },
    ],
  },
  dispatch: {
    id: "dispatch",
    title: "B/L & Dispatch tour",
    path: "/dispatch",
    steps: [
      { target: a("page-actions"), title: "Operations board", description: "Every open shipment in one place.", side: "bottom" },
      { target: a("filters"), title: "Focus filters", description: "Show only shipments with blockers, overdue items or a given B/L status.", side: "bottom" },
      { target: a("list-table"), title: "Shipments", description: "Progress %, blockers, the next action and who is responsible. Open a row to work on its B/L and checklist.", side: "top" },
    ],
  },
  documents: {
    id: "documents",
    title: "Document Centre tour",
    path: "/documents",
    steps: [
      { target: a("page-actions"), title: "Upload", description: "Upload a document and link it to a trade. Type and size are checked on the server.", side: "bottom" },
      { target: a("list-search"), title: "Search", description: "Search file names, trade numbers, contract numbers and suppliers.", side: "bottom" },
      { target: a("filters"), title: "Filters", description: "Filter by type, review status and date.", side: "bottom" },
      { target: a("list-table"), title: "Documents", description: "Download, view versions, approve or reject (Managers) and archive.", side: "top" },
    ],
  },
};

/** Which page tour applies to a pathname (null = none, offer the workspace tour). */
export function tourForPath(pathname: string): TourId | null {
  if (pathname === "/dashboard") return "dashboard";
  if (pathname === "/suppliers") return "suppliers";
  if (pathname === "/suppliers/new" || /^\/suppliers\/[^/]+\/edit$/.test(pathname)) return "supplier-form";
  if (pathname === "/physical-trades") return "trades";
  if (pathname === "/physical-trades/new" || /^\/physical-trades\/[^/]+\/edit$/.test(pathname)) return "book-trade";
  if (/^\/physical-trades\/[^/]+$/.test(pathname)) return "trade-detail";
  if (pathname === "/contracts") return "contracts";
  if (pathname === "/dispatch") return "dispatch";
  if (pathname === "/documents") return "documents";
  return null;
}
