"use client";

import { useTranslations } from "next-intl";
import { EquipeDisabledError, type EquipeAccountJson } from "@/lib/equipe/api";

// Account resolution shared by the client screens: loading, pilot-gate
// (404 → disabled), error with retry, empty, and the account switcher when
// the workspace holds more than one account.

export function EquipeDisabledNotice() {
  const t = useTranslations("equipe.common");
  return (
    <p className="py-10 text-center text-sm text-[var(--text-muted)]" data-testid="equipe-disabled">
      {t("disabled")}
    </p>
  );
}

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

export function EquipeEmptyAccounts() {
  const t = useTranslations("equipe.common");
  return (
    <div className="py-10 text-center" data-testid="equipe-no-accounts">
      <p className="text-sm font-medium text-[var(--text-primary)]">{t("noAccountsTitle")}</p>
      <p className="mt-1 text-sm text-[var(--text-muted)]">{t("noAccountsBody")}</p>
    </div>
  );
}

export function EquipeAccountSwitcher({
  accounts,
  accountId,
  onSelect,
}: {
  accounts: EquipeAccountJson[];
  accountId: string;
  onSelect: (accountId: string) => void;
}) {
  const t = useTranslations("equipe.common");
  if (accounts.length < 2) return null;
  return (
    <label className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
      {t("account")}
      <select
        value={accountId}
        onChange={(event) => onSelect(event.target.value)}
        className="rounded-[var(--radius-control)] border border-[var(--border-subtle)] bg-[var(--surface-base)] px-2 py-1 text-xs text-[var(--text-primary)]"
        data-testid="equipe-account-switcher"
      >
        {accounts.map((account, index) => (
          <option key={account.id} value={account.id}>
            {t("accountOption", { index: index + 1, status: account.status })}
          </option>
        ))}
      </select>
    </label>
  );
}

export function isDisabledError(error: unknown): boolean {
  return error instanceof EquipeDisabledError;
}
