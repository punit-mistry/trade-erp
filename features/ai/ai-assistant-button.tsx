"use client";

import { useQuery } from "convex/react";
import { Sparkles } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import { AiAssistantPanel } from "./ai-assistant-panel";

/**
 * Top-bar entry point for the AI assistant. The panel is only mounted while
 * open so a closed assistant costs nothing (no thread/message subscriptions).
 */
export function AiAssistantButton() {
  const [open, setOpen] = useState(false);
  const status = useQuery(api.ai.status);

  const label =
    status === undefined
      ? "AI assistant"
      : status.available
        ? `AI assistant · ${status.usedToday}/${status.dailyCap} used today`
        : status.configured
          ? "AI assistant (turned off)"
          : "AI assistant (not configured)";

  return (
    <>
      <div data-tour="ai-assistant">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setOpen(true)}
          aria-label="Open AI assistant"
          title={label}
          aria-haspopup="dialog"
        >
          <Sparkles />
        </Button>
      </div>
      {open && <AiAssistantPanel open={open} onOpenChange={setOpen} />}
    </>
  );
}
