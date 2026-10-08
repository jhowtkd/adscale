"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { useActiveBrand } from "@/lib/brands/active-brand-context";
import PageFrame from "@/components/layout/PageFrame";
import PageHeader from "@/components/layout/PageHeader";
import type { ClientPipelineJson, PipelineItemJson } from "@/lib/equipe/api";
import {
  defaultEquipeAccountId,
  useEquipeAccounts,
  useEquipeAccountState,
  useEquipeAccountSelection,
  useEquipeItemAccount,
  useEquipePipeline,
} from "@/lib/equipe/use-equipe";
import EquipeTopActions from "./EquipeTopActions";
import {
  EquipeAccountSwitcher,
  EquipeEmptyAccounts,
  EquipeErrorNotice,
  EquipeLoading,
} from "./EquipeAccountStates";
import EquipeEmptyScreen from "./EquipeEmptyScreen";
import PipelineCard from "./PipelineCard";
import BatchApprovalDialog from "./BatchApprovalDialog";
import ItemOverlay from "./ItemOverlay";

// The client pipeline (C5): Em produção / Precisa de você / Agendado /
// Publicado, each card carrying the single state pill from the API. "Revisar"
// opens the batch dialog; an item opens as an overlay via ?item=<id>.
// Terminal misses (janela perdida, falha) sit in a strip below the columns.

const COLUMN_ORDER = ["in_progress", "needs_you", "scheduled", "finished"] as const;

function FrontChips({ accountId }: { accountId: string }) {
  const tFronts = useTranslations("equipe.fronts");
  const tFrontStatus = useTranslations("equipe.frontStatuses");
  const { data } = useEquipeAccountState(accountId);
  const fronts = useMemo(
    () => [...(data?.fronts ?? [])].sort((a, b) => a.key.localeCompare(b.key)),
    [data],
  );
  if (fronts.length === 0) return null;
  return (
    <span className="flex flex-wrap items-center gap-1.5" data-testid="pipeline-front-chips">
      {fronts.map((front) => (
        <span
          key={front.id}
          className="rounded-full border border-[var(--border-subtle)] bg-[var(--surface-base)] px-2 py-0.5 text-xs text-[var(--text-secondary)]"
        >
          {tFronts.has(front.key) ? tFronts(front.key) : front.key} ·{" "}
          {tFrontStatus.has(front.status) ? tFrontStatus(front.status) : front.status}
        </span>
      ))}
    </span>
  );
}

function PipelineColumn({
  title,
  count,
  action,
  children,
  testId,
}: {
  title: string;
  count: number;
  action?: React.ReactNode;
  children: React.ReactNode;
  testId: string;
}) {
  return (
    <section
      aria-label={title}
      data-testid={testId}
      className="flex min-w-0 flex-col rounded-[var(--radius-panel)] border border-[var(--border-subtle)] bg-[var(--surface-base)] p-3"
    >
      <header className="mb-2 flex items-center justify-between gap-2 px-1">
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">
          {title}{" "}
          <span className="font-normal text-[var(--text-muted)]" data-testid={`${testId}-count`}>
            {count}
          </span>
        </h2>
        {action}
      </header>
      <div className="flex flex-col gap-2">{children}</div>
    </section>
  );
}

function PipelineBoard({ accountId, pipeline }: { accountId: string; pipeline: ClientPipelineJson }) {
  const t = useTranslations("equipe.pipeline");
  const router = useRouter();
  const searchParams = useSearchParams();
  const itemId = searchParams.get("item");
  const [batchOpen, setBatchOpen] = useState(false);

  const byId = useMemo(() => new Map(pipeline.items.map((view) => [view.item.id, view])), [pipeline]);
  const columnItems = useMemo(() => {
    const entries = new Map<string, PipelineItemJson[]>();
    for (const column of pipeline.columns) {
      entries.set(
        column.key,
        column.itemIds.flatMap((id) => {
          const view = byId.get(id);
          return view ? [view] : [];
        }),
      );
    }
    return entries;
  }, [pipeline, byId]);

  const needsYou = useMemo(() => columnItems.get("needs_you") ?? [], [columnItems]);
  const missed = columnItems.get("missed") ?? [];
  const batchTitle = useMemo(() => {
    const titles = new Set(
      needsYou.map((view) => view.batch?.title).filter((title): title is string => Boolean(title)),
    );
    return titles.size === 1 ? [...titles][0] : undefined;
  }, [needsYou]);

  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {COLUMN_ORDER.map((key) => {
          const views = columnItems.get(key) ?? [];
          return (
            <PipelineColumn
              key={key}
              title={t(`column_${key}`)}
              count={views.length}
              testId={`pipeline-column-${key}`}
              action={
                key === "needs_you" && views.length > 0 ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setBatchOpen(true)}
                    data-testid="pipeline-review-batch"
                  >
                    {t("review")}
                  </Button>
                ) : undefined
              }
            >
              {views.length === 0 ? (
                <p className="px-1 py-2 text-xs text-[var(--text-muted)]">{t("columnEmpty")}</p>
              ) : (
                views.map((view) => (
                  <PipelineCard key={view.item.id} view={view} accountId={accountId} />
                ))
              )}
            </PipelineColumn>
          );
        })}
      </div>

      {missed.length > 0 ? (
        <section aria-label={t("column_missed")} data-testid="pipeline-column-missed" className="mt-3">
          <h2 className="mb-2 px-1 text-sm font-semibold text-[var(--text-primary)]">
            {t("column_missed")}{" "}
            <span className="font-normal text-[var(--text-muted)]">{missed.length}</span>
          </h2>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {missed.map((view) => (
              <PipelineCard key={view.item.id} view={view} accountId={accountId} />
            ))}
          </div>
        </section>
      ) : null}

      <BatchApprovalDialog
        accountId={accountId}
        items={needsYou}
        open={batchOpen}
        onOpenChange={setBatchOpen}
        batchTitle={batchTitle}
      />
      <ItemOverlay
        accountId={accountId}
        itemId={itemId}
        open={Boolean(itemId)}
        onOpenChange={(open) => {
          if (!open) {
            const params = new URLSearchParams(searchParams.toString());
            params.delete("item");
            const query = params.toString();
            router.replace(query ? `/pipeline?${query}` : "/pipeline", { scroll: false });
          }
        }}
      />
    </>
  );
}

export default function PipelineView() {
  const t = useTranslations("equipe.pipeline");
  const router = useRouter();
  const searchParams = useSearchParams();
  const brand = useActiveBrand();
  const accountsQuery = useEquipeAccounts();
  const accounts = accountsQuery.data?.accounts;
  const itemId = searchParams.get("item");
  const paramValid = Boolean(
    searchParams.get("account") &&
      accounts?.some((account) => account.id === searchParams.get("account")),
  );
  // Bare ?item= links (notifications) carry no account: resolve the item's
  // account first, then stamp it into the URL. Unknown ids fall back to
  // the default account and the overlay reports the miss.
  const needsResolve = Boolean(itemId && accounts && accounts.length > 0 && !paramValid);
  const resolution = useEquipeItemAccount(accounts, itemId, needsResolve);
  const { selected: selectedByParam, select } = useEquipeAccountSelection(
    "/pipeline",
    needsResolve ? undefined : accounts,
  );
  const selected = needsResolve
    ? resolution.isFetched
      ? (resolution.data ?? defaultEquipeAccountId(accounts ?? [], brand))
      : null
    : selectedByParam;
  useEffect(() => {
    if (!needsResolve || !resolution.isFetched) return;
    const params = new URLSearchParams(searchParams.toString());
    const resolved = resolution.data ?? defaultEquipeAccountId(accounts ?? [], brand);
    if (!resolved) return;
    params.set("account", resolved);
    router.replace(`/pipeline?${params.toString()}`, { scroll: false });
  }, [needsResolve, resolution.isFetched, resolution.data, accounts, brand, router, searchParams]);
  const pipelineQuery = useEquipePipeline(selected);
  const list = accounts ?? [];
  // In the rail the brand is chosen at the top (spec 2026-10-07 §3): no account switcher, and a brand that has no account
  // yet sees the screen's empty state instead of an empty page.
  const inRail = brand !== undefined;
  const resolving = needsResolve && !resolution.isFetched;

  return (
    <PageFrame width="fluid">
      <PageHeader
        title={t("title")}
        meta={selected ? <FrontChips accountId={selected} /> : undefined}
        actions={<EquipeTopActions accountId={selected} />}
      />
      <div className="py-4">
        {accountsQuery.isLoading ? <EquipeLoading /> : null}
        {accountsQuery.error ? <EquipeErrorNotice onRetry={() => void accountsQuery.refetch()} /> : null}
        {accountsQuery.data && list.length === 0 && !inRail ? <EquipeEmptyAccounts /> : null}
        {inRail && accountsQuery.data && !selected && !resolving ? <EquipeEmptyScreen surface="creations" /> : null}
        {accountsQuery.data && selected && !inRail ? (
          <div className="mb-3">
            <EquipeAccountSwitcher
              accounts={list}
              accountId={selected}
              onSelect={select}
            />
          </div>
        ) : null}
        {resolving ? <EquipeLoading /> : null}
        {selected && pipelineQuery.isLoading ? <EquipeLoading /> : null}
        {selected && pipelineQuery.error ? (
          <EquipeErrorNotice onRetry={() => void pipelineQuery.refetch()} />
        ) : null}
        {selected && pipelineQuery.data ? (
          <PipelineBoard accountId={selected} pipeline={pipelineQuery.data} />
        ) : null}
      </div>
    </PageFrame>
  );
}
