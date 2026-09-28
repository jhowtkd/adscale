"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
import { currentVersionOf, type ItemDetailJson } from "@/lib/equipe/api";
import { useInvalidateEquipe } from "@/lib/equipe/use-equipe";

// The decision buttons of the open item (C6): approve, confirm fact, edit
// caption, request adjustment, decline, cancel, report. Approvals bind to
// the exact version seen — a stale version answers "mudou desde que você
// abriu".

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

export default function ItemOverlayActions({
  accountId,
  detail,
}: {
  accountId: string;
  detail: ItemDetailJson;
}) {
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
