"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEquipeAccountState, useFreePlanAccount } from "@/lib/equipe/use-equipe";
import { usePlanRequest } from "@/lib/equipe/use-plan-request";

/**
 * The free plan's CTA where the classic product would ask for a subscription (ticket 11, part 2): "Falar com uma
 * pessoa", never a Stripe checkout. Every state of the free plan gets a button that does what it says:
 * - the plan can be asked (a recorded diagnosis, or the free credit ran out before one): the plan request of the plan
 *   card and the D-12 diagnosis card;
 * - not yet (before or during the diagnosis): a person is asked, with the plan note (`request_support`, accepted in any
 *   state), instead of a plan request the server would refuse;
 * - no Equipe account yet (a sign-up that never opened the home): the way to the conversation, where it opens;
 * - only closed accounts: the conversation does not reopen for a closed account, so a person is asked, through the most
 *   recent closed account (`request_support` is accepted there), never a link to the conversation.
 * `intro` says why the CTA is there when the surface has no message of its own.
 */
/** The card as the composer shows it in the box's place (spec 2026-10-07 §2, frame c7b): the intro leads, the action follows. */
const STAGE_CLASS = "flex min-h-52 flex-col items-start gap-4 rounded-3xl border border-[var(--border-default)] bg-[var(--surface-base)] p-7 [&>p:first-child]:text-2xl [&>p:first-child]:font-semibold [&>p:first-child]:leading-7 [&>button]:h-10 [&>button]:text-[13px] [&>a]:inline-flex [&>a]:h-10 [&>a]:items-center [&>a]:text-[13px] [&>p:not(:first-child)]:text-sm [&>p:not(:first-child)]:leading-5 [&>p[role=status]]:mt-1";

export function FreePlanCta({ accountId, intro, className: classNameProp, variant = "inline" }: {
  accountId: string | null;
  intro?: string;
  className?: string;
  variant?: "inline" | "stage";
}) {
  const t = useTranslations("billing.conversion.freePlan");
  const className = variant === "stage" ? STAGE_CLASS : classNameProp;
  // A payload carries no account when the workspace has no free one: the billing status (the same rule) says why.
  const closedAccountId = useFreePlanAccount()?.closedAccountId ?? null;
  if (!accountId && closedAccountId) {
    return <ClosedAccountRequest accountId={closedAccountId} intro={intro} className={className} />;
  }
  if (!accountId) {
    return (
      <div className={className ?? "flex flex-col items-start gap-2"} data-testid="free-plan-cta">
        {intro ? <p className="text-sm text-[var(--text-primary)]">{intro}</p> : null}
        <Link href="/" className="rounded-full bg-[var(--text-primary)] px-5 py-2 text-xs font-semibold text-[var(--surface-base)] focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
          {t("openConversation")}
        </Link>
        <p className="text-xs text-[var(--text-muted)]">{t("noAccount")}</p>
      </div>
    );
  }
  return <FreePlanRequest accountId={accountId} intro={intro} className={className} />;
}

function FreePlanRequest({ accountId, intro, className }: { accountId: string; intro?: string; className?: string }) {
  const t = useTranslations("billing.conversion.freePlan");
  const tPlan = useTranslations("assistant.equipe.plan");
  const planAvailable = useEquipeAccountState(accountId).data?.planAvailable === true;
  const { pending, requested, requestedHere, error, request } = usePlanRequest(accountId, null, { asPerson: !planAvailable });
  // Once sent the button is disabled and would drop the focus to the page: the confirmation takes it (as in the plan card).
  const button = useRef<HTMLButtonElement>(null);
  const confirmation = useRef<HTMLParagraphElement>(null);
  useEffect(() => { if (requestedHere) confirmation.current?.focus(); }, [requestedHere]);
  useEffect(() => { if (error) button.current?.focus(); }, [error]);

  return (
    <div className={className ?? "flex flex-col items-start gap-2"} data-testid="free-plan-cta">
      {intro ? <p className="text-sm text-[var(--text-primary)]">{intro}</p> : null}
      <button type="button" ref={button} disabled={pending || requested} onClick={() => void request()}
        className="rounded-full bg-[var(--text-primary)] px-5 py-2 text-xs font-semibold text-[var(--surface-base)] focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:opacity-50">
        {pending ? tPlan("sending") : requested ? tPlan("requested") : t("action")}
      </button>
      <p ref={confirmation} tabIndex={-1} className="text-xs text-[var(--text-muted)]" role="status">
        {requested ? tPlan("confirmation") : tPlan("contact")}
      </p>
      {error ? <p className="text-xs text-[var(--danger-text)]" role="alert">{tPlan("error")}</p> : null}
    </div>
  );
}

/** Every account of the workspace is closed: a person is asked, with the plan note, through the most recent one. */
function ClosedAccountRequest({ accountId, intro, className }: { accountId: string; intro?: string; className?: string }) {
  const t = useTranslations("billing.conversion.freePlan");
  const tPlan = useTranslations("assistant.equipe.plan");
  const { pending, requested, requestedHere, error, request } = usePlanRequest(accountId, null, { asPerson: true });
  const confirmation = useRef<HTMLParagraphElement>(null);
  useEffect(() => { if (requestedHere) confirmation.current?.focus(); }, [requestedHere]);
  return (
    <div className={className ?? "flex flex-col items-start gap-2"} data-testid="free-plan-cta">
      {intro ? <p className="text-sm text-[var(--text-primary)]">{intro}</p> : null}
      <p className="text-sm text-[var(--text-secondary)]">{t("closedAccount")}</p>
      <button type="button" disabled={pending || requested} onClick={() => void request()}
        className="rounded-full bg-[var(--text-primary)] px-5 py-2 text-xs font-semibold text-[var(--surface-base)] focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:opacity-50">
        {pending ? tPlan("sending") : requested ? tPlan("requested") : t("action")}
      </button>
      <p ref={confirmation} tabIndex={-1} className="text-xs text-[var(--text-muted)]" role="status">
        {requested ? tPlan("confirmation") : null}
      </p>
      {error ? <p className="text-xs text-[var(--danger-text)]" role="alert">{t("closedAccountError")}</p> : null}
    </div>
  );
}
