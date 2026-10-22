/**
 * Structured help guides. Pure module (no React / Convex imports) shared by
 * the Help Centre UI (features/onboarding) and the AI assistant, which uses
 * `helpContentAsText()` as grounding context. Keep it accurate to the app:
 * update a guide whenever the workflow it describes changes.
 */
import type { Role } from "./validators";

export type HelpStep = {
  title: string;
  body: string;
  /** Where the user performs this step. */
  href?: string;
  /** Guided tour that demonstrates this step (see features/onboarding/tours.ts). */
  tourStep?: TourId;
};

export type TourId =
  | "workspace"
  | "dashboard"
  | "suppliers"
  | "supplier-form"
  | "trades"
  | "book-trade"
  | "trade-detail"
  | "contracts"
  | "dispatch"
  | "documents";

export type HelpCategory =
  | "Getting started"
  | "Suppliers"
  | "Physical trades"
  | "Contracts"
  | "Shipping & dispatch"
  | "Documents"
  | "Workspace"
  | "Administration";

export type HelpGuide = {
  id: string;
  title: string;
  summary: string;
  audience: Role[];
  category: HelpCategory;
  steps: HelpStep[];
  tips?: string[];
};

const ALL: Role[] = ["admin", "manager", "staff"];
const MGMT: Role[] = ["admin", "manager"];

export const HELP_CATEGORIES: HelpCategory[] = [
  "Getting started",
  "Suppliers",
  "Physical trades",
  "Contracts",
  "Shipping & dispatch",
  "Documents",
  "Workspace",
  "Administration",
];

export const HELP_GUIDES: HelpGuide[] = [
  {
    id: "getting-started-admin",
    title: "First-time setup for administrators",
    summary: "Configure your company, bank details, contract template and team before booking trades.",
    audience: ["admin"],
    category: "Getting started",
    steps: [
      {
        title: "Set up your internal company",
        body: "Open Companies & Masters → Companies. Replace the placeholder demo company with your legal entity: name, code, address, tax ID, signatory and bank details (beneficiary, bank, account/IBAN, SWIFT). This information prints on contracts and B/Ls, and the bank block is suggested on new trades.",
        href: "/admin/masters?tab=companies",
      },
      {
        title: "Review reference lists",
        body: "In Companies & Masters → Reference Lists, check currencies, Incoterms, payment terms, units of measure, ports and packing options. These feed the searchable dropdowns in every form.",
        href: "/admin/masters?tab=lists",
      },
      {
        title: "Add your commodities",
        body: "In Companies & Masters → Commodities, add each product with a short code (e.g. TSR10), HS code, default unit and grade.",
        href: "/admin/masters?tab=commodities",
      },
      {
        title: "Activate a contract template",
        body: "Open Contract Templates. Review the default template's clauses with your legal team, edit a draft version, then Activate it and Set as Default. Contracts are generated from the active default template unless a trade selects another.",
        href: "/contract-templates",
      },
      {
        title: "Configure numbering and system settings",
        body: "In Companies & Masters → System Settings set trade/contract/B/L number prefixes (e.g. TRD-2026-0001), default currency, date format, upload limits and the default dispatch checklist.",
        href: "/admin/masters?tab=settings",
      },
      {
        title: "Approve your team",
        body: "New sign-ups wait as 'Awaiting approval'. In Team & Access choose a role (Manager or Staff) and Approve. Nobody can change their own role.",
        href: "/admin/team",
      },
    ],
    tips: [
      "The first account created becomes the Administrator automatically.",
      "Managers can be granted 'Companies & Masters' access from Team & Access.",
    ],
  },
  {
    id: "getting-started-everyone",
    title: "Your first day: the trade-to-shipment flow",
    summary: "The end-to-end path: supplier → trade → contract → B/L → dispatch, with as little retyping as possible.",
    audience: ALL,
    category: "Getting started",
    steps: [
      {
        title: "Find your way around",
        body: "The left sidebar lists every module. The top bar has global search (Ctrl/⌘ K), the + New menu, the AI assistant, pending-action notifications and this help menu.",
        tourStep: "workspace",
      },
      {
        title: "Add or pick a supplier",
        body: "Suppliers store contacts, bank details and default commercial terms (currency, payment term, Incoterm, ports). Set them once and every new trade reuses them.",
        href: "/suppliers",
        tourStep: "suppliers",
      },
      {
        title: "Book a trade",
        body: "Use + Book Trade. The 5-step wizard fills in the supplier's defaults, calculates value as you type and autosaves your draft.",
        href: "/physical-trades/new",
        tourStep: "book-trade",
      },
      {
        title: "Get it approved",
        body: "Submit the trade for review. A Manager or Admin confirms it.",
        href: "/physical-trades?status=pending_review",
      },
      {
        title: "Generate the contract",
        body: "On the trade's Contract tab, generate a draft from the trade data, review it, and (Managers) issue it and download the PDF.",
        tourStep: "trade-detail",
      },
      {
        title: "Prepare shipping",
        body: "On the B/L & Dispatch tab, create the B/L from the trade and work through the dispatch checklist.",
        href: "/dispatch",
        tourStep: "dispatch",
      },
    ],
  },
  {
    id: "add-supplier",
    title: "Add a supplier and its default terms",
    summary: "Create a counterparty once — with contacts, bank details and default commercial terms — and reuse it on every trade.",
    audience: ALL,
    category: "Suppliers",
    steps: [
      {
        title: "Open Add Supplier",
        body: "Go to Suppliers and click + Add Supplier (or + New → Add Supplier in the top bar). A supplier code such as CP-0001 is generated automatically.",
        href: "/suppliers/new",
        tourStep: "supplier-form",
      },
      {
        title: "Basic information",
        body: "Enter the legal name, Domestic or International, country and the roles it plays: Supplier, Buyer and/or Seller. One company can play several roles — don't create duplicates.",
      },
      {
        title: "Contact details",
        body: "Primary contact, email, phone with country code (e.g. +91 98765 43210), website, address and tax/registration IDs. Missing fields simply show as '—'.",
      },
      {
        title: "Default commercial terms",
        body: "Default currency, payment term, Incoterm, pricing term, origin, manufacturer, preferred loading/discharge ports and freight terms. These are suggested on new trades; changing them later never alters existing trades.",
      },
      {
        title: "Bank details",
        body: "Bank name and address, beneficiary, account/IBAN, SWIFT/BIC and instructions. They become the seller's or buyer's bank block on contracts.",
      },
      {
        title: "Save",
        body: "Save, or Save and Add Another to enter several suppliers quickly. If a supplier with the same name, tax ID or registration number exists you'll get a duplicate warning first.",
      },
    ],
    tips: [
      "Use Clone on an existing supplier to start from similar details.",
      "Book Trade from the supplier's page pre-selects the supplier in the wizard.",
      "Staff can edit suppliers they created or are assigned to; Managers can archive.",
    ],
  },
  {
    id: "csv-import-export",
    title: "Import and export suppliers with CSV",
    summary: "Bulk-load counterparties from a spreadsheet, or export lists for reporting.",
    audience: MGMT,
    category: "Suppliers",
    steps: [
      {
        title: "Download the template",
        body: "On Suppliers, open Import CSV and click Download template. Required columns are Name and Type (Domestic/International); the others are optional.",
        href: "/suppliers",
      },
      {
        title: "Upload and preview",
        body: "Choose your file. Every row is validated before anything is saved and errors are shown per row.",
      },
      {
        title: "Import",
        body: "Confirm the import. Rows that duplicate an existing supplier are skipped and reported; the rest are created with new codes.",
      },
      {
        title: "Export",
        body: "Export CSV on the Suppliers or Physical Trades list downloads the rows matching your current filters.",
      },
    ],
  },
  {
    id: "book-trade",
    title: "Book a physical trade",
    summary: "Use the guided 5-step wizard: Basics, Quantity & Price, Terms & Logistics, Contract Information, Review & Save.",
    audience: ALL,
    category: "Physical trades",
    steps: [
      {
        title: "Step 1 — Trade Basics",
        body: "Choose Purchase or Sales, the internal company, the counterparty (sellers/suppliers are suggested for purchases, buyers for sales), the commodity and the trade date. Selecting a counterparty fills in its saved defaults — marked 'from supplier default' — without overwriting anything you typed.",
        href: "/physical-trades/new",
        tourStep: "book-trade",
      },
      {
        title: "Step 2 — Quantity & Price",
        body: "Enter quantity, unit (MT, KG, CBM…), price type, price per unit and currency. Trade value = quantity × price and updates instantly in the summary panel.",
      },
      {
        title: "Step 3 — Terms & Logistics",
        body: "Incoterm, payment and pricing terms, shipment period, loading and discharge ports, partial shipment, tolerance (e.g. ±5% at Seller's option), origin, manufacturer, freight terms and special conditions. Internal Notes are kept separate and are never printed on contracts.",
      },
      {
        title: "Step 4 — Contract Information",
        body: "Buyer reference/PO and date, contract template, packing, documents and arbitration clauses, and both parties' bank details. The printed contract number is optional and only Managers/Admins can set it; otherwise the template's numbering rule is used.",
      },
      {
        title: "Step 5 — Review & Save",
        body: "Check the summary. Errors must be fixed (use the Fix links); warnings are informational. Then Save Draft, Save and Preview Contract, Submit for Review, or — Managers — Confirm Trade.",
      },
    ],
    tips: [
      "Your draft autosaves — watch the Saving… / Saved indicator. Refreshing the page restores it.",
      "You can jump back to any step without losing data.",
      "A new trade gets a number like TRD-2026-0018 automatically.",
    ],
  },
  {
    id: "clone-trade",
    title: "Clone a previous trade",
    summary: "Start a new trade from a similar one and change only what's different.",
    audience: ALL,
    category: "Physical trades",
    steps: [
      {
        title: "Choose the source trade",
        body: "On Physical Trades, open the row menu (or the trade's page) and click Clone Trade, then confirm.",
        href: "/physical-trades",
        tourStep: "trades",
      },
      {
        title: "Update what changed",
        body: "The wizard opens prefilled with the commodity, quantity, price, terms, shipment details, clauses and bank information, with the note 'Copied from TRD-…'. Change the fields that differ, such as the date or quantity.",
      },
      {
        title: "Save the new draft",
        body: "The clone gets a new trade number and starts as Draft. Contract numbers, approvals, PDFs, B/L numbers and dispatch progress are never copied, and the original trade is unchanged.",
      },
    ],
    tips: ["Managers can save frequently used setups with Create Template from Trade."],
  },
  {
    id: "trade-approval",
    title: "Submit, approve, confirm, cancel or close a trade",
    summary: "How a trade moves through Draft → In Review → Confirmed → Closed, and who can do what.",
    audience: ALL,
    category: "Physical trades",
    steps: [
      {
        title: "Submit for review (anyone)",
        body: "When all required fields are complete, click Submit for Review. Incomplete trades are blocked with a list of what's missing.",
      },
      {
        title: "Approve & confirm (Manager/Admin)",
        body: "Managers open trades In Review (Physical Trades → In Review filter, or the notification bell) and choose Approve & Confirm, or Return for Correction with a note. Confirmed trades are locked for editing.",
        href: "/physical-trades?status=pending_review",
      },
      {
        title: "Cancel or close (Manager/Admin)",
        body: "Cancel requires a reason; cancelled trades never count in active metrics. Close a trade when it's finished — closing does not mean all documents are complete.",
      },
      {
        title: "Follow the next step",
        body: "Each trade page shows a 'Next step' card (e.g. Generate Contract, Prepare B/L, Review Dispatch Checklist) based on its real state.",
        tourStep: "trade-detail",
      },
    ],
    tips: ["Every status change is recorded in the trade's Activity History tab."],
  },
  {
    id: "contracts",
    title: "Generate, issue and track a contract",
    summary: "Contracts are built from the trade's own data using a template — no retyping.",
    audience: ALL,
    category: "Contracts",
    steps: [
      {
        title: "Preview",
        body: "Open the trade's Contract tab. Before any draft exists you see a live preview generated from the trade.",
        tourStep: "trade-detail",
      },
      {
        title: "Generate a draft",
        body: "Click Generate Draft Contract. Any missing or unknown template values are highlighted — complete the trade and Regenerate Draft until none remain.",
      },
      {
        title: "Issue (Manager/Admin)",
        body: "Finalise & Issue freezes the contract exactly as generated (status Generated). The trade must be confirmed first. Later trade edits never change an issued contract.",
      },
      {
        title: "Download the PDF",
        body: "Generate / Download PDF creates a print-ready A4 PDF stored in the Document Centre. You can also print from the browser.",
      },
      {
        title: "Track progress",
        body: "Mark as Sent → Awaiting Signature → Rate Fixed → Close. When the counterparty signs, use Upload Signed Copy — the contract then shows 'signed copy uploaded'. There is no e-signature integration, so the system never claims a digital signature.",
      },
      {
        title: "Revise if something changes",
        body: "Create Revision (with a reason) makes a new draft version from the current trade data; the issued version stays in force until a Manager issues the revision. Version history shows what changed.",
      },
    ],
    tips: ["See all contracts and their statuses under Contracts in the sidebar."],
  },
  {
    id: "contract-templates",
    title: "Contract templates and variables",
    summary: "Maintain reusable, versioned contract wording with {{variables}} filled from trade data.",
    audience: MGMT,
    category: "Contracts",
    steps: [
      {
        title: "Create or open a template",
        body: "Contract Templates → New Template, or open an existing one. Active templates can't be edited directly — use New Version, edit the draft, then Activate it.",
        href: "/contract-templates",
      },
      {
        title: "Write clauses with variables",
        body: "Add numbered clauses and insert variables such as {{commodity}}, {{quantity}}, {{totalValue}}, {{incoterm}}, {{paymentTerms}} from the variable picker. Unknown variables are flagged and block activation.",
      },
      {
        title: "Numbering and defaults",
        body: "Set the numbering format (e.g. {prefix}-{year}-{seq}) and default packing, documents and arbitration clauses that new trades inherit.",
      },
      {
        title: "Activate and set default",
        body: "Activate the version and Set as Default for a company and direction (purchase/sales/any).",
      },
    ],
    tips: ["Have your legal team review wording — generated documents don't guarantee legal compliance."],
  },
  {
    id: "bl-dispatch",
    title: "Prepare the B/L and complete dispatch",
    summary: "Build the Bill of Lading from the trade, get it reviewed, record the carrier's B/L, and finish the dispatch checklist.",
    audience: ALL,
    category: "Shipping & dispatch",
    steps: [
      {
        title: "Create the B/L from the trade",
        body: "On the trade's B/L & Dispatch tab click Create B/L from Trade. Shipper, consignee, notify party, ports, goods, quantity and packing are copied from the trade. Edits here never change the trade.",
        tourStep: "trade-detail",
      },
      {
        title: "Complete and preview",
        body: "Fill vessel/voyage, containers and seals, weights, marks and freight terms. Preview it, and Generate Draft PDF (watermarked as a draft).",
      },
      {
        title: "Review workflow",
        body: "Mark Prepared → Send for Review → a Manager Verifies (or returns it for correction).",
      },
      {
        title: "Record the carrier-issued B/L (Manager/Admin)",
        body: "An internal draft is NOT a carrier B/L. Only after the carrier issues it, use Record Carrier-Issued B/L with the carrier's B/L number, issue date and the uploaded carrier document.",
      },
      {
        title: "Work the dispatch checklist",
        body: "Each item (invoice, packing list, contract check, B/L review, customs…) has a status, assignee, due date, comments and attachments. Blocked items need a reason. Completion % is calculated from the items.",
        href: "/dispatch",
        tourStep: "dispatch",
      },
    ],
    tips: ["B/L & Dispatch in the sidebar shows every open shipment, blockers and overdue items."],
  },
  {
    id: "documents",
    title: "Upload and review documents",
    summary: "Keep invoices, packing lists, certificates and B/Ls linked to their trade, contract or supplier.",
    audience: ALL,
    category: "Documents",
    steps: [
      {
        title: "Upload",
        body: "Use Upload on the Document Centre, a trade's Documents tab, a supplier page or a checklist item. Choose the document type; PDFs, images, Office files and CSV are accepted up to the configured size limit.",
        href: "/documents",
        tourStep: "documents",
      },
      {
        title: "Versions",
        body: "Uploading a new file into the same document keeps the old one as a previous version.",
      },
      {
        title: "Review (Manager/Admin)",
        body: "Approve or Reject (with a reason) uploaded documents. Generated PDFs are approved automatically.",
      },
      {
        title: "Find documents",
        body: "Filter the Document Centre by type, review status and date, or search by file name, trade number, contract number or supplier.",
      },
    ],
    tips: ["Downloads are always permission-checked — knowing a file link is not enough."],
  },
  {
    id: "dashboard",
    title: "Dashboard and pending actions",
    summary: "See what needs attention today — every number comes from real records.",
    audience: ALL,
    category: "Workspace",
    steps: [
      {
        title: "KPI cards",
        body: "Active Contracts, Pending Signatures, Rate Fixed and Trades Closed This Month. Hover the (?) for the exact definition; click a card to open the filtered list.",
        href: "/dashboard",
        tourStep: "dashboard",
      },
      {
        title: "Pending actions",
        body: "Work queues such as Awaiting Signature, Pending Trade Approvals, Dispatch Checklists and Missing Shipping Documents. Only queues with items appear. The bell in the top bar shows the same queues.",
      },
      {
        title: "Dispatch operations",
        body: "Shipments needing attention with completion %, blockers and the next action.",
      },
    ],
  },
  {
    id: "search-shortcuts",
    title: "Global search and shortcuts",
    summary: "Jump to any trade, supplier, contract or document in seconds.",
    audience: ALL,
    category: "Workspace",
    steps: [
      {
        title: "Open search",
        body: "Press Ctrl+K (⌘K on Mac) or click Search in the top bar. Type at least 2 characters of a trade number, counterparty, commodity, contract number or file name.",
        tourStep: "workspace",
      },
      {
        title: "Quick actions",
        body: "The search palette also offers Book Trade, Add Supplier and links to every module. The + New menu in the top bar creates common records.",
      },
      {
        title: "Ask the AI assistant",
        body: "Use the AI assistant in the top bar to ask 'how do I…' questions or about your trades.",
      },
    ],
  },
  {
    id: "fx-rates",
    title: "Record and verify FX rates",
    summary: "Currency rates are entered manually with their source — never invented by the system.",
    audience: ALL,
    category: "Workspace",
    steps: [
      {
        title: "Record a rate",
        body: "From the dashboard's Currency Rate Validation queue, use Record FX rate: base and quote currency, rate, source (e.g. bank quote) and timestamp, optionally linked to a trade.",
        href: "/dashboard",
      },
      {
        title: "Verify (Manager/Admin)",
        body: "Another Manager/Admin verifies or rejects the rate. Trades whose historical unit price is missing are also listed for validation.",
      },
    ],
  },
  {
    id: "roles",
    title: "Roles and permissions",
    summary: "What Admins, Managers and Staff can do. Permissions are enforced on the server.",
    audience: ALL,
    category: "Administration",
    steps: [
      {
        title: "Staff",
        body: "Create suppliers and trade drafts, edit their own or assigned drafts, clone trades, prepare contracts and B/L data, upload documents, update checklist items and submit for review.",
      },
      {
        title: "Manager",
        body: "Everything Staff can do plus confirm, cancel and close trades, issue contracts and revisions, override contract numbers and values, review B/Ls and documents, verify FX rates and manage templates. Masters/settings only if granted.",
      },
      {
        title: "Admin",
        body: "Full access including Team & Access (roles, approvals), Companies & Masters, System Settings and the Activity Log.",
        href: "/admin/team",
      },
    ],
    tips: ["If a button is missing, your role probably can't perform that action — ask an Admin."],
  },
  {
    id: "activity-log",
    title: "Audit trail and activity history",
    summary: "Every important change is recorded with who, when and what changed.",
    audience: MGMT,
    category: "Administration",
    steps: [
      {
        title: "Per record",
        body: "Trades, suppliers and contracts have an Activity tab with field-level changes.",
      },
      {
        title: "Activity Log",
        body: "Activity Log in the sidebar lists everything across the system with filters (Managers and Admins).",
        href: "/activity",
      },
    ],
  },
];

export function guidesForRole(role: Role | null | undefined): HelpGuide[] {
  if (!role) return [];
  return HELP_GUIDES.filter((g) => g.audience.includes(role));
}

export function findGuide(id: string): HelpGuide | undefined {
  return HELP_GUIDES.find((g) => g.id === id);
}

/** Compact markdown of the guides (optionally role-filtered) for LLM grounding. */
export function helpContentAsText(role?: Role | null): string {
  const guides = role ? guidesForRole(role) : HELP_GUIDES;
  return guides
    .map((g) => {
      const steps = g.steps
        .map((s, i) => `${i + 1}. ${s.title}: ${s.body}${s.href ? ` (page: ${s.href})` : ""}`)
        .join("\n");
      const tips = g.tips?.length ? `\nTips: ${g.tips.join(" ")}` : "";
      return `## ${g.title} [${g.category}; for ${g.audience.join("/")}]\n${g.summary}\n${steps}${tips}`;
    })
    .join("\n\n");
}
