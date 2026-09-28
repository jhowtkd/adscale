"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ImageIcon } from "lucide-react";
import { toast } from "sonner";
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
import {
  approveEquipeItem,
  cancelEquipeScheduled,
  confirmEquipeBusinessFact,
  declineEquipePublish,
  editEquipeCaption,
  reportEquipeItemProblem,
  requestEquipeAdjustment,
  EquipeCommandError,
  type AdjustmentCategory,
} from "@/lib/equipe/commands";
import {
  currentVersionOf,
  displayStateOf,
  itemImageUrl,
  versionLabel,
  type EquipeReceiptJson,
  type ItemDetailJson,
} from "@/lib/equipe/api";
import { useEquipeItemDetail, useInvalidateEquipe } from "@/lib/equipe/use-equipe";
import EquipeStatePill from "./EquipeStatePill";
import EquipeAuthor from "./EquipeAuthor";
import { formatDate, formatDateTime, shortHash } from "./equipe-format";

// The open item (C6) as an overlay on /pipeline via ?item=<id>: final image,
// full caption, destination, date/time, version and receipts. Every decision
// goes through the commands endpoint; approvals bind to the exact version
// seen — a stale version answers "mudou desde que você abriu".

const ADJUSTMENT_CATEGORIES: AdjustmentCategory[] = ["fact", "brand", "voice", "visual", "other"];

function commandMessage(error: unknown, t: (key: string) => string): string {
  if (error instanceof EquipeCommandError) {
    if (error.code === "version_mismatch") return t("versionMismatch");
    if (error.code === "conference_pending") return t("conferencePending");
    if (error.code === "item_not_ready") return t("notReady");
    if (error.status === 403) return t("forbidden");
  }
  return t("commandError");
}

function ReceiptRow({ receipt }: { receipt: EquipeReceiptJson }) {
  const t = useTranslations("equipe.item");
  const tActions = useTranslations("equipe.receiptActions");
  const locale = useLocale();
  const action = tActions.has(receipt.action) ? tActions(receipt.action) : receipt.action;
  const role =
    receipt.personRole && t.has(`role_${receipt.personRole}`)
      ? t(`role_${receipt.personRole}`)
      : (receipt.personRole ?? receipt.personKind);
  return (
    <li
      className="flex flex-wrap items-baseline gap-x-2 text-xs text-[var(--text-secondary)]"
      data-testid={`receipt-${receipt.id}`}
    >
      <span className="font-medium text-[var(--text-primary)]">{action}</span>
      <span>{role}</span>
      {receipt.objectVersion ? <span>{shortHash(receipt.objectVersion)}</span> : null}
      <span className="text-[var(--text-muted)]">{formatDateTime(receipt.createdAt, locale)}</span>
    </li>
  );
}

function ItemActions({ accountId, detail }: { accountId: string; detail: ItemDetailJson }) {
  const t = useTranslations("equipe.item");
  const invalidate = useInvalidateEquipe(accountId);
  const [panel, setPanel] = useState<"edit" | "adjust" | "decline" | "report" | "cancel" | null>(null);
  const [draft, setDraft] = useState("");
  const [category, setCategory] = useState<AdjustmentCategory>("fact");
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { item, review } = detail;
  const current = currentVersionOf(detail);
  const versionHash = item.currentVersionHash;

  const run = async (work: () => Promise<unknown>, done: string): Promise<boolean> => {
    if (isPending) return false;
    setIsPending(true);
    setError(null);
    try {
      await work();
      toast.success(done);
      setPanel(null);
      setDraft("");
      invalidate();
      return true;
    } catch (err) {
      setError(commandMessage(err, t));
      invalidate();
      return false;
    } finally {
      setIsPending(false);
    }
  };

  const canApprove = review.status === "ready" || review.status === "needs_confirmation";
  const showConfirmFact =
    review.status === "needs_confirmation" && review.triage?.path === "confirm_as_business_fact";
  const canEdit = item.status === "awaiting_approval" || item.status === "scheduled";
  const canAdjust = item.status === "awaiting_approval";
  const canDecline = item.status === "awaiting_approval" || item.status === "held";
  const canCancel = item.status === "scheduled" || item.status === "held";
  const toggle = (next: typeof panel) => setPanel((open) => (open === next ? null : next));

  return (
    <div className="flex flex-col gap-2" data-testid="item-actions">
      <div className="flex flex-wrap gap-2">
        {showConfirmFact && versionHash ? (
          <Button
            type="button"
            variant="default"
            size="sm"
            disabled={isPending}
            onClick={() =>
              void run(
                () => confirmEquipeBusinessFact(accountId, { itemId: item.id, expectedVersionHash: versionHash }),
                t("factConfirmed"),
              )
            }
            data-testid="item-confirm-fact"
          >
            {t("confirmFact")}
          </Button>
        ) : null}
        {canApprove && versionHash ? (
          <Button
            type="button"
            variant={showConfirmFact ? "outline" : "default"}
            size="sm"
            disabled={isPending}
            onClick={() =>
              void run(
                () => approveEquipeItem(accountId, { itemId: item.id, versionHash }),
                t("approved"),
              )
            }
            data-testid="item-approve"
          >
            {t("approve")}
          </Button>
        ) : null}
        {canEdit ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isPending}
            onClick={() => {
              setDraft(current?.caption ?? "");
              toggle("edit");
            }}
            data-testid="item-edit-toggle"
          >
            {t("editCaption")}
          </Button>
        ) : null}
        {canAdjust ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isPending}
            onClick={() => toggle("adjust")}
            data-testid="item-adjust-toggle"
          >
            {t("requestAdjustment")}
          </Button>
        ) : null}
        {canDecline ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={isPending}
            onClick={() => toggle("decline")}
            data-testid="item-decline-toggle"
          >
            {t("decline")}
          </Button>
        ) : null}
        {canCancel ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={isPending}
            onClick={() => toggle("cancel")}
            data-testid="item-cancel-toggle"
          >
            {t("cancelScheduled")}
          </Button>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={isPending}
          onClick={() => toggle("report")}
          data-testid="item-report-toggle"
        >
          {t("reportProblem")}
        </Button>
      </div>

      {error ? (
        <p className="text-xs text-[var(--danger-text)]" role="alert" data-testid="item-action-error">
          {error}
        </p>
      ) : null}

      {panel === "edit" ? (
        <div className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-[var(--border-subtle)] p-3">
          <Textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={4}
            aria-label={t("captionLabel")}
            data-testid="item-edit-caption"
          />
          <p className="text-xs text-[var(--text-muted)]">{t("editHint")}</p>
          <div>
            <Button
              type="button"
              variant="default"
              size="sm"
              disabled={isPending || draft.trim().length === 0 || draft === (current?.caption ?? "")}
              onClick={() =>
                void run(() => editEquipeCaption(accountId, { itemId: item.id, caption: draft }), t("editSaved"))
              }
              data-testid="item-edit-save"
            >
              {t("saveCaption")}
            </Button>
          </div>
        </div>
      ) : null}

      {panel === "adjust" ? (
        <div className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-[var(--border-subtle)] p-3">
          <label className="flex flex-col gap-1 text-xs text-[var(--text-secondary)]">
            {t("adjustCategory")}
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value as AdjustmentCategory)}
              className="rounded-[var(--radius-control)] border border-[var(--border-subtle)] bg-[var(--surface-base)] px-2 py-1.5 text-sm text-[var(--text-primary)]"
              data-testid="item-adjust-category"
            >
              {ADJUSTMENT_CATEGORIES.map((value) => (
                <option key={value} value={value}>
                  {t(`adjustCategory_${value}`)}
                </option>
              ))}
            </select>
          </label>
          <Textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={2}
            placeholder={t("adjustNoteOptional")}
            aria-label={t("adjustNoteOptional")}
            data-testid="item-adjust-note"
          />
          <div>
            <Button
              type="button"
              variant="default"
              size="sm"
              disabled={isPending}
              onClick={() =>
                void run(
                  () =>
                    requestEquipeAdjustment(accountId, {
                      itemId: item.id,
                      category,
                      ...(draft.trim() ? { note: draft.trim() } : {}),
                    }),
                  t("adjustSent"),
                )
              }
              data-testid="item-adjust-send"
            >
              {t("sendAdjustment")}
            </Button>
          </div>
        </div>
      ) : null}

      {panel === "decline" ? (
        <div className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-[var(--border-subtle)] p-3">
          <Textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={2}
            placeholder={t("declineReason")}
            aria-label={t("declineReason")}
            data-testid="item-decline-reason"
          />
          <div>
            <Button
              type="button"
              variant="default"
              size="sm"
              disabled={isPending || draft.trim().length === 0}
              onClick={() =>
                void run(
                  () => declineEquipePublish(accountId, { itemId: item.id, reason: draft.trim() }),
                  t("declined"),
                )
              }
              data-testid="item-decline-send"
            >
              {t("declineConfirm")}
            </Button>
          </div>
        </div>
      ) : null}

      {panel === "cancel" ? (
        <div className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-[var(--border-subtle)] p-3">
          <p className="text-xs text-[var(--text-secondary)]">{t("cancelHint")}</p>
          <div>
            <Button
              type="button"
              variant="default"
              size="sm"
              disabled={isPending}
              onClick={() => void run(() => cancelEquipeScheduled(accountId, { itemId: item.id }), t("cancelled"))}
              data-testid="item-cancel-send"
            >
              {t("cancelConfirm")}
            </Button>
          </div>
        </div>
      ) : null}

      {panel === "report" ? (
        <div className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-[var(--border-subtle)] p-3">
          <Textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={2}
            placeholder={t("reportNote")}
            aria-label={t("reportNote")}
            data-testid="item-report-note"
          />
          <div>
            <Button
              type="button"
              variant="default"
              size="sm"
              disabled={isPending || draft.trim().length === 0}
              onClick={() =>
                void run(
                  () => reportEquipeItemProblem(accountId, { itemId: item.id, note: draft.trim() }),
                  t("reported"),
                )
              }
              data-testid="item-report-send"
            >
              {t("sendReport")}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ItemOverlayBody({ accountId, itemId }: { accountId: string; itemId: string }) {
  const t = useTranslations("equipe.item");
  const tStates = useTranslations("equipe.states");
  const locale = useLocale();
  const { data, isLoading, error, refetch } = useEquipeItemDetail(accountId, itemId);

  if (isLoading) {
    return (
      <DialogBody>
        <p className="py-8 text-center text-sm text-[var(--text-muted)]" role="status">
          {t("loading")}
        </p>
      </DialogBody>
    );
  }
  if (error || !data) {
    return (
      <DialogBody>
        <div className="flex flex-col items-center gap-2 py-8">
          <p className="text-sm text-[var(--text-secondary)]">{t("loadError")}</p>
          <Button type="button" variant="outline" size="sm" onClick={() => void refetch()}>
            {t("retry")}
          </Button>
        </div>
      </DialogBody>
    );
  }

  const current = currentVersionOf(data);
  const image = itemImageUrl(data.item, current);
  const label = versionLabel(data.versions, data.item.currentVersionHash);
  const when = formatDateTime(data.item.scheduledFor ?? current?.scheduledFor, locale);
  const batchDue = formatDateTime(data.batch?.approveByAt, locale);
  const warnings = [
    ...(data.review.triage?.warnings ?? []),
    ...((data.findings.find((f) => f.versionHash === data.item.currentVersionHash)?.findings as { warnings?: string[] } | null)?.warnings ?? []),
  ];

  return (
    <>
      <DialogHeader>
        <div className="flex flex-wrap items-center gap-2">
          <DialogTitle data-testid="item-overlay-title">
            {when ?? formatDate(data.item.createdAt, locale) ?? t("untitledItem")}
          </DialogTitle>
          <EquipeStatePill state={displayStateOf(data.item.status, data.review.status)} />
        </div>
        <DialogDescription>
          {[data.batch?.title, label, batchDue ? t("decideBy", { date: batchDue }) : null]
            .filter(Boolean)
            .join(" · ")}
        </DialogDescription>
      </DialogHeader>
      <DialogBody className="flex flex-col gap-4">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image}
            alt=""
            className="max-h-80 w-full rounded-[var(--radius-md)] border border-[var(--border-subtle)] object-contain bg-[var(--surface-inset)]"
            data-testid="item-overlay-image"
          />
        ) : (
          <span
            aria-hidden="true"
            className="grid h-32 place-items-center rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-inset)] text-[var(--text-muted)]"
          >
            <ImageIcon size={24} />
          </span>
        )}

        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--text-muted)]">
            {t("captionLabel")} · {label ?? shortHash(data.item.currentVersionHash ?? "")}
            {current ? (
              <>
                {" · "}
                <EquipeAuthor authorRole={current.authorRole} />
              </>
            ) : null}
          </p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-[var(--text-primary)]" data-testid="item-overlay-caption">
            {current?.caption || t("noCaption")}
          </p>
        </div>

        <dl className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <dt className="text-[var(--text-muted)]">{t("destination")}</dt>
            <dd className="text-[var(--text-primary)]">{data.destinationAccount ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-[var(--text-muted)]">{t("version")}</dt>
            <dd className="text-[var(--text-primary)]">
              {[label, data.item.currentVersionHash ? shortHash(data.item.currentVersionHash) : null]
                .filter(Boolean)
                .join(" · ") || "—"}
            </dd>
          </div>
        </dl>

        {warnings.length > 0 ? (
          <div
            className="rounded-[var(--radius-md)] border border-[var(--warning-border)] bg-[var(--warning-bg)] px-3 py-2"
            data-testid="item-overlay-warnings"
          >
            <p className="text-xs font-medium text-[var(--warning-text)]">
              {tStates.has(data.review.status) ? tStates(data.review.status) : data.review.status}
            </p>
            <ul className="mt-1 list-disc pl-4 text-xs text-[var(--warning-text)]">
              {warnings.map((warning, index) => (
                <li key={`${warning}-${index}`}>{warning}</li>
              ))}
            </ul>
            {data.review.triage?.path === "update_catalog_only" ? (
              <p className="mt-1 text-xs text-[var(--warning-text)]">{t("catalogPointer")}</p>
            ) : null}
          </div>
        ) : null}

        <ItemActions accountId={accountId} detail={data} />

        <details data-testid="item-overlay-history">
          <summary className="cursor-pointer text-xs font-medium text-[var(--text-secondary)]">
            {t("history", { count: data.versions.length })}
          </summary>
          <ul className="mt-2 flex flex-col gap-1">
            {data.versions.map((version, index) => (
              <li
                key={version.versionHash}
                className="flex flex-wrap items-baseline gap-x-2 text-xs text-[var(--text-secondary)]"
              >
                <span className="font-medium text-[var(--text-primary)]">v{index + 1}</span>
                <EquipeAuthor authorRole={version.authorRole} />
                <span className="text-[var(--text-muted)]">
                  {formatDateTime(version.createdAt, locale)}
                </span>
                {version.versionHash === data.item.currentVersionHash ? (
                  <span className="text-[var(--text-muted)]">{t("currentVersion")}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </details>

        <div>
          <p className="text-xs font-medium text-[var(--text-secondary)]">
            {t("receipts", { count: data.receipts.length })}
          </p>
          {data.receipts.length === 0 ? (
            <p className="mt-1 text-xs text-[var(--text-muted)]">{t("noReceipts")}</p>
          ) : (
            <ul className="mt-1 flex flex-col gap-1">
              {data.receipts.map((receipt) => (
                <ReceiptRow key={receipt.id} receipt={receipt} />
              ))}
            </ul>
          )}
        </div>
      </DialogBody>
    </>
  );
}

export default function ItemOverlay({
  accountId,
  itemId,
  open,
  onOpenChange,
}: {
  accountId: string;
  itemId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg" data-testid="item-overlay">
        {itemId ? (
          <ItemOverlayBody key={itemId} accountId={accountId} itemId={itemId} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
