import type { BetaAnalyticsEvent } from "../db/schema";
import { CREATIVE_WORK_INTENTS } from "../creative-work/contracts";
import {
  validateCampaignOwnership,
  validateDerivationOwnership,
} from "../feedback/validate-refs";
import {
  getBetaSessionById,
  insertBetaAnalyticsEvent,
} from "../repositories/beta-analytics";
import { getCreativeWork } from "../repositories/creative-work";
import {
  BetaEventPropertiesValidationError,
  sanitizeBetaEventProperties,
} from "./sanitize";
import { BETA_EVENT_KEYS, type BetaEventSource } from "./types";
import type { BetaEventPropertyValue } from "./sanitize";

const GUEST_PROTOCOLS: readonly string[] = CREATIVE_WORK_INTENTS;
const MAX_GUEST_REFERENCES = 3;

/**
 * Guest-import payload policy: the four allowed properties are all required,
 * the work must belong to the session workspace, and counts stay within the
 * public snapshot bounds. Unknown/denied keys never reach this point: the
 * shared strict sanitizer rejects them first.
 */
async function validateGuestDraftImported(
  workspaceId: string,
  properties: Record<string, BetaEventPropertyValue>,
): Promise<void> {
  const { creativeWorkId, protocol, referenceCount, recovered } = properties;
  if (typeof creativeWorkId !== "string" || !creativeWorkId) {
    throw new BetaEventPropertiesValidationError(
      "guest_draft_imported requires creativeWorkId",
    );
  }
  if (typeof protocol !== "string" || !GUEST_PROTOCOLS.includes(protocol)) {
    throw new BetaEventPropertiesValidationError(
      "guest_draft_imported requires a canonical protocol",
      { protocol },
    );
  }
  if (
    typeof referenceCount !== "number" ||
    !Number.isInteger(referenceCount) ||
    referenceCount < 0 ||
    referenceCount > MAX_GUEST_REFERENCES
  ) {
    throw new BetaEventPropertiesValidationError(
      "guest_draft_imported requires referenceCount 0-3",
      { referenceCount },
    );
  }
  if (typeof recovered !== "boolean") {
    throw new BetaEventPropertiesValidationError(
      "guest_draft_imported requires recovered",
      { recovered },
    );
  }
  const aggregate = await getCreativeWork(workspaceId, creativeWorkId);
  if (!aggregate) {
    throw new BetaEventPropertiesValidationError(
      "creativeWorkId not found in workspace",
      { creativeWorkId },
    );
  }
}

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

  if (
    !BETA_EVENT_KEYS.includes(
      input.eventKey as (typeof BETA_EVENT_KEYS)[number]
    )
  ) {
    throw new BetaEventPropertiesValidationError("unknown event_key", {
      eventKey: input.eventKey,
    });
  }

  if (input.eventKey === "guest_draft_imported") {
    await validateGuestDraftImported(input.workspaceId, properties);
  }

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
