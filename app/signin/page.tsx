"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AlertCircle, ArrowLeftRight, Copy, FileSignature, Loader2, ShieldCheck, Ship } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/shared/form-field";
import { PasswordInput } from "@/components/shared/password-input";
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
    <div className="grid min-h-screen bg-background lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-sidebar p-10 text-sidebar-foreground lg:flex">
        <Brand />
        <div className="relative max-w-md space-y-6">
          <h1 className="text-3xl leading-tight font-semibold tracking-tight text-sidebar-accent-foreground">
            Book, contract and ship physical commodity trades — without re-typing anything.
          </h1>
          <ul className="space-y-4">
            {HIGHLIGHTS.map((h) => (
              <li key={h.title} className="flex gap-3">
                <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-sidebar-accent text-sidebar-primary">
                  <h.icon className="size-4" />
                </span>
                <span>
                  <span className="block text-sm font-medium text-sidebar-accent-foreground">{h.title}</span>
                  <span className="block text-[13px] leading-relaxed text-sidebar-foreground/75">{h.text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative flex items-center gap-2 text-xs text-sidebar-foreground/60">
          <ShieldCheck className="size-3.5" /> Role-based access. New accounts require administrator approval.
        </p>
        <div
          aria-hidden
          className="pointer-events-none absolute -right-28 -bottom-28 size-[28rem] rounded-full bg-sidebar-primary/20 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 -left-24 size-72 rounded-full bg-cyan/10 blur-3xl"
        />
      </aside>

      <main className="flex flex-col items-center justify-center px-4 py-10 sm:px-6">
        <div className="mb-8 lg:hidden">
          <Brand dark={false} />
        </div>
        <div className="w-full max-w-sm rounded-xl border bg-card p-6 shadow-sm sm:p-7">
          <div
            role="tablist"
            aria-label="Sign in or request access"
            className="mb-6 grid grid-cols-2 gap-1 rounded-lg bg-muted p-1"
          >
            {(["signIn", "signUp"] as const).map((f) => (
              <button
                key={f}
                type="button"
                role="tab"
                aria-selected={flow === f}
                onClick={() => {
                  setFlow(f);
                  setError(null);
                }}
                className={
                  "h-8 rounded-md text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none " +
                  (flow === f ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground")
                }
              >
                {f === "signIn" ? "Sign in" : "Request access"}
              </button>
            ))}
          </div>

          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold tracking-tight">
                {flow === "signIn" ? "Welcome back" : "Create your account"}
              </h2>
              <p className="text-sm text-muted-foreground">
                {flow === "signIn"
                  ? "Sign in with your work email and password."
                  : "The first account becomes the Administrator. Later accounts wait for approval."}
              </p>
            </div>

            {flow === "signUp" && (
              <FormField label="Full name" htmlFor="name" required>
                <Input id="name" name="name" autoComplete="name" required maxLength={120} className="h-9" />
              </FormField>
            )}
            <FormField label="Work email" htmlFor="email" required>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="you@company.com"
                required
                autoFocus
                className="h-9"
              />
            </FormField>
            <FormField
              label="Password"
              htmlFor="password"
              required
              help={flow === "signUp" ? "At least 10 characters, with letters and numbers." : undefined}
            >
              <PasswordInput
                id="password"
                name="password"
                autoComplete={flow === "signIn" ? "current-password" : "new-password"}
                required
                minLength={flow === "signUp" ? 10 : undefined}
                className="h-9"
              />
            </FormField>

            {error && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                <AlertCircle className="mt-0.5 size-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <Button type="submit" className="h-9 w-full" disabled={pending}>
              {pending && <Loader2 className="animate-spin" />}
              {flow === "signIn" ? "Sign in" : "Create account"}
            </Button>
          </form>
        </div>
        <p className="mt-6 max-w-sm text-center text-xs text-muted-foreground">
          {flow === "signIn"
            ? "Forgot your password? Ask an administrator to reset your access."
            : "After you register, an administrator assigns your role (Admin, Manager or Staff)."}
        </p>
      </main>
    </div>
  );
}

const HIGHLIGHTS = [
  { icon: Copy, title: "Create once, reuse everywhere", text: "Clone a previous trade and inherit supplier terms, bank details and clauses." },
  { icon: FileSignature, title: "Contracts from real trade data", text: "Generate, version and issue contracts without retyping a single field." },
  { icon: ArrowLeftRight, title: "Booking to dispatch, connected", text: "Prepare the B/L and track the dispatch checklist on the same record." },
];

function Brand({ dark = true }: { dark?: boolean }) {
  return (
    <div className="relative flex items-center gap-2.5">
      <div className="flex size-8 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
        <Ship className="size-4.5" />
      </div>
      <span className={dark ? "text-sm font-semibold tracking-tight text-sidebar-accent-foreground" : "text-sm font-semibold tracking-tight"}>
        Tradeline ERP
      </span>
    </div>
  );
}
