/**
 * Contrato canônico de geração (Convergence Phase 3 / Gate 3).
 *
 * Define o pedido e as decisões de política compartilhadas por Campanha,
 * Assistente e Criar Post. Persistência e UI permanecem nos adapters.
 */
import type { CreativeWorkOrigin } from "@/server/creative-work/funnel-events";

export type GenerationSurface = "campaign" | "assistant" | "quick_tool";

export type GenerationMode =
  | "art_variation"
  | "format_adaptation"
  | "restyling"
  | "creative_revision"
  | "social_post";

/** Explicit refund contract carried on generation events. */
export type RefundPolicy = "default" | "none";

export type FailurePhase =
  | "pre_provider"
  | "post_provider"
  | "low_quality"
  | "job_failure";

export interface GenerationCostPolicy {
  /** Credits charged before dispatch (caller responsibility). */
  chargeAmount: number;
  refundPolicy: RefundPolicy;
}

export interface GenerationIdempotency {
  /** Billing ledger key (spend/refund). */
  billingKey: string;
  /** Job-level skip when output already materialised. */
  skipWhenOutputExists: boolean;
}

export interface GenerationRequest {
  workspaceId: string;
  origin: CreativeWorkOrigin;
  surface: GenerationSurface;
  mode: GenerationMode;
  /** Destination aggregate id (derivationId or creativeWork outputId). */
  destinationId: string;
  parentId: string | null;
  cost: GenerationCostPolicy;
  idempotency: GenerationIdempotency;
  /** Assistant creative_revision only — enables job-level refund. */
  assistantActionId?: string | null;
}

export type RefundDecision =
  | {
      refund: true;
      amount: number;
      idempotencyKey: string;
      reason: string;
    }
  | {
      refund: false;
      reason: string;
    };

export type IdempotencyDecision =
  | { skip: true; reason: string }
  | { skip: false; reason: string };

export type RetryDecision =
  | { retry: true; reason: string }
  | { retry: false; reason: string };

/** Standard credit amounts already used by existing callers. */
export const GENERATION_CREDIT_COSTS = {
  singleDerivation: 5,
  creativeWorkOutput: 5,
  creativeWorkTriplet: 15,
  goalPackage: 15,
} as const;
