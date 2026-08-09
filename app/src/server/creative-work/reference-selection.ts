import type {
  BrandTrainingAnalysis,
  BrandTrainingUsageMode,
} from "../brand-training/contracts";
import type { VisionStructure } from "../brand-training/vision-structure";
import type { CreativeWorkFormat } from "./contracts";

export type ReferenceMediaType = NonNullable<
  NonNullable<VisionStructure["media"]>["type"]
>;

/**
 * Deterministic reference selection (#178).
 *
 * Replaces "first N approved rows" with a score that answers the request:
 * requested format, layout archetype, content density and brief overlap.
 * Pure — rows in, ordered ids out. No db, no network, no model call.
 *
 * Two invariants the tests pin down:
 * - Insertion order never reaches the result. Every comparison ends on a
 *   `referenceId` tiebreak, so a shuffled corpus produces the same output.
 * - Exact-mode assets never consume a style slot. A logo is composited by the
 *   placement policy (#184); sending it as a style reference both wastes a slot
 *   and invites the model to redraw it.
 */

/** width / height for each requested format. */
export const FORMAT_ASPECT: Record<CreativeWorkFormat, number> = {
  "1:1": 1,
  "4:5": 1080 / 1350,
  "9:16": 1080 / 1920,
};

/**
 * Objective wording → layout archetypes that carry that intent. Deliberately
 * small: an unmatched objective scores neutral rather than penalising, so a
 * brand whose references were never vision-analysed still selects sanely.
 */
const OBJECTIVE_ARCHETYPES: Array<{ tokens: string[]; archetypes: string[] }> = [
  {
    tokens: ["evidencia", "dados", "resultado", "prova", "estudo"],
    archetypes: ["evidence_pyramid", "modular_card"],
  },
  {
    tokens: ["demonstracao", "produto", "app", "plataforma", "tela"],
    archetypes: ["device_showcase", "split_media_copy"],
  },
  {
    tokens: ["institucional", "marca", "equipe", "sobre"],
    archetypes: ["institutional_photo", "text_led_card"],
  },
  {
    tokens: ["anuncio", "oferta", "promocao", "lancamento"],
    archetypes: ["text_led_card", "modular_card"],
  },
];

const WEIGHTS = {
  format: 0.4,
  archetype: 0.2,
  density: 0.1,
  media: 0.1,
  overlap: 0.2,
} as const;

/** Neutral score for "no signal", so an unmeasured asset never ranks last by default. */
const NEUTRAL = 0.5;

export interface ReferenceCandidate {
  referenceId: string;
  usageMode: BrandTrainingUsageMode;
  analysis: BrandTrainingAnalysis | null;
  /** Token overlap between brief and analysis prose, computed by the caller. */
  briefOverlap: number;
}

export interface ReferenceSelectionEntry {
  referenceId: string;
  score: number;
  /** Archetype that claimed this slot, when vision inferred one. */
  archetype: string | null;
  reasons: string[];
}

export interface ReferenceSelection {
  selected: ReferenceSelectionEntry[];
  /** Why the caller got this list — persisted so a surprising result is explainable. */
  provenance: {
    strategy: "ranked";
    format: CreativeWorkFormat | null;
    consideredCount: number;
    excludedExactCount: number;
  };
}

function normalizeToken(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/**
 * Aspect closeness on a log scale, so "1:1 asked, 4:5 measured" and the reverse
 * penalise symmetrically. A full octave off (2x) scores 0.
 */
function formatScore(
  analysis: BrandTrainingAnalysis | null,
  targetAspect: number | null,
): number {
  const measured = analysis?.measurement?.aspectRatio;
  if (measured == null || targetAspect == null || measured <= 0) return NEUTRAL;
  const distance = Math.abs(Math.log(measured / targetAspect)) / Math.LN2;
  return Math.max(0, 1 - Math.min(1, distance));
}

function preferredArchetypes(objective: string): string[] {
  const normalized = normalizeToken(objective);
  const matched = OBJECTIVE_ARCHETYPES.filter((entry) =>
    entry.tokens.some((token) => normalized.includes(token)),
  );
  return matched.flatMap((entry) => entry.archetypes);
}

function archetypeScore(
  analysis: BrandTrainingAnalysis | null,
  preferred: string[],
): number {
  const id = analysis?.structure?.archetype?.id;
  if (!id || preferred.length === 0) return NEUTRAL;
  return preferred.includes(id) ? 1 : 0.35;
}

function densityScore(
  analysis: BrandTrainingAnalysis | null,
  desiredCentralMessages: number | null,
): number {
  const central = analysis?.structure?.contentPattern?.centralMessages;
  if (central == null || desiredCentralMessages == null) return NEUTRAL;
  return 1 / (1 + Math.abs(central - desiredCentralMessages));
}

function mediaScore(
  analysis: BrandTrainingAnalysis | null,
  preferred: readonly ReferenceMediaType[],
): number {
  const mediaType = analysis?.structure?.media?.type;
  if (!mediaType || preferred.length === 0) return NEUTRAL;
  return preferred.includes(mediaType) ? 1 : 0.25;
}

/** Diminishing returns: 0→0, 1→0.33, 4→0.67. Never outweighs format. */
function overlapScore(overlap: number): number {
  if (overlap <= 0) return 0;
  return overlap / (overlap + 2);
}

function scoreCandidate(
  candidate: ReferenceCandidate,
  targetAspect: number | null,
  preferred: string[],
  preferredMediaTypes: readonly ReferenceMediaType[],
  desiredCentralMessages: number | null,
): ReferenceSelectionEntry {
  const format = formatScore(candidate.analysis, targetAspect);
  const archetype = archetypeScore(candidate.analysis, preferred);
  const density = densityScore(candidate.analysis, desiredCentralMessages);
  const media = mediaScore(candidate.analysis, preferredMediaTypes);
  const overlap = overlapScore(candidate.briefOverlap);

  const score =
    format * WEIGHTS.format +
    archetype * WEIGHTS.archetype +
    density * WEIGHTS.density +
    media * WEIGHTS.media +
    overlap * WEIGHTS.overlap;

  const measured = candidate.analysis?.measurement?.aspectRatio;
  const archetypeId = candidate.analysis?.structure?.archetype?.id ?? null;
  const reasons: string[] = [
    measured != null && targetAspect != null
      ? `format ${format.toFixed(2)} (measured ${measured.toFixed(3)} vs target ${targetAspect.toFixed(3)})`
      : "format neutral (unmeasured)",
  ];
  if (archetypeId) reasons.push(`archetype ${archetypeId} ${archetype.toFixed(2)}`);
  const mediaType = candidate.analysis?.structure?.media?.type;
  if (mediaType) reasons.push(`media ${mediaType} ${media.toFixed(2)}`);
  const centralMessages = candidate.analysis?.structure?.contentPattern?.centralMessages;
  if (centralMessages != null && desiredCentralMessages != null) {
    reasons.push(
      `density ${density.toFixed(2)} (${centralMessages} vs requested ${desiredCentralMessages})`,
    );
  }
  if (candidate.briefOverlap > 0) reasons.push(`brief overlap ${candidate.briefOverlap}`);

  return { referenceId: candidate.referenceId, score, archetype: archetypeId, reasons };
}

/**
 * Rank approved references for one request.
 *
 * Slots are filled at most once per archetype family first, so three
 * near-identical cards do not crowd out the repertoire. Only when distinct
 * families run out does a second member of a family take a slot.
 */
export function selectReferences(input: {
  candidates: ReferenceCandidate[];
  format: CreativeWorkFormat | null;
  objective: string;
  preferredMediaTypes?: ReferenceMediaType[];
  desiredCentralMessages?: number | null;
  limit?: number;
}): ReferenceSelection {
  const limit = input.limit ?? 3;
  const targetAspect = input.format ? FORMAT_ASPECT[input.format] : null;
  const preferred = preferredArchetypes(input.objective);
  const preferredMediaTypes = input.preferredMediaTypes ?? [];
  const desiredCentralMessages = input.desiredCentralMessages ?? null;

  // Exact assets are composited, never sent as style references (#178 item 4).
  const excludedExactCount = input.candidates.filter(
    (candidate) => candidate.usageMode === "exact",
  ).length;
  const stylable = input.candidates.filter(
    (candidate) => candidate.usageMode === "reference",
  );

  const scored = stylable
    .map((candidate) =>
      scoreCandidate(
        candidate,
        targetAspect,
        preferred,
        preferredMediaTypes,
        desiredCentralMessages,
      ),
    )
    // Full sort ending on an id tiebreak: input order cannot survive this.
    .sort((a, b) =>
      b.score !== a.score ? b.score - a.score : a.referenceId.localeCompare(b.referenceId),
    );

  const selected: ReferenceSelectionEntry[] = [];
  const usedArchetypes = new Set<string>();

  for (const entry of scored) {
    if (selected.length >= limit) break;
    if (entry.archetype && usedArchetypes.has(entry.archetype)) continue;
    selected.push(entry);
    if (entry.archetype) usedArchetypes.add(entry.archetype);
  }

  // Diversity is a preference, not a cap: backfill when families run out.
  if (selected.length < limit) {
    const taken = new Set(selected.map((entry) => entry.referenceId));
    for (const entry of scored) {
      if (selected.length >= limit) break;
      if (taken.has(entry.referenceId)) continue;
      selected.push(entry);
    }
  }

  return {
    selected,
    provenance: {
      strategy: "ranked",
      format: input.format,
      consideredCount: stylable.length,
      excludedExactCount,
    },
  };
}
