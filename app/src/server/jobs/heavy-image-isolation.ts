export const REQUIRED_HEAVY_IMAGE_SERVICE = "adscale-image-worker";
export const REQUIRED_V2_FUNCTION_COUNT = 8;
export const WORKER_CONNECTED_EVENT = "image_worker_connected";

export type HeavyImageIsolationInput = {
  liveServiceNames: readonly string[];
  workerConnected: boolean;
  syncedV2FunctionCount: number;
};

export function heavyImageExecutorIdentity(env: NodeJS.ProcessEnv = process.env): {
  executorAppId: string;
  executorPid: number;
  executorInstance: string;
} {
  return {
    executorAppId: env.RENDER_SERVICE_NAME ?? env.INNGEST_APP_ID ?? REQUIRED_HEAVY_IMAGE_SERVICE,
    executorPid: process.pid,
    executorInstance: env.RENDER_INSTANCE_ID ?? env.HOSTNAME ?? "local",
  };
}

/** p95 budget for Studio navigation while heavy jobs run off-process. */
export const HEAVY_IMAGE_NAVIGATION_P95_BUDGET_MS = 50;

export function percentile95(samples: number[]): number {
  if (samples.length === 0) return Number.POSITIVE_INFINITY;
  const sorted = [...samples].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1);
  return sorted[Math.max(0, index)]!;
}

export function heavyImageIsolationEvidence(input: HeavyImageIsolationInput): {
  isolated: boolean;
  missing: string[];
} {
  const missing: string[] = [];
  if (!input.liveServiceNames.includes(REQUIRED_HEAVY_IMAGE_SERVICE)) {
    missing.push(REQUIRED_HEAVY_IMAGE_SERVICE);
  }
  if (!input.workerConnected) {
    missing.push(WORKER_CONNECTED_EVENT);
  }
  if (input.syncedV2FunctionCount < REQUIRED_V2_FUNCTION_COUNT) {
    missing.push(`v2_functions_${input.syncedV2FunctionCount}_of_${REQUIRED_V2_FUNCTION_COUNT}`);
  }
  return { isolated: missing.length === 0, missing };
}
