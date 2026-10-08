"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Lightbulb } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useActiveBrand } from "@/lib/brands/active-brand-context";
import PageFrame from "@/components/layout/PageFrame";
import PageHeader from "@/components/layout/PageHeader";
import type { EquipeIdeaJson } from "@/lib/equipe/api";
import { decideEquipeIdea, EquipeCommandError } from "@/lib/equipe/commands";
import {
  useEquipeAccounts,
  useEquipeAccountSelection,
  useEquipeIdeas,
  useInvalidateEquipe,
} from "@/lib/equipe/use-equipe";
import EquipeTopActions from "./EquipeTopActions";
import EquipeEmptyScreen from "./EquipeEmptyScreen";
import {
  EquipeAccountSwitcher,
  EquipeDisabledNotice,
  EquipeEmptyAccounts,
  EquipeErrorNotice,
  EquipeLoading,
  isDisabledError,
} from "./EquipeAccountStates";
import { formatDateTime } from "./equipe-format";

// Estrategista proposals (C2) with a detail panel. Open ideas are decided
// here: approving echoes the server-provided versionHash and generates the
// new Plan/Mandate version straight away; rejecting takes an optional
// reason. "Conversar" leads to the conversation.

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

function decideMessage(error: unknown, t: (key: string) => string): string {
  if (error instanceof EquipeCommandError) {
    if (error.code === "stale_version") return t("staleVersion");
    if (error.status === 403) return t("forbidden");
    if (error.status === 409 && error.detail) return error.detail;
  }
  return t("decideError");
}

function IdeaDecision({ accountId, idea }: { accountId: string; idea: EquipeIdeaJson }) {
  const t = useTranslations("equipe.ideas");
  const invalidate = useInvalidateEquipe(accountId);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");

  if (idea.status !== "proposed" || !idea.versionHash) return null;
  const versionHash = idea.versionHash;
  const run = async (decision: "approve" | "reject", done: string): Promise<boolean> => {
    if (isPending) return false;
    setIsPending(true);
    setError(null);
    try {
      await decideEquipeIdea(accountId, {
        ideaId: idea.id,
        decision,
        expectedVersionHash: versionHash,
        ...(decision === "reject" && reason.trim() ? { reason: reason.trim() } : {}),
      });
      toast.success(done);
      setRejecting(false);
      setReason("");
      invalidate();
      return true;
    } catch (err) {
      setError(decideMessage(err, t));
      invalidate();
      return false;
    } finally {
      setIsPending(false);
    }
  };

  return (
    <div className="flex flex-col gap-2" data-testid="idea-decision">
      <p className="text-xs text-[var(--text-secondary)]">{t("decideExplainer")}</p>
      {error ? (
        <p className="text-xs text-[var(--danger-text)]" role="alert" data-testid="idea-decide-error">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="default"
          size="sm"
          disabled={isPending}
          onClick={() => void run("approve", t("approved"))}
          data-testid="idea-approve"
        >
          {t("approve")}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isPending}
          onClick={() => setRejecting((open) => !open)}
          data-testid="idea-reject-toggle"
        >
          {t("reject")}
        </Button>
      </div>
      {rejecting ? (
        <div className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-[var(--border-subtle)] p-3">
          <Textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={2}
            placeholder={t("reasonOptional")}
            aria-label={t("reasonOptional")}
            data-testid="idea-reject-reason"
          />
          <div>
            <Button
              type="button"
              variant="default"
              size="sm"
              disabled={isPending}
              onClick={() => void run("reject", t("rejected"))}
              data-testid="idea-reject-send"
            >
              {t("rejectConfirm")}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function IdeaDetail({ accountId, idea }: { accountId: string; idea: EquipeIdeaJson }) {
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
        <IdeaDecision accountId={accountId} idea={idea} />
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

function IdeasBoard({ accountId, ideas }: { accountId: string; ideas: EquipeIdeaJson[] }) {
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
    params.set("account", accountId);
    params.set("idea", ideaId);
    router.replace(`/ideas?${params.toString()}`, { scroll: false });
  };
  const closeIdea = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("account", accountId);
    params.delete("idea");
    const query = params.toString();
    router.replace(query ? `/ideas?${query}` : "/ideas", { scroll: false });
  };

  if (ordered.length === 0) {
    return (
      <div data-testid="ideas-empty">
        <p className="sr-only">{t("empty")}</p>
        <EquipeEmptyScreen surface="ideas" />
      </div>
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
          {selected ? <IdeaDetail accountId={accountId} idea={selected} /> : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function IdeasView() {
  const t = useTranslations("equipe.ideas");
  const accountsQuery = useEquipeAccounts();
  const accounts = accountsQuery.data?.accounts;
  const { selected, select } = useEquipeAccountSelection("/ideas", accounts);
  // In the rail the brand is chosen at the top (spec 2026-10-07 §3), so the screen offers no account switcher.
  const inRail = useActiveBrand() !== undefined;
  const list = accounts ?? [];
  const ideasQuery = useEquipeIdeas(selected);

  return (
    <PageFrame width="reading">
      <PageHeader
        title={t("title")}
        description={t("subtitle")}
        actions={<EquipeTopActions accountId={selected} />}
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
        {accountsQuery.data && list.length === 0 ? <EquipeEmptyAccounts /> : null}
        {accountsQuery.data && selected && !inRail ? (
          <div className="mb-3">
            <EquipeAccountSwitcher
              accounts={list}
              accountId={selected}
              onSelect={select}
            />
          </div>
        ) : null}
        {selected && ideasQuery.isLoading ? <EquipeLoading /> : null}
        {selected && ideasQuery.error ? (
          <EquipeErrorNotice onRetry={() => void ideasQuery.refetch()} />
        ) : null}
        {selected && ideasQuery.data ? (
          <IdeasBoard accountId={selected} ideas={ideasQuery.data.ideas} />
        ) : null}
      </div>
    </PageFrame>
  );
}
