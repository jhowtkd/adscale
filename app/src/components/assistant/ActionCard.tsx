"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { ActionContract } from "@/server/assistant/action-contracts/types";
import { buildRiskCopyLines } from "@/server/assistant/action-contracts/risk-copy";
import { assistantQuietCommitClass } from "./assistant-chrome";

export type ActionCardStatus = "pending" | "executing" | "completed" | "error";

export interface ActionCardProps {
  /** Contract that drives the card's label, risk copy, and metadata. */
  contract: ActionContract;
  /** Current input snapshot (derived from the contract's inputSchema). */
  snapshot: Record<string, unknown>;
  /** Card lifecycle state. */
  status: ActionCardStatus;
  /** Message shown when status === "error". */
  errorMessage?: string;
  /** Optional extra body rendered above the risk copy (e.g. summary lines). */
  children?: React.ReactNode;
  /**
   * Optional inline-edit fields (rendered in place of the static snapshot
   * once the user enters edit mode). Each action type's caller (Task 8)
   * supplies the appropriate inputs derived from the contract's inputSchema.
   */
  editFields?: React.ReactNode;
  /** Fired when the confirm button is clicked in pending state. */
  onConfirm?: () => void;
  /** Fired when the cancel button is clicked in pending state. */
  onCancel?: () => void;
  /** Fired when entering edit mode (optional side-effect hook). */
  onEdit?: () => void;
  /**
   * Fired when confirm is clicked while editing. The caller owns the
   * editFields state and reads the edited values from its own controlled
   * inputs; the snapshot is forwarded as a convenience base.
   */
  onEditSubmit?: (editedSnapshot: Record<string, unknown>) => void;
}

export function ActionCard({
  contract,
  snapshot,
  status,
  errorMessage,
  children,
  editFields,
  onConfirm,
  onCancel,
  onEdit,
  onEditSubmit,
}: ActionCardProps) {
  const t = useTranslations("assistant.actionCard");
  const [isEditing, setIsEditing] = useState(false);
  const riskLines = buildRiskCopyLines(contract, snapshot);
  const canEdit = Boolean(editFields);

  const handleEnterEdit = () => {
    setIsEditing(true);
    onEdit?.();
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
  };

  const handleSubmitEdit = () => {
    // The caller controls the editFields inputs; it reads the edited values
    // itself. We forward the snapshot as the base for the merged result.
    onEditSubmit?.(snapshot);
    setIsEditing(false);
  };

  return (
    <div
      className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4"
      data-action-type={contract.actionType}
      data-action-status={status}
    >
      <div className="mb-2 flex items-center gap-2">
        <h4 className="text-sm font-semibold text-[var(--text-primary)]">
          {contract.label}
        </h4>
      </div>

      {children ? (
        <div className="mb-3 space-y-1 text-xs text-[var(--text-secondary)]">
          {children}
        </div>
      ) : null}

      {isEditing && editFields ? (
        <div className="mb-3 space-y-2 text-xs text-[var(--text-secondary)]">
          {editFields}
        </div>
      ) : riskLines.length > 0 ? (
        <ul className="mb-3 space-y-1">
          {riskLines.map((line) => (
            <li
              key={line}
              className="flex gap-1.5 text-xs text-[var(--warning-text)]"
            >
              <span aria-hidden>⚠</span>
              <span>{line}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {status === "executing" ? (
        <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
          <span className="inline-block size-3 animate-spin rounded-full border-2 border-[var(--info-text)] border-t-transparent" />
          {t("executing")}
        </div>
      ) : status === "error" ? (
        <div className="text-xs text-[var(--danger-text)]">
          {t("errorTitle")}: {errorMessage}
        </div>
      ) : status === "completed" ? (
        <div className="text-xs text-[var(--success-text)]">{t("successTitle")}</div>
      ) : isEditing ? (
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={handleCancelEdit}
            className="rounded px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--surface-base)]"
          >
            {t("cancel")}
          </button>
          <button
            type="button"
            onClick={handleSubmitEdit}
            className={`${assistantQuietCommitClass} rounded px-3 py-1.5 text-xs font-medium`}
          >
            {t("confirm")}
          </button>
        </div>
      ) : (
        <div className="flex justify-end gap-2">
          {canEdit ? (
            <button
              type="button"
              onClick={handleEnterEdit}
              className="rounded px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--surface-base)]"
            >
              {t("edit")}
            </button>
          ) : null}
          <button
            type="button"
            onClick={onCancel}
            className="rounded px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--surface-base)]"
          >
            {t("cancel")}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`${assistantQuietCommitClass} rounded px-3 py-1.5 text-xs font-medium`}
          >
            {t("confirm")}
          </button>
        </div>
      )}
    </div>
  );
}
