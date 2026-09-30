"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { requestEquipeSupport } from "@/lib/equipe/commands";
import { assistantThreadQueryKey } from "@/lib/hooks/use-assistant-threads";

export default function EquipePlanOffer({ accountId, threadId, disabled, onSuggestion }: {
  accountId: string;
  threadId: string | null;
  disabled?: boolean;
  onSuggestion?: (text: string) => void;
}) {
  const t = useTranslations("assistant.equipe.plan");
  const queryClient = useQueryClient();
  const busy = useRef(false);
  const [pending, setPending] = useState(false);
  const [requested, setRequested] = useState(false);
  const [error, setError] = useState(false);

  const requestPlan = async () => {
    if (busy.current || requested || disabled) return;
    busy.current = true;
    setPending(true);
    setError(false);
    try {
      await requestEquipeSupport(accountId, { purpose: "plan" });
      setRequested(true);
      if (threadId) await queryClient.invalidateQueries({ queryKey: assistantThreadQueryKey(threadId) });
    } catch {
      setError(true);
    } finally {
      busy.current = false;
      setPending(false);
    }
  };

  return (
    <div className="max-w-[85%] text-sm text-[var(--text-primary)]" data-testid="equipe-plan-offer">
      <p className="mb-3 leading-relaxed">{t("intro")}</p>
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
          <button type="button" disabled={disabled || pending || requested} onClick={() => void requestPlan()}
            className="rounded-full bg-[var(--text-primary)] px-5 py-2 text-xs font-semibold text-[var(--surface-base)] disabled:opacity-50">
            {pending ? t("sending") : requested ? t("requested") : t("subscribe")}
          </button>
        </div>
        <p className="mt-2 text-xs text-[var(--text-muted)]" role="status">{requested ? t("confirmation") : t("contact")}</p>
        {error ? <p className="mt-2 text-xs text-[var(--danger-text)]" role="alert">{t("error")}</p> : null}
      </div>
    </div>
  );
}
