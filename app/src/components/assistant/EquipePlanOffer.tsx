"use client";

import { useTranslations } from "next-intl";
import { Check } from "lucide-react";
import { useEquipeAccountState } from "@/lib/equipe/use-equipe";
import { usePlanRequest } from "@/lib/equipe/use-plan-request";

export default function EquipePlanOffer({ accountId, threadId, disabled, onSuggestion, reason }: {
  accountId: string;
  threadId: string | null;
  disabled?: boolean;
  onSuggestion?: (text: string) => void;
  /** Why the card was offered. When the credit ended before the diagnosis, the intro cannot say the diagnosis is the person's (ticket 13, D-12). */
  reason?: string;
}) {
  const t = useTranslations("assistant.equipe.plan");
  // The gate follows the account: while a correction of the diagnosis is pending (or its replacement is being built) every
  // plan card of the conversation waits, instead of failing on click.
  const waiting = useEquipeAccountState(accountId).data?.planAvailable === false;
  const { pending, requested, error, request } = usePlanRequest(accountId, threadId);
  const requestPlan = () => { if (!disabled && !waiting) void request(); };

  return (
    <div className="max-w-[85%] text-sm text-[var(--text-primary)]" data-testid="equipe-plan-offer">
      <p className="mb-3 leading-relaxed">{t(reason === "diagnosis_budget_exceeded" ? "introBudget" : "intro")}</p>
      <div className="rounded-[var(--radius-panel)] border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4">
        <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)]">{t("label")}</p>
        <p className="mt-3 text-base font-semibold">{t("title")}</p>
        <ul className="mt-3 flex flex-col gap-3">
          {(["calendar", "review", "publication", "results"] as const).map((key) => (
            <li key={key} className="flex items-start gap-2">
              <Check className="mt-0.5 size-4 shrink-0 text-[var(--success-text)]" aria-hidden="true" />
              {t(key)}
            </li>
          ))}
        </ul>
        <div className="mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-[var(--border-subtle)] pt-3">
          <button type="button" disabled={disabled || pending || !onSuggestion} onClick={() => onSuggestion?.(t("continueMessage"))}
            className="rounded-full border border-[var(--border-subtle)] px-4 py-2 text-xs disabled:opacity-50">
            {t("later")}
          </button>
          <button type="button" disabled={disabled || pending || requested || waiting} onClick={requestPlan}
            className="rounded-full bg-[var(--text-primary)] px-5 py-2 text-xs font-semibold text-[var(--surface-base)] disabled:opacity-50">
            {pending ? t("sending") : requested ? t("requested") : t("subscribe")}
          </button>
        </div>
        <p className="mt-2 text-xs text-[var(--text-muted)]" role="status">{requested ? t("confirmation") : waiting ? t("waiting") : t("contact")}</p>
        {error ? <p className="mt-2 text-xs text-[var(--danger-text)]" role="alert">{t("error")}</p> : null}
      </div>
    </div>
  );
}
