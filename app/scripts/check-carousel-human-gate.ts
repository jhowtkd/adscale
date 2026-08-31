/**
 * Studio Carousel human gate validator (Task 10 / Step 6).
 *
 * This script is a VALIDATOR ONLY. It checks a completed human-review
 * evidence file for the nine-deck carousel gate: three approved brands
 * (nike, mtv, absolut) × short_idea | long_text | pre_split. Generating the
 * nine real decks requires a separate paid-generation authorization, and
 * every verdict field is filled by a human reviewer — this script never
 * generates decks, calls a provider, or fabricates verdicts.
 *
 * Usage:
 *   npx tsx scripts/check-carousel-human-gate.ts <evidence-file.json>
 *
 * Exit codes:
 *   0 — the evidence file satisfies the acceptance predicate.
 *   2 — the evidence file is still pending human review (template state).
 *   1 — the evidence file is complete but the predicate fails.
 */
import fs from "node:fs";
import { pathToFileURL } from "node:url";

export const CAROUSEL_GATE_BRANDS = ["nike", "mtv", "absolut"] as const;
export const CAROUSEL_GATE_INPUT_KINDS = ["short_idea", "long_text", "pre_split"] as const;

export type CarouselGateBrand = (typeof CAROUSEL_GATE_BRANDS)[number];
export type CarouselGateInputKind = (typeof CAROUSEL_GATE_INPUT_KINDS)[number];

export type CarouselVisualLanguageVerdict = "single_system" | "mixed" | "unreviewed";
export type CarouselNarrativeProgressionVerdict = "clear" | "confusing" | "unreviewed";

export type CarouselGateEntry = {
  brand: CarouselGateBrand;
  inputKind: CarouselGateInputKind;
  slideCount: number;
  inventedFacts: number;
  corruptedTexts: number;
  visualLanguage: CarouselVisualLanguageVerdict;
  narrativeProgression: CarouselNarrativeProgressionVerdict;
  selfContainedFailures: number;
  reviewer: string | null;
  /** Provider run / work ids produced by the separately authorized batch. */
  artifactIds: string[];
};

export type CarouselHumanGateEvidence = {
  schemaVersion: 1;
  status: "pending_human_review" | "completed";
  reviewedAt: string | null;
  entries: CarouselGateEntry[];
};

export function validateCarouselGateEvidenceShape(evidence: CarouselHumanGateEvidence): void {
  const expected = CAROUSEL_GATE_BRANDS.flatMap((brand) =>
    CAROUSEL_GATE_INPUT_KINDS.map((inputKind) => `${brand}:${inputKind}`),
  );
  if (!Array.isArray(evidence.entries) || evidence.entries.length !== 9) {
    throw new Error(`Carousel human gate requires exactly 9 entries (3 brands × 3 input kinds); got ${evidence.entries?.length ?? 0}`);
  }
  const seen = new Set(evidence.entries.map((entry) => `${entry.brand}:${entry.inputKind}`));
  const missing = expected.filter((key) => !seen.has(key));
  if (missing.length > 0) {
    throw new Error(`Carousel human gate is missing entries for: ${missing.join(", ")}`);
  }
  for (const entry of evidence.entries) {
    if (!Number.isInteger(entry.slideCount) || entry.slideCount < 5 || entry.slideCount > 8) {
      throw new Error(`${entry.brand}:${entry.inputKind} slide count must be an integer between 5 and 8`);
    }
    if (entry.reviewer === null || entry.reviewer.trim().length === 0) {
      throw new Error(`${entry.brand}:${entry.inputKind} needs a human reviewer name`);
    }
    if (!Array.isArray(entry.artifactIds) || entry.artifactIds.length === 0) {
      throw new Error(`${entry.brand}:${entry.inputKind} needs at least one artifact id`);
    }
  }
}

/**
 * Acceptance predicate, verbatim from the plan: all nine decks factually
 * clean, at least eight judged as one coherent visual system, at least eight
 * judged with clear narrative progression, and zero self-contained failures.
 */
export function evaluateCarouselHumanGate(
  entries: CarouselGateEntry[],
): { accepted: boolean; singleSystemCount: number; clearProgressionCount: number } {
  const accepted =
    entries.length === 9 &&
    entries.every((entry) => entry.inventedFacts === 0 && entry.corruptedTexts === 0) &&
    entries.filter((entry) => entry.visualLanguage === "single_system").length >= 8 &&
    entries.filter((entry) => entry.narrativeProgression === "clear").length >= 8 &&
    entries.every((entry) => entry.selfContainedFailures === 0);
  return {
    accepted,
    singleSystemCount: entries.filter((entry) => entry.visualLanguage === "single_system").length,
    clearProgressionCount: entries.filter((entry) => entry.narrativeProgression === "clear").length,
  };
}

export function runCarouselHumanGateCheck(file: string): { accepted: boolean; detail: string } {
  const evidence = JSON.parse(fs.readFileSync(file, "utf8")) as CarouselHumanGateEvidence;
  if (evidence.status === "pending_human_review") {
    return { accepted: false, detail: "PENDING human review: nine-deck carousel gate scaffolded, verdicts not filled" };
  }
  validateCarouselGateEvidenceShape(evidence);
  const result = evaluateCarouselHumanGate(evidence.entries);
  return {
    accepted: result.accepted,
    detail: `single_system=${result.singleSystemCount}/9 clear_progression=${result.clearProgressionCount}/9`,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const file = process.argv[2];
  if (!file) {
    throw new Error("Usage: check-carousel-human-gate.ts <evidence-file.json>");
  }
  const outcome = runCarouselHumanGateCheck(file);
  console.log(`[carousel-human-gate] ${outcome.accepted ? "PASS" : "FAIL"} — ${outcome.detail}`);
  process.exitCode = outcome.accepted ? 0 : 2;
}
