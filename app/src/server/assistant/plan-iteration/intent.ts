import { classifyPlanFeedback } from "./proposal";

const REVISE_HINTS = [
  /\b(plano|estratégia|estrategia|ângulo|angulo|hook|cta|restr)/i,
  /\b(revis|ajust|mud|alter|troc)/i,
];

export type PlanRevisionIntent =
  | { kind: "revise" }
  | { kind: "clarify" }
  | { kind: "out_of_scope" }
  | { kind: "continue" };

const ACTIONISH_SHORT = /^(melhora|ajusta|refaça|refaca|muda)/i;

export function classifyPlanRevisionIntent(message: string): PlanRevisionIntent {
  const trimmed = message.trim();
  if (!trimmed) return { kind: "continue" };

  const hasReviseHint = REVISE_HINTS.some((pattern) => pattern.test(trimmed));
  if (!hasReviseHint) {
    if (trimmed.length < 12 && ACTIONISH_SHORT.test(trimmed)) {
      return { kind: "clarify" };
    }
    return { kind: "continue" };
  }

  const feedbackClass = classifyPlanFeedback(trimmed);
  if (feedbackClass === "clarify") return { kind: "clarify" };
  if (feedbackClass === "out_of_scope") return { kind: "out_of_scope" };
  return { kind: "revise" };
}
