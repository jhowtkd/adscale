// Agent roles, task kinds, and model resolution (#550).
//
// OpenAI only in the pilot. Models come from env with defaults that track
// the app's existing model vars; the env schema refuses a reviewer model
// equal to an author model (see validation/env.ts).

import { env } from "@/server/validation/env";

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
  "writing",
  "art_direction",
  "review_text",
  "review_visual",
  "measurement",
] as const;

export type EquipeAgentTaskKind = (typeof EQUIPE_AGENT_TASK_KINDS)[number];

export function isAgentTaskKind(value: unknown): value is EquipeAgentTaskKind {
  return (
    typeof value === "string" &&
    (EQUIPE_AGENT_TASK_KINDS as readonly string[]).includes(value)
  );
}

export const DEFAULT_STRATEGIST_MODEL = "gpt-5.6-sol";
export const DEFAULT_RESEARCH_MODEL = "gpt-5.6-sol";
export const DEFAULT_REVIEWER_MODEL = "gpt-4o-mini";

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

/** Redação reuses the existing caption generator on OPENAI_TEXT_MODEL. */
export function resolveWriterModel(): string {
  return env.OPENAI_TEXT_MODEL ?? DEFAULT_STRATEGIST_MODEL;
}

export const DEFAULT_AI_BUDGET_CENTS = 100000;

export function resolveAgentBudgetCents(): number {
  const value = env.EQUIPE_AI_BUDGET_CENTS;
  return typeof value === "number" && Number.isFinite(value) ? value : DEFAULT_AI_BUDGET_CENTS;
}
