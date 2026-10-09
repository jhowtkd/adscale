"use client";

// What `/` shows when the conversation cannot open (spec 2026-10-07 §4), each with a real way out: resend the confirmation,
// say who the owner is, or try again. Before, the rail and "Abrir a conversa" led back to the same bare message.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { authClient } from "@/lib/auth-client";

export type HomeOpenProblemProps =
  | { kind: "verifyEmail"; email: string }
  | { kind: "ownerFirst"; ownerName: string | null }
  | { kind: "openError" };

const BUTTON = "rounded-full bg-[var(--text-primary)] px-5 py-2 text-xs font-semibold text-[var(--surface-base)] focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:opacity-50";

export default function HomeOpenProblem(props: HomeOpenProblemProps) {
  return (
    <div className="flex flex-col items-start gap-3 p-6" data-testid="home-open-problem" data-kind={props.kind}>
      {props.kind === "verifyEmail" ? <ResendConfirmation email={props.email} /> : <TryAgain {...props} />}
    </div>
  );
}

function ResendConfirmation({ email }: { email: string }) {
  const t = useTranslations("assistant");
  const tAuth = useTranslations("auth");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "failed">("idle");
  async function resend() {
    setState("sending");
    try {
      const res = await authClient.sendVerificationEmail({ email, callbackURL: "/" });
      setState(res?.error ? "failed" : "sent");
    } catch {
      setState("failed");
    }
  }
  return (
    <>
      <p className="text-sm text-[var(--text-secondary)]" role="status">{t("homeVerifyEmail")}</p>
      <button type="button" className={BUTTON} disabled={state === "sending" || state === "sent"} onClick={() => void resend()}>
        {state === "sending" ? tAuth("resendingVerificationEmail") : tAuth("resendVerificationEmail")}
      </button>
      {/* Always there, so the live region exists before "sent" fills it and screen readers announce it. */}
      <p className="text-xs text-[var(--text-muted)]" role="status" data-testid="home-verify-sent">
        {state === "sent" ? tAuth("verificationEmailSent") : null}
      </p>
      {state === "failed" ? <p className="text-xs text-[var(--danger-text)]" role="alert">{tAuth("verificationEmailError")}</p> : null}
    </>
  );
}

function TryAgain(props: Exclude<HomeOpenProblemProps, { kind: "verifyEmail" }>) {
  const t = useTranslations("assistant");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const message = props.kind === "ownerFirst"
    ? props.ownerName ? t("homeOwnerFirstNamed", { owner: props.ownerName }) : t("homeOwnerFirst")
    : t("homeOpenError");
  return (
    <>
      <p className="text-sm text-[var(--danger-text)]" role="alert">{message}</p>
      <button type="button" className={BUTTON} disabled={pending} onClick={() => startTransition(() => router.refresh())}>
        {pending ? t("homeRetrying") : t("homeRetry")}
      </button>
    </>
  );
}
