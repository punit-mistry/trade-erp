# Tradeline ERP — Architecture & Module Contract

Next.js 16 (App Router, `proxy.ts` instead of middleware) · React 19 · TypeScript strict · Convex (DB, functions,
file storage) · Convex Auth (Password) · Tailwind v4 · shadcn/ui (radix-nova) · React Hook Form + Zod v4 ·
@react-pdf/renderer · date-fns · lucide-react · sonner.

> Next 16 has breaking changes — check `node_modules/next/dist/docs/` when unsure (e.g. `params` is a Promise in
> page components: `export default async function Page({ params }: PageProps<"/physical-trades/[id]">)`, or in a
> client page use `const { id } = use(params)` / `useParams()`).

## Offline development without a Convex deployment

`convex/_generated` is produced by `node scripts/gen-convex-stubs.mjs` (typed stubs with the same shape as real
codegen). **Re-run it after adding/removing any file in `convex/`.** `npx convex dev` replaces them later.

Checks:

```bash
node scripts/gen-convex-stubs.mjs
npx tsc -p convex/tsconfig.json        # backend
npx tsc --noEmit -p tsconfig.json      # whole app
npx eslint <your files>
```

## Backend conventions (convex/)

- **Every** public query/mutation starts with `requireViewer(ctx)` or `requirePermission(ctx, "<perm>")` from
  `convex/lib/auth.ts`. Never trust ids/roles from args for authorization. Staff edit restrictions:
  `assertCanModifyOwned(user, record)`.
- Throw user-facing errors with `appError(code, message)` (ConvexError `{code,message}`); UI shows them via
  `getErrorMessage` (`lib/errors.ts`).
- Permission matrix: `convex/lib/roles.ts` (`hasPermission`, `Permission`). Status machines and allowed transitions:
  `convex/lib/workflow.ts` — use `canTransitionTrade/Contract/Bl` + check the transition's `permission`.
- Audit: `logActivity(ctx, user, {entityType, entityId, entityLabel, tradeId?, action, summary, changes?})`
  (`convex/lib/audit.ts`), `diffFields(before, patch)` for field-level changes. Set `tradeId` for anything related
  to a trade so it appears in the trade's Activity tab. Records carry `createdBy/updatedBy/updatedAt`.
- Numbering (transaction-safe): `nextTradeNumber`, `nextContractNumber`, `nextBlRecordNumber`,
  `nextCounterpartyCode`, `bumpSequenceTo` in `convex/lib/numbering.ts`.
- Settings with defaults: `getSettings(ctx)` (`convex/lib/settings.ts`).
- Money/quantity precision: `convex/lib/money.ts` (`computeTradeValue`, `roundTo`, `valueDiscrepancy`).
- Trade completeness: `convex/lib/tradeValidation.ts` (`validateTrade`, `blockingIssues`, `resolveTotalValue`).
- Contract variables/rendering: `convex/lib/templateEngine.ts` (`TEMPLATE_VARIABLES`, `buildContractVariables`,
  `renderContract`, `validateTemplateText`, `bankBlock`, `partyAddress`). **`internalNotes` is never passed to
  any external document.**
- Supplier-default inheritance: `convex/lib/inheritance.ts` (`defaultsFromCounterparty`, `defaultsFromCompany`,
  `defaultsFromTemplate`, `applyDefaults`, `markOverridden`).
- Search: each searchable table has a `searchText` column rebuilt with helpers in `convex/lib/search.ts`; use
  `.withSearchIndex("search", q => q.search("searchText", term).eq(...filters))`. Lists use
  `.paginate(paginationOpts)` with `paginationOptsValidator` from `convex/server`; the UI uses
  `usePaginatedQuery`. Never `.collect()` an unbounded table — use indexes and `.take(n)` for bounded reads.
- Documents/file storage: upload via `generateUploadUrl` → POST file → mutation with `storageId`; the DB row is
  written ONLY through `insertDocument(ctx, user, {...})` in `convex/lib/documents.ts` (validates type/size from
  `_storage` metadata, versioning by `groupKey`, audit). Download URLs are produced by an authorized query
  (`ctx.storage.getUrl`) — never expose storage ids publicly.
- Prefer archive/soft-delete. Refuse to delete referenced records.
- Denormalised labels (`counterpartyName`, `commodityName`, `tradeNumber`, …) must be patched by the mutation
  that renames the source (bounded loops over the relevant index).

### Data model

See `convex/schema.ts` (single source of truth) and validators in `convex/lib/validators.ts`. Tables: users (Convex
Auth + role/status/grants), companies, counterparties (normalized: one row per legal entity, `roles[]`),
commodities, lookups, settings, counters, trades, tradeTemplates, contractTemplates (versioned by `familyId`),
contracts (one row per version; immutable snapshot once issued), blDocuments (versioned), dispatchChecklists +
dispatchItems, documents (versioned by `groupKey`), fxRates, activityLogs.

### Roles

Admin / Manager / Staff, stored on `users.role` + `users.status` (`active|pending|disabled`). First sign-up → active
Admin; later sign-ups → pending Staff until an Admin activates them. Only `users.setAccess` (admin) changes
role/status/grants; users cannot change their own role.

## Frontend conventions

- Route group `app/(app)/…` renders inside the sidebar shell (auth + account-status gate). Pages are client
  components using `useQuery/useMutation/usePaginatedQuery` from `convex/react` and `api` from
  `@/convex/_generated/api`.
- Feature code lives in `features/<module>/…`; pages in `app/(app)/<route>/page.tsx` stay thin.
- Shared components (`components/shared/`): `PageHeader`, `StatusBadge`/`TonePill`, `EmptyState`,
  `ConfirmDialog` (destructive confirmations, optional reason), `Combobox` (searchable, client or server search,
  `allowCustom`), `LookupCombobox kind=…`, `CountryCombobox`, `FormField` (+ `tip` tooltips), `InheritedBadge`,
  `NumberInput`, `Section`, `DetailList`, `AccessDenied`, `ErrorState`, `TableSkeleton`, `PageSkeleton`,
  `TableCard`, `SearchInput`, `FilterTabs`, `SortHeader`, `PaginationFooter`.
- Status labels/tones: `lib/status.ts`. Formatting: `lib/format.ts` (`formatMoney`, `formatQuantity`,
  `formatDate`, `display` → "—" for blanks; never render `undefined`). CSV: `lib/csv.ts`.
- Permissions in UI: `const { can } = useViewer()` — hide/disable actions the role can't perform (server still
  enforces).
- Hooks: `useDebouncedValue`, `useUnsavedChangesWarning`.
- Toasts: `toast.success/error` from `sonner` with `getErrorMessage(e)`.
- Numbers: right-aligned with class `num`; table rows compact (`h-9`/`py-2`), sticky header via `TableCard`.
- No fake buttons: every visible action must work. No hard-coded data in UI.

## Module ownership & cross-module contracts

| Owner | Backend files | Frontend |
|---|---|---|
| A Suppliers | `convex/counterparties.ts` | `/suppliers/**`, `features/suppliers/**` |
| B Trades | `convex/trades.ts`, `convex/tradeTemplates.ts` | `/physical-trades/**`, `features/trades/**` |
| C Contracts | `convex/contracts.ts`, `convex/contractTemplates.ts` | `/contracts/**`, `/contract-templates/**`, `features/contracts/**` |
| D B/L, Dispatch, Docs | `convex/blDocuments.ts`, `convex/dispatch.ts`, `convex/documents.ts` | `/dispatch/**`, `/documents/**`, `features/bl/**`, `features/dispatch/**`, `features/documents/**` |
| E Dashboard & Search | `convex/dashboard.ts`, `convex/search.ts`, `convex/activity.ts`, `convex/fx.ts` | `/dashboard`, `/activity`, `components/layout/command-palette.tsx`, `features/dashboard/**`, `features/activity/**`, `features/fx/**` |
| F Admin & Seed | `convex/companies.ts`, `convex/commodities.ts`, `convex/lookups.ts`, `convex/settings.ts`, `convex/seed.ts`, `convex/users.ts` (extend) | `/admin/**`, `/profile`, `features/admin/**` |

Shared exports other modules rely on (exact names):

- **B** `features/trades/…` is the only Book Trade wizard. Clone opens `/physical-trades/new?cloneFrom=<tradeId>`;
  templates open `/physical-trades/new?template=<tradeTemplateId>`. `api.trades.get({ id })` returns
  `{ trade, company, counterparty, commodity, createdByName, updatedByName }` (or throws NOT_FOUND).
- **C** `features/contracts/trade-contract-tab.tsx` → `export function TradeContractTab({ tradeId }: { tradeId: Id<"trades"> })`.
- **D** `features/bl/trade-bl-tab.tsx` → `export function TradeBlTab({ tradeId }: { tradeId: Id<"trades"> })`.
- **D** `features/documents/trade-documents-tab.tsx` → `export function TradeDocumentsTab({ tradeId }: { tradeId: Id<"trades"> })`.
- **D** `features/documents/document-list.tsx` → `export function DocumentList({ filter }: { filter: { tradeId?: Id<"trades">; counterpartyId?: Id<"counterparties">; contractId?: Id<"contracts">; blDocumentId?: Id<"blDocuments"> } })` (compact list with download/version/review actions + upload button).
- **D** `features/documents/upload-document-dialog.tsx` → `export function UploadDocumentDialog(props: { defaults: { tradeId?: Id<"trades">; contractId?: Id<"contracts">; counterpartyId?: Id<"counterparties">; blDocumentId?: Id<"blDocuments">; dispatchItemId?: Id<"dispatchItems">; docType?: DocumentType; groupKey?: string }; trigger?: React.ReactNode; onUploaded?: (documentId: Id<"documents">) => void })`.
- **D** `convex/documents.ts` → `generateUploadUrl` (mutation, `document.upload`), `create` (mutation → `insertDocument`), `getDownloadUrl({ id })` (query, authorized).
- **E** `features/activity/activity-timeline.tsx` → `export function ActivityTimeline(props: { tradeId: Id<"trades"> } | { entityType: EntityType; entityId: string })`.
- **E** `components/layout/command-palette.tsx` → `export function CommandPalette()` (⌘K / Ctrl+K global search, rendered in the top bar).
- Trade detail tab order: Overview · Commercial Terms · Contract (C) · B/L & Dispatch (D) · Documents (D) · Activity History (E).
