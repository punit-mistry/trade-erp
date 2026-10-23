"use client";

import { useMutation, useQuery } from "convex/react";
import { CheckCircle2, CircleOff, Sparkles } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { DetailList, Section } from "@/components/shared/section";
import { Switch } from "@/components/ui/switch";
import { getErrorMessage } from "@/lib/errors";

/** Admin switch + configuration state for the AI assistant (System Settings tab). */
export function AiSettingsCard() {
  const status = useQuery(api.ai.status);
  const setEnabled = useMutation(api.ai.setEnabled);
  const [saving, setSaving] = useState(false);

  if (!status || !status.canManage) return null;

  async function toggle(enabled: boolean) {
    setSaving(true);
    try {
      await setEnabled({ enabled });
      toast.success(enabled ? "AI assistant turned on" : "AI assistant turned off for everyone");
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Section
      title={
        <span className="inline-flex items-center gap-1.5">
          <Sparkles className="size-3.5 text-primary" /> AI assistant
        </span>
      }
      description="Chat, “fill from email/signature”, trade summaries and clause drafting. Turning it off hides nothing — AI buttons just explain that it's off."
      actions={
        <label className="flex items-center gap-2 text-sm">
          {status.enabled ? "On" : "Off"}
          <Switch
            checked={status.enabled}
            disabled={saving || !status.configured}
            onCheckedChange={(checked) => void toggle(checked)}
            aria-label="Enable the AI assistant for everyone"
          />
        </label>
      }
    >
      <DetailList
        items={[
          { label: "Provider", value: status.provider },
          { label: "Model", value: status.model, mono: true },
          {
            label: "API key",
            value: status.configured ? (
              <span className="inline-flex items-center gap-1 text-success">
                <CheckCircle2 className="size-3.5" /> Configured
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-warning">
                <CircleOff className="size-3.5" /> Not set
              </span>
            ),
          },
          { label: "Your usage today", value: `${status.usedToday} / ${status.dailyCap} requests` },
          { label: "Data notice shown to users", value: status.notice, span: 2 },
        ]}
      />
      {!status.configured && (
        <p className="mt-3 rounded-md bg-muted/50 p-2.5 text-xs text-muted-foreground">
          Set the key on the Convex deployment (not in <code className="font-mono">.env.local</code>):{" "}
          <code className="font-mono">npx convex env set {status.keyEnv} &lt;your Groq key&gt;</code>. Optional:{" "}
          <code className="font-mono">AI_MODEL</code> to change the model.
        </p>
      )}
    </Section>
  );
}
