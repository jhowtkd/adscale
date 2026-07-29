/**
 * Pós-geração canônica: score → quality gate → corpus (Phase 3 / item 22).
 *
 * Campanha/Assistente e Criar Post compartilham políticas e o scorer;
 * adapters só preparam o artefato final e persistem o resultado.
 */
import { logger } from "@/lib/logger";
import { objectStorage } from "@/server/storage";
import type { CreativeContract } from "@/server/ai/creative-contract";
import {
  runCompletedDerivationQualityGate,
  buildCreativeWorkQualityPayload,
  deriveCreativeWorkObjectiveVerdict,
  type CreativeWorkQaEvaluatorStatus,
  type CreativeWorkQualityFinding,
  type CreativeWorkQualityPayload,
} from "@/server/ai/creative-quality-gate";
import {
  analyzeCreativeWorkQa,
  inspectCreativeWorkImageFile,
  type AnalyzeCreativeWorkQaInput,
  type CreativeWorkObjectiveVerdict,
  type CreativeWorkQaFinding,
} from "@/server/ai/creative-qa";
import type { CreativeWorkReferenceRole } from "@/server/creative-work/reference-plan";
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
import {
  observeImagePipelineExternalCall,
} from "@/server/ai/image-pipeline-telemetry";
import type { ImagePipelineTelemetryContext } from "@/server/ai/image-generation";

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
  telemetry?: ImagePipelineTelemetryContext;
}): Promise<CreativeWorkPostGenerationResult> {
  let quality: ScoreResult | null = null;
  try {
    quality = await observeImagePipelineExternalCall({
      callType: "score",
      attempt: input.telemetry?.inngestAttempt ?? 0,
      ...input.telemetry,
    }, () => analyzeDerivationCreative(input.analyze));
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

// ---------------------------------------------------------------------------
// Creative Work v1 tri-state quality assessment (R-005 / spec 9).
// ---------------------------------------------------------------------------

export interface CreativeWorkQualityAssessmentInput {
  workItemId: string;
  outputId: string;
  /** 1-based attempt of the provider call that produced the assessed image. */
  attempt: number;
  imageBuffer: Buffer;
  /** Canonical target dimensions — the deterministic dimension authority. */
  expectedDimensions: { width: number; height: number };
  /** Required roles from the reference plan (R-003). */
  requiredReferenceRoles: readonly CreativeWorkReferenceRole[];
  /** Required roles actually attached to the generation call. */
  attachedReferenceRoles: readonly CreativeWorkReferenceRole[];
  /** Visual objective QA context: fact pack, copy, mode, references. */
  qa: Omit<AnalyzeCreativeWorkQaInput, "imageBuffer" | "mimeType">;
  /** Advisory subjective scorer input — its failure never rejects. */
  score: AnalyzeInput;
  telemetry?: ImagePipelineTelemetryContext;
}

export interface CreativeWorkQualityAssessmentResult {
  /**
   * Tri-state objective verdict (spec 9.2). `fail` marks the output for the
   * exclusive objective correction (T8/R-006) — the assessment persists the
   * verdict but never triggers the second call and never rejects by score.
   */
  objectiveVerdict: CreativeWorkObjectiveVerdict;
  /** Versioned payload persisted in `creative_work_outputs.quality`. */
  quality: CreativeWorkQualityPayload;
}

function shortAssessmentError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/\s+/g, " ").trim().slice(0, 160) || "unknown error";
}

/**
 * Objective QA for v1 direct outputs: deterministic file/dimension/reference
 * checks (no vision model) + visual evaluation contextualized by the frozen
 * fact pack and the role-bound references + advisory subjective score.
 *
 * Decision contract (spec 9.2):
 * - confirmed objective code → `fail` (score can never override it);
 * - evaluator timeout/error/ambiguity → `inconclusive`: the output completes
 *   with a review signal, no retry, no Gate 8 objective approval;
 * - subjective-only findings stay advisory and never reject or retry;
 * - the function always resolves — the adapter completes the output with the
 *   persisted payload; there is no `reject_low_quality` on this path.
 */
export async function runCreativeWorkQualityAssessment(
  input: CreativeWorkQualityAssessmentInput,
): Promise<CreativeWorkQualityAssessmentResult> {
  // 1. Deterministic file + dimension checks (criterion 5 — no vision model).
  const file = await inspectCreativeWorkImageFile(input.imageBuffer).catch((error) => ({
    ok: false,
    width: null,
    height: null,
    format: null,
    bytes: input.imageBuffer.byteLength,
    error: shortAssessmentError(error),
  }));

  const deterministicFindings: CreativeWorkQualityFinding[] = [];
  if (!file.ok) {
    deterministicFindings.push({
      code: "unusable_file",
      status: "confirmed",
      note: `Produced image could not be decoded (${file.error ?? "unknown error"})`,
      origin: "deterministic",
    });
  } else if (
    file.width !== input.expectedDimensions.width ||
    file.height !== input.expectedDimensions.height
  ) {
    deterministicFindings.push({
      code: "wrong_dimensions",
      status: "confirmed",
      note: `Expected ${input.expectedDimensions.width}x${input.expectedDimensions.height}, produced ${file.width}x${file.height}`,
      origin: "deterministic",
    });
  }

  const missingRequired = [
    ...new Set(
      input.requiredReferenceRoles.filter(
        (role) => !input.attachedReferenceRoles.includes(role),
      ),
    ),
  ];
  for (const role of missingRequired) {
    deterministicFindings.push({
      code: "ignored_mandatory_reference",
      status: "confirmed",
      note: `Mandatory ${role} reference was planned but not attached to the generation call`,
      origin: "deterministic",
    });
  }

  // 2. Visual objective evaluation. A corrupt/unusable file cannot be
  // evaluated — the verdict is already a deterministic fail — so the vision
  // call is skipped instead of burning an evaluator call on garbage.
  let evaluatorStatus: CreativeWorkQaEvaluatorStatus = "completed";
  let evaluatorError: string | null = null;
  let evaluatorSummary: string | null = null;
  let visionFindings: CreativeWorkQaFinding[] = [];
  if (file.ok) {
    try {
      const qa = await observeImagePipelineExternalCall({
        callType: "qa",
        attempt: input.attempt,
        ...input.telemetry,
      }, () => analyzeCreativeWorkQa({
        imageBuffer: input.imageBuffer,
        mimeType: "image/png",
        ...input.qa,
        // R-010: the deterministic E2E branch distinguishes fail-once from
        // fail-always by the durable attempt of the assessed call.
        attempt: input.attempt,
      }));
      visionFindings = qa.findings;
      // T8: persist the one-sentence evaluator summary for the T9 review
      // surface (null when the evaluator failed or was skipped).
      evaluatorSummary = qa.summary.trim().length > 0 ? qa.summary.trim() : null;
    } catch (error) {
      evaluatorStatus = "failed";
      evaluatorError = shortAssessmentError(error);
      logger.warn(
        `[creative-work-quality-assessment] objective evaluator failed outputId=${input.outputId} — persisting inconclusive: ${evaluatorError}`,
      );
    }
  } else {
    evaluatorStatus = "skipped";
  }

  // 3. Advisory subjective score. Skipped entirely when the objective
  // verdict is already a confirmed fail (T8: never burn an advisory call on
  // an output headed for correction/terminal failure). A scorer crash never
  // rejects, never retries and never changes the objective verdict (spec
  // 9.2): the output stays available without a subjective score.
  const preVerdict = deriveCreativeWorkObjectiveVerdict({
    deterministicCodes: deterministicFindings.map((finding) => finding.code),
    findings: visionFindings,
    evaluatorStatus,
  });
  let subjective: {
    scoreStatus: string;
    qualityScore: number | null;
    issues: string[];
  } | null = null;
  if (file.ok && preVerdict.verdict !== "fail") {
    try {
      const score = await observeImagePipelineExternalCall({
        callType: "score",
        attempt: input.attempt,
        ...input.telemetry,
      }, () => analyzeDerivationCreative(input.score));
      subjective = {
        scoreStatus: score.scoreStatus,
        qualityScore: score.qualityScore,
        issues: score.scoreIssues ?? [],
      };
    } catch (error) {
      logger.warn(
        `[creative-work-quality-assessment] subjective scorer failed outputId=${input.outputId} — output stays available without a score: ${shortAssessmentError(error)}`,
      );
    }
  }

  const quality = buildCreativeWorkQualityPayload({
    deterministicFindings,
    visionFindings,
    evaluatorStatus,
    evaluatorError,
    evaluatorSummary,
    subjective,
    checks: {
      file: {
        ok: file.ok,
        width: file.width,
        height: file.height,
        format: file.format,
        bytes: file.bytes,
      },
      dimensions: {
        ok:
          file.ok &&
          file.width === input.expectedDimensions.width &&
          file.height === input.expectedDimensions.height,
        expected: input.expectedDimensions,
        actual: file.ok ? { width: file.width!, height: file.height! } : null,
      },
      references: { ok: missingRequired.length === 0, missingRequired },
    },
    attempt: input.attempt,
  });

  return { objectiveVerdict: quality.objectiveVerdict, quality };
}
