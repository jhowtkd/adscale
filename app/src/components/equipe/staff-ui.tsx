// Shared presentational bits for the internal Equipe consoles (#554).

"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { StaffApiError } from "./staff-api";
import { staffErrorKey } from "./staff-errors";

export function StaffErrorAlert({
  error,
  onRetry,
  className,
}: {
  error: unknown;
  onRetry?: () => void;
  className?: string;
}) {
  const t = useTranslations("equipe.staffErrors");
  const tCommon = useTranslations("equipe.common");
  const key = staffErrorKey(error);
  const code = error instanceof StaffApiError ? error.code : null;
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--danger-border)] bg-[var(--danger-bg)] p-3 text-sm text-[var(--danger-text)]",
        className,
      )}
    >
      <span>
        {t(key)}
        {code ? <span className="ml-2 font-mono text-xs opacity-70">{code}</span> : null}
      </span>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="rounded-[var(--radius-control)] border border-[var(--border-dim)] bg-[var(--surface-raised)] px-3 py-1 text-sm font-medium text-[var(--text-primary)]"
        >
          {tCommon("retry")}
        </button>
      ) : null}
    </div>
  );
}

export function StaffLoading({ label }: { label: string }) {
  return (
    <p role="status" className="text-sm text-[var(--text-muted)]">
      {label}
    </p>
  );
}

export function StaffEmpty({ label }: { label: string }) {
  return (
    <p className="rounded-lg border border-dashed border-[var(--border-dim)] p-6 text-center text-sm text-[var(--text-muted)]">
      {label}
    </p>
  );
}

/** Short, stable account id — the fallback when the API has no names. */
export function shortAccountId(accountId: string): string {
  return accountId.slice(0, 8);
}

export type StaffAccountNames = {
  brandName: string | null;
  workspaceName: string | null;
};

/**
 * What staff see as the account: "Brand · Workspace", the brand alone when
 * the workspace name is missing, else the translated short-id fallback.
 */
export function accountDisplayName(names: StaffAccountNames, fallback: string): string {
  if (!names.brandName) return fallback;
  if (!names.workspaceName) return names.brandName;
  return `${names.brandName} · ${names.workspaceName}`;
}

export function formatDue(value: string | null, locale: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString(locale, {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
