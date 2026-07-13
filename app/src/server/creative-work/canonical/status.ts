/**
 * Normalização de estados entre Campanha e Creative Work → funil canônico.
 * Rejeita combinações impossíveis (Gate 2 / item 15).
 */
import type { CreativeWorkFunnelStage } from "@/server/creative-work/funnel-events";
import type { CanonicalOutputStatus, CanonicalWorkState } from "./types";

export class ImpossibleCanonicalStateError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "ImpossibleCanonicalStateError";
    this.code = code;
  }
}

export type CampaignStatusInput = {
  status: string;
  creativeDiagnosisStatus?: string | null;
  activeDerivations?: number;
  totalDerivations?: number;
  completedDerivations?: number;
  failedDerivations?: number;
  derivationStatuses?: string[];
};

export type CreativeWorkStatusInput = {
  status: string;
  hasCopy: boolean;
  hasIdentitySnapshot: boolean;
  outputStatuses: string[];
  hasSelectedOutput: boolean;
};

const CAMPAIGN_STATUSES = new Set([
  "draft",
  "active",
  "generating",
  "completed",
  "failed",
]);

const CREATIVE_WORK_STATUSES = new Set([
  "draft",
  "ready",
  "generating",
  "partial",
  "completed",
  "failed",
]);

export function mapDerivationStatusToCanonical(
  status: string
): CanonicalOutputStatus {
  switch (status) {
    case "queued":
      return "queued";
    case "processing":
      return "processing";
    case "completed":
      return "ready";
    case "approved":
      return "approved";
    case "rejected":
      return "rejected";
    case "failed":
      return "failed";
    default:
      throw new ImpossibleCanonicalStateError(
        "unknown_derivation_status",
        `Unknown derivation status: ${status}`
      );
  }
}

export function mapCreativeWorkOutputStatusToCanonical(
  status: string
): CanonicalOutputStatus {
  switch (status) {
    case "queued":
      return "queued";
    case "processing":
      return "processing";
    case "completed":
      return "ready";
    case "failed":
      return "failed";
    default:
      throw new ImpossibleCanonicalStateError(
        "unknown_output_status",
        `Unknown creative work output status: ${status}`
      );
  }
}

/**
 * Projects campaign (+ optional derivation signals) onto a funnel stage.
 * Throws on impossible combinations.
 */
export function normalizeCampaignState(
  input: CampaignStatusInput
): CanonicalWorkState {
  const {
    status,
    creativeDiagnosisStatus,
    activeDerivations = 0,
    totalDerivations = 0,
    completedDerivations = 0,
    failedDerivations = 0,
    derivationStatuses = [],
  } = input;

  if (!CAMPAIGN_STATUSES.has(status)) {
    throw new ImpossibleCanonicalStateError(
      "unknown_campaign_status",
      `Unknown campaign status: ${status}`
    );
  }

  if (status === "draft" && (totalDerivations > 0 || derivationStatuses.length > 0)) {
    throw new ImpossibleCanonicalStateError(
      "draft_with_derivations",
      "Campaign draft cannot have derivations"
    );
  }

  if (status === "completed" && activeDerivations > 0) {
    throw new ImpossibleCanonicalStateError(
      "completed_with_active",
      "Campaign completed cannot have active derivations"
    );
  }

  if (status === "failed") return "failed";

  const statuses =
    derivationStatuses.length > 0
      ? derivationStatuses
      : synthesizeStatusesFromMetrics({
          activeDerivations,
          completedDerivations,
          failedDerivations,
          totalDerivations,
        });

  if (statuses.some((s) => s === "queued" || s === "processing") || status === "generating") {
    return "generating";
  }

  if (statuses.some((s) => s === "approved")) {
    return "approved";
  }

  if (
    statuses.some((s) => s === "completed") ||
    (status === "completed" && completedDerivations > 0)
  ) {
    return "reviewing";
  }

  if (
    statuses.length > 0 &&
    statuses.every((s) => s === "failed") &&
    status !== "draft" &&
    status !== "active"
  ) {
    return "failed";
  }

  if (status === "active" || creativeDiagnosisStatus === "ready") {
    return "briefing";
  }

  if (status === "completed") {
    return "reviewing";
  }

  return "intending";
}

function synthesizeStatusesFromMetrics(m: {
  activeDerivations: number;
  completedDerivations: number;
  failedDerivations: number;
  totalDerivations: number;
}): string[] {
  const out: string[] = [];
  for (let i = 0; i < m.activeDerivations; i++) out.push("processing");
  for (let i = 0; i < m.completedDerivations; i++) out.push("completed");
  for (let i = 0; i < m.failedDerivations; i++) out.push("failed");
  if (out.length === 0 && m.totalDerivations > 0) {
    // metrics incomplete — treat as reviewing-capable presence
    for (let i = 0; i < m.totalDerivations; i++) out.push("completed");
  }
  return out;
}

/**
 * Projects Creative Work item + outputs onto a funnel stage.
 * Throws on impossible combinations.
 */
export function normalizeCreativeWorkState(
  input: CreativeWorkStatusInput
): CanonicalWorkState {
  const {
    status,
    hasCopy,
    hasIdentitySnapshot,
    outputStatuses,
    hasSelectedOutput,
  } = input;

  if (!CREATIVE_WORK_STATUSES.has(status)) {
    throw new ImpossibleCanonicalStateError(
      "unknown_creative_work_status",
      `Unknown creative work status: ${status}`
    );
  }

  if (status === "ready" && !hasIdentitySnapshot) {
    throw new ImpossibleCanonicalStateError(
      "ready_without_identity",
      "Creative Work ready requires identitySnapshot"
    );
  }

  if (status === "generating" && outputStatuses.length === 0) {
    throw new ImpossibleCanonicalStateError(
      "generating_without_outputs",
      "Creative Work generating requires at least one output row"
    );
  }

  if (status === "failed") return "failed";

  if (
    outputStatuses.some((s) => s === "queued" || s === "processing") ||
    status === "generating"
  ) {
    return "generating";
  }

  if (status === "completed" && hasSelectedOutput) {
    return "approved";
  }

  if (status === "completed" || status === "partial") {
    return "reviewing";
  }

  if (status === "ready") {
    return "briefing";
  }

  // draft
  if (!hasCopy) return "intending";
  if (!hasIdentitySnapshot) return "intending";
  return "briefing";
}

/** Exhaustiveness helper for consumers asserting a stage is known. */
export function assertFunnelStage(
  state: string
): asserts state is CreativeWorkFunnelStage {
  const allowed: readonly string[] = [
    "intending",
    "briefing",
    "generating",
    "reviewing",
    "approved",
    "delivered",
    "abandoned",
    "failed",
  ];
  if (!allowed.includes(state)) {
    throw new ImpossibleCanonicalStateError(
      "unknown_funnel_stage",
      `Unknown funnel stage: ${state}`
    );
  }
}
