"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Lightbulb } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import PageFrame from "@/components/layout/PageFrame";
import PageHeader from "@/components/layout/PageHeader";
import type { EquipeIdeaJson } from "@/lib/equipe/api";
import { useEquipeAccounts, useEquipeIdeas } from "@/lib/equipe/use-equipe";
import EquipeTopActions from "./EquipeTopActions";
import {
  EquipeAccountSwitcher,
  EquipeDisabledNotice,
  EquipeEmptyAccounts,
  EquipeErrorNotice,
  EquipeLoading,
  isDisabledError,
} from "./EquipeAccountStates";
import { formatDateTime } from "./equipe-format";

// Estrategista proposals (C2) with a detail panel. The API exposes no idea
// decision command, so this screen is read-only: accepting an idea happens
// when its plan or mandate proposal arrives for approval, and the panel says
// so. "Conversar" leads to the conversation.

function ideaText(idea: EquipeIdeaJson): { title: string; summary: string | null; rest: Array<[string, string]> } {
  const payload = idea.payload ?? {};
  const title =
    typeof payload.title === "string" && payload.title.trim() ? payload.title : "Ideia";
  const summary = typeof payload.summary === "string" && payload.summary.trim() ? payload.summary : null;
  const rest: Array<[string, string]> = [];
  for (const [key, value] of Object.entries(payload)) {
    if (key === "title" || key === "summary") continue;
    if (value === null || value === undefined) continue;
    const label = key.replace(/_/g, " ");
    const text =
      typeof value === "string" || typeof value === "number" || typeof value === "boolean"
        ? String(value)
        : JSON.stringify(value);
    rest.push([label, text]);
  }
  return { title, summary, rest };
}

function IdeaKindPill({ kind }: { kind: string }) {
  const t = useTranslations("equipe.ideas");
  const key = `kind_${kind}`;
  return (
    <Badge variant="neutral" data-testid="idea-kind-pill">
      {t.has(key) ? t(key) : kind}
    </Badge>
  );
}

function IdeaStatusPill({ status }: { status: string }) {
  const t = useTranslations("equipe.ideas");
  const key = `status_${status}`;
  const tone = status === "accepted" ? "success" : status === "rejected" ? "neutral" : "info";
  return (
    <Badge variant={tone} data-testid="idea-status-pill">
      {t.has(key) ? t(key) : status}
    </Badge>
  );
}

function IdeaDetail({ idea }: { idea: EquipeIdeaJson }) {
  const t = useTranslations("equipe.ideas");
  const locale = useLocale();
  const { title, summary, rest } = ideaText(idea);
  const when = formatDateTime(idea.createdAt, locale);
  return (
    <>
      <DialogHeader>
        <div className="flex flex-wrap items-center gap-2">
          <IdeaKindPill kind={idea.kind} />
          <IdeaStatusPill status={idea.status} />
        </div>
        <DialogTitle className="mt-2" data-testid="idea-detail-title">
          {title}
        </DialogTitle>
        <DialogDescription>
          {[t("strategistByline"), when].filter(Boolean).join(" · ")}
        </DialogDescription>
      </DialogHeader>
      <DialogBody className="flex flex-col gap-3">
        {summary ? (
          <p className="text-sm text-[var(--text-primary)]" data-testid="idea-detail-summary">
            {summary}
          </p>
        ) : null}
        {rest.length > 0 ? (
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--text-muted)]">
              {t("whatChanges")}
            </p>
            <dl className="mt-1 divide-y divide-[var(--border-subtle)]">
              {rest.map(([label, value]) => (
                <div key={label} className="flex items-baseline justify-between gap-3 py-1.5 text-sm">
                  <dt className="shrink-0 text-[var(--text-muted)]">{label}</dt>
                  <dd className="text-right text-[var(--text-primary)]">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        ) : null}
        {(idea.resultingPlanVersion ?? idea.resultingMandateVersion) ? (
          <p className="text-xs text-[var(--text-muted)]">
            {[
              idea.resultingPlanVersion ? t("resultingPlan", { version: idea.resultingPlanVersion }) : null,
              idea.resultingMandateVersion
                ? t("resultingMandate", { version: idea.resultingMandateVersion })
                : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        ) : null}
        <p
          className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-inset)] px-3 py-2 text-xs text-[var(--text-secondary)]"
          data-testid="idea-readonly-note"
        >
          {t("readOnlyNote")}
        </p>
        <div>
          <Link
            href="/assistant"
            className="inline-flex items-center rounded-[var(--radius-control)] bg-[var(--action-primary-bg)] px-4 py-2 text-sm font-medium text-[var(--action-primary-text)]"
            data-testid="idea-talk"
          >
            {t("talk")}
          </Link>
        </div>
      </DialogBody>
    </>
  );
}

function IdeasBoard({ ideas }: { ideas: EquipeIdeaJson[] }) {
  const t = useTranslations("equipe.ideas");
  const locale = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedId = searchParams.get("idea");

  const ordered = useMemo(
    () => [...ideas].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [ideas],
  );
  const selected = selectedId ? (ordered.find((idea) => idea.id === selectedId) ?? null) : null;
  const openIdea = (ideaId: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("idea", ideaId);
    router.replace(`/ideas?${params.toString()}`, { scroll: false });
  };
  const closeIdea = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("idea");
    const query = params.toString();
    router.replace(query ? `/ideas?${query}` : "/ideas", { scroll: false });
  };

  if (ordered.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-[var(--text-muted)]" data-testid="ideas-empty">
        {t("empty")}
      </p>
    );
  }

  return (
    <>
      <ul className="divide-y divide-[var(--border-subtle)]" data-testid="ideas-list">
        {ordered.map((idea) => {
          const { title, summary } = ideaText(idea);
          const when = formatDateTime(idea.createdAt, locale);
          return (
            <li key={idea.id}>
              <button
                type="button"
                onClick={() => openIdea(idea.id)}
                data-testid={`idea-row-${idea.id}`}
                className="flex w-full items-center gap-3 py-3 text-left"
              >
                <span
                  aria-hidden="true"
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-raised)] text-[var(--text-muted)]"
                >
                  <Lightbulb size={18} />
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="truncate text-sm font-medium text-[var(--text-primary)]">
                    {title}
                  </span>
                  {summary ? (
                    <span className="truncate text-xs text-[var(--text-muted)]">{summary}</span>
                  ) : null}
                  <span className="flex flex-wrap items-center gap-1.5">
                    <IdeaKindPill kind={idea.kind} />
                    <IdeaStatusPill status={idea.status} />
                    {when ? (
                      <span className="text-xs text-[var(--text-muted)]">{when}</span>
                    ) : null}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <Dialog open={Boolean(selected)} onOpenChange={(open) => { if (!open) closeIdea(); }}>
        <DialogContent size="md" data-testid="idea-detail">
          {selected ? <IdeaDetail idea={selected} /> : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function IdeasView() {
  const t = useTranslations("equipe.ideas");
  const accountsQuery = useEquipeAccounts();
  const [accountId, setAccountId] = useState<string | null>(null);
  const accounts = accountsQuery.data?.accounts ?? [];
  const selected = accountId ?? accounts[0]?.id ?? null;
  const ideasQuery = useEquipeIdeas(selected);

  return (
    <PageFrame width="reading">
      <PageHeader
        title={t("title")}
        description={t("subtitle")}
        actions={<EquipeTopActions active="painel" accountId={selected} />}
      />
      <div className="py-4">
        {accountsQuery.isLoading ? <EquipeLoading /> : null}
        {accountsQuery.error ? (
          isDisabledError(accountsQuery.error) ? (
            <EquipeDisabledNotice />
          ) : (
            <EquipeErrorNotice onRetry={() => void accountsQuery.refetch()} />
          )
        ) : null}
        {accountsQuery.data && accounts.length === 0 ? <EquipeEmptyAccounts /> : null}
        {accountsQuery.data && selected ? (
          <div className="mb-3">
            <EquipeAccountSwitcher
              accounts={accounts}
              accountId={selected}
              onSelect={setAccountId}
            />
          </div>
        ) : null}
        {selected && ideasQuery.isLoading ? <EquipeLoading /> : null}
        {selected && ideasQuery.error ? (
          <EquipeErrorNotice onRetry={() => void ideasQuery.refetch()} />
        ) : null}
        {selected && ideasQuery.data ? (
          <IdeasBoard ideas={ideasQuery.data.ideas} />
        ) : null}
      </div>
    </PageFrame>
  );
}
