"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { usePlanRequest } from "@/lib/equipe/use-plan-request";

/**
 * The free plan's CTA where the classic product would ask for a subscription (ticket 11, part 2): the same plan request
 * as the plan card and the diagnosis card that ran out of credit (ticket 13, D-12), "Falar com uma pessoa", never a
 * Stripe checkout. `intro` says why the button is there when the surface has no message of its own.
 */
export function FreePlanCta({ accountId, intro, className }: { accountId: string; intro?: string; className?: string }) {
  const t = useTranslations("billing.conversion.freePlan");
  const tPlan = useTranslations("assistant.equipe.plan");
  const { pending, requested, requestedHere, error, request } = usePlanRequest(accountId);
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
