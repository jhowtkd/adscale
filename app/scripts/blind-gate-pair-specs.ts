import type { CanonicalCampaignSlug } from "@/server/ai/creative-corpus";
import type { CreativeFidelityLevel } from "@/server/ai/creative-contract";

export type BlindGateMode = "art_variation" | "format_adaptation" | "restyling";

export interface BlindGatePairSpec {
  id: string;
  mode: BlindGateMode;
  format: string;
  creativeLevel: CreativeFidelityLevel;
  canonicalSlug: CanonicalCampaignSlug;
  baseAsset: string;
  styleAsset?: string;
  /** Corpus ref for pre-recalibration baseline when available */
  baselineCorpusRefId?: string;
}

export const BLIND_GATE_PAIR_SPECS: BlindGatePairSpec[] = [
  {
    id: "pair-01",
    mode: "art_variation",
    format: "1:1",
    creativeLevel: "conservative",
    canonicalSlug: "teste-3-nr1",
    baseAsset: "nr1-1x1-base.png",
    baselineCorpusRefId: "6fc63100",
  },
  {
    id: "pair-02",
    mode: "art_variation",
    format: "4:5",
    creativeLevel: "balanced",
    canonicalSlug: "teste-3-nr1",
    baseAsset: "nr1-1x1-base.png",
    baselineCorpusRefId: "c2c12774",
  },
  {
    id: "pair-03",
    mode: "art_variation",
    format: "9:16",
    creativeLevel: "bold",
    canonicalSlug: "teste-3-nr1",
    baseAsset: "nr1-1x1-base.png",
    baselineCorpusRefId: "27069645",
  },
  {
    id: "pair-04",
    mode: "art_variation",
    format: "1:1",
    creativeLevel: "extreme",
    canonicalSlug: "teste-campanha-nr1",
    baseAsset: "master-nr1-base.png",
    baselineCorpusRefId: "8a2bebf9",
  },
  {
    id: "pair-05",
    mode: "format_adaptation",
    format: "9:16",
    creativeLevel: "conservative",
    canonicalSlug: "teste-3-nr1",
    baseAsset: "nr1-1x1-base.png",
    baselineCorpusRefId: "27069645",
  },
  {
    id: "pair-06",
    mode: "format_adaptation",
    format: "4:5",
    creativeLevel: "balanced",
    canonicalSlug: "teste-3-nr1",
    baseAsset: "nr1-1x1-base.png",
    baselineCorpusRefId: "c2c12774",
  },
  {
    id: "pair-07",
    mode: "format_adaptation",
    format: "1:1",
    creativeLevel: "bold",
    canonicalSlug: "teste-3-nr1",
    baseAsset: "nr1-1x1-base.png",
    baselineCorpusRefId: "6fc63100",
  },
  {
    id: "pair-08",
    mode: "format_adaptation",
    format: "9:16",
    creativeLevel: "extreme",
    canonicalSlug: "teste-3-nr1",
    baseAsset: "nr1-1x1-base.png",
    baselineCorpusRefId: "27069645",
  },
  {
    id: "pair-09",
    mode: "restyling",
    format: "1:1",
    creativeLevel: "conservative",
    canonicalSlug: "nova-campanha",
    baseAsset: "educacao-base.png",
    styleAsset: "educacao-style-ref.png",
    baselineCorpusRefId: "d7d9d323",
  },
  {
    id: "pair-10",
    mode: "restyling",
    format: "4:5",
    creativeLevel: "balanced",
    canonicalSlug: "nova-campanha",
    baseAsset: "educacao-base.png",
    styleAsset: "educacao-style-ref.png",
    baselineCorpusRefId: "d7d9d323",
  },
  {
    id: "pair-11",
    mode: "restyling",
    format: "9:16",
    creativeLevel: "bold",
    canonicalSlug: "nova-campanha",
    baseAsset: "educacao-base.png",
    styleAsset: "educacao-style-ref.png",
    baselineCorpusRefId: "d7d9d323",
  },
  {
    id: "pair-12",
    mode: "restyling",
    format: "1:1",
    creativeLevel: "extreme",
    canonicalSlug: "nova-campanha",
    baseAsset: "educacao-base.png",
    styleAsset: "educacao-style-ref.png",
    baselineCorpusRefId: "d7d9d323",
  },
];

export function matrixKeyForSpec(spec: BlindGatePairSpec): string {
  return `${spec.canonicalSlug}:${spec.mode}:${spec.format}`;
}
