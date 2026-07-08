import { logger } from "@/lib/logger";

export interface GenerationLogStep {
  name: string;
  startedAt: string;
  endedAt?: string;
  durationMs?: number;
  status: "started" | "completed" | "failed" | "skipped";
  detail?: string;
}

export interface DerivationGenerationLog {
  schemaVersion: 1;
  campaignId: string;
  derivationId: string;
  startedAt: string;
  completedAt?: string;
  totalDurationMs?: number;
  steps: GenerationLogStep[];
  model?: string;
  imageOperation?: string;
  autoRetryAttempted?: boolean;
  autoRetryReason?: string;
  appliedBrandRuleIds?: string[];
  appliedCorpusRuleIds?: string[];
  error?: string;
}

export function createGenerationLog(
  campaignId: string,
  derivationId: string
): DerivationGenerationLog {
  return {
    schemaVersion: 1,
    campaignId,
    derivationId,
    startedAt: new Date().toISOString(),
    steps: [],
  };
}

export function appendGenerationLogStep(
  log: DerivationGenerationLog,
  step: Omit<GenerationLogStep, "startedAt"> & { startedAt?: string }
): DerivationGenerationLog {
  const startedAt = step.startedAt ?? new Date().toISOString();
  return {
    ...log,
    steps: [
      ...log.steps,
      {
        ...step,
        startedAt,
      },
    ],
  };
}

export function finalizeGenerationLog(
  log: DerivationGenerationLog,
  patch: Partial<DerivationGenerationLog> = {}
): DerivationGenerationLog {
  const completedAt = new Date().toISOString();
  const started = Date.parse(log.startedAt);
  const totalDurationMs = Number.isFinite(started)
    ? Date.parse(completedAt) - started
    : undefined;

  return {
    ...log,
    ...patch,
    completedAt,
    totalDurationMs,
  };
}

/**
 * Telemetry event payload emitted once per dual-engine generation run. The
 * shape is consumed by the cockpit owner's analytics view to show win rate,
 * average score, latency, and cost per provider.
 *
 * Note: `campaignId`, `workspaceId`, and `jobType` are not yet threaded
 * through `generateAndStoreImage`; the MVP emits the event with the metadata
 * we have (`derivationId: outputPrefix`) plus empty/placeholder values for
 * those fields. A follow-up extends the helper signature to accept a
 * `telemetry` block so analytics can correlate runs to campaigns/workspaces.
 */
export type DualEngineCandidateEvent = {
  event: "image.generation.candidates";
  campaignId: string;
  derivationId: string;
  workspaceId: string;
  jobType: "derivation" | "creative_work" | "brand_training";
  candidates: Array<{
    provider: "openai" | "seedream";
    model: string;
    outputKey: string;
    durationMs: number;
    score?: number;
    quality?: "invalid" | "improvable" | "acceptable";
    costCredits?: number;
  }>;
  winnerProvider: "openai" | "seedream";
  aggregateLatencyMs: number;
  timestamp: string;
};

/**
 * Record a dual-engine telemetry event. Emits via the shared logger so the
 * existing log pipeline (with redaction/sampling) handles routing. When a
 * dedicated telemetry sink is added (Task X), this becomes the single
 * insertion point to swap in a DB or analytics client.
 */
export async function recordDualEngineCandidates(
  input: Omit<DualEngineCandidateEvent, "event" | "timestamp">
): Promise<void> {
  const event: DualEngineCandidateEvent = {
    event: "image.generation.candidates",
    timestamp: new Date().toISOString(),
    ...input,
  };
  logger.info("[dual-engine-candidates]", JSON.stringify(event));
}
