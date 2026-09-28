"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  approveEquipeBatch,
  parseBatchResults,
  type EquipeApprovalRef,
  type EquipeBatchItemResult,
} from "@/lib/equipe/commands";
import { currentVersionOf, itemImageUrl, type PipelineItemJson } from "@/lib/equipe/api";
import { useEquipeItemDetail, useInvalidateEquipe } from "@/lib/equipe/use-equipe";
import EquipeStatePill from "./EquipeStatePill";
import { captionTitle, formatDateTime, shortHash } from "./equipe-format";

// "Revisar" + "Aprovar os N prontos": the batch dialog lists everything that
// needs the client, confirms the CLOSED LIST of { itemId, versionHash } with
// the excluded items and their reasons, then shows the per-item result
// (approved / mudou desde que você abriu / not ready).

function BatchRow({
  accountId,
  view,
  showState,
}: {
  accountId: string;
  view: PipelineItemJson;
  showState: boolean;
}) {
  const t = useTranslations("equipe.batch");
  const locale = useLocale();
  const { data } = useEquipeItemDetail(accountId, view.item.id);
  const version = data ? currentVersionOf(data) : null;
  const image = itemImageUrl(view.item, version);
  const title = captionTitle(version?.caption, 60) ?? view.batch?.title ?? t("untitledItem");
  const when = formatDateTime(view.item.scheduledFor, locale);

  return (
    <div
      className="flex items-center gap-3 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-base)] px-3 py-2"
      data-testid={`batch-row-${view.item.id}`}
    >
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={image}
          alt=""
          loading="lazy"
          className="h-11 w-11 shrink-0 rounded-[var(--radius-md)] border border-[var(--border-subtle)] object-cover"
        />
      ) : (
        <span
          aria-hidden="true"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-inset)] text-[var(--text-muted)]"
        >
          <ImageIcon size={16} />
        </span>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="truncate text-[13px] font-medium text-[var(--text-primary)]">
          {when ? `${when} · ${title}` : title}
        </p>
        {showState ? (
          <span>
            <EquipeStatePill state={view.displayState} />
          </span>
        ) : (
          <p className="text-xs text-[var(--text-muted)]">
            {t("versionShort", { hash: shortHash(view.item.currentVersionHash ?? "") })}
          </p>
        )}
      </div>
      <Link
        href={`/pipeline?item=${view.item.id}`}
        className="shrink-0 rounded-[var(--radius-md)] border border-[var(--border-strong)] px-2.5 py-1 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--surface-inset)]"
        data-testid={`batch-review-${view.item.id}`}
      >
        {t("review")}
      </Link>
    </div>
  );
}

function ResultRow({ result, accountId }: { result: EquipeBatchItemResult; accountId: string }) {
  const t = useTranslations("equipe.batch");
  const { data } = useEquipeItemDetail(accountId, result.itemId);
  const version = data ? currentVersionOf(data) : null;
  const title = captionTitle(version?.caption, 60) ?? data?.batch?.title ?? t("untitledItem");
  const ok = result.outcome === "approved" || result.outcome === "already_decided";
  return (
    <div
      className="flex items-center gap-3 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-base)] px-3 py-2"
      data-testid={`batch-result-${result.itemId}`}
      data-outcome={result.outcome}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium text-[var(--text-primary)]">{title}</p>
        <p className="text-xs text-[var(--text-muted)]">{t(`outcome_${result.outcome}`)}</p>
      </div>
      {ok ? null : (
        <Link
          href={`/pipeline?item=${result.itemId}`}
          className="shrink-0 rounded-[var(--radius-md)] border border-[var(--border-strong)] px-2.5 py-1 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--surface-inset)]"
          data-testid={`batch-rereview-${result.itemId}`}
        >
          {t("reviewAgain")}
        </Link>
      )}
    </div>
  );
}

export default function BatchApprovalDialog({
  accountId,
  items,
  open,
  onOpenChange,
  batchTitle,
}: {
  accountId: string;
  items: PipelineItemJson[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  batchTitle?: string;
}) {
  const t = useTranslations("equipe.batch");
  const tStates = useTranslations("equipe.states");
  const invalidate = useInvalidateEquipe(accountId);
  const [step, setStep] = useState<"list" | "confirm" | "results">("list");
  const [closedList, setClosedList] = useState<EquipeApprovalRef[]>([]);
  const [results, setResults] = useState<EquipeBatchItemResult[]>([]);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready = useMemo(
    () =>
      items.filter(
        (view) => view.displayState === "ready" && view.item.currentVersionHash,
      ),
    [items],
  );
  const excluded = useMemo(() => items.filter((view) => !ready.includes(view)), [items, ready]);

  const startConfirm = () => {
    // Snapshot the closed list: exactly the ready items at their version now.
    setClosedList(
      ready.map((view) => ({ itemId: view.item.id, versionHash: view.item.currentVersionHash! })),
    );
    setError(null);
    setStep("confirm");
  };

  const confirm = async () => {
    if (isPending || closedList.length === 0) return;
    setIsPending(true);
    setError(null);
    try {
      const response = await approveEquipeBatch(accountId, closedList);
      setResults(parseBatchResults(response));
      setStep("results");
      invalidate();
    } catch {
      setError(t("approveError"));
    } finally {
      setIsPending(false);
    }
  };

  const close = (next: boolean) => {
    if (!next) {
      setStep("list");
      setResults([]);
      setError(null);
    }
    onOpenChange(next);
  };

  const approvedCount = results.filter(
    (r) => r.outcome === "approved" || r.outcome === "already_decided",
  ).length;

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent size="md" data-testid="batch-dialog">
        {step === "list" ? (
          <>
            <DialogHeader>
              <DialogTitle>{batchTitle ?? t("title")}</DialogTitle>
              <DialogDescription>
                {t("listSubtitle", { ready: ready.length, total: items.length })}
              </DialogDescription>
            </DialogHeader>
            <DialogBody className="flex flex-col gap-2">
              {items.length === 0 ? (
                <p className="py-4 text-center text-sm text-[var(--text-muted)]">{t("empty")}</p>
              ) : (
                items.map((view) => (
                  <BatchRow key={view.item.id} accountId={accountId} view={view} showState />
                ))
              )}
            </DialogBody>
            <DialogFooter>
              <Button
                type="button"
                variant="default"
                size="sm"
                disabled={ready.length === 0}
                onClick={startConfirm}
                data-testid="batch-approve-ready"
              >
                {t("approveReady", { count: ready.length })}
              </Button>
            </DialogFooter>
          </>
        ) : null}

        {step === "confirm" ? (
          <>
            <DialogHeader>
              <DialogTitle>{t("confirmTitle", { count: closedList.length })}</DialogTitle>
              <DialogDescription>{t("confirmClosedList")}</DialogDescription>
            </DialogHeader>
            <DialogBody className="flex flex-col gap-2">
              {closedList.map((ref) => {
                const view = items.find((v) => v.item.id === ref.itemId);
                return view ? (
                  <BatchRow
                    key={ref.itemId}
                    accountId={accountId}
                    view={view}
                    showState={false}
                  />
                ) : null;
              })}
              {excluded.length > 0 ? (
                <div
                  className="rounded-[var(--radius-md)] border border-dashed border-[var(--border-strong)] px-3 py-2"
                  data-testid="batch-excluded"
                >
                  <p className="text-xs font-medium text-[var(--text-primary)]">
                    {t("excluded", { count: excluded.length })}
                  </p>
                  <ul className="mt-1 flex flex-col gap-0.5 text-xs text-[var(--text-secondary)]">
                    {excluded.map((view) => (
                      <li key={view.item.id} data-testid={`batch-excluded-${view.item.id}`}>
                        {tStates.has(view.displayState)
                          ? tStates(view.displayState)
                          : view.displayState}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <p className="text-xs text-[var(--text-muted)]">{t("confirmNote")}</p>
              {error ? (
                <p className="text-xs text-[var(--danger-text)]" role="alert">
                  {error}
                </p>
              ) : null}
            </DialogBody>
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={isPending}
                onClick={() => setStep("list")}
                data-testid="batch-back"
              >
                {t("back")}
              </Button>
              <Button
                type="button"
                variant="default"
                size="sm"
                disabled={isPending || closedList.length === 0}
                onClick={() => void confirm()}
                data-testid="batch-confirm"
              >
                {isPending ? t("approving") : t("confirm", { count: closedList.length })}
              </Button>
            </DialogFooter>
          </>
        ) : null}

        {step === "results" ? (
          <>
            <DialogHeader>
              <DialogTitle>
                {t("resultsTitle", {
                  approved: approvedCount,
                  total: results.length,
                })}
              </DialogTitle>
              <DialogDescription>{t("resultsSubtitle")}</DialogDescription>
            </DialogHeader>
            <DialogBody className="flex flex-col gap-2">
              {results.map((result) => (
                <ResultRow key={result.itemId} result={result} accountId={accountId} />
              ))}
            </DialogBody>
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setStep("list")}
                data-testid="batch-back-to-list"
              >
                {t("backToList")}
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
