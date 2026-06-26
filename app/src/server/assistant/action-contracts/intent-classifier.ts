export type IntentClassificationResult =
  | { kind: "skip" }
  | {
      kind: "classified";
      intent: "quick_action" | "complete_campaign";
      source: "heuristic" | "model_hint";
    }
  | { kind: "clarify"; question: string };

export type GuidedPathClassificationResult =
  | { kind: "skip" }
  | {
      kind: "classified";
      path: "existing_creative" | "from_zero";
      source: "heuristic";
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

const GUIDED_PATH_CLARIFY_QUESTION =
  "Você já tem uma peça criativa ou quer produzir do zero?";

const EXISTING_CREATIVE_PATTERN =
  /\b(já tenho|tenho peça|peça pronta|criativo existente|anúncio pronto|imagem pronta|material pronto|adaptar peça|melhorar peça|diagnóstico)\b/i;

const FROM_ZERO_PATTERN =
  /\b(do zero|produzir do zero|criar do zero|nova peça|sem referência|briefing|campanha nova|estratégia|referências visuais)\b/i;

const SKIP_FALLBACK_HINT =
  "If the user requests an executable action and intent is unclear, ask one clarifying question: quick action vs. complete campaign.";

const LATERAL_QUESTION_HINT =
  "When the user asks a short side question during an in-progress workflow, answer briefly and keep any pending state. Do not repeat the entire prior context block.";

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

export function classifyGuidedPath(
  userMessage: string
): GuidedPathClassificationResult {
  const trimmed = userMessage.trim();

  if (GREETING_SKIP_PATTERN.test(trimmed) && trimmed.length < 40) {
    return { kind: "skip" };
  }

  const existing = EXISTING_CREATIVE_PATTERN.test(trimmed);
  const fromZero = FROM_ZERO_PATTERN.test(trimmed);

  if (existing && fromZero) {
    return { kind: "clarify", question: GUIDED_PATH_CLARIFY_QUESTION };
  }

  if (existing) {
    return { kind: "classified", path: "existing_creative", source: "heuristic" };
  }

  if (fromZero) {
    return { kind: "classified", path: "from_zero", source: "heuristic" };
  }

  return { kind: "skip" };
}

export function buildAttachmentPromptAugment(input: {
  attachments?: Array<{ assetId?: string; key?: string; type: string; name?: string }>;
  hasCampaign: boolean;
}): string | null {
  const hasImage = input.attachments?.some((attachment) =>
    attachment.type.startsWith("image/")
  );
  if (!hasImage) {
    return null;
  }

  if (!input.hasCampaign) {
    return [
      "The user attached an image without an active campaign thread.",
      "Acknowledge the attachment and collect target formats, but do not propose an executable action card yet because generation requires a campaign-linked asset.",
      "If the user wants to proceed, ask them to link this thread to a campaign or create a campaign first.",
    ].join(" ");
  }

  const refs = input.attachments
    ?.filter((attachment) => attachment.type.startsWith("image/"))
    .map((attachment) => `${attachment.name ?? "image"} assetId=${attachment.assetId ?? "unknown"}`)
    .join("; ");

  return [
    "The user attached an image in a campaign thread.",
    refs ? `Available attached image references: ${refs}.` : "",
    "Use the attached image as source context when proposing the next confirmed action, and do not invent asset ids.",
  ]
    .filter(Boolean)
    .join(" ");
}

export function buildIntentPromptAugment(
  result: IntentClassificationResult
): string | null {
  if (result.kind === "clarify") {
    return null;
  }

  if (result.kind === "classified") {
    return `Intent family: ${result.intent} — prefer contracts in that family when proposing actions.\n${LATERAL_QUESTION_HINT}`;
  }

  return `${SKIP_FALLBACK_HINT}\n${LATERAL_QUESTION_HINT}`;
}
