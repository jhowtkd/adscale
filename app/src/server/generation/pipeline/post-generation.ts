/**
 * Pós-geração canônica: score → quality gate → corpus (Phase 3 / item 22).
 *
 * O job Inngest continua wrapping cada etapa em `step.run` para durabilidade;
 * estes helpers centralizam a regra sem duplicar a sequência.
 */
import { logger } from "@/lib/logger";
import { objectStorage } from "@/server/storage";
import type { CreativeContract } from "@/server/ai/creative-contract";
import { runCompletedDerivationQualityGate } from "@/server/ai/creative-quality-gate";
import { captureCorpusCandidateFromDerivation } from "@/server/human-quality/candidate-capture";
import { scoreCompletedDerivation } from "@/server/generation/pipeline/score-derivation";

export interface PostGenerationCampaign {
  name: string;
  client: string | null;
  product: string | null;
  offer: string | null;
  objective: string | null;
  audience: string | null;
  tone?: string | null;
  creativeLevel?: string | null;
  creativeDiagnosis?: unknown;
}

export interface PostGenerationDerivation {
  ctaText: string | null;
  format: string | null;
  generationMode: string | null;
  feedback: string | null;
  parentId: string | null;
  creativeLevel?: string | null;
}

export async function runDerivationScore(input: {
  derivationId: string;
  workspaceId: string;
  outputKey: string;
  campaign: PostGenerationCampaign;
  derivation: PostGenerationDerivation;
  locale?: string;
  contract?: CreativeContract | null;
}): Promise<void> {
  logger.info(
    `[score-derivation] derivationId=${input.derivationId} outputKey=${input.outputKey}`
  );
  try {
    const scoreBuffer = await objectStorage.get(input.outputKey);
    await scoreCompletedDerivation(
      input.derivationId,
      input.workspaceId,
      scoreBuffer,
      input.campaign,
      input.derivation,
      input.locale,
      input.contract
    );
    logger.info(`[score-derivation] done derivationId=${input.derivationId}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.warn(
      `[score-derivation] failed derivationId=${input.derivationId}: ${message}`
    );
  }
}

export async function runDerivationQualityGate(input: {
  derivationId: string;
  workspaceId: string;
  outputKey: string;
  locale?: string;
  campaign: PostGenerationCampaign;
  derivation: {
    ctaText: string | null;
    format: string | null;
    generationMode: string | null;
  };
  contract: CreativeContract;
  qaReferences?: {
    baseImageBuffer?: Buffer;
    baseMimeType?: string;
    styleImageBuffer?: Buffer;
    styleMimeType?: string;
  };
  /** Load restyling refs inside the non-blocking try (Gate 3 regression fix). */
  loadQaReferences?: () => Promise<{
    baseImageBuffer?: Buffer;
    baseMimeType?: string;
    styleImageBuffer?: Buffer;
    styleMimeType?: string;
  }>;
}): Promise<void> {
  logger.info(
    `[quality-gate] derivationId=${input.derivationId} outputKey=${input.outputKey}`
  );
  try {
    const qaReferences = input.loadQaReferences
      ? await input.loadQaReferences()
      : input.qaReferences;
    const gateBuffer = await objectStorage.get(input.outputKey);
    await runCompletedDerivationQualityGate({
      derivationId: input.derivationId,
      workspaceId: input.workspaceId,
      imageBuffer: gateBuffer,
      mimeType: "image/png",
      locale: input.locale ?? "pt-BR",
      campaign: {
        name: input.campaign.name ?? "",
        client: input.campaign.client ?? "",
        product: input.campaign.product ?? "",
        offer: input.campaign.offer ?? "",
        objective: input.campaign.objective ?? "",
        audience: input.campaign.audience ?? "",
        tone: input.campaign.tone,
        creativeDiagnosis: input.campaign.creativeDiagnosis,
      },
      derivation: input.derivation,
      contract: input.contract,
      ...qaReferences,
    });
    logger.info(`[quality-gate] done derivationId=${input.derivationId}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.warn(
      `[quality-gate] step failed derivationId=${input.derivationId}: ${message}`
    );
  }
}

export async function runDerivationCorpusCapture(input: {
  workspaceId: string;
  derivationId: string;
  /** Skip for preview rows and goal-agent runs (existing behaviour). */
  enabled: boolean;
}): Promise<void> {
  if (!input.enabled) return;
  try {
    await captureCorpusCandidateFromDerivation({
      workspaceId: input.workspaceId,
      derivationId: input.derivationId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.warn(
      `[capture-corpus-candidate] failed derivationId=${input.derivationId}: ${message}`
    );
  }
}
