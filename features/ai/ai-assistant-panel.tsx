"use client";

import { useMutation, useQuery } from "convex/react";
import {
  AlertCircle,
  ArrowUp,
  Check,
  History,
  Loader2,
  Plus,
  RefreshCw,
  Sparkles,
  Square,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { errorText, RichText } from "./ai-shared";

const MAX_INPUT = 4000;

function UserMessage({ message }: { message: Doc<"aiMessages"> }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] rounded-xl rounded-br-sm bg-primary px-3 py-2 text-sm text-primary-foreground">
        <RichText text={message.content} />
      </div>
    </div>
  );
}

function AssistantMessage({
  message,
  onRetry,
  retrying,
}: {
  message: Doc<"aiMessages">;
  onRetry: (id: Id<"aiMessages">) => void;
  retrying: boolean;
}) {
  const pending = message.status === "pending" || message.status === "streaming";
  return (
    <div className="space-y-2">
      <div className="flex items-start gap-2">
        <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md bg-accent text-accent-foreground">
          <Sparkles className="size-3.5" />
        </span>
        <div className="min-w-0 flex-1 text-sm">
          {message.content ? (
            <RichText text={message.content} />
          ) : message.status === "error" ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-2.5 text-xs text-destructive">
              <p className="flex items-center gap-1.5 font-medium">
                <AlertCircle className="size-3.5" /> Couldn&apos;t answer
              </p>
              {message.error && <p className="mt-1 leading-relaxed">{message.error}</p>}
              <Button
                size="xs"
                variant="outline"
                className="mt-2"
                disabled={retrying}
                onClick={() => onRetry(message._id)}
              >
                <RefreshCw className={cn(retrying && "animate-spin")} /> Retry
              </Button>
            </div>
          ) : pending ? (
            <p className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" /> Thinking…
            </p>
          ) : (
            <span className="sr-only">Empty answer</span>
          )}
          {pending && message.content && (
            <span className="mt-1 inline-flex items-center gap-1 text-[11px] text-muted-foreground">
              <Loader2 className="size-3 animate-spin" /> Streaming
            </span>
          )}
          {message.status === "done" && message.model && (
            <p className="mt-1.5 text-[10px] text-muted-foreground">Answered by {message.model}</p>
          )}
        </div>
      </div>
      {message.contextRefs && message.contextRefs.length > 0 && (
        <div className="ml-8 flex flex-wrap gap-1.5">
          {message.contextRefs.map((ref) => (
            <Link
              key={`${ref.type}-${ref.id}`}
              href={ref.href}
              className="rounded-full border bg-background px-2 py-0.5 text-[11px] font-medium transition-colors hover:bg-muted"
            >
              {ref.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export function AiAssistantPanel({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const pathname = usePathname();
  const status = useQuery(api.ai.status);
  const threads = useQuery(api.ai.listThreads);
  const [threadId, setThreadId] = useState<Id<"aiThreads"> | null>(null);
  const [newChatStarted, setNewChatStarted] = useState(false);
  // Open on the most recent conversation until the user starts/selects one.
  const selectedThreadId = newChatStarted ? null : (threadId ?? threads?.[0]?._id ?? null);
  const messages = useQuery(api.ai.messages, selectedThreadId ? { threadId: selectedThreadId } : "skip");

  const sendMessage = useMutation(api.ai.sendMessage);
  const retry = useMutation(api.ai.retry);
  const stop = useMutation(api.ai.stop);
  const deleteThread = useMutation(api.ai.deleteThread);
  const setEnabled = useMutation(api.ai.setEnabled);

  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [retryingId, setRetryingId] = useState<Id<"aiMessages"> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const active = messages
    ? [...messages].reverse().find((m) => m.role === "assistant" && (m.status === "pending" || m.status === "streaming"))
    : undefined;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages, selectedThreadId]);

  const currentThread = threads?.find((t) => t._id === selectedThreadId);
  const used = status?.usedToday ?? 0;
  const cap = status?.dailyCap ?? 0;
  const quotaExhausted = status !== undefined && cap > 0 && used >= cap;
  const canChat = status?.available === true && !quotaExhausted;

  async function submit() {
    const content = text.trim();
    if (!content || sending || !canChat || active) return;
    setSending(true);
    setError(null);
    try {
      const res = await sendMessage({
        threadId: selectedThreadId ?? undefined,
        content,
        page: pathname,
      });
      setText("");
      setThreadId(res.threadId);
      setNewChatStarted(false);
      requestAnimationFrame(() => inputRef.current?.focus());
    } catch (e) {
      setError(errorText(e));
    } finally {
      setSending(false);
    }
  }

  async function onRetry(messageId: Id<"aiMessages">) {
    setRetryingId(messageId);
    setError(null);
    try {
      await retry({ messageId, page: pathname });
    } catch (e) {
      setError(errorText(e));
    } finally {
      setRetryingId(null);
    }
  }

  async function onStop() {
    if (!active) return;
    try {
      await stop({ messageId: active._id });
    } catch (e) {
      setError(errorText(e));
    }
  }

  function newChat() {
    setNewChatStarted(true);
    setThreadId(null);
    setText("");
    setError(null);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  async function removeCurrentThread() {
    if (!selectedThreadId) return;
    try {
      await deleteThread({ threadId: selectedThreadId });
      newChat();
    } catch (e) {
      setError(errorText(e));
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b px-4 py-3">
          <div className="flex items-start justify-between gap-2 pr-8">
            <div className="min-w-0">
              <SheetTitle className="flex items-center gap-2">
                <Sparkles className="size-4 text-primary" /> AI assistant
                {status && <Badge variant="secondary">{status.provider}</Badge>}
              </SheetTitle>
              <SheetDescription className="truncate text-xs">
                {status
                  ? status.model
                    ? `Model: ${status.model}`
                    : "Answers are grounded in data you are allowed to see."
                  : "Loading status…"}
              </SheetDescription>
            </div>
          </div>
          <div className="flex items-center justify-between gap-2 pt-2">
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="xs"
                onClick={newChat}
                disabled={sending}
                title="Start a new conversation"
              >
                <Plus /> New chat
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="xs" aria-label="Conversation history">
                    <History /> History
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="max-h-72 w-64 overflow-y-auto">
                  <DropdownMenuLabel>Recent conversations</DropdownMenuLabel>
                  {threads === undefined ? (
                    <DropdownMenuItem disabled>Loading…</DropdownMenuItem>
                  ) : threads.length === 0 ? (
                    <DropdownMenuItem disabled>No conversations yet</DropdownMenuItem>
                  ) : (
                    threads.map((t) => (
                      <DropdownMenuItem
                        key={t._id}
                        onSelect={() => {
                          setThreadId(t._id);
                          setNewChatStarted(false);
                        }}
                      >
                        <span className="min-w-0 flex-1 truncate">{t.title}</span>
                        {t._id === selectedThreadId && <Check className="shrink-0" />}
                      </DropdownMenuItem>
                    ))
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
              {selectedThreadId && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="xs" aria-label="Delete this conversation">
                      <Trash2 />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete this conversation?</AlertDialogTitle>
                      <AlertDialogDescription>
                        {currentThread?.title ? `“${currentThread.title}”` : "This conversation"} and its messages will be
                        removed. This cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Keep it</AlertDialogCancel>
                      <AlertDialogAction onClick={removeCurrentThread}>Delete</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
            {status?.canManage && status.configured && (
              <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
                Enabled
                <Switch
                  size="sm"
                  checked={status.enabled}
                  onCheckedChange={(checked) => void setEnabled({ enabled: checked })}
                  aria-label="Enable the AI assistant for everyone"
                />
              </label>
            )}
          </div>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
            {status === undefined ? (
              <div className="space-y-3 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                <p>Checking whether the assistant is available…</p>
              </div>
            ) : !status.configured ? (
              <div className="rounded-lg border bg-muted/40 p-3 text-sm">
                <p className="font-medium">The AI assistant isn&apos;t configured</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  An administrator must set <code className="font-mono">{status.keyEnv}</code> on the Convex deployment
                  (<code className="font-mono">npx convex env set {status.keyEnv} …</code>). Until then the assistant
                  stays off — it never makes up answers.
                </p>
              </div>
            ) : !status.enabled ? (
              <div className="rounded-lg border bg-muted/40 p-3 text-sm">
                <p className="font-medium">The AI assistant is turned off</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  An administrator has disabled it for this workspace. You can switch it back on from here if you manage
                  settings.
                </p>
              </div>
            ) : messages === undefined && selectedThreadId ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Loading conversation…
              </div>
            ) : !messages || messages.length === 0 ? (
              <div className="space-y-3 py-6 text-center">
                <span className="mx-auto flex size-10 items-center justify-center rounded-full bg-accent text-accent-foreground">
                  <Sparkles className="size-5" />
                </span>
                <div>
                  <p className="text-sm font-medium">Ask about your workspace</p>
                  <p className="mx-auto mt-1 max-w-xs text-xs leading-relaxed text-muted-foreground">
                    For example: “What is waiting for my approval?”, “Summarise TRD-2026-0017” or “How do I prepare a
                    B/L?”. Answers use only records you can see.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {messages.map((m) =>
                  m.role === "user" ? (
                    <UserMessage key={m._id} message={m} />
                  ) : (
                    <AssistantMessage
                      key={m._id}
                      message={m}
                      onRetry={onRetry}
                      retrying={retryingId === m._id}
                    />
                  ),
                )}
                <div ref={bottomRef} />
              </div>
            )}
          </div>

          {status?.available && (
            <div className="border-t px-3 py-3">
              {error && (
                <div className="mb-2 flex items-start gap-1.5 rounded-md bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
                  <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}
              {quotaExhausted && (
                <p className="mb-2 rounded-md bg-warning/10 px-2 py-1.5 text-xs text-warning">
                  Today&apos;s AI limit is used up ({used}/{cap}). It resets at 00:00 UTC.
                </p>
              )}
              <div className="rounded-lg border bg-background focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/20">
                <Textarea
                  ref={inputRef}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void submit();
                    }
                  }}
                  rows={2}
                  maxLength={MAX_INPUT}
                  disabled={!canChat || sending}
                  placeholder="Ask about your trades, or how to do something…"
                  aria-label="Message the AI assistant"
                  className="min-h-14 resize-none border-0 bg-transparent shadow-none focus-visible:ring-0"
                />
                <div className="flex items-center justify-between gap-2 px-2 pb-2">
                  <span className="text-[11px] text-muted-foreground tabular">
                    {cap > 0 ? `${used} / ${cap} requests today` : "Free tier"}
                    {text.length > MAX_INPUT - 400 && ` · ${MAX_INPUT - text.length} left`}
                  </span>
                  {active ? (
                    <Button size="sm" variant="outline" onClick={onStop}>
                      <Square /> Stop
                    </Button>
                  ) : (
                    <Button size="sm" onClick={submit} disabled={!text.trim() || sending || !canChat}>
                      {sending ? <Loader2 className="animate-spin" /> : <ArrowUp />} Send
                    </Button>
                  )}
                </div>
              </div>
              <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">{status.notice}</p>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
