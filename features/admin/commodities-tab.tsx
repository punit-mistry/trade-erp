"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "convex/react";
import { Loader2, Package, Pencil, Plus, Power } from "lucide-react";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { EmptyState } from "@/components/shared/empty-state";
import { FormField } from "@/components/shared/form-field";
import { LookupCombobox } from "@/components/shared/lookup-combobox";
import { TableSkeleton } from "@/components/shared/states";
import { StatusBadge } from "@/components/shared/status-badge";
import { SearchInput, TableCard } from "@/components/shared/table-parts";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useDebouncedValue } from "@/hooks/use-debounce";
import { useViewer } from "@/hooks/use-viewer";
import { getErrorMessage } from "@/lib/errors";
import { ACTIVE_STATUS } from "@/lib/status";

const schema = z.object({
  name: z.string().trim().min(2, "Commodity name is required."),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9_-]{2,20}$/, "2–20 characters: A–Z, 0–9, _ or -."),
  hsCode: z.string().trim().max(20).optional(),
  defaultUom: z.string().optional(),
  grade: z.string().trim().max(120).optional(),
  description: z.string().trim().max(1000).optional(),
});
type FormValues = z.input<typeof schema>;

export function CommoditiesTab() {
  const { can } = useViewer();
  const canManage = can("commodity.manage");
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(true);
  const debounced = useDebouncedValue(search);
  const rows = useQuery(api.commodities.list, { search: debounced || undefined, includeInactive: showInactive });
  const setActive = useMutation(api.commodities.setActive);
  const [editing, setEditing] = useState<Doc<"commodities"> | "new" | null>(null);

  return (
    <>
      <TableCard
        toolbar={
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              <SearchInput value={search} onChange={setSearch} placeholder="Search name, code, HS code…" />
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <Switch checked={showInactive} onCheckedChange={setShowInactive} aria-label="Show inactive" />
                Show inactive
              </label>
            </div>
            {canManage && (
              <Button size="sm" onClick={() => setEditing("new")}>
                <Plus /> Add Commodity
              </Button>
            )}
          </div>
        }
      >
        {rows === undefined ? (
          <TableSkeleton rows={5} columns={6} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Package}
            title={debounced ? "No commodities match your search" : "No commodities yet"}
            description={debounced ? "Try a different name or code." : "Add the products you trade so they can be selected on trades."}
            action={
              canManage && !debounced ? (
                <Button size="sm" onClick={() => setEditing("new")}>
                  <Plus /> Add Commodity
                </Button>
              ) : undefined
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>HS code</TableHead>
                <TableHead>Default UOM</TableHead>
                <TableHead>Grade</TableHead>
                <TableHead>Status</TableHead>
                {canManage && <TableHead className="w-24 text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((c) => (
                <TableRow key={c._id}>
                  <TableCell className="font-mono text-xs">{c.code}</TableCell>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell>{c.hsCode || "—"}</TableCell>
                  <TableCell>{c.defaultUom || "—"}</TableCell>
                  <TableCell>{c.grade || "—"}</TableCell>
                  <TableCell>
                    <StatusBadge value={c.active ? "active" : "inactive"} map={ACTIVE_STATUS} />
                  </TableCell>
                  {canManage && (
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon-sm" onClick={() => setEditing(c)} aria-label={`Edit ${c.name}`}>
                        <Pencil />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={c.active ? `Deactivate ${c.name}` : `Activate ${c.name}`}
                        title={c.active ? "Deactivate" : "Activate"}
                        onClick={async () => {
                          try {
                            await setActive({ id: c._id, active: !c.active });
                            toast.success(c.active ? "Commodity deactivated — it no longer appears on new trades" : "Commodity activated");
                          } catch (e) {
                            toast.error(getErrorMessage(e));
                          }
                        }}
                      >
                        <Power />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </TableCard>
      {editing && <CommodityDialog commodity={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function CommodityDialog({ commodity, onClose }: { commodity?: Doc<"commodities">; onClose: () => void }) {
  const create = useMutation(api.commodities.create);
  const update = useMutation(api.commodities.update);
  const { register, handleSubmit, control, formState } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: commodity?.name ?? "",
      code: commodity?.code ?? "",
      hsCode: commodity?.hsCode ?? "",
      defaultUom: commodity?.defaultUom ?? "",
      grade: commodity?.grade ?? "",
      description: commodity?.description ?? "",
    },
  });
  const errors = formState.errors;

  const onSubmit = handleSubmit(async (values) => {
    const v = schema.parse(values);
    const blank = (s?: string) => (s && s.trim() !== "" ? s : undefined);
    const payload = {
      name: v.name,
      code: v.code,
      hsCode: blank(v.hsCode),
      defaultUom: blank(v.defaultUom),
      grade: blank(v.grade),
      description: blank(v.description),
    };
    try {
      if (commodity) await update({ id: commodity._id, ...payload });
      else await create(payload);
      toast.success(commodity ? "Commodity updated" : "Commodity created");
      onClose();
    } catch (e) {
      toast.error(getErrorMessage(e));
    }
  });

  return (
    <Dialog open onOpenChange={(o) => !o && !formState.isSubmitting && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{commodity ? `Edit ${commodity.code}` : "Add commodity"}</DialogTitle>
          <DialogDescription>
            {commodity
              ? "Renaming updates the labels shown on existing trades; their commercial data is unchanged."
              : "Commodities appear in the trade booking selector."}
          </DialogDescription>
        </DialogHeader>
        <form id="commodity-form" onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
          <FormField label="Name" htmlFor="cm-name" required error={errors.name?.message} className="sm:col-span-2">
            <Input id="cm-name" aria-invalid={!!errors.name} {...register("name")} />
          </FormField>
          <FormField label="Code" htmlFor="cm-code" required error={errors.code?.message} help="e.g. TSR10, RCN">
            <Input id="cm-code" className="font-mono uppercase" aria-invalid={!!errors.code} {...register("code")} />
          </FormField>
          <FormField label="HS code" htmlFor="cm-hs" error={errors.hsCode?.message} tip="Harmonized System tariff code used on customs and shipping documents.">
            <Input id="cm-hs" {...register("hsCode")} />
          </FormField>
          <FormField label="Default unit" htmlFor="cm-uom" help="Pre-filled on new trades.">
            <Controller
              control={control}
              name="defaultUom"
              render={({ field }) => (
                <LookupCombobox id="cm-uom" kind="uom" value={field.value || undefined} onChange={(v) => field.onChange(v ?? "")} />
              )}
            />
          </FormField>
          <FormField label="Grade / specification" htmlFor="cm-grade">
            <Input id="cm-grade" {...register("grade")} />
          </FormField>
          <FormField label="Description" htmlFor="cm-desc" className="sm:col-span-2">
            <Textarea id="cm-desc" rows={3} {...register("description")} />
          </FormField>
        </form>
        <DialogFooter>
          <Button variant="outline" type="button" onClick={onClose} disabled={formState.isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" form="commodity-form" disabled={formState.isSubmitting}>
            {formState.isSubmitting && <Loader2 className="animate-spin" />}
            {commodity ? "Save changes" : "Create commodity"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
