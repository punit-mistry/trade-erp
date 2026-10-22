"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { useState } from "react";
import { Archive, ArchiveRestore, ArrowLeftRight, Copy, FileSignature, Pencil, Plus, Power } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { DetailList, Section } from "@/components/shared/section";
import { StatusBadge, TonePill } from "@/components/shared/status-badge";
import { PageSkeleton, TableSkeleton } from "@/components/shared/states";
import { ActivityTimeline } from "@/features/activity/activity-timeline";
import { DocumentList } from "@/features/documents/document-list";
import { formatDate, formatDateTime, formatMoney, formatQuantity } from "@/lib/format";
import { ACTIVE_STATUS, CONTRACT_STATUS, DIRECTION_LABEL, TRADE_STATUS } from "@/lib/status";
import { ArchiveSupplierDialog, StatusToggleDialog, useSupplierPermissions } from "./supplier-actions";
import { ROLE_LABEL, TYPE_LABEL } from "./supplier-schema";
import { useSetPageTitle } from "@/components/layout/page-title";

export function SupplierDetail({ id }: { id: Id<"counterparties"> }) {
  const detail = useQuery(api.counterparties.getDetail, { id });
  const cp = detail?.counterparty;
  useSetPageTitle(cp?.name);
  const perms = useSupplierPermissions(cp);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [tab, setTab] = useState("overview");

  if (!detail || !cp) return <PageSkeleton />;

  const address = [cp.address, [cp.city, cp.state, cp.postalCode].filter(Boolean).join(", "), cp.country]
    .filter((x) => x && x.trim() !== "")
    .join("\n");

  return (
    <>
      <PageHeader
        back={{ href: "/suppliers", label: "Suppliers" }}
        title={cp.name}
        meta={
          <>
            <StatusBadge value={cp.status} map={ACTIVE_STATUS} />
            {cp.archived && <TonePill tone="muted">Archived</TonePill>}
          </>
        }
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-mono text-xs">{cp.code}</span>
            <span>{TYPE_LABEL[cp.type]}</span>
            {cp.country && <span>{cp.country}</span>}
            <span>{cp.roles.map((r) => ROLE_LABEL[r]).join(" · ")}</span>
          </span>
        }
        actions={
          <>
            {perms.canBookTrade && !cp.archived && cp.status === "active" && (
              <Button asChild size="sm">
                <Link href={`/physical-trades/new?counterpartyId=${cp._id}`}>
                  <Plus /> Book Trade
                </Link>
              </Button>
            )}
            {perms.canEdit && (
              <Button asChild variant="outline" size="sm">
                <Link href={`/suppliers/${cp._id}/edit`}>
                  <Pencil /> Edit
                </Link>
              </Button>
            )}
            {perms.canClone && (
              <Button asChild variant="outline" size="sm">
                <Link href={`/suppliers/new?cloneFrom=${cp._id}`}>
                  <Copy /> Clone
                </Link>
              </Button>
            )}
            {perms.canToggleStatus && (
              <Button variant="outline" size="sm" onClick={() => setStatusOpen(true)}>
                <Power /> {cp.status === "active" ? "Deactivate" : "Activate"}
              </Button>
            )}
            {perms.canArchive && (
              <Button variant={cp.archived ? "outline" : "destructive"} size="sm" onClick={() => setArchiveOpen(true)}>
                {cp.archived ? <ArchiveRestore /> : <Archive />} {cp.archived ? "Restore" : "Archive"}
              </Button>
            )}
          </>
        }
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="trades">Trades</TabsTrigger>
          <TabsTrigger value="contracts">Contracts</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-2">
            <Section title="Contact information">
              <DetailList
                columns={2}
                items={[
                  { label: "Primary contact", value: cp.contactPerson },
                  {
                    label: "Email",
                    value: cp.email ? (
                      <a href={`mailto:${cp.email}`} className="text-primary hover:underline">
                        {cp.email}
                      </a>
                    ) : undefined,
                  },
                  { label: "Phone", value: cp.phone },
                  {
                    label: "Website",
                    value: cp.website ? (
                      <a
                        href={/^https?:\/\//.test(cp.website) ? cp.website : `https://${cp.website}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
                      >
                        {cp.website}
                      </a>
                    ) : undefined,
                  },
                  { label: "Registered address", value: address, span: 2 },
                  { label: "Tax ID", value: cp.taxId, mono: true },
                  { label: "Registration number", value: cp.registrationNumber, mono: true },
                ]}
              />
            </Section>
            <Section
              title="Default commercial terms"
              description="Suggested on new trades. Changing them never alters existing trades."
            >
              <DetailList
                columns={2}
                items={[
                  { label: "Currency", value: cp.defaultCurrency },
                  { label: "Payment term", value: cp.defaultPaymentTerm },
                  { label: "Incoterm", value: cp.defaultIncoterm },
                  { label: "Pricing term", value: cp.defaultPricingTerm },
                  { label: "Origin of goods", value: cp.defaultOrigin },
                  { label: "Manufacturer / factory", value: cp.defaultManufacturer },
                  { label: "Loading location", value: cp.defaultLoadingLocation },
                  { label: "Discharge location", value: cp.defaultDischargeLocation },
                  { label: "Freight terms", value: cp.defaultFreightTerms },
                  { label: "Shipment preferences", value: cp.shipmentPreferences, span: 2 },
                ]}
              />
            </Section>
            <Section title="Bank details">
              <DetailList
                columns={2}
                items={[
                  { label: "Bank name", value: cp.bankName },
                  { label: "Beneficiary", value: cp.beneficiaryName },
                  { label: "Account / IBAN", value: cp.accountNumber, mono: true },
                  { label: "SWIFT / BIC", value: cp.swift, mono: true },
                  { label: "Bank address", value: cp.bankAddress, span: 2 },
                  { label: "Other instructions", value: cp.bankInstructions, span: 2 },
                ]}
              />
            </Section>
            <Section title="Internal" description="Not shown on external documents.">
              <DetailList
                columns={2}
                items={[
                  { label: "Assigned to", value: detail.assignedToName ?? "Unassigned" },
                  { label: "Created by", value: detail.createdByName },
                  { label: "Created", value: formatDateTime(cp._creationTime) },
                  { label: "Last updated", value: `${formatDateTime(cp.updatedAt)}${detail.updatedByName ? ` · ${detail.updatedByName}` : ""}` },
                  { label: "Internal notes", value: cp.notes, span: 2 },
                ]}
              />
            </Section>
          </div>
        </TabsContent>

        <TabsContent value="trades">{tab === "trades" && <RelatedTrades id={cp._id} canBook={perms.canBookTrade && !cp.archived} />}</TabsContent>
        <TabsContent value="contracts">{tab === "contracts" && <RelatedContracts id={cp._id} />}</TabsContent>
        <TabsContent value="documents">
          {tab === "documents" && (
            <Section title="Documents" description="Agreements, certificates, bank letters and other files for this company.">
              <DocumentList filter={{ counterpartyId: cp._id }} />
            </Section>
          )}
        </TabsContent>
        <TabsContent value="activity">
          {tab === "activity" && (
            <Section title="Activity history">
              <ActivityTimeline entityType="counterparty" entityId={cp._id} />
            </Section>
          )}
        </TabsContent>
      </Tabs>

      <ArchiveSupplierDialog cp={cp} open={archiveOpen} onOpenChange={setArchiveOpen} />
      <StatusToggleDialog cp={cp} open={statusOpen} onOpenChange={setStatusOpen} />
    </>
  );
}

function RelatedTrades({ id, canBook }: { id: Id<"counterparties">; canBook: boolean }) {
  const trades = useQuery(api.counterparties.relatedTrades, { id });
  return (
    <div className="overflow-hidden rounded-lg border bg-card shadow-xs">
      {trades === undefined ? (
        <TableSkeleton rows={4} columns={7} />
      ) : trades.length === 0 ? (
        <EmptyState
          icon={ArrowLeftRight}
          title="No trades with this company yet"
          description="Book a trade and this supplier's saved defaults will be filled in for you."
          action={
            canBook ? (
              <Button asChild size="sm">
                <Link href={`/physical-trades/new?counterpartyId=${id}`}>
                  <Plus /> Book Trade
                </Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/60">
              <TableRow>
                <TableHead>Trade No.</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Direction</TableHead>
                <TableHead>Commodity</TableHead>
                <TableHead className="text-right">Quantity</TableHead>
                <TableHead className="text-right">Value</TableHead>
                <TableHead>Incoterm</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {trades.map((t) => (
                <TableRow key={t._id}>
                  <TableCell>
                    <Link href={`/physical-trades/${t._id}`} className="font-mono text-[13px] font-medium text-primary hover:underline">
                      {t.tradeNumber}
                    </Link>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{formatDate(t.tradeDate)}</TableCell>
                  <TableCell>{t.direction ? DIRECTION_LABEL[t.direction] : "—"}</TableCell>
                  <TableCell className="max-w-64 truncate">
                    {t.commodityName ?? "—"}
                    {t.commodityCode && <span className="text-muted-foreground"> ({t.commodityCode})</span>}
                  </TableCell>
                  <TableCell className="num whitespace-nowrap">{formatQuantity(t.quantity, t.uom)}</TableCell>
                  <TableCell className="num whitespace-nowrap">{formatMoney(t.totalValue, t.currency)}</TableCell>
                  <TableCell>{t.incoterm ?? "—"}</TableCell>
                  <TableCell>
                    <StatusBadge value={t.status} map={TRADE_STATUS} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function RelatedContracts({ id }: { id: Id<"counterparties"> }) {
  const contracts = useQuery(api.counterparties.relatedContracts, { id });
  return (
    <div className="overflow-hidden rounded-lg border bg-card shadow-xs">
      {contracts === undefined ? (
        <TableSkeleton rows={4} columns={6} />
      ) : contracts.length === 0 ? (
        <EmptyState
          icon={FileSignature}
          title="No contracts yet"
          description="Contracts are generated from this company's trades on the trade's Contract tab."
        />
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/60">
              <TableRow>
                <TableHead>Contract No.</TableHead>
                <TableHead>Trade</TableHead>
                <TableHead>Product</TableHead>
                <TableHead className="text-right">Value</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {contracts.map((c) => (
                <TableRow key={c._id}>
                  <TableCell>
                    <Link href={`/contracts/${c._id}`} className="font-mono text-[13px] font-medium text-primary hover:underline">
                      {c.contractNumber}
                    </Link>
                    {c.version > 1 && <span className="ml-1 text-xs text-muted-foreground">v{c.version}</span>}
                  </TableCell>
                  <TableCell>
                    <Link href={`/physical-trades/${c.tradeId}`} className="font-mono text-[13px] hover:underline">
                      {c.tradeNumber}
                    </Link>
                  </TableCell>
                  <TableCell className="max-w-64 truncate">{c.commodityName ?? "—"}</TableCell>
                  <TableCell className="num whitespace-nowrap">{formatMoney(c.totalValue, c.currency)}</TableCell>
                  <TableCell>
                    <StatusBadge value={c.status} map={CONTRACT_STATUS} />
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">{formatDateTime(c.updatedAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
