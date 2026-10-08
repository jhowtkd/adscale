"use client";

import { useTranslations } from "next-intl";

// Account resolution shared by the client screens: loading, and error with retry.

export function EquipeErrorNotice({ onRetry }: { onRetry: () => void }) {
  const t = useTranslations("equipe.common");
  return (
    <div className="flex flex-col items-center gap-2 py-10" data-testid="equipe-error">
      <p className="text-sm text-[var(--text-secondary)]">{t("loadError")}</p>
      <button
        type="button"
        onClick={onRetry}
        className="rounded-[var(--radius-control)] border border-[var(--border-strong)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--surface-inset)]"
      >
        {t("retry")}
      </button>
    </div>
  );
}

export function EquipeLoading() {
  const t = useTranslations("equipe.common");
  return (
    <p className="py-10 text-center text-sm text-[var(--text-muted)]" data-testid="equipe-loading" role="status">
      {t("loading")}
    </p>
  );
}
