"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { ArrowLeftRight } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { PageHeader } from "@/components/shared/page-header";
import { DetailList, Section } from "@/components/shared/section";
import { PageSkeleton } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { ActivityTimeline } from "@/features/activity/activity-timeline";
import { formatDateTime, formatMoney } from "@/lib/format";
import { DIRECTION_LABEL } from "@/lib/status";
import { toDocData } from "./contract-document";
import { ContractVersions } from "./contract-versions";
import { ContractWorkspace } from "./trade-contract-tab";
import { useSetPageTitle } from "@/components/layout/page-title";

export function ContractDetail({ id }: { id: Id<"contracts"> }) {
  const data = useQuery(api.contracts.get, { id });
  const family = useQuery(api.contracts.listForTrade, data?.contract ? { tradeId: data.contract.tradeId } : "skip");
  useSetPageTitle(data?.contract.contractNumber);

  if (data === undefined) return <PageSkeleton />;
  const { contract } = data;
  const versionRow = family?.versions.find((v) => v._id === contract._id);

  return (
    <div className="space-y-6">
      <PageHeader
        back={{ href: "/contracts", label: "Contracts" }}
        title={`${contract.contractNumber}`}
        description={
          <>
            Version {contract.version}
            {!contract.isCurrent && contract.status !== "draft" && " · not the version in force"}
            {!contract.isCurrent && contract.status === "draft" && contract.revisionOf && " · pending revision"}
            {" · generated from trade data; issued versions are immutable."}
          </>
        }
        actions={
          data.trade && (
            <Button variant="outline" asChild>
              <Link href={`/physical-trades/${data.trade._id}?tab=contract`}>
                <ArrowLeftRight /> Trade {data.trade.tradeNumber}
              </Link>
            </Button>
          )
        }
      />

      <ContractWorkspace
        contract={{ ...contract, pdfUrl: data.pdfUrl, issuedByName: data.issuedByName }}
        data={toDocData(contract)}
        tradeStatus={data.trade?.status}
        stale={data.stale}
        hasPendingRevision={Boolean(family?.pendingRevision)}
        templateName={data.template?.name ?? versionRow?.templateName}
        showDetailLink={false}
      />

      <div className="grid gap-4 xl:grid-cols-[2fr_1fr]">
        <Section title="Version history">
          {family ? <ContractVersions versions={family.versions} /> : <PageSkeleton />}
        </Section>
        <Section title="Details">
          <DetailList
            columns={2}
            items={[
              { label: "Direction", value: contract.direction ? DIRECTION_LABEL[contract.direction as "purchase" | "sales"] : undefined },
              { label: "Value", value: formatMoney(contract.totalValue, contract.currency) },
              { label: "Counterparty", value: contract.counterpartyName },
              { label: "Product", value: contract.commodityName },
              { label: "Created", value: `${formatDateTime(contract._creationTime)}${data.createdByName ? ` · ${data.createdByName}` : ""}` },
              { label: "Last updated", value: `${formatDateTime(contract.updatedAt)}${data.updatedByName ? ` · ${data.updatedByName}` : ""}` },
              { label: "Revision approved", value: contract.revisionApprovedAt ? `${formatDateTime(contract.revisionApprovedAt)} · ${data.revisionApprovedByName ?? ""}` : undefined },
              { label: "Signed copy", value: data.signedDocument?.fileName },
              { label: "Revision reason", value: contract.revisionReason, span: 2 },
            ]}
          />
        </Section>
      </div>

      <Section title="Activity history">
        <ActivityTimeline entityType="contract" entityId={contract._id} />
      </Section>
    </div>
  );
}
