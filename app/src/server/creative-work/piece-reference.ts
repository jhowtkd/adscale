import { z } from "zod";
import { policyForExactAsset } from "./placement-policy";
import type { CreativeWorkFormat, CreativeWorkIdentityAssetSnapshot, CreativeWorkInputSnapshot } from "./contracts";

export const MAX_PIECE_REFERENCES = 3;
export const PIECE_REFERENCE_CATEGORIES = [
  "person_or_character",
  "product_or_packaging",
  "additional_logo_or_seal",
  "required_object_or_scene",
  "graphic_or_texture",
  "style_reference",
] as const;
export const PIECE_REFERENCE_TREATMENTS = [
  "identity_preservation",
  "recognizable_preservation",
  "exact_application",
  "required_presence",
  "visual_language",
  "style_direction",
] as const;

export const pieceReferenceDraftSchema = z.object({
  version: z.literal(1),
  category: z.enum(PIECE_REFERENCE_CATEGORIES).nullable(),
  classificationSource: z.enum(["automatic", "user"]),
  confidence: z.enum(["high", "medium", "low"]),
  userInstruction: z.string().trim().max(240).nullable(),
  hasTransparency: z.boolean(),
});

export type PieceReferenceDraft = z.infer<typeof pieceReferenceDraftSchema>;
export type PieceReferenceCategory = NonNullable<PieceReferenceDraft["category"]>;
export type PieceReferenceTreatment = (typeof PIECE_REFERENCE_TREATMENTS)[number];

export interface FrozenPieceReference {
  version: 1;
  category: PieceReferenceCategory;
  treatment: PieceReferenceTreatment;
  userInstruction: string | null;
  hasTransparency: boolean;
}

const TREATMENT_BY_CATEGORY: Record<PieceReferenceCategory, PieceReferenceTreatment> = {
  person_or_character: "identity_preservation",
  product_or_packaging: "recognizable_preservation",
  additional_logo_or_seal: "exact_application",
  required_object_or_scene: "required_presence",
  graphic_or_texture: "visual_language",
  style_reference: "style_direction",
};

export const pieceReferenceTreatment = (category: PieceReferenceCategory) => TREATMENT_BY_CATEGORY[category];

export const isPieceReferenceReady = (reference: PieceReferenceDraft | null | undefined) =>
  Boolean(reference?.category)
  && (reference?.classificationSource === "user" || reference?.confidence !== "low")
  && (reference?.category !== "additional_logo_or_seal" || reference.hasTransparency);

export function exactPieceReferenceAssets(
  sources: readonly CreativeWorkInputSnapshot["sources"][number][],
  format: CreativeWorkFormat,
  occupiedGravities: readonly ("northwest" | "northeast" | "southwest" | "southeast")[] = [],
): CreativeWorkIdentityAssetSnapshot[] {
  const policy = policyForExactAsset("logo", format);
  const exactSources = sources.filter((source) =>
    source.pieceReference?.treatment === "exact_application" && source.assetKey && source.mimeType,
  );
  const gravityFor = (instruction: string | null, index: number) => {
    const value = instruction?.toLocaleLowerCase("pt-BR") ?? "";
    if (/topo|superior|top/.test(value)) return /direit|right/.test(value) ? "northeast" as const : "northwest" as const;
    if (/direit|right/.test(value)) return "southeast" as const;
    if (/esquerd|left/.test(value)) return "southwest" as const;
    return (["southwest", "southeast", "northwest"] as const)[index % 3];
  };
  const availableGravities = ["southwest", "southeast", "northwest", "northeast"] as const;
  const usedGravities = new Set<(typeof availableGravities)[number]>(occupiedGravities);
  return exactSources.map((source, index) => {
    const reference = source.pieceReference!;
    const preferredGravity = gravityFor(reference.userInstruction, index);
    // A direction in an instruction is a preference, never permission to
    // stack multiple exact marks in the same pixels.  These temporary marks
    // are composed after generation, so choosing the next corner is stable.
    const gravity = !usedGravities.has(preferredGravity)
      ? preferredGravity
      : availableGravities.find((candidate) => !usedGravities.has(candidate));
    if (!gravity) {
      throw new Error("piece_reference_exact_placement_unavailable");
    }
    usedGravities.add(gravity);
    return ({
          referenceId: source.sourceId,
          assetKey: source.assetKey!,
          label: source.label?.trim() || "Logo ou selo adicional",
          category: "logo",
          usageMode: "exact",
          analysis: null,
          mimeType: source.mimeType!,
          hasAlpha: reference.hasTransparency,
          compositionInstruction: reference.userInstruction,
          placement: policy ? { gravity, widthRatio: policy.preferredWidthRatio } : null,
        });
  });
}
