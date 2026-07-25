/**
 * Políticas canônicas de cobrança, reembolso, retry e idempotência (item 21).
 *
 * Codifica o comportamento já observado nos jobs — não muda preços.
 * Callers devem consultar estas funções em vez de reimplementar regras.
 */
import {
  GENERATION_CREDIT_COSTS,
  type FailurePhase,
  type GenerationMode,
  type GenerationSurface,
  type IdempotencyDecision,
  type RefundDecision,
  type RefundPolicy,
  type RetryDecision,
} from "./types";

export interface DerivationRefundInput {
  surface: Extract<GenerationSurface, "campaign" | "assistant">;
  generationMode: string | null | undefined;
  refundPolicy?: RefundPolicy | string | null;
  assistantActionId?: string | null;
  failurePhase: FailurePhase;
}

export interface CreativeWorkRefundInput {
  surface: "quick_tool";
  failurePhase: FailurePhase;
  workItemId: string;
  outputId: string;
}

/**
 * Derivation / Assistente refund rules (current production behaviour):
 * - Charge happens upstream of the job.
 * - Job refunds only assistant `creative_revision` on job_failure when
 *   refundPolicy !== "none".
 * - Pre/post provider and low_quality do not refund inside the derivation job.
 */
export function decideDerivationRefund(
  input: DerivationRefundInput
): RefundDecision {
  if (input.failurePhase !== "job_failure") {
    return {
      refund: false,
      reason: `derivation_${input.failurePhase}_no_job_refund`,
    };
  }

  if (input.refundPolicy === "none") {
    return { refund: false, reason: "refund_policy_none" };
  }

  if (
    input.assistantActionId &&
    input.generationMode === "creative_revision"
  ) {
    return {
      refund: true,
      amount: GENERATION_CREDIT_COSTS.singleDerivation,
      idempotencyKey: `assistant-action:${input.assistantActionId}:refund`,
      reason: "assistant_creative_revision_job_failure",
    };
  }

  return { refund: false, reason: "derivation_job_failure_non_refundable" };
}

/**
 * Criar Post refund rules:
 * - Triplet/batch charged upstream.
 * - Per-output refund (5) on pre_provider and low_quality.
 * - R-006: a v1 output that fails TERMINALLY after consuming its durable
 *   image-call budget settles at net zero via an idempotent refund keyed per
 *   output — repetition of the same refund is a duplicate, never a second
 *   credit. Legacy-frozen works keep the historical behavior below.
 * - Legacy post-provider failure: no refund.
 */
export function decideCreativeWorkRefund(
  input: CreativeWorkRefundInput
): RefundDecision {
  if (
    input.failurePhase === "pre_provider" ||
    input.failurePhase === "low_quality"
  ) {
    return {
      refund: true,
      amount: GENERATION_CREDIT_COSTS.creativeWorkOutput,
      idempotencyKey: `creative-work:${input.workItemId}:output:${input.outputId}:pregen-refund`,
      reason:
        input.failurePhase === "low_quality"
          ? "creative_work_low_quality"
          : "creative_work_pre_provider",
    };
  }

  if (input.failurePhase === "terminal") {
    return {
      refund: true,
      amount: GENERATION_CREDIT_COSTS.creativeWorkOutput,
      idempotencyKey: `creative-work:${input.workItemId}:output:${input.outputId}:terminal-refund`,
      reason: "creative_work_terminal_failure",
    };
  }

  if (input.failurePhase === "post_provider") {
    return { refund: false, reason: "creative_work_post_provider_no_refund" };
  }

  return { refund: false, reason: "creative_work_job_failure_no_refund" };
}

export function decideGenerationRefund(
  input: DerivationRefundInput | CreativeWorkRefundInput
): RefundDecision {
  if (input.surface === "quick_tool") {
    return decideCreativeWorkRefund(input);
  }
  return decideDerivationRefund(input);
}

/** Job-level skip when an output is already materialised. */
export function decideJobIdempotency(input: {
  surface: GenerationSurface;
  hasOutputKey?: boolean;
  outputStatus?: string | null;
}): IdempotencyDecision {
  if (input.surface === "quick_tool") {
    if (input.outputStatus === "completed") {
      return { skip: true, reason: "creative_work_output_already_completed" };
    }
    return { skip: false, reason: "creative_work_output_pending" };
  }

  if (input.hasOutputKey) {
    return { skip: true, reason: "derivation_output_key_present" };
  }
  return { skip: false, reason: "derivation_output_pending" };
}

/**
 * Auto-retry is derivation-only today (objective hard failures, once).
 * Criar Post relies on user retry routes — no automatic job retry.
 */
export function decideAutoRetry(input: {
  surface: GenerationSurface;
  mode?: GenerationMode | string | null;
  eligibleByPolicy: boolean;
}): RetryDecision {
  if (input.surface === "quick_tool") {
    return { retry: false, reason: "creative_work_no_auto_retry" };
  }
  if (!input.eligibleByPolicy) {
    return { retry: false, reason: "derivation_auto_retry_not_eligible" };
  }
  return { retry: true, reason: "derivation_auto_retry_eligible" };
}

/**
 * Minimum quality score for surfaces that reject low-quality outputs.
 * Campaign/assistant score is advisory (gate is separate / non-blocking).
 */
export const POST_GENERATION_MIN_QUALITY_SCORE: Record<
  GenerationSurface,
  number | null
> = {
  quick_tool: 60,
  campaign: null,
  assistant: null,
};

export type PostGenerationQualityDecision =
  | { accept: true; reason: string }
  | { accept: false; failurePhase: "low_quality"; reason: string };

/**
 * Shared post-score quality policy (item 22).
 * Criar Post rejects below threshold; derivation always accepts here.
 */
export function decidePostGenerationQuality(input: {
  surface: GenerationSurface;
  quality: {
    scoreStatus: string;
    qualityScore: number;
  } | null;
}): PostGenerationQualityDecision {
  const threshold = POST_GENERATION_MIN_QUALITY_SCORE[input.surface];
  if (threshold == null) {
    return {
      accept: true,
      reason: `${input.surface}_quality_advisory_only`,
    };
  }
  if (!input.quality) {
    // Scorer crash: preserve prior behaviour — do not reject.
    return { accept: true, reason: "score_unavailable_accept" };
  }
  if (
    input.quality.scoreStatus === "failed" ||
    input.quality.qualityScore < threshold
  ) {
    return {
      accept: false,
      failurePhase: "low_quality",
      reason: `low_quality score=${input.quality.qualityScore} threshold=${threshold}`,
    };
  }
  return { accept: true, reason: "quality_above_threshold" };
}
