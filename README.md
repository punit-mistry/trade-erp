# Tradeline ERP — Physical Commodity Trading

A production-oriented trading ERP: suppliers and counterparties, physical trade booking (guided wizard, clone,
templates), contracts generated from trade data (versioned, PDF), B/L preparation and dispatch checklists, a
document centre, dashboards and a full audit trail, with role-based access enforced on the server.

**Stack:** Next.js 16 (App Router) · React 19 · TypeScript (strict) · Convex (database, functions, file storage) ·
Convex Auth (email + password) · Tailwind CSS v4 · shadcn/ui · React Hook Form + Zod · @react-pdf/renderer.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for conventions, module ownership and the data model.

---

## 1. Setup (local development)

Requirements: Node.js 20+ (tested on 24), npm, a free Convex account (or Convex local/anonymous dev mode).

```bash
cd trading-erp
npm install

# 1) Create / connect a Convex dev deployment. Logs you in, pushes the schema + functions,
#    generates convex/_generated and writes NEXT_PUBLIC_CONVEX_URL + CONVEX_DEPLOYMENT to .env.local.
#    Leave it running (it watches convex/ for changes).
npx convex dev

# 2) In a second terminal: configure Convex Auth keys on the deployment
#    (sets JWT_PRIVATE_KEY, JWKS and SITE_URL). Choose the defaults; SITE_URL = http://localhost:3000
npx @convex-dev/auth

# 3) Start the web app
npm run dev            # http://localhost:3000
```

> Without a Convex account you can try `CONVEX_AGENT_MODE=anonymous npx convex dev` (local backend, beta).

### First user = Administrator

Open http://localhost:3000, choose **Request access** and create an account. The **first** account becomes an
active **Admin**. Every later sign-up is created as **Staff** with status *Awaiting approval* and cannot see any
data until an Admin activates it under **Administration → Team & Access** (where roles are also assigned).

### Master data and demo data

```bash
# Idempotent: settings, reference lists (currencies, Incoterms, UOMs, ports…),
# a placeholder internal company and a default contract template.
npx convex run seed:ensureMasters '{"adminEmail":"you@example.com"}'

# Optional sample data from the brief (4 suppliers, 7 counterparties, 7 commodities, 17 trades,
# 3 demo contracts). Refuses to run unless explicitly allowed on the deployment — dev/demo only.
npx convex env set ERP_ALLOW_DEMO_SEED true
npx convex run seed:loadDemoData '{"adminEmail":"you@example.com"}'
npx convex run seed:demoStatus
```

Seeding never overwrites existing records (natural keys are checked) and must not be enabled in production. Then
open **Companies & Masters** and replace the placeholder company with your real entity, bank details and
signatory, and review the default contract template wording with your legal team.

Historical trades from the brief keep their supplied totals; their unit prices are **not** derived — they are
flagged *“unit price needs validation”* instead.

---

## 2. Environment variables

| Where | Variable | Purpose |
|---|---|---|
| `.env.local` (written by `npx convex dev`) | `NEXT_PUBLIC_CONVEX_URL` | Convex deployment URL used by the browser and the Next.js proxy |
| `.env.local` | `CONVEX_DEPLOYMENT` | Deployment the CLI targets |
| Convex deployment (`npx convex env set`) | `JWT_PRIVATE_KEY`, `JWKS` | Convex Auth token signing keys (set by `npx @convex-dev/auth`) |
| Convex deployment | `SITE_URL` | App URL (only required for OAuth/magic links) |
| Convex deployment | `ERP_ALLOW_DEMO_SEED` | `true` only on dev/demo deployments to allow `seed:loadDemoData` |

No secrets are exposed through `NEXT_PUBLIC_*`. See `.env.example`.

---

## 3. Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Next.js dev server |
| `npm run dev:convex` | `convex dev` (push functions + codegen, watch) |
| `npm run build` / `npm start` | Production build / serve |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript for the app and for `convex/` |
| `npm test` | Vitest + convex-test: runs the real Convex functions in memory (no deployment needed) |
| `npm run convex:stubs` | Writes typed `convex/_generated` stubs **offline** (used only when no deployment is configured; `npx convex dev` overwrites them) |

---

## 4. Main routes and workflows

| Area | Route | Highlights |
|---|---|---|
| Dashboard | `/dashboard` | KPI cards from real records (definitions in tooltips), recent contracts, pending-action queues, dispatch operations |
| Suppliers | `/suppliers`, `/new`, `/[id]`, `/[id]/edit` | Search/filter/sort, pagination, CSV import (validated preview) & export, clone, archive/restore, duplicate warnings, default terms, bank details, related trades/contracts/documents/activity |
| Physical Trades | `/physical-trades`, `/new`, `/[id]`, `/[id]/edit` | 5-step Book Trade wizard with autosave, supplier-default inheritance (marked “from supplier default”), live value calculation, review & validation, submit/confirm/cancel/close workflow, Clone Trade, trade templates |
| Contracts | `/contracts`, `/contracts/[id]` | Generated from trade data via templates, live preview, issue (frozen snapshot), revisions with diff, sent / pending signature / rate fixed / closed, PDF download (stored in Convex storage), signed-copy upload |
| Contract Templates | `/contract-templates` | Versioned templates, clause editor, `{{variable}}` picker, unknown-variable checks, defaults per company/direction, numbering formats |
| B/L & Dispatch | `/dispatch` (+ trade tab) | Structured B/L from the trade, preview, draft PDF, review/verify, record carrier-issued B/L (separate from internal drafts), revisions, dispatch checklist with assignees, due dates, blockers and real completion % |
| Document Centre | `/documents` | Upload (type/size validated on the server), versions, review status, filters, authorised download |
| Administration | `/admin/team`, `/admin/masters`, `/activity`, `/profile` | Users & roles, companies, commodities, reference lists, numbering & system settings, audit log |

Global search: **Ctrl/⌘ + K** (trades, counterparties, contracts, documents).

Typical flow: *Add supplier → Book Trade (pick supplier, defaults fill in) → Submit → Manager confirms →
Contract tab: Generate draft → Issue → Download PDF → Mark sent → Pending signature → upload signed copy →
B/L & Dispatch tab: Create B/L from trade → review/verify → record carrier B/L → complete checklist.*

---

## 5. Data model & permissions (summary)

Tables (`convex/schema.ts`): `users` (Convex Auth + `role`, `status`, `grants`), `companies`, `counterparties`
(one row per legal entity with `roles[]` supplier/buyer/seller), `commodities`, `lookups`, `settings`, `counters`
(transaction-safe numbering), `trades`, `tradeTemplates`, `contractTemplates` (versioned families), `contracts`
(one row per version, immutable snapshot once issued), `blDocuments` (versioned), `dispatchChecklists`,
`dispatchItems`, `documents` (Convex storage ids, versioned), `fxRates` (manually recorded with source,
timestamp and review — never invented), `activityLogs`.

Separate status machines (`convex/lib/workflow.ts`): trade (draft → in review → confirmed → closed / cancelled),
contract (draft → generated → sent → pending signature → rate fixed → closed / cancelled; superseded),
B/L (draft → prepared → under review → verified → carrier issued; superseded), dispatch items
(pending / in progress / complete / blocked).

Roles (`convex/lib/roles.ts`, enforced inside every Convex query/mutation):

- **Admin** — everything, incl. users & roles, masters, settings, audit log.
- **Manager** — operations: confirm/cancel/close trades, issue contracts, override contract numbers and values,
  review B/Ls and documents, manage templates; masters/settings only if granted.
- **Staff** — create suppliers and trade drafts, edit their own/assigned drafts, clone, prepare contracts and B/L
  data, upload documents, update checklist items, submit for review.

Users cannot change their own role; only Admins can, and the last active Admin cannot be demoted.

---

## 6. Assumptions & notes

- No e-signature integration exists: a contract is only marked *signed copy uploaded* when a signed document is
  attached. Nothing claims a verified digital signature.
- Generated B/Ls are internal drafts. *Carrier issued* requires the carrier's B/L number, issue date and the
  uploaded carrier document.
- Contract wording is fully configurable; the seeded template contains placeholders to be reviewed by your legal
  team. Generated documents do not guarantee legal compliance.
- Staff can view all operational records (needed to clone previous trades) but edit only their own/assigned
  drafts.
