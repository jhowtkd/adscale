import type { BetaAnalyticsEvent } from "../db/schema";
import {
  validateCampaignOwnership,
  validateDerivationOwnership,
} from "../feedback/validate-refs";
import {
  getBetaSessionById,
  insertBetaAnalyticsEvent,
} from "../repositories/beta-analytics";
import {
  BetaEventPropertiesValidationError,
  sanitizeBetaEventProperties,
} from "./sanitize";
import type { BetaEventSource } from "./types";

export async function recordBetaAnalyticsEvent(input: {
  workspaceId: string;
  userId: string;
  eventKey: string;
  properties?: unknown;
  sessionId?: string | null;
  campaignId?: string | null;
  derivationId?: string | null;
  source?: BetaEventSource;
}): Promise<BetaAnalyticsEvent> {
  const properties = sanitizeBetaEventProperties(input.properties ?? {});
  const source = input.source ?? "client";

  if (input.sessionId) {
    const session = await getBetaSessionById(
      input.workspaceId,
      input.sessionId
    );
    if (!session) {
      throw new BetaEventPropertiesValidationError(
        "session not found in workspace",
        { sessionId: input.sessionId }
      );
    }
  }

  if (input.campaignId) {
    await validateCampaignOwnership(input.workspaceId, input.campaignId);
  }

  if (input.derivationId) {
    await validateDerivationOwnership(
      input.workspaceId,
      input.derivationId,
      input.campaignId
    );
  }

  return insertBetaAnalyticsEvent({
    workspaceId: input.workspaceId,
    userId: input.userId,
    eventKey: input.eventKey,
    properties,
    sessionId: input.sessionId ?? null,
    campaignId: input.campaignId ?? null,
    derivationId: input.derivationId ?? null,
    source,
  });
}
