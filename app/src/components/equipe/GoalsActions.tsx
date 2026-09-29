"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  agreeEquipeManualMode,
  answerEquipeConflict,
  approveEquipeAutomaticPublication,
  approveEquipeContextSection,
  approveEquipeMandate,
  approveEquipePlan,
  confirmEquipeScope,
  EquipeCommandError,
} from "@/lib/equipe/commands";
import type {
  EquipeContextFieldJson,
  EquipeMandateJson,
  GoalsDecisionsJson,
} from "@/lib/equipe/api";
import { useInvalidateEquipe } from "@/lib/equipe/use-equipe";
import { formatDate } from "./equipe-format";

// The implantação decisions the client takes in Metas (C3a): one action per
// step, each wired to the commands endpoint. Hash-bound approvals echo the
// server-provided versionHash — the browser never computes a hash. The API
// is the authority: a 409 shows its reason, a stale version asks for review.

function commandMessage(error: unknown, t: (key: string) => string): string {
  if (error instanceof EquipeCommandError) {
    if (error.code === "stale_version") return t("staleVersion");
    if (error.code === "unknown_asset") return t("materialUnknownAsset");
    if (error.status === 403) return t("forbidden");
    if (error.code === "automatic_publication_requires_connection" ||
        error.code === "automatic_publication_requires_mandate") return t(error.code);
    if (error.status === 409 && error.detail) return error.detail;
  }
  return t("commandError");
}

export function useDecisionRunner(accountId: string) {
  const t = useTranslations("equipe.goals");
  const invalidate = useInvalidateEquipe(accountId);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (work: () => Promise<unknown>, done: string): Promise<boolean> => {
    if (isPending) return false;
    setIsPending(true);
    setError(null);
    try {
      await work();
      toast.success(done);
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
  return { isPending, error, run };
}

export function ActionError({ message, testId }: { message: string | null; testId: string }) {
  if (!message) return null;
  return (
    <p className="text-xs text-[var(--danger-text)]" role="alert" data-testid={testId}>
      {message}
    </p>
  );
}

function fieldText(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value === null || value === undefined) return "—";
  return JSON.stringify(value);
}

export function ScopeConfirmAction({
  accountId,
  scope,
}: {
  accountId: string;
  scope: GoalsDecisionsJson["scope"];
}) {
  const t = useTranslations("equipe.goals");
  const { isPending, error, run } = useDecisionRunner(accountId);
  const [digest, setDigest] = useState("");
  const [note, setNote] = useState("");

  if (scope.confirmed) {
    return (
      <p className="text-xs text-[var(--text-muted)]" data-testid="goals-action-scope-done">
        {[t("scopeConfirmed"), scope.digest].filter(Boolean).join(" · ")}
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-2" data-testid="goals-action-scope">
      <p className="text-xs text-[var(--text-secondary)]">{t("scopeExplainer")}</p>
      <input
        value={digest}
        onChange={(event) => setDigest(event.target.value)}
        placeholder={t("scopeDigestPlaceholder")}
        aria-label={t("scopeDigestLabel")}
        data-testid="goals-scope-digest"
        className="rounded-[var(--radius-control)] border border-[var(--border-subtle)] bg-[var(--surface-base)] px-2 py-1.5 text-sm text-[var(--text-primary)]"
      />
      <input
        value={note}
        onChange={(event) => setNote(event.target.value)}
        placeholder={t("scopeNotePlaceholder")}
        aria-label={t("scopeNotePlaceholder")}
        data-testid="goals-scope-note"
        className="rounded-[var(--radius-control)] border border-[var(--border-subtle)] bg-[var(--surface-base)] px-2 py-1.5 text-sm text-[var(--text-primary)]"
      />
      <ActionError message={error} testId="goals-scope-error" />
      <div>
        <Button
          type="button"
          variant="default"
          size="sm"
          disabled={isPending || digest.trim().length === 0}
          onClick={() =>
            void run(
              () =>
                confirmEquipeScope(accountId, {
                  scopeDigest: digest.trim(),
                  ...(note.trim() ? { note: note.trim() } : {}),
                }),
              t("scopeDone"),
            )
          }
          data-testid="goals-scope-confirm"
        >
          {t("scopeConfirm")}
        </Button>
      </div>
    </div>
  );
}

function ContextFields({ fields }: { fields: Record<string, EquipeContextFieldJson> }) {
  const t = useTranslations("equipe.goals");
  const entries = Object.entries(fields ?? {});
  if (entries.length === 0) return null;
  return (
    <dl className="divide-y divide-[var(--border-subtle)]">
      {entries.map(([name, field]) => (
        <div key={name} className="flex items-baseline justify-between gap-3 py-1 text-sm">
          <dt className="shrink-0 text-[var(--text-muted)]">{name.replace(/_/g, " ")}</dt>
          <dd className="truncate text-right text-[var(--text-primary)]">
            {field?.status === "unknown" ? (
              <span className="text-[var(--text-muted)]">{t("fieldStatus_unknown")}</span>
            ) : (
              fieldText(field?.value)
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function ContextStepActions({
  accountId,
  sections,
  conflicts,
}: {
  accountId: string;
  sections: GoalsDecisionsJson["contextSections"];
  conflicts: GoalsDecisionsJson["conflicts"];
}) {
  const t = useTranslations("equipe.goals");
  const { isPending, error, run } = useDecisionRunner(accountId);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  if (sections.length === 0 && conflicts.length === 0) return null;
  return (
    <div className="flex flex-col gap-3" data-testid="goals-action-context">
      {sections.map((section) => (
        <div
          key={section.versionId}
          className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-[var(--border-subtle)] p-3"
        >
          <p className="text-sm font-medium text-[var(--text-primary)]">
            {t("sectionProposal", { section: section.section, version: section.version })}
          </p>
          <ContextFields fields={section.fields} />
          <p className="text-xs text-[var(--text-secondary)]">{t("sectionExplainer")}</p>
          <div>
            <Button
              type="button"
              variant="default"
              size="sm"
              disabled={isPending}
              onClick={() =>
                void run(
                  () =>
                    approveEquipeContextSection(accountId, {
                      section: section.section,
                      expectedVersionHash: section.versionHash,
                    }),
                  t("sectionApproved"),
                )
              }
              data-testid={`goals-section-approve-${section.section}`}
            >
              {t("sectionApprove")}
            </Button>
          </div>
        </div>
      ))}
      {conflicts.map((conflict) => {
        const key = `${conflict.section}.${conflict.field}`;
        const answer = answers[key] ?? "";
        return (
          <div
            key={conflict.versionId + conflict.field}
            className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-[var(--border-subtle)] p-3"
          >
            <p className="text-sm text-[var(--text-primary)]">{conflict.question}</p>
            <p className="text-xs text-[var(--text-muted)]">
              {t("conflictWhere", { section: conflict.section, field: conflict.field })}
            </p>
            <Textarea
              value={answer}
              onChange={(event) => setAnswers((prev) => ({ ...prev, [key]: event.target.value }))}
              rows={2}
              placeholder={t("conflictAnswerPlaceholder")}
              aria-label={t("conflictAnswerPlaceholder")}
              data-testid={`goals-conflict-answer-${conflict.section}-${conflict.field}`}
            />
            <div>
              <Button
                type="button"
                variant="default"
                size="sm"
                disabled={isPending || answer.trim().length === 0}
                onClick={() =>
                  void run(
                    () =>
                      answerEquipeConflict(accountId, {
                        section: conflict.section,
                        field: conflict.field,
                        answer: answer.trim(),
                      }),
                    t("conflictSent"),
                  ).then((sent) => {
                    if (sent) setAnswers((prev) => ({ ...prev, [key]: "" }));
                  })
                }
                data-testid={`goals-conflict-send-${conflict.section}-${conflict.field}`}
              >
                {t("conflictSend")}
              </Button>
            </div>
          </div>
        );
      })}
      <ActionError message={error} testId="goals-context-error" />
    </div>
  );
}

export function PlanStepAction({
  accountId,
  plan,
}: {
  accountId: string;
  plan: GoalsDecisionsJson["plan"];
}) {
  const t = useTranslations("equipe.goals");
  const { isPending, error, run } = useDecisionRunner(accountId);
  if (!plan) return null;
  return (
    <div className="flex flex-col gap-2" data-testid="goals-action-plan">
      <p className="text-sm font-medium text-[var(--text-primary)]">
        {t("planProposal", { version: plan.version })}
      </p>
      <p className="text-xs text-[var(--text-secondary)]">{t("planExplainer")}</p>
      <ActionError message={error} testId="goals-plan-error" />
      <div>
        <Button
          type="button"
          variant="default"
          size="sm"
          disabled={isPending}
          onClick={() =>
            void run(
              () => approveEquipePlan(accountId, { expectedVersionHash: plan.versionHash }),
              t("planApproved"),
            )
          }
          data-testid="goals-plan-approve"
        >
          {t("planApprove")}
        </Button>
      </div>
    </div>
  );
}

export function MandateStepActions({
  accountId,
  mandates,
  rows,
  locale,
}: {
  accountId: string;
  mandates: GoalsDecisionsJson["mandates"];
  rows: EquipeMandateJson[];
  locale: string;
}) {
  const t = useTranslations("equipe.goals");
  const { isPending, error, run } = useDecisionRunner(accountId);
  if (mandates.length === 0) return null;
  const byId = new Map(rows.map((row) => [row.id, row]));
  return (
    <div className="flex flex-col gap-2" data-testid="goals-action-mandate">
      {mandates.map((mandate) => {
        const row = byId.get(mandate.id);
        const validUntil = formatDate(row?.validUntil, locale);
        // #584: a pending activation out of shadow says plainly what the
        // approval changes; anything else keeps the compact mandate line.
        const subtitle = mandate.activation
          ? t("mandateActivationExplainer")
          : [
              row?.shadow ? t("shadowMode") : null,
              validUntil ? t("validUntil", { date: validUntil }) : null,
            ]
              .filter(Boolean)
              .join(" · ") || t("mandateExplainer");
        return (
          <div
            key={mandate.id}
            className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[var(--radius-md)] border border-[var(--border-subtle)] p-3"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-[var(--text-primary)]">
                {t("mandateProposal", { version: mandate.version })}
              </span>
              <span className="block text-xs text-[var(--text-muted)]">{subtitle}</span>
            </span>
            <Button
              type="button"
              variant="default"
              size="sm"
              disabled={isPending}
              onClick={() =>
                void run(
                  () => approveEquipeMandate(accountId, { expectedVersionHash: mandate.versionHash }),
                  t("mandateApproved"),
                )
              }
              data-testid={`goals-mandate-approve-${mandate.version}`}
            >
              {t("mandateApprove")}
            </Button>
          </div>
        );
      })}
      <ActionError message={error} testId="goals-mandate-error" />
    </div>
  );
}

// #584 (round 2): a pending activation on a calibrating/active account
// approves from the mandates section — the implantação mandate step is
// done (or hidden) by then. Same hash-bound approve_mandate flow.
export function MandateActivationActions({
  accountId,
  mandates,
}: {
  accountId: string;
  mandates: GoalsDecisionsJson["mandates"];
}) {
  const t = useTranslations("equipe.goals");
  const { isPending, error, run } = useDecisionRunner(accountId);
  const activations = mandates.filter((mandate) => mandate.activation);
  if (activations.length === 0) return null;
  return (
    <div className="flex flex-col gap-2" data-testid="goals-mandates-activation">
      {activations.map((mandate) => (
        <div
          key={mandate.id}
          className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[var(--radius-md)] border border-[var(--border-subtle)] p-3"
        >
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-[var(--text-primary)]">
              {t("mandateProposal", { version: mandate.version })}
            </span>
            <span className="block text-xs text-[var(--text-muted)]">
              {t("mandateActivationExplainer")}
            </span>
          </span>
          <Button
            type="button"
            variant="default"
            size="sm"
            disabled={isPending}
            onClick={() =>
              void run(
                () => approveEquipeMandate(accountId, { expectedVersionHash: mandate.versionHash }),
                t("mandateApproved"),
              )
            }
            data-testid={`goals-mandates-activation-approve-${mandate.version}`}
          >
            {t("mandateApprove")}
          </Button>
        </div>
      ))}
      <ActionError message={error} testId="goals-mandates-activation-error" />
    </div>
  );
}

export function ConnectionStepAction({
  accountId,
  connection,
}: {
  accountId: string;
  connection: GoalsDecisionsJson["connection"];
}) {
  const t = useTranslations("equipe.goals");
  const { isPending, error, run } = useDecisionRunner(accountId);
  if (connection.verified) {
    return (
      <p className="text-xs text-[var(--text-muted)]" data-testid="goals-action-connection-done">
        {t("connectionVerified")}
      </p>
    );
  }
  if (connection.manualAgreed) {
    return (
      <p className="text-xs text-[var(--text-muted)]" data-testid="goals-action-connection-done">
        {t("manualAgreed")}
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-2" data-testid="goals-action-connection">
      <p className="text-xs text-[var(--text-secondary)]">{t("manualExplainer")}</p>
      <ActionError message={error} testId="goals-connection-error" />
      <div>
        <Button
          type="button"
          variant="default"
          size="sm"
          disabled={isPending}
          onClick={() => void run(() => agreeEquipeManualMode(accountId), t("manualDone"))}
          data-testid="goals-manual-agree"
        >
          {t("manualAgree")}
        </Button>
      </div>
    </div>
  );
}

export function PublicationModeAction({
  accountId,
  publication,
}: {
  accountId: string;
  publication: GoalsDecisionsJson["publication"];
}) {
  const t = useTranslations("equipe.goals");
  const { isPending, error, run } = useDecisionRunner(accountId);
  if (publication.mode === "automatic" && !publication.receiptId) return null;
  return (
    <section aria-label={t("publicationMode")} data-testid="goals-publication-mode">
      <h2 className="text-sm font-semibold text-[var(--text-primary)]">{t("publicationMode")}</h2>
      <div className="mt-2 flex flex-col gap-2 rounded-[var(--radius-panel)] border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-3">
        <p className="text-sm font-medium text-[var(--text-primary)]">
          {t(publication.mode === "manual" ? "manualAgreed" : "automaticPublicationApproved")}
        </p>
        <p className="text-xs text-[var(--text-secondary)]">{t("automaticPublicationExplainer")}</p>
        {publication.mode === "manual" && publication.igAccount ? (
          <p className="text-xs text-[var(--text-secondary)]">
            {t("automaticPublicationTarget", { account: publication.igAccount, version: publication.mandateVersion ?? "" })}
          </p>
        ) : null}
        {publication.mode === "manual" && publication.blockedReason ? (
          <p className="text-xs text-[var(--text-muted)]">{t(publication.blockedReason)}</p>
        ) : null}
        {publication.receiptId ? (
          <p className="break-all text-xs text-[var(--text-muted)]">{t("publicationReceipt", { id: publication.receiptId })}</p>
        ) : null}
        <ActionError message={error} testId="goals-publication-error" />
        {publication.mode === "manual" && publication.canApprove ? (
          <div>
            <Button
              type="button"
              size="sm"
              disabled={isPending || !publication.versionHash || !!publication.blockedReason}
              onClick={() => publication.versionHash && void run(
                () => approveEquipeAutomaticPublication(accountId, { expectedVersionHash: publication.versionHash! }),
                t("automaticPublicationApproved"),
              )}
              data-testid="goals-publication-approve"
            >
              {t("approveAutomaticPublication")}
            </Button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
