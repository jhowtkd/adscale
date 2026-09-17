import type { ContentBrief } from "@/server/ai/image-analysis";
import type {
  BriefingConfidence,
  BriefingReadiness,
  CreativeWorkFactPack,
  CreativeWorkFormat,
  InferredBriefing,
  SocialPostBrief,
  CreativeWorkBriefingOverrides,
} from "./contracts";

export function formatFromDimensions(width: number | null, height: number | null): CreativeWorkFormat | null {
  if (width == null || height == null || !Number.isFinite(width) || !Number.isFinite(height)
    || width <= 0 || height <= 0) return null;
  const ratio = width / height;
  for (const [format, target] of [["1:1", 1], ["4:5", 4 / 5], ["9:16", 9 / 16], ["3:4", 3 / 4]] as const) {
    if (Math.abs(ratio / target - 1) <= 0.01) return format;
  }
  return null;
}

export function inferCreativeWorkFormat(
  analyses: readonly Pick<ContentBrief, "format">[],
  request = "",
  sourceFormat: CreativeWorkFormat | null = null,
): CreativeWorkFormat | null {
  const explicitFormats = [...new Set((request.match(/\b(?:1\s*:\s*1|4\s*:\s*5|9\s*:\s*16|3\s*:\s*4)\b/g) ?? [])
    .map((format) => format.replace(/\s/g, "")))];
  if (explicitFormats.length === 1) return explicitFormats[0] as CreativeWorkFormat;
  if (sourceFormat) return sourceFormat;
  const candidates = [
    ...(explicitFormats.length > 1 ? [] : [request]),
    ...analyses.map((analysis) => analysis.format),
  ];
  for (const candidate of candidates) {
    const value = candidate.toLocaleLowerCase("pt-BR");
    if (/\b1\s*:\s*1\b/.test(value)) return "1:1";
    if (/\b9\s*:\s*16\b/.test(value)) return "9:16";
    if (/\b4\s*:\s*5\b/.test(value)) return "4:5";
    if (/\b3\s*:\s*4\b/.test(value)) return "3:4";
    if (/quadrad|square/.test(value)) return "1:1";
    if (/story|stories|reel|vertical/.test(value)) return "9:16";
    if (/retrato|portrait/.test(value)) return "4:5";
  }
  return null;
}

export function deriveCreativeWorkTitle(request: string): string {
  const normalized = request.trim().replace(/\s+/g, " ");
  const firstSentence = normalized.split(/[.!?]+/).find((part) => part.trim()) ?? normalized;
  return firstSentence.replace(/[.!?]+$/, "").trim().slice(0, 80);
}

function uniqueTrimmed(values: readonly (string | null | undefined)[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value?.trim() ?? "";
    const key = trimmed.toLocaleLowerCase("pt-BR");
    if (!trimmed || seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}

/**
 * Reduced presentation brief: every content analysis contributes, and absent
 * information stays absent — the audience is never filled with a generic
 * placeholder (R-002 / spec 7.2). The factual truth for copy and generation
 * lives in the fact pack, not here; `deriveCreativeWorkTitle` stays
 * presentation-only.
 */
export function inferSocialPostBrief(request: string, analyses: readonly ContentBrief[]): SocialPostBrief {
  const title = deriveCreativeWorkTitle(request);
  const products = uniqueTrimmed(analyses.map((analysis) => analysis.product));
  const offers = uniqueTrimmed(analyses.map((analysis) => analysis.offer));
  const headlines = uniqueTrimmed(analyses.map((analysis) => analysis.textContent?.headline));
  const theme = title || headlines[0] || products[0] || "";
  const objective = products.length > 0
    ? `Promover ${products.join(" e ")}`
    : theme
      ? `Promover ${theme}`
      : "";
  return {
    theme: theme.slice(0, 240),
    objective: objective.slice(0, 240),
    audience: "",
    offer: offers.length > 0 ? offers.join(" e ").slice(0, 240) : null,
  };
}

export function applyCreativeWorkBriefingOverrides(
  brief: SocialPostBrief,
  overrides?: CreativeWorkBriefingOverrides,
): SocialPostBrief {
  if (!overrides) return brief;
  return {
    ...brief,
    ...(Object.prototype.hasOwnProperty.call(overrides, "message") ? { theme: overrides.message ?? "" } : {}),
    ...(Object.prototype.hasOwnProperty.call(overrides, "objective") ? { objective: overrides.objective ?? "" } : {}),
    ...(Object.prototype.hasOwnProperty.call(overrides, "audience") ? { audience: overrides.audience ?? "" } : {}),
    ...(Object.prototype.hasOwnProperty.call(overrides, "offer") ? { offer: overrides.offer ?? null } : {}),
  };
}

const FACTUAL_CLASSES = new Set([
  "price", "date", "offer", "benefit", "proof", "condition", "credential", "modality", "guarantee", "product", "service",
]);
const TONE_WORDS = /\b(moderno|moderna|direto|direta|acolhedor|acolhedora|sofisticado|sofisticada|leve|premium|ousado|ousada|minimalista|editorial)\b/i;

function unknownField(): InferredBriefing["message"] {
  return { value: null, state: "unknown" };
}

function knownField(value: string, state: "sourced" | "inferred", confidence?: BriefingConfidence) {
  return state === "inferred"
    ? { value, state, confidence: confidence ?? "medium" as const }
    : { value, state };
}

function findExplicitTone(request: string): string | null {
  return request.match(TONE_WORDS)?.[0] ?? null;
}

function valueHasOrigin(value: string, factPack: CreativeWorkFactPack): boolean {
  const normalized = value.toLocaleLowerCase("pt-BR").trim();
  return factPack.request.toLocaleLowerCase("pt-BR").includes(normalized)
    || factPack.facts.some((fact) => fact.value.toLocaleLowerCase("pt-BR") === normalized);
}

function sourcedConstraints(factPack: CreativeWorkFactPack): string {
  return uniqueTrimmed([
    ...factPack.facts
      .filter((fact) => fact.class === "date" || fact.class === "condition")
      .map((fact) => fact.value),
    ...factPack.brand.requiredElements.map((value) => `Incluir: ${value}`),
    ...factPack.brand.prohibitedElements.map((value) => `Evitar: ${value}`),
  ]).join("; ");
}

/** Build the durable presentation envelope without adding a second fact source. */
export function buildInferredBriefing(input: {
  request: string;
  brief: SocialPostBrief;
  factPack: CreativeWorkFactPack;
  toneOfVoice?: string | null;
  briefingOverrides?: CreativeWorkBriefingOverrides;
}): InferredBriefing {
  const brief = applyCreativeWorkBriefingOverrides(input.brief, input.briefingOverrides);
  const message = brief.theme.trim();
  const objective = brief.objective.trim();
  const audience = brief.audience.trim();
  // A request discount is an explicit offer even though the fact pack keeps
  // its factual class as `price`; source offers remain the richer value.
  const offerFact = input.factPack.facts.find((fact) => fact.class === "offer")
    ?? input.factPack.facts.find((fact) => fact.class === "price" && fact.origin === "request");
  const hasOfferOverride = Object.prototype.hasOwnProperty.call(input.briefingOverrides ?? {}, "offer");
  const hasMessageOverride = Object.prototype.hasOwnProperty.call(input.briefingOverrides ?? {}, "message");
  const hasObjectiveOverride = Object.prototype.hasOwnProperty.call(input.briefingOverrides ?? {}, "objective");
  const hasAudienceOverride = Object.prototype.hasOwnProperty.call(input.briefingOverrides ?? {}, "audience");
  const offer = hasOfferOverride ? brief.offer?.trim() ?? "" : offerFact?.value ?? "";
  const tone = Object.prototype.hasOwnProperty.call(input.briefingOverrides ?? {}, "tone")
    ? input.briefingOverrides?.tone?.trim() ?? ""
    : findExplicitTone(input.request) ?? input.toneOfVoice?.trim() ?? "";
  const constraints = Object.prototype.hasOwnProperty.call(input.briefingOverrides ?? {}, "constraints")
    ? input.briefingOverrides?.constraints?.trim() ?? ""
    : sourcedConstraints(input.factPack);
  const hasFactualContext = input.factPack.facts.some((fact) => FACTUAL_CLASSES.has(fact.class));
  const hasActionableDirection = Boolean(message && objective);
  const readiness: BriefingReadiness = hasActionableDirection
    ? hasFactualContext ? "ready" : "exploratory"
    : "blocked";
  const inferredCount = Number(Boolean(objective)) + Number(!tone && Boolean(message));
  const confidence: BriefingConfidence = readiness === "exploratory"
    ? "low"
    : inferredCount > 0
      ? "medium"
      : "high";

  return {
    version: 1,
    message: message
      ? knownField(message, hasMessageOverride || valueHasOrigin(message, input.factPack) ? "sourced" : "inferred")
      : unknownField(),
    objective: objective
      ? knownField(objective, hasObjectiveOverride ? "sourced" : "inferred", "medium")
      : unknownField(),
    audience: audience
      ? knownField(audience, hasAudienceOverride || valueHasOrigin(audience, input.factPack) ? "sourced" : "inferred")
      : unknownField(),
    offer: offer ? knownField(offer, "sourced") : unknownField(),
    tone: tone ? knownField(tone, "sourced") : unknownField(),
    constraints: constraints ? knownField(constraints, "sourced") : unknownField(),
    readiness,
    confidence,
  };
}
