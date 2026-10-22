"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { useState } from "react";
import {
  BookOpen,
  CheckCircle2,
  ChevronDown,
  Copy,
  FilePlus2,
  MoreHorizontal,
  PauseCircle,
  PencilLine,
  ScrollText,
  Star,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Section } from "@/components/shared/section";
import { StatusBadge, TonePill } from "@/components/shared/status-badge";
import { TableSkeleton } from "@/components/shared/states";
import { TableCard } from "@/components/shared/table-parts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useViewer } from "@/hooks/use-viewer";
import { formatRelative } from "@/lib/format";
import { TEMPLATE_STATUS } from "@/lib/status";
import { useTemplateActions } from "./template-actions";
import { VariableReferenceTable } from "./variable-reference";

const DIRECTION = { any: "Purchase & Sales", purchase: "Purchase", sales: "Sales" } as const;

export function TemplateList() {
  const { can } = useViewer();
  const [includeInactive, setIncludeInactive] = useState(false);
  const templates = useQuery(api.contractTemplates.list, { includeInactive });
  const actions = useTemplateActions();
  const manage = can("contractTemplate.manage");

  return (
    <>
      <PageHeader
        title="Contract Templates"
        description="Reusable, versioned contract wording. Contracts are rendered from trade data through these templates."
        actions={
          manage && (
            <Button asChild>
              <Link href="/contract-templates/new">
                <FilePlus2 /> New Template
              </Link>
            </Button>
          )
        }
      />
      <Alert className="mb-4">
        <BookOpen />
        <AlertDescription>
          Template wording is configured by your business — it must be reviewed by your commercial and legal team. Generated
          documents do not by themselves guarantee legal compliance.
        </AlertDescription>
      </Alert>

      <TableCard
        toolbar={
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <Switch checked={includeInactive} onCheckedChange={setIncludeInactive} />
            Show inactive templates
          </label>
        }
      >
        {templates === undefined ? (
          <TableSkeleton columns={7} />
        ) : templates.length === 0 ? (
          <EmptyState
            icon={ScrollText}
            title="No contract templates yet"
            description="Create a template with numbered clauses and {{variables}}; activate it to use it on trades."
            action={
              manage && (
                <Button asChild>
                  <Link href="/contract-templates/new">
                    <FilePlus2 /> Create the first template
                  </Link>
                </Button>
              )
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Version</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Default</TableHead>
                <TableHead>Direction</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {templates.map((t) => {
                const activeId = t.status === "active" ? t._id : t.activeVersion?._id;
                return (
                  <TableRow key={t._id}>
                    <TableCell className="font-medium">
                      <Link href={`/contract-templates/${t._id}`} className="hover:underline">
                        {t.name}
                      </Link>
                      {t.description && <div className="max-w-72 truncate text-xs text-muted-foreground">{t.description}</div>}
                    </TableCell>
                    <TableCell className="tabular">
                      v{t.version}
                      {t.activeVersion && (
                        <div className="text-xs text-muted-foreground">
                          v{t.activeVersion.version} active · v{t.version} {t.status}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1">
                        <StatusBadge value={t.status} map={TEMPLATE_STATUS} />
                        {t.unknownVariables.length > 0 && <TonePill tone="danger">{t.unknownVariables.length} unknown var.</TonePill>}
                      </div>
                    </TableCell>
                    <TableCell>{t.isDefault ? <TonePill tone="brand"><Star className="size-3" /> Default</TonePill> : "—"}</TableCell>
                    <TableCell>{DIRECTION[t.direction]}</TableCell>
                    <TableCell>{t.companyName ?? "Any company"}</TableCell>
                    <TableCell className="text-muted-foreground">{formatRelative(t.updatedAt)}</TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="icon-sm" variant="ghost" aria-label={`Actions for ${t.name}`}>
                            <MoreHorizontal />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <Link href={`/contract-templates/${t._id}`}>
                              <PencilLine /> {manage && t.status === "draft" ? "Edit draft" : "Open"}
                            </Link>
                          </DropdownMenuItem>
                          {manage && (
                            <>
                              {t.status !== "draft" && (
                                <DropdownMenuItem onSelect={() => actions.newVersion(t._id)}>
                                  <FilePlus2 /> New Version
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem onSelect={() => actions.clone(t._id)}>
                                <Copy /> Clone
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              {t.status !== "active" && (
                                <DropdownMenuItem onSelect={() => actions.activate(t._id)}>
                                  <CheckCircle2 /> Activate v{t.version}
                                </DropdownMenuItem>
                              )}
                              {t.status === "active" && (
                                <DropdownMenuItem onSelect={() => actions.deactivate(t._id)}>
                                  <PauseCircle /> Deactivate
                                </DropdownMenuItem>
                              )}
                              {activeId && !t.isDefault && (
                                <DropdownMenuItem onSelect={() => actions.makeDefault(activeId)}>
                                  <Star /> Set as Default
                                </DropdownMenuItem>
                              )}
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </TableCard>

      <Collapsible className="mt-4">
        <Section
          title="Template variable reference"
          description="Use these placeholders in titles, clauses, header and footer. Unknown variables are flagged and block activation."
          actions={
            <CollapsibleTrigger asChild>
              <Button size="sm" variant="ghost">
                Show / hide <ChevronDown />
              </Button>
            </CollapsibleTrigger>
          }
          contentClassName="p-0"
        >
          <CollapsibleContent>
            <VariableReferenceTable />
          </CollapsibleContent>
        </Section>
      </Collapsible>
    </>
  );
}
