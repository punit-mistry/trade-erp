"use client";

import { useMutation } from "convex/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { TradeFields } from "@/convex/lib/validators";
import { getErrorMessage } from "@/lib/errors";
import { fieldsFingerprint, hasMeaningfulContent } from "./form";

export type SaveStatus = "idle" | "pending" | "saving" | "saved" | "error";

function newRequestId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Draft persistence for the Book Trade wizard.
 *  - First save creates the draft (idempotent `clientRequestId`, so a retried
 *    or double-clicked save never creates two trades), later saves patch it.
 *  - Saves are serialised; edits during a save trigger one follow-up save.
 *  - `schedule()` debounces autosave, `flush()` saves immediately and resolves
 *    with the trade id (used by explicit actions).
 */
export function useTradeAutosave({
  initialTradeId,
  initialFields,
  cloneFromId,
  templateId,
  getFields,
  onCreated,
  delay = 1200,
}: {
  initialTradeId?: Id<"trades">;
  initialFields: TradeFields;
  cloneFromId?: Id<"trades">;
  templateId?: Id<"tradeTemplates">;
  getFields: () => TradeFields;
  onCreated?: (id: Id<"trades">, tradeNumber: string) => void;
  delay?: number;
}) {
  const createDraft = useMutation(api.trades.createDraft);
  const saveDraft = useMutation(api.trades.saveDraft);

  const [tradeId, setTradeId] = useState<Id<"trades"> | undefined>(initialTradeId);
  const [tradeNumber, setTradeNumber] = useState<string | undefined>();
  const [status, setStatus] = useState<SaveStatus>(initialTradeId ? "saved" : "idle");
  const [error, setError] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);

  const tradeIdRef = useRef(initialTradeId);
  const requestIdRef = useRef(newRequestId());
  const savedFingerprint = useRef(initialTradeId ? fieldsFingerprint(initialFields) : null);
  const inFlight = useRef<Promise<Id<"trades">> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const getFieldsRef = useRef(getFields);
  const onCreatedRef = useRef(onCreated);
  useEffect(() => {
    getFieldsRef.current = getFields;
    onCreatedRef.current = onCreated;
  }, [getFields, onCreated]);

  const runSave = useCallback(async (): Promise<Id<"trades">> => {
    // Loops so that edits made while a save was in flight get a follow-up save.
    for (;;) {
      const fields = getFieldsRef.current();
      const fp = fieldsFingerprint(fields);
      if (tradeIdRef.current && fp === savedFingerprint.current) {
        setStatus("saved");
        return tradeIdRef.current;
      }
      setStatus("saving");
      setError(null);
      try {
        if (!tradeIdRef.current) {
          const res = await createDraft({ fields, clientRequestId: requestIdRef.current, cloneFromId, templateId });
          tradeIdRef.current = res.id;
          setTradeId(res.id);
          setTradeNumber(res.tradeNumber);
          onCreatedRef.current?.(res.id, res.tradeNumber);
        } else {
          await saveDraft({ id: tradeIdRef.current, fields });
        }
      } catch (e) {
        setStatus("error");
        setError(getErrorMessage(e, "Unable to save."));
        throw e;
      }
      savedFingerprint.current = fp;
      setLastSavedAt(Date.now());
    }
  }, [createDraft, saveDraft, cloneFromId, templateId]);

  const save = useCallback(async (): Promise<Id<"trades">> => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    while (inFlight.current) {
      try {
        await inFlight.current;
      } catch {
        // the next attempt retries
      }
    }
    const p = runSave();
    inFlight.current = p;
    try {
      return await p;
    } finally {
      inFlight.current = null;
    }
  }, [runSave]);

  /**
   * Debounced autosave; only for changes that differ from the last save. A
   * brand-new form is not persisted until it holds meaningful content.
   */
  const schedule = useCallback(() => {
    const fields = getFieldsRef.current();
    if (!tradeIdRef.current && !hasMeaningfulContent(fields)) return;
    const fp = fieldsFingerprint(fields);
    if (fp === savedFingerprint.current) return;
    setStatus("pending");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      save().catch(() => undefined);
    }, delay);
  }, [delay, save]);

  /** Starts a brand-new trade in the same wizard ("Save and Add Another"). */
  const resetForNew = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    tradeIdRef.current = undefined;
    requestIdRef.current = newRequestId();
    savedFingerprint.current = null;
    setTradeId(undefined);
    setTradeNumber(undefined);
    setStatus("idle");
    setError(null);
  }, []);

  /** Marks the current values as persisted (e.g. a fresh form that hasn't been touched). */
  const markClean = useCallback(() => {
    savedFingerprint.current = fieldsFingerprint(getFieldsRef.current());
  }, []);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return {
    tradeId,
    tradeNumber,
    status,
    error,
    lastSavedAt,
    save,
    schedule,
    resetForNew,
    markClean,
    hasUnsavedChanges: status === "pending" || status === "saving" || status === "error",
  };
}
