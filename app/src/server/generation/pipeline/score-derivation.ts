/**
 * Score pós-geração de derivação — extraído do job (Phase 3 / item 22).
 */
import { logger } from "@/lib/logger";
import type { CreativeContract } from "@/server/ai/creative-contract";
import {
  scoreDerivationHeuristic,
  analyzeDerivationCreative,
} from "@/server/ai/creative-score";
import { updateDerivationScore } from "@/server/repositories/derivation";

export async function scoreCompletedDerivation(
  derivationId: string,
  workspaceId: string,
  normalizedBuffer: Buffer,
  campaign: {
    name: string;
    client: string | null;
    product: string | null;
    offer: string | null;
    objective: string | null;
    audience: string | null;
    creativeLevel?: string | null;
    creativeDiagnosis?: unknown;
  },
  derivation: {
    ctaText: string | null;
    format: string | null;
    generationMode: string | null;
    feedback: string | null;
    parentId: string | null;
    creativeLevel?: string | null;
  },
  locale?: string,
  contract?: CreativeContract | null
) {
  const effectiveGenerationMode = derivation.generationMode ?? "art_variation";
  const targetFormat = derivation.format ?? "1:1";

  try {
    const heuristicScore = scoreDerivationHeuristic({
      status: "completed",
      format: targetFormat,
      generationMode: effectiveGenerationMode,
      ctaText: derivation.ctaText,
      parentId: derivation.parentId,
    });
    await updateDerivationScore(derivationId, workspaceId, heuristicScore);

    try {
      const visualScore = await analyzeDerivationCreative({
        imageBuffer: normalizedBuffer,
        mimeType: "image/png",
        campaign: {
          name: campaign.name,
          client: campaign.client ?? "",
          product: campaign.product ?? "",
          offer: campaign.offer ?? "",
          objective: campaign.objective ?? "",
          audience: campaign.audience ?? "",
        },
        derivation: {
          ctaText: derivation.ctaText,
          format: targetFormat,
          generationMode: effectiveGenerationMode,
          feedback: derivation.feedback,
          creativeLevel: campaign.creativeLevel ?? null,
          creativeDiagnosis: campaign.creativeDiagnosis ?? null,
        },
        locale: locale ?? "pt-BR",
        contract: contract ?? null,
      });
      await updateDerivationScore(derivationId, workspaceId, visualScore);
    } catch (error) {
      logger.warn("[generate-and-store-output] creative visual scoring failed", error);
      await updateDerivationScore(derivationId, workspaceId, {
        ...heuristicScore,
        scoreStatus: "failed",
      });
    }
  } catch (error) {
    logger.warn("[generate-and-store-output] creative scoring failed", error);
  }
}
