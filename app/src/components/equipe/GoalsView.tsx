"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Check, Heart, Megaphone, Plus, Rocket, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import PageFrame from "@/components/layout/PageFrame";
import PageHeader from "@/components/layout/PageHeader";
import type {
  EquipeFrontJson,
  EquipeMandateJson,
  EquipeOnboardingStepJson,
  EquipePlanJson,
  GoalsDecisionsJson,
} from "@/lib/equipe/api";
import {
  useEquipeAccounts,
  useEquipeAccountSelection,
  useEquipeAccountState,
  useEquipeGoals,
} from "@/lib/equipe/use-equipe";
import EquipeTopActions, { RequestSupportButton } from "./EquipeTopActions";
import {
  ConnectionStepAction,
  ContextStepActions,
  MandateStepActions,
  PlanStepAction,
  ScopeConfirmAction,
} from "./GoalsActions";
import { BrandVoiceCard } from "./GoalsBrandVoice";
import { MaterialsAction } from "./GoalsMaterialsAction";
import {
  EquipeAccountSwitcher,
  EquipeDisabledNotice,
  EquipeEmptyAccounts,
  EquipeErrorNotice,
  EquipeLoading,
  isDisabledError,
} from "./EquipeAccountStates";
import { formatDate, formatDateTime } from "./equipe-format";

// Metas (C3a implantation, C3b in operation): implantation steps with owner
// and deadline while deploying, then fronts state, the cycle plan and the
// mandates. New goals start as a Strategist proposal in the conversation.

const STEP_ORDER = [
  "scope_confirm",
  "materials",
  "context",
  "plan",
  "mandate",
  "connection",
  "go_live",
] as const;

const CREATE_GOAL_ROWS = [
  { key: "sales", Icon: TrendingUp },
  { key: "reach", Icon: Megaphone },
  { key: "launch", Icon: Rocket },
  { key: "relationship", Icon: Heart },
  { key: "other", Icon: Plus },
] as const;

function StepStatusPill({ status }: { status: string }) {
  const t = useTranslations("equipe.goals");
  const key = `stepStatus_${status}`;
  const tone = status === "done" ? "success" : status === "in_progress" ? "info" : "neutral";
  return <Badge variant={tone}>{t.has(key) ? t(key) : status}</Badge>;
}

function StepAction({
  accountId,
  step,
  decisions,
  mandates,
  locale,
}: {
  accountId: string;
  step: string;
  decisions: GoalsDecisionsJson;
  mandates: EquipeMandateJson[];
  locale: string;
}) {
  switch (step) {
    case "scope_confirm":
      return <ScopeConfirmAction accountId={accountId} scope={decisions.scope} />;
    case "materials":
      return <MaterialsAction accountId={accountId} materials={decisions.materials} />;
    case "context":
      return (
        <ContextStepActions
          accountId={accountId}
          sections={decisions.contextSections}
          conflicts={decisions.conflicts}
        />
      );
    case "plan":
      return <PlanStepAction accountId={accountId} plan={decisions.plan} />;
    case "mandate":
      return (
        <MandateStepActions
          accountId={accountId}
          mandates={decisions.mandates}
          rows={mandates}
          locale={locale}
        />
      );
    case "connection":
      return <ConnectionStepAction accountId={accountId} connection={decisions.connection} />;
    default:
      return null;
  }
}

function ImplantationSteps({
  accountId,
  steps,
  decisions,
  mandates,
}: {
  accountId: string;
  steps: EquipeOnboardingStepJson[];
  decisions: GoalsDecisionsJson;
  mandates: EquipeMandateJson[];
}) {
  const t = useTranslations("equipe.goals");
  const tRoles = useTranslations("equipe.roles");
  const locale = useLocale();
  const ordered = useMemo(() => {
    const rank = new Map<string, number>(STEP_ORDER.map((step, index) => [step, index]));
    return [...steps].sort((a, b) => (rank.get(a.step) ?? 99) - (rank.get(b.step) ?? 99));
  }, [steps]);
  const done = ordered.filter((step) => step.status === "done").length;

  return (
    <section aria-label={t("implantation")} data-testid="goals-implantation">
      <h2 className="text-sm font-semibold text-[var(--text-primary)]">
        {t("implantation")} · {t("stepsDone", { done, total: ordered.length })}
      </h2>
      <ul className="mt-2 flex flex-col gap-2">
        {ordered.map((step) => {
          const key = `step_${step.step}`;
          const due = formatDate(step.dueAt, locale);
          const completed = formatDate(step.completedAt, locale);
          return (
            <li
              key={step.id}
              data-testid={`goals-step-${step.step}`}
              className="rounded-[var(--radius-panel)] border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-3"
            >
              <div className="flex items-start gap-3">
                <span
                  aria-hidden="true"
                  className={
                    step.status === "done"
                      ? "grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[var(--success-bg)] text-[var(--success-text)]"
                      : "h-5 w-5 shrink-0 rounded border border-[var(--border-strong)]"
                  }
                >
                  {step.status === "done" ? <Check size={14} /> : null}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="text-sm font-medium text-[var(--text-primary)]">
                    {t.has(key) ? t(key) : step.step}
                  </span>
                  <span className="text-xs text-[var(--text-muted)]">
                    {[
                      step.owner
                        ? (tRoles.has(step.owner) ? tRoles(step.owner) : step.owner)
                        : null,
                      due ? t("dueAt", { date: due }) : null,
                      completed ? t("completedAt", { date: completed }) : null,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "—"}
                  </span>
                </span>
                <StepStatusPill status={step.status} />
              </div>
              <div className="mt-2">
                <StepAction
                  accountId={accountId}
                  step={step.step}
                  decisions={decisions}
                  mandates={mandates}
                  locale={locale}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function FrontsState({ fronts }: { fronts: EquipeFrontJson[] }) {
  const t = useTranslations("equipe.goals");
  const tFronts = useTranslations("equipe.fronts");
  const tFrontStatus = useTranslations("equipe.frontStatuses");
  const locale = useLocale();
  const ordered = useMemo(
    () => [...fronts].sort((a, b) => a.key.localeCompare(b.key)),
    [fronts],
  );
  if (ordered.length === 0) return null;
  return (
    <section aria-label={t("fronts")} data-testid="goals-fronts">
      <h2 className="text-sm font-semibold text-[var(--text-primary)]">{t("fronts")}</h2>
      <ul className="mt-2 flex flex-col gap-2">
        {ordered.map((front) => {
          const released = formatDate(front.releasedAt, locale);
          return (
            <li
              key={front.id}
              data-testid={`goals-front-${front.key}`}
              className="flex items-center gap-3 rounded-[var(--radius-panel)] border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-3"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-[var(--text-primary)]">
                  {tFronts.has(front.key) ? tFronts(front.key) : front.key}
                </span>
                <span className="block text-xs text-[var(--text-muted)]">
                  {[
                    tFrontStatus.has(front.status) ? tFrontStatus(front.status) : front.status,
                    front.status === "calibrating"
                      ? t("roundsUsed", { count: front.roundsUsed })
                      : null,
                    released ? t("releasedAt", { date: released }) : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function PlanState({ plan }: { plan: EquipePlanJson | null }) {
  const t = useTranslations("equipe.goals");
  const locale = useLocale();
  if (!plan) return null;
  const entries = Object.entries(plan.content ?? {}).slice(0, 8);
  const approved = formatDateTime(plan.approvedAt, locale);
  return (
    <section aria-label={t("plan")} data-testid="goals-plan">
      <h2 className="text-sm font-semibold text-[var(--text-primary)]">
        {t("plan")} · v{plan.version}
      </h2>
      <div className="mt-2 rounded-[var(--radius-panel)] border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-3">
        <p className="text-xs text-[var(--text-muted)]">
          {[
            t.has(`versionStatus_${plan.status}`) ? t(`versionStatus_${plan.status}`) : plan.status,
            approved ? t("approvedAt", { date: approved }) : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {entries.length > 0 ? (
          <dl className="mt-2 divide-y divide-[var(--border-subtle)]">
            {entries.map(([key, value]) => (
              <div key={key} className="flex items-baseline justify-between gap-3 py-1 text-sm">
                <dt className="shrink-0 text-[var(--text-muted)]">{key.replace(/_/g, " ")}</dt>
                <dd className="truncate text-right text-[var(--text-primary)]">
                  {typeof value === "string" || typeof value === "number" || typeof value === "boolean"
                    ? String(value)
                    : JSON.stringify(value)}
                </dd>
              </div>
            ))}
          </dl>
        ) : null}
      </div>
    </section>
  );
}

function MandatesState({
  mandates,
  fronts,
}: {
  mandates: EquipeMandateJson[];
  fronts: EquipeFrontJson[];
}) {
  const t = useTranslations("equipe.goals");
  const tFronts = useTranslations("equipe.fronts");
  const locale = useLocale();
  const ordered = useMemo(() => [...mandates].sort((a, b) => a.version - b.version), [mandates]);
  if (ordered.length === 0) return null;
  const frontKeyOf = (frontId: string | null) => fronts.find((front) => front.id === frontId)?.key ?? null;
  return (
    <section aria-label={t("mandates")} data-testid="goals-mandates">
      <h2 className="text-sm font-semibold text-[var(--text-primary)]">{t("mandates")}</h2>
      <ul className="mt-2 flex flex-col gap-2">
        {ordered.map((mandate) => {
          const frontKey = frontKeyOf(mandate.frontId);
          const validUntil = formatDate(mandate.validUntil, locale);
          return (
            <li
              key={mandate.id}
              data-testid={`goals-mandate-${mandate.version}`}
              className="rounded-[var(--radius-panel)] border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-3"
            >
              <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-[var(--text-primary)]">
                {t("mandateVersion", { version: mandate.version })}
                <Badge variant="neutral">
                  {t.has(`mandateStatus_${mandate.status}`)
                    ? t(`mandateStatus_${mandate.status}`)
                    : mandate.status}
                </Badge>
                {mandate.shadow ? <Badge variant="info">{t("shadowMode")}</Badge> : null}
              </p>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                {[
                  frontKey ? (tFronts.has(frontKey) ? tFronts(frontKey) : frontKey) : null,
                  validUntil ? t("validUntil", { date: validUntil }) : null,
                ]
                  .filter(Boolean)
                  .join(" · ") || "—"}
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function CreateGoal() {
  const t = useTranslations("equipe.goals");
  return (
    <section aria-label={t("createGoal")} data-testid="goals-create">
      <h2 className="text-sm font-semibold text-[var(--text-primary)]">{t("createGoal")}</h2>
      <p className="mt-1 text-xs text-[var(--text-muted)]">{t("createGoalHint")}</p>
      <ul className="mt-2 divide-y divide-[var(--border-subtle)] rounded-[var(--radius-panel)] border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-3">
        {CREATE_GOAL_ROWS.map(({ key, Icon }) => (
          <li key={key}>
            <Link
              href="/assistant"
              data-testid={`goals-create-${key}`}
              className="flex w-full items-center gap-3 py-2.5 text-left text-sm text-[var(--text-primary)]"
            >
              <Icon size={16} aria-hidden="true" className="shrink-0 text-[var(--utility-icon)]" />
              <span className="flex-1">{t(`createGoal_${key}`)}</span>
              <span aria-hidden="true" className="text-[var(--text-muted)]">
                ›
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function GoalsBoard({
  accountId,
  accountStatus,
  fronts,
  plan,
  mandates,
  onboarding,
  decisions,
}: {
  accountId: string;
  accountStatus: string;
  fronts: EquipeFrontJson[];
  plan: EquipePlanJson | null;
  mandates: EquipeMandateJson[];
  onboarding: EquipeOnboardingStepJson[];
  decisions: GoalsDecisionsJson;
}) {
  const inOperation = accountStatus === "active";
  return (
    <div className="flex flex-col gap-6">
      {!inOperation ? (
        <ImplantationSteps
          accountId={accountId}
          steps={onboarding}
          decisions={decisions}
          mandates={mandates}
        />
      ) : null}
      {!inOperation ? (
        <BrandVoiceCard accountId={accountId} brandVoice={decisions.brandVoice} />
      ) : null}
      <FrontsState fronts={fronts} />
      <PlanState plan={plan} />
      <MandatesState mandates={mandates} fronts={fronts} />
      {inOperation ? <CreateGoal /> : null}
      <div>
        <RequestSupportButton accountId={accountId} />
      </div>
    </div>
  );
}

export default function GoalsView() {
  const t = useTranslations("equipe.goals");
  const accountsQuery = useEquipeAccounts();
  const accounts = accountsQuery.data?.accounts;
  const { selected, select } = useEquipeAccountSelection("/goals", accounts);
  const list = accounts ?? [];
  const goalsQuery = useEquipeGoals(selected);
  const stateQuery = useEquipeAccountState(selected);

  return (
    <PageFrame width="reading">
      <PageHeader
        title={t("title")}
        description={t("subtitle")}
        actions={<EquipeTopActions active={null} accountId={selected} />}
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
        {accountsQuery.data && selected ? (
          <div className="mb-3">
            <EquipeAccountSwitcher
              accounts={list}
              accountId={selected}
              onSelect={select}
            />
          </div>
        ) : null}
        {selected && (goalsQuery.isLoading || stateQuery.isLoading) ? <EquipeLoading /> : null}
        {selected && (goalsQuery.error ?? stateQuery.error) ? (
          <EquipeErrorNotice
            onRetry={() => {
              void goalsQuery.refetch();
              void stateQuery.refetch();
            }}
          />
        ) : null}
        {selected && goalsQuery.data && stateQuery.data ? (
          <GoalsBoard
            accountId={selected}
            accountStatus={stateQuery.data.status}
            fronts={stateQuery.data.fronts}
            plan={goalsQuery.data.plan}
            mandates={goalsQuery.data.mandates}
            onboarding={goalsQuery.data.onboarding}
            decisions={goalsQuery.data.decisions}
          />
        ) : null}
      </div>
    </PageFrame>
  );
}
