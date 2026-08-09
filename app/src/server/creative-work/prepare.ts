import type { ContentBrief } from "@/server/ai/image-analysis";
import type {
  BriefingConfidence,
  BriefingReadiness,
  CreativeWorkFactPack,
  CreativeWorkFormat,
  InferredBriefing,
  SocialPostBrief,
} from "./contracts";

export function inferCreativeWorkFormat(
  analyses: readonly Pick<ContentBrief, "format">[],
  request = "",
): CreativeWorkFormat | null {
  const candidates = [request, ...analyses.map((analysis) => analysis.format)];
  for (const candidate of candidates) {
    const value = candidate.toLocaleLowerCase("pt-BR");
    if (/\b1\s*:\s*1\b/.test(value)) return "1:1";
    if (/\b9\s*:\s*16\b/.test(value)) return "9:16";
    if (/\b4\s*:\s*5\b/.test(value)) return "4:5";
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
    offer: offers.join(" e ").slice(0, 240),
  };
}

const FACTUAL_CLASSES = new Set([
  "price", "date", "offer", "benefit", "proof", "condition", "credential", "modality", "guarantee", "product", "service",
]);
const PLATFORM_NAMES = new Set(["instagram", "facebook", "linkedin", "tiktok", "meta", "google", "youtube", "threads"]);
const TONE_WORDS = /\b(moderno|moderna|direto|direta|acolhedor|acolhedora|sofisticado|sofisticada|leve|premium|ousado|ousada|minimalista|editorial)\b/i;

function unknownField(): InferredBriefing["message"] {
  return { value: null, state: "unknown" };
}

function knownField(value: string, state: "sourced" | "inferred", confidence?: BriefingConfidence) {
  return state === "inferred"
    ? { value, state, confidence: confidence ?? "medium" as const }
    : { value, state };
}

function findExplicitAudience(request: string): string | null {
  const match = request.match(/\bpara\s+([^,.!?;\n]+)/i);
  const value = match?.[1]?.trim().replace(/\s+/g, " ") ?? "";
  if (!value || PLATFORM_NAMES.has(value.toLocaleLowerCase("pt-BR"))) return null;
  return value.slice(0, 240);
}

function findExplicitTone(request: string): string | null {
  return request.match(TONE_WORDS)?.[0] ?? null;
}

function valueHasOrigin(value: string, factPack: CreativeWorkFactPack): boolean {
  const normalized = value.toLocaleLowerCase("pt-BR").trim();
  return factPack.request.toLocaleLowerCase("pt-BR").includes(normalized)
    || factPack.facts.some((fact) => fact.value.toLocaleLowerCase("pt-BR") === normalized);
}

/** Build the durable presentation envelope without adding a second fact source. */
export function buildInferredBriefing(input: {
  request: string;
  brief: SocialPostBrief;
  factPack: CreativeWorkFactPack;
  toneOfVoice?: string | null;
}): InferredBriefing {
  const message = input.brief.theme.trim();
  const objective = input.brief.objective.trim();
  const audience = input.brief.audience.trim() || findExplicitAudience(input.request) || "";
  // A request discount is an explicit offer even though the fact pack keeps
  // its factual class as `price`; source offers remain the richer value.
  const offerFact = input.factPack.facts.find((fact) => fact.class === "offer")
    ?? input.factPack.facts.find((fact) => fact.class === "price" && fact.origin === "request");
  const offer = offerFact?.value ?? "";
  const tone = findExplicitTone(input.request) ?? input.toneOfVoice?.trim() ?? "";
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
      ? knownField(message, valueHasOrigin(message, input.factPack) ? "sourced" : "inferred")
      : unknownField(),
    objective: objective
      ? knownField(objective, "inferred", "medium")
      : unknownField(),
    audience: audience
      ? knownField(audience, valueHasOrigin(audience, input.factPack) ? "sourced" : "inferred")
      : unknownField(),
    offer: offer ? knownField(offer, "sourced") : unknownField(),
    tone: tone ? knownField(tone, "sourced") : unknownField(),
    constraints: unknownField(),
    readiness,
    confidence,
  };
}
