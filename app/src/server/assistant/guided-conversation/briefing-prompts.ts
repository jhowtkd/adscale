import {
  getNextStep,
  mapGuidedAnswersToCampaignDraft,
  type GuidedBriefingAnswers,
  type GuidedBriefingStepId,
} from "@/server/ai/guided-briefing";

const FIELD_BY_STEP: Record<GuidedBriefingStepId, keyof GuidedBriefingAnswers> = {
  productOffer: "product",
  audience: "audience",
  promise: "promise",
  objections: "objections",
  cta: "cta",
  platforms: "platforms",
  constraints: "constraints",
};

const STEP_LABEL_KEY: Record<GuidedBriefingStepId, string> = {
  productOffer: "productOffer",
  audience: "audience",
  promise: "promise",
  objections: "objections",
  cta: "cta",
  platforms: "platforms",
  constraints: "constraints",
};

const SKIPPABLE_STEPS = new Set<GuidedBriefingStepId>([
  "objections",
  "constraints",
]);

export function answersFromJourneySlots(
  slots: Record<string, unknown>
): GuidedBriefingAnswers {
  const answers = slots.answers as
    | Record<string, { value: string; unknown?: boolean }>
    | undefined;

  if (!answers) {
    return (slots.briefAnswers as GuidedBriefingAnswers) ?? {};
  }

  const mapped: GuidedBriefingAnswers = {};
  for (const [key, entry] of Object.entries(answers)) {
    if (entry.unknown) {
      if (key === "objections" || key === "constraints") {
        mapped[key as keyof GuidedBriefingAnswers] = "";
      }
      continue;
    }
    mapped[key as keyof GuidedBriefingAnswers] = entry.value;
  }

  if (!mapped.product && answers.offer?.value) {
    mapped.offer = answers.offer.value;
  }
  if (!mapped.offer && answers.product?.value && answers.productOffer?.value) {
    mapped.product = answers.productOffer.value;
  }

  return mapped;
}

export function getActiveBriefingPrompt(slots: Record<string, unknown>) {
  const answers = answersFromJourneySlots(slots);
  const nextStep = getNextStep(answers);
  if (!nextStep) {
    return null;
  }

  let field = FIELD_BY_STEP[nextStep];
  let labelKey = STEP_LABEL_KEY[nextStep];

  if (nextStep === "productOffer" && answers.product?.trim() && !answers.offer?.trim()) {
    field = "offer";
    labelKey = "offer";
  }

  const hints = (slots.briefHints ?? {}) as Record<string, string>;
  const suggestionKey =
    field === "product"
      ? "suggestedOffer"
      : `suggested${field.charAt(0).toUpperCase()}${field.slice(1)}`;
  const hintValue = hints[suggestionKey] ?? hints[field];
  const fallbackSuggestion = fallbackSuggestionForField(field);
  const suggestionValue = hintValue ?? fallbackSuggestion;

  return {
    field,
    stepId: nextStep,
    labelKey,
    allowSkip: SKIPPABLE_STEPS.has(nextStep),
    allowUnknown: SKIPPABLE_STEPS.has(nextStep),
    quickReplies: suggestionValue ? [suggestionValue] : undefined,
    suggestion: suggestionValue
      ? {
          value: suggestionValue,
          source: hintValue
            ? hints[suggestionSourceKey(field)] ?? "brand"
            : "sistema",
        }
      : null,
  };
}

function fallbackSuggestionForField(field: string): string | null {
  const suggestions: Record<string, string> = {
    product: "Descreva o produto ou serviço principal",
    offer: "Explique a oferta concreta desta campanha",
    audience: "Defina o público mais importante",
    promise: "Declare o principal benefício prometido",
    objections: "Não sei",
    cta: "Saiba mais",
    platforms: "Instagram e Facebook",
    constraints: "Não sei",
  };
  return suggestions[field] ?? null;
}

function suggestionSourceKey(field: string) {
  return `${field}Source`;
}

export function isBriefingComplete(slots: Record<string, unknown>) {
  const answers = answersFromJourneySlots(slots);
  return getNextStep(answers) === null;
}

export function buildBriefReview(slots: Record<string, unknown>) {
  const answers = answersFromJourneySlots(slots);
  const snapshot = mapGuidedAnswersToCampaignDraft(answers, "pt-BR");
  return {
    product: answers.product ?? "",
    offer: answers.offer ?? "",
    audience: answers.audience ?? "",
    promise: answers.promise ?? "",
    objections: answers.objections ?? "",
    cta: answers.cta ?? "",
    platforms: answers.platforms ?? "",
    constraints: answers.constraints ?? "",
    objective: snapshot.objective ?? "",
  };
}

export function briefingReadinessPasses(slots: Record<string, unknown>) {
  const answers = answersFromJourneySlots(slots);
  const required = ["product", "offer", "audience", "promise", "cta", "platforms"] as const;
  return required.every((key) => Boolean(answers[key]?.trim()));
}
