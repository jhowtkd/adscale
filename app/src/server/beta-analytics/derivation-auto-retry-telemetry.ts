import { logger } from "@/lib/logger";
import { classifyAutoRetryOutcome } from "@/server/ai/derivation-auto-retry-observability";
import type { CreativeHardFailure } from "@/server/ai/creative-quality-gate";
import { recordBetaAnalyticsEvent } from "./record";

const telemetryLogger = logger.child("derivation-auto-retry-telemetry");

export interface DerivationAutoRetryTelemetryContext {
  workspaceId: string;
  userId: string;
  campaignId: string;
  derivationId: string;
  generationMode: string;
  targetFormat: string;
  isPreview?: boolean;
}

function baseProperties(context: DerivationAutoRetryTelemetryContext) {
  return {
    operation: context.generationMode,
    format: context.targetFormat,
    ...(context.isPreview ? { isPreview: true } : {}),
  };
}

export function emitDerivationAutoRetryTriggered(
  context: DerivationAutoRetryTelemetryContext,
  failureCodes: string[]
): void {
  void recordBetaAnalyticsEvent({
    workspaceId: context.workspaceId,
    userId: context.userId,
    eventKey: "derivation_auto_retry_triggered",
    source: "server",
    campaignId: context.campaignId,
    derivationId: context.derivationId,
    properties: {
      ...baseProperties(context),
      reasonCode: failureCodes.join(","),
    },
  }).catch((error) => {
    telemetryLogger.warn("derivation_auto_retry_triggered failed", error);
  });
}

export function emitDerivationAutoRetryOutcome(
  context: DerivationAutoRetryTelemetryContext,
  preRetryFailureCodes: string[],
  postRetryFailures: CreativeHardFailure[] | null | undefined
): void {
  const outcome = classifyAutoRetryOutcome(preRetryFailureCodes, postRetryFailures);
  const eventKey =
    outcome === "succeeded"
      ? "derivation_auto_retry_succeeded"
      : "derivation_auto_retry_unchanged";

  const postCodes = (postRetryFailures ?? []).map((failure) => failure.code);

  void recordBetaAnalyticsEvent({
    workspaceId: context.workspaceId,
    userId: context.userId,
    eventKey,
    source: "server",
    campaignId: context.campaignId,
    derivationId: context.derivationId,
    properties: {
      ...baseProperties(context),
      reasonCode:
        outcome === "succeeded"
          ? "cleared"
          : postCodes.join(",") || preRetryFailureCodes.join(","),
    },
  }).catch((error) => {
    telemetryLogger.warn(`${eventKey} failed`, error);
  });
}
