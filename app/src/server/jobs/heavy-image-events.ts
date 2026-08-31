import { resolveHeavyEventName, type HeavyImageEventBase } from "@/server/ai/image-runtime-config";

export const HEAVY_IMAGE_EVENT_BASES = {
  creativeWorkGenerate: "creative-work.generate",
  derivationGenerate: "derivation.generate",
  creativeWorkSourceAnalyze: "creative-work.source.analyze",
  workspaceAssetAnalyze: "workspace.asset.analyze",
  brandTrainingAnalyze: "brand.training.analyze",
  creativeWorkLayerize: "creative-work.layerize",
  creativeWorkLayerRegenerate: "creative-work.layer-regenerate",
} as const satisfies Record<string, HeavyImageEventBase>;

export function heavyImageEventName(
  base: (typeof HEAVY_IMAGE_EVENT_BASES)[keyof typeof HEAVY_IMAGE_EVENT_BASES] | string
): string {
  return resolveHeavyEventName(base);
}

/**
 * Stable base name of the per-slide carousel dispatch event. It resolves
 * through the same heavy-image runtime suffixing as the registered bases.
 */
export const CAROUSEL_SLIDE_GENERATE_EVENT = "creative-work.carousel-slide.generate";
