export const GUIDED_BRIEFING_STEP_ORDER = [
  "productOffer",
  "audience",
  "promise",
  "objections",
  "cta",
  "platforms",
  "constraints",
] as const;

export type GuidedBriefingStepId = (typeof GUIDED_BRIEFING_STEP_ORDER)[number];

export type GuidedBriefingLocale = "pt-BR" | "en";

export interface GuidedBriefingAnswers {
  product?: string;
  offer?: string;
  audience?: string;
  promise?: string;
  objections?: string;
  cta?: string;
  platforms?: string;
  constraints?: string;
}

export interface GuidedBriefingHints {
  suggestedObjective?: string;
  suggestedAudience?: string;
  suggestedPlatforms?: string;
  suggestedCta?: string;
  suggestedTone?: string;
  detectedConcept?: string;
  client?: string;
}

export interface CampaignBriefSnapshot {
  product?: string | null;
  offer?: string | null;
  audience?: string | null;
  objective?: string | null;
  constraints?: string | null;
  platforms?: string[] | null;
  ctaVariants?: string[] | null;
}

const OBJECTIONS_PREFIX_EN = "Objections to address:";
const OBJECTIONS_PREFIX_PT = "Objeções a endereçar:";

export function isBriefWeak(snapshot: CampaignBriefSnapshot): boolean {
  const core = [
    snapshot.product,
    snapshot.offer,
    snapshot.audience,
    snapshot.objective,
  ].filter((value) => typeof value === "string" && value.trim().length > 0);
  return core.length < 2;
}

function isStepComplete(
  stepId: GuidedBriefingStepId,
  answers: GuidedBriefingAnswers
): boolean {
  switch (stepId) {
    case "productOffer":
      return Boolean(answers.product?.trim() || answers.offer?.trim());
    case "audience":
      return Boolean(answers.audience?.trim());
    case "promise":
      return Boolean(answers.promise?.trim());
    case "objections":
      return answers.objections !== undefined;
    case "cta":
      return Boolean(answers.cta?.trim());
    case "platforms":
      return Boolean(answers.platforms?.trim());
    case "constraints":
      return answers.constraints !== undefined;
    default:
      return false;
  }
}

export function getNextStep(
  answers: GuidedBriefingAnswers
): GuidedBriefingStepId | null {
  for (const stepId of GUIDED_BRIEFING_STEP_ORDER) {
    if (!isStepComplete(stepId, answers)) {
      return stepId;
    }
  }
  return null;
}

export function answersFromCampaign(
  campaign: CampaignBriefSnapshot
): GuidedBriefingAnswers {
  const objections = extractObjectionsFromConstraints(
    campaign.constraints ?? undefined
  );
  const constraintsWithoutObjections = stripObjectionsFromConstraints(
    campaign.constraints ?? undefined
  );

  return {
    product: campaign.product?.trim() || undefined,
    offer: campaign.offer?.trim() || undefined,
    audience: campaign.audience?.trim() || undefined,
    promise: campaign.objective?.trim() || undefined,
    objections,
    cta: campaign.ctaVariants?.[0]?.trim() || undefined,
    platforms: campaign.platforms?.join(", ") || undefined,
    constraints: constraintsWithoutObjections,
  };
}

function extractObjectionsFromConstraints(
  constraints: string | undefined
): string | undefined {
  if (!constraints?.trim()) return undefined;
  const lines = constraints.split("\n");
  const prefixLine = lines.find(
    (line) =>
      line.startsWith(OBJECTIONS_PREFIX_EN) ||
      line.startsWith(OBJECTIONS_PREFIX_PT)
  );
  if (!prefixLine) return undefined;
  const value = prefixLine
    .replace(OBJECTIONS_PREFIX_EN, "")
    .replace(OBJECTIONS_PREFIX_PT, "")
    .trim();
  return value || "";
}

function stripObjectionsFromConstraints(
  constraints: string | undefined
): string | undefined {
  if (!constraints?.trim()) return undefined;
  const filtered = constraints
    .split("\n")
    .filter(
      (line) =>
        !line.startsWith(OBJECTIONS_PREFIX_EN) &&
        !line.startsWith(OBJECTIONS_PREFIX_PT)
    )
    .join("\n")
    .trim();
  return filtered || undefined;
}

function objectionsPrefix(locale: GuidedBriefingLocale): string {
  return locale === "pt-BR" ? OBJECTIONS_PREFIX_PT : OBJECTIONS_PREFIX_EN;
}

export function buildSuggestion(
  stepId: GuidedBriefingStepId,
  answers: GuidedBriefingAnswers,
  hints: GuidedBriefingHints,
  locale: GuidedBriefingLocale
): string {
  const product = answers.product?.trim() || hints.client?.trim() || hints.detectedConcept?.trim();
  const offer = answers.offer?.trim();
  const isPt = locale === "pt-BR";

  switch (stepId) {
    case "productOffer":
      if (product && offer) return `${product} — ${offer}`;
      if (product) return product;
      if (offer) return offer;
      return hints.detectedConcept?.trim() || (isPt ? "Descreva produto e oferta" : "Describe product and offer");

    case "audience":
      if (hints.suggestedAudience?.trim()) return hints.suggestedAudience.trim();
      if (product && offer) {
        return isPt
          ? `Pessoas interessadas em ${product} com interesse em ${offer}`
          : `People interested in ${product} drawn to ${offer}`;
      }
      if (product) {
        return isPt
          ? `Público com interesse em ${product}`
          : `Audience interested in ${product}`;
      }
      return isPt ? "Adultos da região-alvo da campanha" : "Adults in the campaign target region";

    case "promise":
      if (hints.suggestedObjective?.trim()) return hints.suggestedObjective.trim();
      if (offer && product) {
        return isPt
          ? `Destaque ${offer} para quem busca ${product}`
          : `Highlight ${offer} for people seeking ${product}`;
      }
      if (offer) {
        return isPt ? `Comunicar ${offer} com clareza` : `Communicate ${offer} clearly`;
      }
      return isPt ? "Gerar interesse e ação imediata" : "Drive interest and immediate action";

    case "objections":
      return isPt
        ? "Preço, confiança na marca, tempo para decidir"
        : "Price, brand trust, time to decide";

    case "cta":
      if (hints.suggestedCta?.trim()) return hints.suggestedCta.trim();
      return isPt ? "Saiba mais" : "Learn more";

    case "platforms":
      if (hints.suggestedPlatforms?.trim()) return hints.suggestedPlatforms.trim();
      return isPt ? "Instagram, Facebook" : "Instagram, Facebook";

    case "constraints":
      if (hints.suggestedTone?.trim()) {
        return isPt
          ? `Manter tom ${hints.suggestedTone}; preservar identidade visual`
          : `Keep ${hints.suggestedTone} tone; preserve visual identity`;
      }
      return isPt
        ? "Preservar logo e cores da marca; evitar promessas não comprovadas"
        : "Preserve brand logo and colors; avoid unverified claims";

    default:
      return "";
  }
}

export function parsePlatformsInput(value: string): string[] {
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

export function mergeConstraintsWithObjections(
  objections: string | undefined,
  constraints: string | undefined,
  locale: GuidedBriefingLocale
): string | undefined {
  const parts: string[] = [];
  const trimmedObjections = objections?.trim();
  if (trimmedObjections) {
    parts.push(`${objectionsPrefix(locale)} ${trimmedObjections}`);
  }
  const trimmedConstraints = constraints?.trim();
  if (trimmedConstraints) {
    parts.push(trimmedConstraints);
  }
  return parts.length > 0 ? parts.join("\n") : undefined;
}

export function mapGuidedAnswersToCampaignDraft(
  answers: GuidedBriefingAnswers,
  locale: GuidedBriefingLocale = "en"
): {
  product?: string;
  offer?: string;
  objective?: string;
  audience?: string;
  platforms?: string[];
  ctaVariants?: string[];
  constraints?: string;
} {
  const draft: {
    product?: string;
    offer?: string;
    objective?: string;
    audience?: string;
    platforms?: string[];
    ctaVariants?: string[];
    constraints?: string;
  } = {};

  if (answers.product?.trim()) draft.product = answers.product.trim();
  if (answers.offer?.trim()) draft.offer = answers.offer.trim();
  if (answers.audience?.trim()) draft.audience = answers.audience.trim();
  if (answers.promise?.trim()) draft.objective = answers.promise.trim();
  if (answers.cta?.trim()) draft.ctaVariants = [answers.cta.trim()];
  if (answers.platforms?.trim()) {
    draft.platforms = parsePlatformsInput(answers.platforms);
  }

  const mergedConstraints = mergeConstraintsWithObjections(
    answers.objections,
    answers.constraints,
    locale
  );
  if (mergedConstraints) draft.constraints = mergedConstraints;

  return draft;
}

export function mapGuidedAnswersToPilotBriefing(
  answers: GuidedBriefingAnswers,
  locale: GuidedBriefingLocale = "en"
): {
  objective?: string;
  audience?: string;
  platforms?: string;
  ctaText?: string;
  constraints?: string;
  product?: string;
  offer?: string;
} {
  const draft = mapGuidedAnswersToCampaignDraft(answers, locale);
  return {
    product: draft.product,
    offer: draft.offer,
    objective: draft.objective,
    audience: draft.audience,
    platforms: draft.platforms?.join(", "),
    ctaText: draft.ctaVariants?.[0],
    constraints: draft.constraints,
  };
}
