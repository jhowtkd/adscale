/**
 * Contrato canônico de geração (Convergence Phase 3 / Gate 3).
 *
 * Plano §5.2 — solicitação canônica consumida por `executeCanonicalGeneration`.
 */
import type { CreativeWorkOrigin } from "@/server/creative-work/funnel-events";
import type { ImageReference } from "@/server/ai/providers/image-provider";
import type { GenerationCandidateMeta } from "@/server/ai/image-generation";

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
  /** Credits charged for this generation unit. */
  chargeAmount: number;
  refundPolicy: RefundPolicy;
}

export interface GenerationIdempotency {
  /** Billing ledger key (spend/refund). */
  billingKey: string;
  /** Job-level skip when output already materialised. */
  skipWhenOutputExists: boolean;
}

export interface GenerationAuthorship {
  userId: string | null;
  workspaceId: string;
}

export interface GenerationIntent {
  mode: GenerationMode;
  objective: string | null;
}

export interface GenerationIdentity {
  clientProfileId: string | null;
  /** Provider reference images (brand / base / style). */
  referenceImages: ImageReference[];
  brandConstraints: string | null;
}

export interface GenerationFormat {
  targetFormat: string;
  dimensions: { width: number; height: number };
  constraints: string | null;
  isPreview?: boolean;
}

export interface GenerationSource {
  parentId: string | null;
  sourceVersionId: string | null;
  lineageId: string | null;
  packageSource: string | null;
  outputSuffix?: string;
  /** When true, allow edit→generate fallback (derivation single-ref path). */
  allowGenerateFallback?: boolean;
}

export interface GenerationDestination {
  kind: "derivation" | "creative_work_output";
  id: string;
  storagePrefix: string;
  campaignId?: string;
  workItemId?: string;
}

/**
 * Canonical generation request — built by surface adapters, executed once.
 */
export interface GenerationRequest {
  authorship: GenerationAuthorship;
  origin: CreativeWorkOrigin;
  surface: GenerationSurface;
  intent: GenerationIntent;
  identity: GenerationIdentity;
  format: GenerationFormat;
  source: GenerationSource;
  /** Fully resolved prompt text from the surface adapter. */
  prompt: { text: string };
  cost: GenerationCostPolicy;
  idempotency: GenerationIdempotency;
  destination: GenerationDestination;
  /** Assistant creative_revision only — enables job-level refund. */
  assistantActionId?: string | null;
}

export interface GenerationResult {
  outputKey: string;
  revisedPrompt: string;
  buffer: Buffer;
  imageOperation: "generate" | "edit" | "generation_fallback";
  candidates: (GenerationCandidateMeta & { winner: boolean })[];
  /** Echo of the request destination for adapters. */
  destination: GenerationDestination;
  surface: GenerationSurface;
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

export function assertGenerationRequest(
  request: GenerationRequest
): void {
  if (!request.authorship.workspaceId) {
    throw new Error("GenerationRequest.authorship.workspaceId is required");
  }
  if (!request.prompt.text.trim()) {
    throw new Error("GenerationRequest.prompt.text is required");
  }
  if (!request.destination.id || !request.destination.storagePrefix) {
    throw new Error("GenerationRequest.destination is incomplete");
  }
  if (!request.idempotency.billingKey) {
    throw new Error("GenerationRequest.idempotency.billingKey is required");
  }
  if (!(request.cost.chargeAmount > 0)) {
    throw new Error("GenerationRequest.cost.chargeAmount must be > 0");
  }
  if (!request.format.dimensions.width || !request.format.dimensions.height) {
    throw new Error("GenerationRequest.format.dimensions are required");
  }
}
