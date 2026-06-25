export type IntentClassificationResult =
  | { kind: "skip" }
  | {
      kind: "classified";
      intent: "quick_action" | "complete_campaign";
      source: "heuristic" | "model_hint";
    }
  | { kind: "clarify"; question: string };

const GREETING_SKIP_PATTERN =
  /^(oi|olá|ola|hello|hi|hey|bom dia|boa tarde)\b/i;

const QUICK_KEYWORD_PATTERN =
  /\b(restyle|restyling|reestilizar|regenerar|pontual|quick|adaptar formato)\b/i;

const CAMPAIGN_KEYWORD_PATTERN =
  /\b(campanha completa|nova campanha|lançar campanha|brief completo|estratégia de campanha)\b/i;

const CLARIFY_QUESTION =
  "Você quer uma ação pontual ou montar uma campanha completa?";

const SKIP_FALLBACK_HINT =
  "If the user requests an executable action and intent is unclear, ask one clarifying question: quick action vs. complete campaign.";

export function classifyUserIntent(
  userMessage: string
): IntentClassificationResult {
  const trimmed = userMessage.trim();

  if (GREETING_SKIP_PATTERN.test(trimmed) && trimmed.length < 40) {
    return { kind: "skip" };
  }

  const quick = QUICK_KEYWORD_PATTERN.test(trimmed);
  const campaign = CAMPAIGN_KEYWORD_PATTERN.test(trimmed);

  if (quick && campaign) {
    return { kind: "clarify", question: CLARIFY_QUESTION };
  }

  if (quick) {
    return { kind: "classified", intent: "quick_action", source: "heuristic" };
  }

  if (campaign) {
    return {
      kind: "classified",
      intent: "complete_campaign",
      source: "heuristic",
    };
  }

  return { kind: "skip" };
}

export function buildIntentPromptAugment(
  result: IntentClassificationResult
): string | null {
  if (result.kind === "clarify") {
    return null;
  }

  if (result.kind === "classified") {
    return `Intent family: ${result.intent} — prefer contracts in that family when proposing actions.`;
  }

  return SKIP_FALLBACK_HINT;
}
