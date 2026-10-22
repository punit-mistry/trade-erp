"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import {
  AlertOctagon,
  ArrowDown,
  ArrowUp,
  CalendarClock,
  ListChecks,
  Loader2,
  MessageSquare,
  Paperclip,
  Plus,
  Trash2,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { DispatchItemStatus } from "@/convex/lib/validators";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { Combobox } from "@/components/shared/combobox";
import { StatusBadge } from "@/components/shared/status-badge";
import { TableSkeleton } from "@/components/shared/states";
import { useViewer } from "@/hooks/use-viewer";
import { getErrorMessage } from "@/lib/errors";
import { formatDate, formatDateTime } from "@/lib/format";
import { DISPATCH_ITEM_STATUS } from "@/lib/status";
import { cn } from "@/lib/utils";
import { DownloadButton } from "@/features/documents/document-actions";
import { UploadDocumentDialog } from "@/features/documents/upload-document-dialog";

type ChecklistData = NonNullable<ReturnType<typeof useChecklist>>;
type Item = ChecklistData["items"][number];

function useChecklist(tradeId: Id<"trades">) {
  return useQuery(api.dispatch.forTrade, { tradeId });
}

const STATUSES = Object.keys(DISPATCH_ITEM_STATUS) as DispatchItemStatus[];

function ItemRow({
  item,
  index,
  count,
  configurable,
  onMove,
}: {
  item: Item;
  index: number;
  count: number;
  configurable: boolean;
  onMove: (from: number, to: number) => void;
}) {
  const { can, viewer } = useViewer();
  const updateItem = useMutation(api.dispatch.updateItem);
  const removeItem = useMutation(api.dispatch.removeItem);
  const users = useQuery(api.users.directory);
  const [blockOpen, setBlockOpen] = useState(false);
  const [commentOpen, setCommentOpen] = useState(false);
  const [comment, setComment] = useState(item.comment ?? "");
  const [busy, setBusy] = useState(false);
  const isManager = can("dispatch.configure");
  const editable = item.canEdit && can("dispatch.update");

  async function run(args: Omit<Parameters<typeof updateItem>[0], "itemId">, success?: string) {
    setBusy(true);
    try {
      await updateItem({ itemId: item._id, ...args });
      if (success) toast.success(success);
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const assigneeOptions = (users ?? [])
    .filter((u) => isManager || u._id === viewer?._id)
    .map((u) => ({ value: u._id, label: u.name }));

  return (
    <li className={cn("grid gap-2 px-4 py-3 md:grid-cols-[minmax(0,1.6fr)_150px_170px_150px_auto] md:items-center", item.status === "blocked" && "bg-destructive/5")}>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="w-5 shrink-0 text-xs text-muted-foreground tabular">{index + 1}.</span>
          <span className={cn("font-medium", item.status === "complete" && "text-muted-foreground line-through decoration-muted-foreground/40")}>
            {item.label}
          </span>
          {item.overdue && (
            <span className="inline-flex items-center gap-1 rounded bg-destructive/10 px-1.5 text-[10px] font-medium text-destructive">
              <CalendarClock className="size-3" /> Overdue
            </span>
          )}
        </div>
        <div className="mt-0.5 ml-7 space-y-0.5 text-xs text-muted-foreground">
          {item.status === "blocked" && item.blockedReason && (
            <div className="flex items-center gap-1 text-destructive">
              <AlertOctagon className="size-3" /> {item.blockedReason}
            </div>
          )}
          {item.comment && <div className="flex items-center gap-1"><MessageSquare className="size-3" /> {item.comment}</div>}
          {item.status === "complete" && item.completedAt && (
            <div>Completed {formatDateTime(item.completedAt)}{item.completedByName ? ` by ${item.completedByName}` : ""}</div>
          )}
          {item.documents.length > 0 && (
            <div className="flex flex-wrap items-center gap-1">
              <Paperclip className="size-3" />
              {item.documents.map((d) => (
                <DownloadButton key={d._id} id={d._id} label={d.fileName} />
              ))}
            </div>
          )}
        </div>
      </div>

      <Select
        value={item.status}
        disabled={!editable || busy}
        onValueChange={(v) => {
          const next = v as DispatchItemStatus;
          if (next === "blocked") setBlockOpen(true);
          else run({ status: next }, next === "complete" ? `“${item.label}” completed` : undefined);
        }}
      >
        <SelectTrigger className="h-8 w-full" aria-label={`Status of ${item.label}`}>
          <SelectValue>
            <StatusBadge value={item.status} map={DISPATCH_ITEM_STATUS} />
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {STATUSES.map((s) => (
            <SelectItem key={s} value={s}>
              {DISPATCH_ITEM_STATUS[s].label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Combobox
        options={assigneeOptions}
        value={item.assignedTo}
        selectedLabel={item.assigneeName ?? undefined}
        onChange={(v) => run({ assignedTo: (v as Id<"users"> | undefined) ?? null })}
        placeholder="Unassigned"
        searchPlaceholder="Search people…"
        disabled={!editable || busy}
        loading={users === undefined}
      />

      <Input
        type="date"
        aria-label={`Due date for ${item.label}`}
        className={cn("h-8", item.overdue && "border-destructive/50 text-destructive")}
        disabled={!editable || busy}
        defaultValue={item.dueDate ?? ""}
        key={item.dueDate ?? "none"}
        onBlur={(e) => {
          const val = e.target.value || null;
          if (val !== (item.dueDate ?? null)) run({ dueDate: val });
        }}
      />

      <div className="flex items-center justify-end gap-0.5">
        {editable && (
          <Popover open={commentOpen} onOpenChange={(o) => { setCommentOpen(o); if (o) setComment(item.comment ?? ""); }}>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Comment" title="Comment">
                <MessageSquare />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 space-y-2" align="end">
              <Textarea rows={3} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Add a note for the team" />
              <div className="flex justify-end">
                <Button
                  size="sm"
                  onClick={async () => {
                    await run({ comment }, "Comment saved");
                    setCommentOpen(false);
                  }}
                  disabled={busy}
                >
                  Save
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        )}
        {editable && can("document.upload") && (
          <UploadDocumentDialog
            defaults={{ tradeId: item.tradeId, dispatchItemId: item._id }}
            title={`Attach document — ${item.label}`}
            trigger={
              <Button variant="ghost" size="icon-sm" aria-label="Attach document" title="Attach document">
                <Paperclip />
              </Button>
            }
          />
        )}
        {configurable && (
          <>
            <Button variant="ghost" size="icon-sm" aria-label="Move up" disabled={index === 0} onClick={() => onMove(index, index - 1)}>
              <ArrowUp />
            </Button>
            <Button variant="ghost" size="icon-sm" aria-label="Move down" disabled={index === count - 1} onClick={() => onMove(index, index + 1)}>
              <ArrowDown />
            </Button>
            <ConfirmDialog
              trigger={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Remove item"
                  disabled={item.status === "complete" || item.documentIds.length > 0}
                  title={item.status === "complete" || item.documentIds.length > 0 ? "Completed items or items with documents can't be removed" : "Remove item"}
                >
                  <Trash2 />
                </Button>
              }
              title="Remove checklist item?"
              description={`“${item.label}” will be removed from this trade’s checklist.`}
              confirmLabel="Remove"
              destructive
              successMessage="Item removed"
              onConfirm={() => removeItem({ itemId: item._id })}
            />
          </>
        )}
      </div>

      <ConfirmDialog
        open={blockOpen}
        onOpenChange={setBlockOpen}
        title={`Mark “${item.label}” as blocked`}
        description="Blocked items are flagged on the dashboard and dispatch board until resolved."
        reason={{ label: "What is blocking this?", required: true, placeholder: "e.g. Waiting for phytosanitary certificate" }}
        confirmLabel="Mark Blocked"
        destructive
        onConfirm={(reason) => updateItem({ itemId: item._id, status: "blocked", blockedReason: reason })}
      />
    </li>
  );
}

/** Dispatch checklist for one trade with real progress, blockers and next step. */
export function DispatchChecklist({ tradeId }: { tradeId: Id<"trades"> }) {
  const data = useChecklist(tradeId);
  const { can } = useViewer();
  const ensure = useMutation(api.dispatch.ensureForTrade);
  const addItem = useMutation(api.dispatch.addItem);
  const reorder = useMutation(api.dispatch.reorder);
  const [creating, setCreating] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [adding, setAdding] = useState(false);
  const configurable = can("dispatch.configure");

  if (data === undefined) {
    return (
      <div className="rounded-lg border bg-card shadow-xs">
        <TableSkeleton rows={4} columns={4} />
      </div>
    );
  }

  if (data === null) {
    return (
      <div className="rounded-lg border bg-card shadow-xs">
        <EmptyState
          icon={ListChecks}
          title="No dispatch checklist yet"
          description="Start the checklist to track invoices, packing lists, B/L review, customs and dispatch approval for this shipment."
          action={
            can("dispatch.update") ? (
              <Button
                variant="outline"
                disabled={creating}
                onClick={async () => {
                  setCreating(true);
                  try {
                    await ensure({ tradeId });
                    toast.success("Dispatch checklist created");
                  } catch (e) {
                    toast.error(getErrorMessage(e));
                  } finally {
                    setCreating(false);
                  }
                }}
              >
                {creating ? <Loader2 className="animate-spin" /> : <ListChecks />} Start Dispatch Checklist
              </Button>
            ) : undefined
          }
        />
      </div>
    );
  }

  const { progress, nextStep, items, checklist } = data;

  async function move(from: number, to: number) {
    const ids = items.map((i) => i._id);
    const [moved] = ids.splice(from, 1);
    ids.splice(to, 0, moved);
    try {
      await reorder({ checklistId: checklist._id, itemIds: ids });
    } catch (e) {
      toast.error(getErrorMessage(e));
    }
  }

  return (
    <section className="rounded-lg border bg-card shadow-xs">
      <div className="space-y-3 border-b px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold">Dispatch checklist</h3>
            {checklist.status === "completed" && (
              <span className="rounded bg-success/10 px-1.5 text-[11px] font-medium text-success">Completed</span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground tabular">
            <span>
              {progress.complete}/{progress.total} complete
            </span>
            {progress.blocked > 0 && <span className="font-medium text-destructive">{progress.blocked} blocked</span>}
            {progress.overdue > 0 && <span className="font-medium text-destructive">{progress.overdue} overdue</span>}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Progress value={progress.percent} className="h-1.5" aria-label="Checklist completion" />
          <span className="w-10 text-right text-sm font-semibold tabular">{progress.percent}%</span>
        </div>
        {nextStep && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-accent/50 px-3 py-2 text-sm">
            <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {nextStep.status === "blocked" ? "Blocked" : "Next step"}
            </span>
            <span className="font-medium">{nextStep.label}</span>
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <UserRound className="size-3" /> {nextStep.responsible ?? "Unassigned"}
            </span>
            {nextStep.dueDate && <span className="text-xs text-muted-foreground">Due {formatDate(nextStep.dueDate)}</span>}
          </div>
        )}
      </div>
      <div className="hidden grid-cols-[minmax(0,1.6fr)_150px_170px_150px_auto] gap-2 border-b bg-muted/50 px-4 py-1.5 text-xs font-medium text-muted-foreground md:grid">
        <span>Item</span>
        <span>Status</span>
        <span>Assigned to</span>
        <span>Due date</span>
        <span className="sr-only">Actions</span>
      </div>
      <ul className="divide-y">
        {items.map((item, i) => (
          <ItemRow key={item._id} item={item} index={i} count={items.length} configurable={configurable} onMove={move} />
        ))}
      </ul>
      {configurable && (
        <form
          className="flex items-center gap-2 border-t px-4 py-2.5"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!newLabel.trim() || adding) return;
            setAdding(true);
            try {
              await addItem({ checklistId: checklist._id, label: newLabel });
              setNewLabel("");
            } catch (err) {
              toast.error(getErrorMessage(err));
            } finally {
              setAdding(false);
            }
          }}
        >
          <Input
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="Add a checklist item for this shipment…"
            className="h-8"
            maxLength={160}
          />
          <Button type="submit" size="sm" variant="outline" disabled={!newLabel.trim() || adding}>
            {adding ? <Loader2 className="animate-spin" /> : <Plus />} Add
          </Button>
        </form>
      )}
    </section>
  );
}
