import type { ContentBrief } from "@/server/ai/image-analysis";
import { CREATIVE_WORK_BRAND_CHOICES, type CreativeSourceUsage } from "./contracts";

/**
 * R-003 / spec 8.4 — restyle brand conflict.
 *
 * When the content art confidently carries an explicit brand that differs
 * from the active workspace brand, `prepare` must stop with a typed
 * `brand_conflict` error (before copy, persistence, billing or any image
 * call) and offer exactly two short choices: keep the art's brand ("source")
 * or convert to the active brand ("active"). The choice is persisted as an
 * optional `CreativeWorkSettings.brandConflictChoice` field.
 *
 * Absence — or ambiguity — of a conflict proceeds automatically with the
 * active brand: no question is ever added outside a high-confidence,
 * single, explicit, different brand (spec 11: the restyle brand choice is
 * the only new visible decision). This detector is deterministic and
 * precision-first: it never infers a brand, it only recognizes one already
 * stated by the persisted content analysis.
 */

export interface CreativeWorkBrandConflictDetails {
  /** The explicit brand found in the content art (e.g. "XTB"). */
  detectedBrand: string;
  /** The active workspace brand the piece would otherwise use. */
  activeBrand: string;
  /** The content source whose analysis stated the conflicting brand. */
  sourceId: string;
  /** Exactly the two short choices the UI may render — never more. */
  choices: typeof CREATIVE_WORK_BRAND_CHOICES;
}

/**
 * Tokens that describe brand ARTIFACTS (logo, palette, typography...), colors
 * or connective words — never a brand name itself. They are stripped from a
 * `brandElements` entry before the remainder is considered a brand candidate.
 */
const GENERIC_BRAND_TOKENS = new Set([
  "logo", "logotipo", "logomarca", "marca", "brand", "slogan", "tagline",
  "ícone", "icone", "icon", "selo", "badge", "símbolo", "simbolo", "symbol",
  "cor", "cores", "color", "colors", "paleta", "palette",
  "tipografia", "typography", "fonte", "font",
  "gradiente", "gradient", "degradê", "degrade",
  "azul", "vermelho", "verde", "amarelo", "preto", "branco", "cinza",
  "rosa", "roxo", "laranja", "dourado", "prateado", "marrom", "bege",
  "blue", "red", "green", "yellow", "black", "white", "gray", "grey",
  "pink", "purple", "orange", "gold", "golden", "silver", "brown",
  "oficial", "official", "principal", "main",
  "de", "da", "do", "das", "dos", "e", "of", "the", "and",
]);

function normalizeToken(token: string): string {
  return token.toLocaleLowerCase("pt-BR").replace(/[^a-z0-9à-ÿ]+/gi, "");
}

/** Identity-only normalization: immune to punctuation, casing and spacing. */
function normalizeTight(value: string): string {
  return value.toLocaleLowerCase("pt-BR").replace(/[^a-z0-9à-ÿ]+/gi, "");
}

/**
 * Ordered token stream of a free-text value (lowercased, punctuation split
 * away). Matching is ALWAYS token-level: a compacted substring search would
 * corroborate "XP" inside "experiência" or absorb "Nu" into "Nutrifood".
 */
function tokenize(value: string): string[] {
  return value
    .toLocaleLowerCase("pt-BR")
    .split(/[^a-z0-9à-ÿ]+/i)
    .filter((token) => token.length > 0);
}

/** True when the needle token sequence appears contiguously in the haystack. */
function containsTokenSequence(haystack: readonly string[], needle: readonly string[]): boolean {
  if (needle.length === 0 || needle.length > haystack.length) return false;
  outer: for (let start = 0; start + needle.length <= haystack.length; start += 1) {
    for (let offset = 0; offset < needle.length; offset += 1) {
      if (haystack[start + offset] !== needle[offset]) continue outer;
    }
    return true;
  }
  return false;
}

/**
 * Extract a name-like brand candidate from one `brandElements` entry, or null
 * when the entry describes an artifact/color/tagline instead of a name. A
 * candidate is 1–3 non-generic words, 2–30 chars — e.g. "XTB" from
 * "logo da XTB" — never an inferred value.
 */
function extractBrandCandidate(element: string): string | null {
  if (element.includes("#")) return null; // hex color swatch, not a name
  const kept = element
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0 && !GENERIC_BRAND_TOKENS.has(normalizeToken(word)));
  if (kept.length === 0 || kept.length > 3) return null;
  const candidate = kept.join(" ").trim();
  if (candidate.length < 2 || candidate.length > 30) return null;
  if (!/[a-z0-9à-ÿ]/i.test(candidate)) return null;
  return candidate;
}

/**
 * A candidate only counts as an explicit brand when the same analysis states
 * it again outside `brandElements` (product, headline, bullets or CTA). A
 * bare tagline or artifact mention never reaches confidence by itself.
 */
function isCorroborated(candidate: string, content: ContentBrief): boolean {
  const candidateTokens = tokenize(candidate);
  if (candidateTokens.length === 0) return false;
  const corpus = [
    content.product,
    content.textContent?.headline ?? "",
    ...(content.textContent?.bullets ?? []),
    content.cta?.text ?? "",
  ].join("\n");
  return containsTokenSequence(tokenize(corpus), candidateTokens);
}

/**
 * Same brand family when either token stream contains the other contiguously
 * ("XTB Corretora" ⊇ "XTB"). A bare substring never merges distinct brands:
 * "Nu" is NOT "Nutrifood".
 */
function isSameBrand(candidate: string, activeBrand: string): boolean {
  const candidateTokens = tokenize(candidate);
  const activeTokens = tokenize(activeBrand);
  if (candidateTokens.length === 0 || activeTokens.length === 0) return false;
  return containsTokenSequence(candidateTokens, activeTokens)
    || containsTokenSequence(activeTokens, candidateTokens);
}

/**
 * Detect a high-confidence explicit brand conflict between the content art
 * and the active brand. Returns the typed details for the `brand_conflict`
 * error, or null when there is no conflict — including every ambiguous case
 * (no active brand to compare against, no explicit candidate, several
 * distinct candidates), which always proceeds with the active brand.
 */
export function detectCreativeWorkBrandConflict(input: {
  sources: ReadonlyArray<{
    sourceId: string;
    usage: CreativeSourceUsage;
    content: ContentBrief | null;
  }>;
  activeBrandName: string | null;
}): CreativeWorkBrandConflictDetails | null {
  const activeBrand = input.activeBrandName?.trim() ?? "";
  if (!activeBrand) return null;

  const detections = new Map<string, { detectedBrand: string; sourceId: string }>();
  for (const source of input.sources) {
    // Only the content art can carry the conflicting brand; style sources
    // transfer visual language only and are never a factual authority.
    if (source.usage === "style" || !source.content) continue;
    for (const element of source.content.brandElements ?? []) {
      const candidate = extractBrandCandidate(element);
      if (!candidate) continue;
      if (isSameBrand(candidate, activeBrand)) continue;
      if (!isCorroborated(candidate, source.content)) continue;
      const key = normalizeTight(candidate);
      if (!detections.has(key)) {
        detections.set(key, { detectedBrand: candidate, sourceId: source.sourceId });
      }
    }
  }

  // Exactly one distinct explicit brand is a confident conflict; two or more
  // different brands is ambiguity, which proceeds with the active brand.
  if (detections.size !== 1) return null;
  const [detection] = detections.values();
  return {
    detectedBrand: detection.detectedBrand,
    activeBrand,
    sourceId: detection.sourceId,
    choices: CREATIVE_WORK_BRAND_CHOICES,
  };
}
