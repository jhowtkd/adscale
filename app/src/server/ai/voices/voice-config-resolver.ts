import { getOlharVoiceConfigByClientProfileId } from "@/server/repositories/client-profile-olhar-config";
import type { OlharVoiceReviewStatus } from "@/server/db/schema";
import { logger } from "@/lib/logger";

import type { ClientVoice } from "./client-voice-types";
import { buildClientVoiceFromConfig } from "./client-voice";

export interface ResolveVoiceForClientProfileInput {
  workspaceId: string;
  clientProfileId: string;
}

export interface ResolvedClientVoice {
  voice: ClientVoice;
  reviewStatus: OlharVoiceReviewStatus;
}

export async function resolveVoiceForClientProfile(
  input: ResolveVoiceForClientProfileInput
): Promise<ResolvedClientVoice | null> {
  let row;
  try {
    row = await getOlharVoiceConfigByClientProfileId({
      workspaceId: input.workspaceId,
      clientProfileId: input.clientProfileId,
    });
  } catch (error) {
    logger.warn("[resolveVoiceForClientProfile] olhar config lookup failed; using fallback", {
      workspaceId: input.workspaceId,
      clientProfileId: input.clientProfileId,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }

  if (!row) {
    return null;
  }

  return {
    voice: buildClientVoiceFromConfig({
      voiceId: row.voiceId,
      displayName: row.displayName,
      config: row.config,
    }),
    reviewStatus: row.reviewStatus,
  };
}
