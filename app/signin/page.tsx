"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, Ship } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/shared/form-field";
import { getErrorMessage } from "@/lib/errors";

export default function SignInPage() {
  const { signIn } = useAuthActions();
  const router = useRouter();
  const [flow, setFlow] = useState<"signIn" | "signUp">("signIn");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    const formData = new FormData(event.currentTarget);
    formData.set("flow", flow);
    try {
      await signIn("password", formData);
      router.replace("/dashboard");
    } catch (e) {
      const message = getErrorMessage(e, "");
      setError(
        flow === "signIn" && (!message || /InvalidSecret|InvalidAccountId|Invalid credentials/i.test(message))
          ? "Incorrect email or password."
          : flow === "signUp" && /already exists/i.test(message)
            ? "An account with this email already exists. Sign in instead."
            : message || "Unable to continue. Please try again.",
      );
      setPending(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <div className="relative hidden flex-col justify-between overflow-hidden bg-sidebar p-10 text-sidebar-foreground lg:flex">
        <div className="flex items-center gap-2.5 text-sidebar-accent-foreground">
          <div className="flex size-8 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
            <Ship className="size-4.5" />
          </div>
          <span className="text-sm font-semibold tracking-tight">Tradeline ERP</span>
        </div>
        <div className="max-w-md space-y-4">
          <h1 className="text-3xl font-semibold tracking-tight text-sidebar-accent-foreground">
            Book, contract and ship physical commodity trades — without re-typing anything.
          </h1>
          <p className="text-sm leading-relaxed text-sidebar-foreground/80">
            Clone a previous trade, inherit supplier terms, generate the contract from the trade itself and prepare the
            B/L from the same data. One connected record from booking to dispatch.
          </p>
        </div>
        <p className="text-xs text-sidebar-foreground/60">Access is role-based. New accounts require administrator approval.</p>
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -bottom-24 size-96 rounded-full bg-sidebar-primary/20 blur-3xl"
        />
      </div>

      <div className="flex items-center justify-center p-6">
        <form onSubmit={onSubmit} className="w-full max-w-sm space-y-5">
          <div className="space-y-1">
            <h2 className="text-xl font-semibold tracking-tight">
              {flow === "signIn" ? "Sign in to your workspace" : "Create your account"}
            </h2>
            <p className="text-sm text-muted-foreground">
              {flow === "signIn"
                ? "Use your work email and password."
                : "The first account becomes the Administrator. Later accounts wait for approval."}
            </p>
          </div>

          {flow === "signUp" && (
            <FormField label="Full name" htmlFor="name" required>
              <Input id="name" name="name" autoComplete="name" required maxLength={120} />
            </FormField>
          )}
          <FormField label="Work email" htmlFor="email" required>
            <Input id="email" name="email" type="email" autoComplete="email" required />
          </FormField>
          <FormField
            label="Password"
            htmlFor="password"
            required
            help={flow === "signUp" ? "At least 10 characters, with letters and numbers." : undefined}
          >
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete={flow === "signIn" ? "current-password" : "new-password"}
              required
              minLength={flow === "signUp" ? 10 : undefined}
            />
          </FormField>

          {error && (
            <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <Button type="submit" className="h-9 w-full" disabled={pending}>
            {pending && <Loader2 className="animate-spin" />}
            {flow === "signIn" ? "Sign in" : "Create account"}
          </Button>

          <p className="text-center text-sm text-muted-foreground">
            {flow === "signIn" ? "New to the workspace?" : "Already have an account?"}{" "}
            <button
              type="button"
              className="font-medium text-primary hover:underline"
              onClick={() => {
                setFlow(flow === "signIn" ? "signUp" : "signIn");
                setError(null);
              }}
            >
              {flow === "signIn" ? "Request access" : "Sign in"}
            </button>
          </p>
        </form>
      </div>
    </div>
  );
}
