import { createHash } from "node:crypto";

import type { BrandFontAsset } from "../brand-training/font-assets";
import type { CompositionProvenance } from "./placement-policy";
import type { TextCompositionProvenance } from "./text-composite";
import type { TypographyPlan } from "./typography-plan";
import type {
  CreativeWorkFormat,
  CreativeWorkIdentityAssetSnapshot,
  SocialPostCopy,
} from "./contracts";
import { canonicalJsonStringify } from "./canonical-json";

export type BrandFidelityState = "proven" | "nonconforming" | "not_applicable";
export type BrandFidelityCheckId = "copy" | "font" | "exact_assets" | "composition";

export interface BrandFidelityEvidence {
  source: "identity_snapshot" | "text_composition" | "exact_composition" | "output_artifact";
  path: string;
  expected: unknown;
  observed: unknown;
}

export interface BrandFidelityCheck {
  id: BrandFidelityCheckId;
  state: BrandFidelityState;
  evidence: BrandFidelityEvidence[];
}

export interface DeterministicBrandFidelityReport {
  version: 1;
  deterministic: true;
  overall: BrandFidelityState;
  checkedAt: string;
  artifactSha256: string;
  checks: BrandFidelityCheck[];
}

export interface ResidualBrandFidelitySignal {
  classification: "suspected" | "inconclusive";
  code: string;
  confidence: number | null;
  note: string;
  evidence: {
    source: "vision";
    originalStatus: string | null;
  };
}

export interface ResidualBrandFidelityReview {
  version: 1;
  advisoryOnly: true;
  status: "clear" | "suspected" | "inconclusive";
  checkedAt: string;
  signals: ResidualBrandFidelitySignal[];
}

type ExactCompositionEvidence = Omit<CompositionProvenance, "composed"> & {
  baseHash?: string;
  outputHash?: string;
  composed: Array<CompositionProvenance["composed"][number] & {
    sourceSha256?: string;
  }>;
};

export interface DeterministicBrandFidelityInput {
  copy: SocialPostCopy;
  format: CreativeWorkFormat;
  dimensions: { width: number; height: number };
  typographyPlan: TypographyPlan | null;
  approvedFont: BrandFontAsset | null;
  exactAssets: readonly CreativeWorkIdentityAssetSnapshot[];
  exactComposition: ExactCompositionEvidence | null;
  textComposition: TextCompositionProvenance | null;
  finalArtifact: Buffer;
  now?: () => Date;
}

const hash = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");

const isSha256 = (value: unknown): value is string =>
  typeof value === "string" && /^[a-f0-9]{64}$/.test(value);

function same(value: unknown, expected: unknown): boolean {
  return canonicalJsonStringify(value) === canonicalJsonStringify(expected);
}

function check(
  id: BrandFidelityCheckId,
  state: BrandFidelityState,
  evidence: BrandFidelityEvidence[],
): BrandFidelityCheck {
  return { id, state, evidence };
}

export function buildDeterministicBrandFidelity(
  input: DeterministicBrandFidelityInput,
): DeterministicBrandFidelityReport {
  const artifactSha256 = hash(input.finalArtifact);
  const text = input.textComposition;
  const exactAssets = input.exactAssets.filter((asset) => asset.usageMode === "exact");
  const exact = input.exactComposition;

  const copyEvidence: BrandFidelityEvidence[] = text ? [
    {
      source: "text_composition",
      path: "quality.textComposition.copy",
      expected: input.copy,
      observed: text.copy,
    },
    {
      source: "text_composition",
      path: "quality.textComposition.copyHash",
      expected: hash(canonicalJsonStringify(input.copy)),
      observed: text.copyHash,
    },
    {
      source: "output_artifact",
      path: "quality.textComposition.outputHash",
      expected: artifactSha256,
      observed: text.outputHash,
    },
  ] : [{
    source: "text_composition",
    path: "quality.textComposition",
    expected: "deterministic copy provenance",
    observed: null,
  }];
  const roles = (["headline", "body", "cta"] as const);
  const copyProven = Boolean(text)
    && same(text?.copy, input.copy)
    && text?.copyHash === hash(canonicalJsonStringify(input.copy))
    && text?.outputHash === artifactSha256
    && roles.every((role) => text?.layers.some(
      (layer) => layer.role === role && layer.textHash === hash(input.copy[role]),
    ));
  const copyCheck = check(
    "copy",
    text ? (copyProven ? "proven" : "nonconforming") : "not_applicable",
    copyEvidence,
  );

  const fontExpected = input.typographyPlan && input.approvedFont;
  const fontObserved = text?.font ?? null;
  const fontProven = Boolean(fontExpected && text)
    && text?.typographyPlan.fontAssetKey === input.typographyPlan?.fontAssetKey
    && same(fontObserved, input.approvedFont);
  const fontCheck = check(
    "font",
    !fontExpected ? "not_applicable" : fontProven ? "proven" : "nonconforming",
    [{
      source: "text_composition",
      path: "quality.textComposition.font",
      expected: fontExpected ? input.approvedFont : null,
      observed: fontObserved,
    }],
  );

  const expectedExact = exactAssets.map(({ referenceId, assetKey }) => ({ referenceId, assetKey }));
  const observedExact = exact?.composed.map(({ referenceId, assetKey, sourceSha256 }) => ({
    referenceId,
    assetKey,
    sourceSha256: sourceSha256 ?? null,
  })) ?? [];
  const exactProven = exactAssets.length > 0
    && Boolean(exact)
    && exact?.blocked.length === 0
    && exact?.omitted.length === 0
    && expectedExact.every((expected) => observedExact.some(
      (observed) => observed.referenceId === expected.referenceId
        && observed.assetKey === expected.assetKey
        && isSha256(observed.sourceSha256),
    ));
  const exactCheck = check(
    "exact_assets",
    exactAssets.length === 0 ? "not_applicable" : exactProven ? "proven" : "nonconforming",
    [
      {
        source: "identity_snapshot",
        path: "identitySnapshot.assets[usageMode=exact]",
        expected: expectedExact,
        observed: observedExact,
      },
      {
        source: "exact_composition",
        path: "quality.exactComposition.omitted|blocked",
        expected: { omitted: [], blocked: [] },
        observed: { omitted: exact?.omitted ?? null, blocked: exact?.blocked ?? null },
      },
    ],
  );

  const deterministicCompositionExpected = Boolean(
    text
    || exact
    || input.typographyPlan?.execution === "deterministic"
    || exactAssets.length > 0,
  );
  const finalRecordedHash = text?.outputHash ?? exact?.outputHash ?? null;
  const compositionProven = deterministicCompositionExpected
    && finalRecordedHash === artifactSha256
    && (!text || (
      text.format === input.format
      && same(text.dimensions, input.dimensions)
      && (!exact || text.baseHash === exact.outputHash)
    ))
    && (!exact || (
      exact.format === input.format
      && same(exact.dimensions, input.dimensions)
      && isSha256(exact.baseHash)
      && isSha256(exact.outputHash)
    ));
  const compositionCheck = check(
    "composition",
    !deterministicCompositionExpected
      ? "not_applicable"
      : compositionProven ? "proven" : "nonconforming",
    [
      {
        source: "output_artifact",
        path: "creativeWorkOutput.outputKey",
        expected: artifactSha256,
        observed: finalRecordedHash,
      },
      {
        source: "exact_composition",
        path: "quality.exactComposition.outputHash -> quality.textComposition.baseHash",
        expected: exact?.outputHash ?? null,
        observed: text?.baseHash ?? null,
      },
    ],
  );

  const checks = [copyCheck, fontCheck, exactCheck, compositionCheck];
  const overall = checks.some((item) => item.state === "nonconforming")
    ? "nonconforming"
    : checks.some((item) => item.state === "proven")
      ? "proven"
      : "not_applicable";
  return {
    version: 1,
    deterministic: true,
    overall,
    checkedAt: (input.now?.() ?? new Date()).toISOString(),
    artifactSha256,
    checks,
  };
}

export function buildResidualBrandFidelityReview(
  quality: unknown,
  now: () => Date = () => new Date(),
): ResidualBrandFidelityReview {
  const payload = quality && typeof quality === "object"
    ? quality as {
        evaluator?: { status?: unknown; error?: unknown };
        findings?: unknown;
      }
    : {};
  const evaluatorStatus = typeof payload.evaluator?.status === "string"
    ? payload.evaluator.status
    : "skipped";
  const rawFindings = Array.isArray(payload.findings) ? payload.findings : [];
  const signals = rawFindings.flatMap((raw): ResidualBrandFidelitySignal[] => {
    if (!raw || typeof raw !== "object") return [];
    const finding = raw as Record<string, unknown>;
    if (finding.origin !== "vision" || typeof finding.code !== "string") return [];
    const reportedConfidence = typeof finding.confidence === "number" && Number.isFinite(finding.confidence)
      ? Math.min(1, Math.max(0, finding.confidence))
      : null;
    return [{
      classification: "suspected",
      code: finding.code,
      confidence: reportedConfidence,
      note: typeof finding.note === "string" ? finding.note : finding.code,
      evidence: {
        source: "vision",
        originalStatus: typeof finding.status === "string" ? finding.status : null,
      },
    }];
  });

  if (evaluatorStatus !== "completed") {
    signals.push({
      classification: "inconclusive",
      code: "visual_evaluator_unavailable",
      confidence: null,
      note: typeof payload.evaluator?.error === "string"
        ? payload.evaluator.error
        : `visual evaluator ${evaluatorStatus}`,
      evidence: { source: "vision", originalStatus: evaluatorStatus },
    });
  }

  return {
    version: 1,
    advisoryOnly: true,
    status: evaluatorStatus !== "completed"
      ? "inconclusive"
      : signals.length > 0 ? "suspected" : "clear",
    checkedAt: now().toISOString(),
    signals,
  };
}
