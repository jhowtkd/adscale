import type { ExtractedBrandKit } from "../ai/brand-kit-extractor";
import { createHash } from "node:crypto";
import type {
  BrandKnowledgeClaimInput,
  BrandKnowledgeClaimKey,
} from "./contracts";
import { parseBrandKnowledgeClaimInput } from "./contracts";
import { REPERTOIRE_EXTRACTOR_VERSION } from "../brand-training/synthesize-repertoire";
import { visualRepertoireSchema, type VisualRepertoire } from "../brand-training/visual-repertoire";
import { PEOPLE_CATALOG_EXTRACTOR_VERSION, peopleCatalogSchema, type PeopleCatalog } from "../brand-training/people";
import { canonicalJsonStringify } from "../creative-work/canonical-json";

type Evidence = {
  type: "brand_guide" | "training_asset";
  id: string;
  sourceHash: string;
};

type CandidateInput =
  | {
      evidence: Evidence & { type: "brand_guide" };
      extracted: ExtractedBrandKit;
      confidence?: "low" | "medium" | "high";
    }
  | {
      evidence: Evidence & { type: "training_asset" };
      approvedAsset: {
        assetKey: string;
        category: string;
        usageMode: string;
        rules: string[];
        constraints: string[];
        confidence: number;
        structure?: {
          archetype?: { id: string } | null;
          typography?: { hierarchyNotes: string | null } | null;
          media?: { treatment: string | null } | null;
        } | null;
      };
    };

export type CandidateBrandKnowledgeClaim = BrandKnowledgeClaimInput & { status: "candidate" };

const list = (value: string) => [...new Set(value.split(/[;\n]/).map((item) => item.trim()).filter(Boolean))];
const hash = (value: unknown) => createHash("sha256").update(canonicalJsonStringify(value)).digest("hex");

function candidate(
  input: CandidateInput,
  claimKey: BrandKnowledgeClaimKey,
  kind: BrandKnowledgeClaimInput["kind"],
  value: unknown,
  path: string,
  confidence: BrandKnowledgeClaimInput["confidence"],
): CandidateBrandKnowledgeClaim {
  return {
    ...parseBrandKnowledgeClaimInput({
      claimKey,
      kind,
      value,
      scope: { level: "global" },
      authority: "inferred",
      confidence,
      evidenceRefs: [{ ...input.evidence, path }],
      extractorVersion: input.evidence.type === "brand_guide" ? "brand-guide-v1" : "training-asset-v1",
      sourceHash: input.evidence.sourceHash,
    }),
    status: "candidate",
  };
}

export function compileBrandKnowledgeCandidates(input: CandidateInput): CandidateBrandKnowledgeClaim[] {
  const claims: CandidateBrandKnowledgeClaim[] = [];
  if ("extracted" in input) {
    const { extracted } = input;
    const confidence = input.confidence ?? "medium";
    const colors = [...new Set(extracted.colors.map((color) => color.trim().toUpperCase()))];
    const fonts = [...new Set(extracted.fonts.map((font) => font.trim()).filter(Boolean))];
    if (colors.length) claims.push(candidate(input, "palette.colors", "fact", colors, "extraction.colors", confidence));
    if (fonts.length) claims.push(candidate(input, "typography.families", "preference", fonts, "extraction.fonts", confidence));
    if (extracted.logoDescription.trim()) claims.push(candidate(input, "logo.placement", "rule", extracted.logoDescription.trim(), "extraction.logoDescription", confidence));
    const required = list(extracted.requiredElements);
    if (required.length) claims.push(candidate(input, "visual.required_elements", "rule", required, "extraction.requiredElements", confidence));
    const prohibited = list(extracted.prohibitedElements);
    if (prohibited.length) claims.push(candidate(input, "visual.prohibited_elements", "prohibition", prohibited, "extraction.prohibitedElements", confidence));
    return claims;
  }

  const asset = input.approvedAsset;
  const confidence = asset.confidence >= 0.8 ? "high" : asset.confidence >= 0.5 ? "medium" : "low";
  if (asset.category === "logo" && asset.usageMode === "exact") {
    claims.push(candidate(input, "logo.primary_asset", "fact", { assetKey: asset.assetKey, sha256: input.evidence.sourceHash }, "trainingAsset.assetKey", confidence));
  }
  if (asset.rules.length) claims.push(candidate(input, "visual.required_elements", "rule", asset.rules, "trainingAnalysis.rules", confidence));
  if (asset.constraints.length) claims.push(candidate(input, "visual.prohibited_elements", "prohibition", asset.constraints, "trainingAnalysis.constraints", confidence));
  const hierarchy = asset.structure?.typography?.hierarchyNotes ?? asset.structure?.archetype?.id;
  if (hierarchy) claims.push(candidate(input, "layout.hierarchy", "preference", hierarchy, "trainingAnalysis.structure", confidence));
  const treatment = asset.structure?.media?.treatment;
  if (treatment) claims.push(candidate(
    input,
    asset.category === "graphic" ? "graphic.treatment" : "imagery.treatment",
    "preference",
    treatment,
    "trainingAnalysis.structure.media.treatment",
    confidence,
  ));
  return claims;
}

export function compileRepertoireCandidate(input: {
  repertoire: VisualRepertoire;
  evidence: Array<{
    type: "training_asset";
    id: string;
    path: string;
    sourceHash: string;
  }>;
  sourceHash: string;
  confidence?: BrandKnowledgeClaimInput["confidence"];
}): CandidateBrandKnowledgeClaim {
  return {
    ...parseBrandKnowledgeClaimInput({
      claimKey: "visual.repertoire",
      kind: "rule",
      value: visualRepertoireSchema.parse(input.repertoire),
      scope: { level: "global" },
      authority: "inferred",
      confidence: input.confidence ?? "medium",
      evidenceRefs: input.evidence,
      extractorVersion: REPERTOIRE_EXTRACTOR_VERSION,
      sourceHash: input.sourceHash,
    }),
    status: "candidate",
  };
}

/**
 * Compile the operator-reviewed people catalog as a `people.catalog` fact.
 * Approval replaces the previous catalog atomically at publish; editing a
 * name/photo afterwards compiles a different candidate and requires a new
 * calibration before normal work can use it.
 */
export function compilePeopleCatalogCandidate(input: {
  catalog: PeopleCatalog;
  evidence: Array<{
    type: "training_asset";
    id: string;
    path: string;
    sourceHash: string;
  }>;
  sourceHash: string;
  confidence?: BrandKnowledgeClaimInput["confidence"];
}): CandidateBrandKnowledgeClaim {
  return {
    ...parseBrandKnowledgeClaimInput({
      claimKey: "people.catalog",
      kind: "fact",
      value: peopleCatalogSchema.parse(input.catalog),
      scope: { level: "global" },
      authority: "human",
      confidence: input.confidence ?? "high",
      evidenceRefs: input.evidence,
      extractorVersion: PEOPLE_CATALOG_EXTRACTOR_VERSION,
      sourceHash: input.sourceHash,
    }),
    status: "candidate",
  };
}

export function compileExplicitBrandKitCandidates(input: {
  profileId: string;
  brandColors?: string[] | null;
  brandFonts?: string[] | null;
  requiredElements?: string | null;
  prohibitedElements?: string | null;
}): CandidateBrandKnowledgeClaim[] {
  const fields: Array<{
    claimKey: BrandKnowledgeClaimKey;
    kind: BrandKnowledgeClaimInput["kind"];
    value: unknown;
    sourceValue: unknown;
    path: "brandColors" | "brandFonts" | "requiredElements" | "prohibitedElements";
  }> = [];
  const colors = [...new Set((input.brandColors ?? []).map((color) => color.trim().toUpperCase()))];
  if (colors.length) fields.push({ claimKey: "palette.colors", kind: "fact", value: colors, sourceValue: colors, path: "brandColors" });
  const fonts = [...new Set((input.brandFonts ?? []).map((font) => font.trim()).filter(Boolean))];
  if (fonts.length) fields.push({ claimKey: "typography.families", kind: "preference", value: fonts, sourceValue: fonts, path: "brandFonts" });
  const required = list(input.requiredElements ?? "");
  if (required.length) fields.push({ claimKey: "visual.required_elements", kind: "rule", value: required, sourceValue: input.requiredElements, path: "requiredElements" });
  const prohibited = list(input.prohibitedElements ?? "");
  if (prohibited.length) fields.push({ claimKey: "visual.prohibited_elements", kind: "prohibition", value: prohibited, sourceValue: input.prohibitedElements, path: "prohibitedElements" });
  return fields.map((field) => ({
    ...parseBrandKnowledgeClaimInput({
      claimKey: field.claimKey,
      kind: field.kind,
      value: field.value,
      scope: { level: "global" },
      authority: "explicit",
      confidence: "high",
      evidenceRefs: [{ type: "brand_kit_field", id: input.profileId, path: field.path, sourceHash: hash(field.sourceValue) }],
      extractorVersion: "brand-kit-explicit-v1",
      sourceHash: hash(field.sourceValue),
    }),
    status: "candidate",
  }));
}
