/**
 * Pós-geração canônica: score → quality gate → corpus (Phase 3 / item 22).
 *
 * Campanha/Assistente e Criar Post compartilham políticas e o scorer;
 * adapters só preparam o artefato final e persistem o resultado.
 */
import { logger } from "@/lib/logger";
import { objectStorage } from "@/server/storage";
import type { CreativeContract } from "@/server/ai/creative-contract";
import { runCompletedDerivationQualityGate } from "@/server/ai/creative-quality-gate";
import {
  analyzeDerivationCreative,
  type AnalyzeInput,
  type ScoreResult,
} from "@/server/ai/creative-score";
import { captureCorpusCandidateFromDerivation } from "@/server/human-quality/candidate-capture";
import { scoreCompletedDerivation } from "@/server/generation/pipeline/score-derivation";
import {
  decideCreativeWorkRefund,
  decidePostGenerationQuality,
} from "@/server/generation/canonical/policies";
import type { RefundDecision } from "@/server/generation/canonical/types";

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

/**
 * Campaign/Assistant post-generation sequence (item 22).
 * Jobs may still wrap each step in Inngest `step.run` for durability;
 * this helper documents the canonical order when running synchronously.
 */
export async function runDerivationPostGeneration(input: {
  score: Parameters<typeof runDerivationScore>[0];
  qualityGate: Parameters<typeof runDerivationQualityGate>[0];
  corpus: Parameters<typeof runDerivationCorpusCapture>[0];
}): Promise<void> {
  await runDerivationScore(input.score);
  await runDerivationQualityGate(input.qualityGate);
  await runDerivationCorpusCapture(input.corpus);
  decidePostGenerationQuality({ surface: "campaign", quality: null });
}

export type CreativeWorkPostGenerationResult =
  | {
      decision: "accept";
      quality: ScoreResult | null;
      reason: string;
    }
  | {
      decision: "reject_low_quality";
      quality: ScoreResult;
      reason: string;
      refund: RefundDecision;
    };

/**
 * Criar Post post-generation (item 22): shared score + quality policy.
 * Brand composition stays in the job adapter (artifact prep before this).
 * Persistence (complete/fail/refund apply) stays in the adapter.
 */
export async function runCreativeWorkPostGeneration(input: {
  workItemId: string;
  outputId: string;
  analyze: AnalyzeInput;
}): Promise<CreativeWorkPostGenerationResult> {
  let quality: ScoreResult | null = null;
  try {
    quality = await analyzeDerivationCreative(input.analyze);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.warn(
      `[creative-work-post-generation] analyze failed outputId=${input.outputId}: ${message}`
    );
    quality = null;
  }

  const qualityDecision = decidePostGenerationQuality({
    surface: "quick_tool",
    quality,
  });

  if (!qualityDecision.accept && quality) {
    const refund = decideCreativeWorkRefund({
      surface: "quick_tool",
      failurePhase: "low_quality",
      workItemId: input.workItemId,
      outputId: input.outputId,
    });
    return {
      decision: "reject_low_quality",
      quality,
      reason: qualityDecision.reason,
      refund,
    };
  }

  return {
    decision: "accept",
    quality,
    reason: qualityDecision.reason,
  };
}
