"use client";

import { useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { getErrorMessage } from "@/lib/errors";

/** Template lifecycle mutations with consistent toasts + navigation. */
export function useTemplateActions() {
  const router = useRouter();
  const createNewVersion = useMutation(api.contractTemplates.createNewVersion);
  const clone = useMutation(api.contractTemplates.clone);
  const setStatus = useMutation(api.contractTemplates.setStatus);
  const setDefault = useMutation(api.contractTemplates.setDefault);

  const run = async <T,>(fn: () => Promise<T>, success: string): Promise<T | undefined> => {
    try {
      const result = await fn();
      toast.success(success);
      return result;
    } catch (e) {
      toast.error(getErrorMessage(e));
      return undefined;
    }
  };

  return {
    newVersion: async (id: Id<"contractTemplates">) => {
      const newId = await run(() => createNewVersion({ id }), "Draft version ready for editing.");
      if (newId) router.push(`/contract-templates/${newId}`);
    },
    clone: async (id: Id<"contractTemplates">) => {
      const newId = await run(() => clone({ id }), "Template cloned as a new draft.");
      if (newId) router.push(`/contract-templates/${newId}`);
    },
    activate: (id: Id<"contractTemplates">) => run(() => setStatus({ id, status: "active" }), "Template activated."),
    deactivate: (id: Id<"contractTemplates">) => run(() => setStatus({ id, status: "inactive" }), "Template deactivated."),
    makeDefault: (id: Id<"contractTemplates">) => run(() => setDefault({ id }), "Default template updated."),
  };
}
