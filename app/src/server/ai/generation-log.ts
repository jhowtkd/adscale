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
