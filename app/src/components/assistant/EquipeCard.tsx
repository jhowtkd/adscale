"use client";
import { HANDOFF_STEPS, type HandoffStep } from "@/server/equipe/domain/handoff";
import HandoffCard from "./HandoffCard";
import DiagnosisCard from "./DiagnosisCard";
import { filterSuggestions } from "@/lib/equipe/suggestions";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type {
  EquipeCardItemRef,
  EquipeCardPayload,
} from "@/server/repositories/assistant-types";
import {
  approveEquipeBatch,
  approveEquipeItem,
} from "@/lib/equipe/commands";

/** Defensive parse: server payloads are untyped records at the boundary. */
export function parseEquipeCard(payload: Record<string, unknown>): EquipeCardPayload | null {
  const kind = payload.kind;
  if (kind === "handoff") {
    if (typeof payload.accountId !== "string" || !payload.accountId || typeof payload.handoffId !== "string" || !payload.handoffId || !HANDOFF_STEPS.includes(payload.step as HandoffStep)) return null;
    return { kind, accountId: payload.accountId, handoffId: payload.handoffId, step: payload.step as HandoffStep, title: typeof payload.title === "string" ? payload.title : "", items: [] };
  }
  if (kind === "diagnosis") {
    if (typeof payload.accountId !== "string" || !payload.accountId) return null;
    const status = payload.status === "ready" || payload.status === "insufficient" || payload.status === "failed" ? payload.status : null;
    if (!status) return null;
    const strings = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
    if (status !== "failed" && (typeof payload.documentId !== "string" || !payload.documentId || typeof payload.summary !== "string" || !Array.isArray(payload.opportunities))) return null;
    return {
      kind, status, accountId: payload.accountId, title: typeof payload.title === "string" ? payload.title : "", items: [],
      ...(typeof payload.documentId === "string" ? { documentId: payload.documentId } : {}),
      ...(typeof payload.brand === "string" ? { brand: payload.brand } : {}),
      ...(typeof payload.summary === "string" ? { summary: payload.summary } : {}),
      channels: Array.isArray(payload.channels) ? payload.channels.flatMap(entry => {
        const channel = entry as Record<string, unknown> | null;
        return channel && typeof channel.source === "string" && typeof channel.message === "string" && typeof channel.name === "string"
          ? [{ name: channel.name, source: channel.source, message: channel.message }] : [];
      }) : [],
      opportunities: Array.isArray(payload.opportunities) ? payload.opportunities.flatMap(entry => {
        const opportunity = entry as Record<string, unknown> | null;
        return opportunity && typeof opportunity.title === "string" ? [{ title: opportunity.title, sources: strings(opportunity.sources) }] : [];
      }) : [],
      notFound: strings(payload.notFound),
      suggestions: filterSuggestions(payload.suggestions),
    };
  }
  if (kind !== "item" && kind !== "batch" && kind !== "idea") return null;
  if (typeof payload.accountId !== "string" || !payload.accountId) return null;
  if (typeof payload.title !== "string" || !payload.title) return null;
  if (!Array.isArray(payload.items)) return null;
  const items: EquipeCardItemRef[] = [];
  for (const entry of payload.items) {
    if (!entry || typeof entry !== "object") return null;
    const ref = entry as Record<string, unknown>;
    if (typeof ref.itemId !== "string" || !ref.itemId) return null;
    if (typeof ref.versionHash !== "string" || !ref.versionHash) return null;
    items.push({
      itemId: ref.itemId,
      versionHash: ref.versionHash,
      ...(typeof ref.title === "string" ? { title: ref.title } : {}),
      ...(typeof ref.scheduledFor === "string" ? { scheduledFor: ref.scheduledFor } : {}),
    });
  }
  if (kind !== "idea" && items.length === 0) return null;
  if (kind === "idea" && (typeof payload.ideaId !== "string" || !payload.ideaId)) return null;
  return {
    kind,
    accountId: payload.accountId,
    title: payload.title,
    ...(typeof payload.batchId === "string" ? { batchId: payload.batchId } : {}),
    ...(typeof payload.ideaId === "string" ? { ideaId: payload.ideaId } : {}),
    ...(typeof payload.approveByAt === "string" ? { approveByAt: payload.approveByAt } : {}),
    ...(typeof payload.summary === "string" ? { summary: payload.summary } : {}),
    items,
    ...(Array.isArray(payload.excluded)
      ? {
          excluded: payload.excluded.flatMap((entry) => {
            if (!entry || typeof entry !== "object") return [];
            const ref = entry as Record<string, unknown>;
            if (typeof ref.itemId !== "string" || typeof ref.reason !== "string") return [];
            return [{ itemId: ref.itemId, reason: ref.reason }];
          }),
        }
      : {}),
  };
}

function shortHash(versionHash: string): string {
  return versionHash.length > 8 ? `${versionHash.slice(0, 8)}…` : versionHash;
}

function formatDateTime(iso: string): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString(undefined, {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function CardShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div
      className="max-w-[85%] rounded-[var(--radius-panel)] border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-4 py-3 text-sm text-[var(--text-primary)]"
      data-testid="equipe-card"
    >
      <p className="text-sm font-semibold">{title}</p>
      {subtitle ? <p className="mt-0.5 text-xs text-[var(--text-muted)]">{subtitle}</p> : null}
      <div className="mt-2 flex flex-col gap-2">{children}</div>
    </div>
  );
}

function ItemRow({ item, accountId }: { item: EquipeCardItemRef; accountId: string }) {
  const t = useTranslations("assistant.equipe");
  const scheduled = item.scheduledFor ? formatDateTime(item.scheduledFor) : null;
  return (
    <div
      className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-base)] px-3 py-2"
      data-testid="equipe-card-item"
    >
      <div className="min-w-0">
        <p className="truncate text-[13px] font-medium">{item.title ?? item.itemId}</p>
        <p className="text-xs text-[var(--text-muted)]">
          {[scheduled, t("versionShort", { hash: shortHash(item.versionHash) })]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>
      <Link
        href={`/pipeline?account=${accountId}&item=${item.itemId}`}
        className="shrink-0 rounded-[var(--radius-md)] border border-[var(--border-strong)] px-2.5 py-1 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--surface-inset)]"
        data-testid="equipe-card-review"
      >
        {t("review")}
      </Link>
    </div>
  );
}

function ApprovalConfirmation({
  card,
  onDone,
  onBack,
}: {
  card: EquipeCardPayload;
  onDone: () => void;
  onBack: () => void;
}) {
  const t = useTranslations("assistant.equipe");
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [approved, setApproved] = useState(false);

  const handleConfirm = async () => {
    if (isPending || approved) return;
    setIsPending(true);
    setError(null);
    try {
      if (card.kind === "item") {
        await approveEquipeItem(accountIdOf(card), {
          itemId: card.items[0]!.itemId,
          versionHash: card.items[0]!.versionHash,
        });
      } else {
        await approveEquipeBatch(
          accountIdOf(card),
          card.items.map((item) => ({ itemId: item.itemId, versionHash: item.versionHash })),
        );
      }
      setApproved(true);
      onDone();
    } catch {
      setError(t("approveError"));
    } finally {
      setIsPending(false);
    }
  };

  return (
    <div
      className="rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-[var(--surface-base)] px-3 py-2"
      data-testid="equipe-card-confirm"
      role="dialog"
      aria-label={t("confirmTitle")}
    >
      <p className="text-[13px] font-semibold">
        {card.kind === "item"
          ? t("confirmTitle")
          : t("confirmBatchTitle", { count: card.items.length })}
      </p>
      <p className="mt-1 text-xs text-[var(--text-secondary)]">{t("confirmClosedList")}</p>
      <ul className="mt-1 flex flex-col gap-1">
        {card.items.map((item) => (
          <li
            key={`${item.itemId}:${item.versionHash}`}
            className="flex items-center justify-between gap-2 text-xs"
            data-testid="equipe-card-confirm-item"
          >
            <span className="truncate">{item.title ?? item.itemId}</span>
            <span className="shrink-0 text-[var(--text-muted)]">
              {t("versionShort", { hash: shortHash(item.versionHash) })}
            </span>
          </li>
        ))}
      </ul>
      {card.excluded && card.excluded.length > 0 ? (
        <div className="mt-2 rounded-[var(--radius-md)] border border-dashed border-[var(--border-strong)] px-2 py-1.5 text-xs">
          <p className="font-medium">
            {t("confirmExcluded")} ({card.excluded.length})
          </p>
          <ul className="mt-0.5 text-[var(--text-secondary)]">
            {card.excluded.map((entry) => (
              <li key={entry.itemId}>
                {entry.itemId.slice(0, 8)}… — {entry.reason}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <p className="mt-2 text-xs text-[var(--text-muted)]">{t("confirmNote")}</p>
      {approved ? (
        <p className="mt-2 text-xs font-medium" data-testid="equipe-card-approved">
          {t("approvedOk")}
        </p>
      ) : (
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={isPending}
            className={cn(
              "rounded-[var(--radius-md)] bg-[var(--accent-primary)] px-3 py-1.5 text-xs font-semibold text-[var(--text-on-accent)]",
              isPending && "opacity-60",
            )}
            data-testid="equipe-card-confirm-button"
          >
            {isPending ? t("approving") : t("confirm")}
          </button>
          <button
            type="button"
            onClick={onBack}
            disabled={isPending}
            className="rounded-[var(--radius-md)] border border-[var(--border-strong)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)]"
            data-testid="equipe-card-back-button"
          >
            {t("back")}
          </button>
        </div>
      )}
      {error ? (
        <p className="mt-1 text-xs text-[var(--danger-text)]" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function accountIdOf(card: EquipeCardPayload): string {
  return card.accountId;
}

export default function EquipeCard({
  card,
  equipeEnabled,
  threadId,
  latest,
  disabled,
  onSuggestion,
  hideLine,
}: {
  card: EquipeCardPayload;
  equipeEnabled: boolean;
  threadId?: string | null;
  latest?: boolean;
  disabled?: boolean;
  onSuggestion?: (text: string) => void;
  /** The opening line already says what the first handoff card asks, so the card leaves its own line out. */
  hideLine?: boolean;
}) {
  const t = useTranslations("assistant.equipe");
  const [confirming, setConfirming] = useState(false);
  const [approved, setApproved] = useState(false);

  const approveBy = card.approveByAt ? formatDateTime(card.approveByAt) : null;

  if (card.kind === "handoff" && card.handoffId && card.step) return <HandoffCard accountId={card.accountId} handoffId={card.handoffId} step={card.step} threadId={threadId} disabled={!equipeEnabled} latest={latest} hideLine={hideLine} />;

  if (card.kind === "diagnosis") return <DiagnosisCard card={card} latest={latest} disabled={disabled || !equipeEnabled} onSuggestion={onSuggestion} />;

  if (card.kind === "idea") {
    return (
      <CardShell title={card.title} subtitle={card.summary ?? null}>
        <p className="text-xs text-[var(--text-muted)]" data-testid="equipe-card-idea">
          {card.summary ?? card.title}
        </p>
        {card.ideaId ? (
          <Link
            href={`/ideas?account=${card.accountId}&idea=${card.ideaId}`}
            className="w-fit rounded-[var(--radius-md)] border border-[var(--border-strong)] px-2.5 py-1 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--surface-inset)]"
            data-testid="equipe-card-idea-link"
          >
            {t("viewIdea")}
          </Link>
        ) : null}
      </CardShell>
    );
  }

  return (
    <CardShell
      title={card.title}
      subtitle={approveBy ? t("approveBy", { date: approveBy }) : null}
    >
      {card.items.map((item) => (
        <ItemRow key={item.itemId} item={item} accountId={card.accountId} />
      ))}
      {equipeEnabled && !approved ? (
        confirming ? (
          <ApprovalConfirmation
            card={card}
            onDone={() => setApproved(true)}
            onBack={() => setConfirming(false)}
          />
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="rounded-[var(--radius-md)] bg-[var(--accent-primary)] px-3 py-1.5 text-xs font-semibold text-[var(--text-on-accent)]"
            data-testid="equipe-card-approve"
          >
            {card.kind === "item"
              ? t("approveItem")
              : t("approveBatch", { count: card.items.length })}
          </button>
        )
      ) : null}
      {approved ? (
        <p className="text-xs font-medium" data-testid="equipe-card-approved">
          {t("approvedOk")}
        </p>
      ) : null}
    </CardShell>
  );
}
