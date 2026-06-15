import type { CorpusArchetype } from "../src/server/ai/corpus-fixtures";
import {
  CANONICAL_CAMPAIGNS,
  isCorpusRefIdKnown,
  type CanonicalCampaignSlug,
} from "../src/server/ai/creative-corpus";

export const CREATIVE_VALIDATION_SEED_SUPPORTED = false;

export type DerivationMode = "art_variation" | "format_adaptation" | "restyling";

export type CreativeLevel = "balanced";

export interface CreativeValidationMatrixRow {
  key: string;
  canonicalSlug: CanonicalCampaignSlug;
  mode: DerivationMode;
  format: string;
  beforeCorpusRefId: string;
  creativeLevel: CreativeLevel;
  baseAsset: string;
  styleAsset?: string;
  auditArchetype?: CorpusArchetype;
}

const MATRIX_ROWS: CreativeValidationMatrixRow[] = [
  {
    key: "teste-3-nr1:art_variation:1:1",
    canonicalSlug: "teste-3-nr1",
    mode: "art_variation",
    format: "1:1",
    beforeCorpusRefId: "6fc63100",
    creativeLevel: "balanced",
    baseAsset: "nr1-1x1-base.png",
  },
  {
    key: "teste-3-nr1:format_adaptation:9:16",
    canonicalSlug: "teste-3-nr1",
    mode: "format_adaptation",
    format: "9:16",
    beforeCorpusRefId: "27069645",
    creativeLevel: "balanced",
    baseAsset: "nr1-1x1-base.png",
    auditArchetype: "invented_factual_entity",
  },
  {
    key: "teste-3-nr1:format_adaptation:4:5",
    canonicalSlug: "teste-3-nr1",
    mode: "format_adaptation",
    format: "4:5",
    beforeCorpusRefId: "c2c12774",
    creativeLevel: "balanced",
    baseAsset: "nr1-1x1-base.png",
    auditArchetype: "format_campaign_drift",
  },
  {
    key: "nova-campanha:restyling:1:1",
    canonicalSlug: "nova-campanha",
    mode: "restyling",
    format: "1:1",
    beforeCorpusRefId: "d7d9d323",
    creativeLevel: "balanced",
    baseAsset: "educacao-base.png",
    styleAsset: "educacao-style-ref.png",
    auditArchetype: "restyling_factual_contamination",
  },
  {
    key: "teste-campanha-nr1:art_variation:1:1",
    canonicalSlug: "teste-campanha-nr1",
    mode: "art_variation",
    format: "1:1",
    beforeCorpusRefId: "8a2bebf9",
    creativeLevel: "balanced",
    baseAsset: "master-nr1-base.png",
    auditArchetype: "visual_overload",
  },
  {
    key: "smoke:art_variation:1:1",
    canonicalSlug: "smoke",
    mode: "art_variation",
    format: "1:1",
    beforeCorpusRefId: "8907bce5",
    creativeLevel: "balanced",
    baseAsset: "smoke-base.png",
  },
];

for (const row of MATRIX_ROWS) {
  if (!(row.canonicalSlug in CANONICAL_CAMPAIGNS)) {
    throw new Error(
      `CREATIVE_VALIDATION_MATRIX: unknown canonicalSlug "${row.canonicalSlug}" on row ${row.key}`
    );
  }
  if (!isCorpusRefIdKnown(row.beforeCorpusRefId)) {
    throw new Error(
      `CREATIVE_VALIDATION_MATRIX: unknown beforeCorpusRefId "${row.beforeCorpusRefId}" on row ${row.key}`
    );
  }
}

export const CREATIVE_VALIDATION_MATRIX = MATRIX_ROWS as const;

export function matrixKeys(): string[] {
  return CREATIVE_VALIDATION_MATRIX.map((row) => row.key);
}

export function matrixRowByKey(
  key: string
): CreativeValidationMatrixRow | undefined {
  return CREATIVE_VALIDATION_MATRIX.find((row) => row.key === key);
}

export function modesInMatrix(): Set<DerivationMode> {
  return new Set(CREATIVE_VALIDATION_MATRIX.map((row) => row.mode));
}
