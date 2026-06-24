import { getOlharVoiceConfigByClientProfileId } from "@/server/repositories/client-profile-olhar-config";
import type { OlharVoiceReviewStatus } from "@/server/db/schema";

import type { ClientVoice } from "./cenbrap";
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
  const row = await getOlharVoiceConfigByClientProfileId({
    workspaceId: input.workspaceId,
    clientProfileId: input.clientProfileId,
  });

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
