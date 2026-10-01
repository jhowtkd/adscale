// Agent roles, task kinds, and model/effort resolution (#550, #588).
//
// Multi-provider since #588: each role's model id picks its provider
// (see provider.ts), and each role carries its own reasoning level. The
// reviewer must differ from the AUTHOR models — the ones producing what
// is reviewed (see validation/env.ts).

import { env } from "@/server/validation/env";
import type { EquipeEffort } from "./provider";

export const EQUIPE_AGENT_ROLES = [
  "strategist",
  "research",
  "writer",
  "reviewer_text",
  "reviewer_visual",
  "measurement",
] as const;

export type EquipeAgentRole = (typeof EQUIPE_AGENT_ROLES)[number];

export const EQUIPE_AGENT_TASK_KINDS = [
  "strategist_turn",
  "research",
  "diagnosis",
  "writing",
  "art_direction",
  "review_text",
  "review_visual",
  "review_caption",
  "plan_adjustment",
  "plan_replacement",
  "plan_reschedule",
  "measurement",
] as const;

export type EquipeAgentTaskKind = (typeof EQUIPE_AGENT_TASK_KINDS)[number];

export function isAgentTaskKind(value: unknown): value is EquipeAgentTaskKind {
  return (
    typeof value === "string" &&
    (EQUIPE_AGENT_TASK_KINDS as readonly string[]).includes(value)
  );
}

export const DEFAULT_STRATEGIST_MODEL = "claude-opus-5-5";
export const DEFAULT_RESEARCH_MODEL = "muse-spark-1.3-contributor";
export const DEFAULT_REVIEWER_MODEL = "claude-opus-5-5";

export const DEFAULT_STRATEGIST_EFFORT: EquipeEffort = "high";
export const DEFAULT_RESEARCH_EFFORT: EquipeEffort = "xhigh";
export const DEFAULT_REVIEWER_EFFORT: EquipeEffort = "high";

/** Fallbacks mirror the env defaults (env is undefined-keyed under test). */
export function resolveStrategistModel(): string {
  return env.EQUIPE_MODEL_STRATEGIST ?? DEFAULT_STRATEGIST_MODEL;
}

export function resolveResearchModel(): string {
  return env.EQUIPE_MODEL_RESEARCH ?? DEFAULT_RESEARCH_MODEL;
}

export function resolveReviewerModel(): string {
  return env.EQUIPE_MODEL_REVIEWER ?? DEFAULT_REVIEWER_MODEL;
}

export function resolveStrategistEffort(): EquipeEffort {
  return env.EQUIPE_EFFORT_STRATEGIST ?? DEFAULT_STRATEGIST_EFFORT;
}

export function resolveResearchEffort(): EquipeEffort {
  return env.EQUIPE_EFFORT_RESEARCH ?? DEFAULT_RESEARCH_EFFORT;
}

export function resolveReviewerEffort(): EquipeEffort {
  return env.EQUIPE_EFFORT_REVIEWER ?? DEFAULT_REVIEWER_EFFORT;
}

/** Redação reuses the existing caption generator on OPENAI_TEXT_MODEL. */
export const DEFAULT_WRITER_MODEL = "gpt-5.6-sol";

export function resolveWriterModel(): string {
  return env.OPENAI_TEXT_MODEL ?? DEFAULT_WRITER_MODEL;
}

export const DEFAULT_AI_MONTHLY_BUDGET_USD_CENTS = 100000;

/** Monthly per-account cap in USD cents (provider estimates, not invoices). */
export function resolveAgentMonthlyBudgetUsdCents(): number {
  const value = env.EQUIPE_AI_MONTHLY_BUDGET_USD_CENTS;
  return typeof value === "number" && Number.isFinite(value) ? value : DEFAULT_AI_MONTHLY_BUDGET_USD_CENTS;
}
