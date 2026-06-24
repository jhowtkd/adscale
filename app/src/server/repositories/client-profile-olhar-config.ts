import { and, eq } from "drizzle-orm";

import { db } from "../db";
import {
  clientProfileOlharConfig,
  type ClientProfileOlharConfig,
  type OlharVoiceConfigPayload,
  type OlharVoiceReviewStatus,
} from "../db/schema";

export interface GetOlharVoiceConfigInput {
  workspaceId: string;
  clientProfileId: string;
}

export interface UpsertOlharVoiceConfigInput {
  workspaceId: string;
  clientProfileId: string;
  voiceId: string;
  displayName: string;
  config: OlharVoiceConfigPayload;
  reviewStatus: OlharVoiceReviewStatus;
  source?: string;
  approvedAt?: Date | null;
  approvedBy?: string | null;
}

export async function getOlharVoiceConfigByClientProfileId(
  input: GetOlharVoiceConfigInput
): Promise<ClientProfileOlharConfig | null> {
  const [row] = await db
    .select()
    .from(clientProfileOlharConfig)
    .where(
      and(
        eq(clientProfileOlharConfig.workspaceId, input.workspaceId),
        eq(clientProfileOlharConfig.clientProfileId, input.clientProfileId)
      )
    )
    .limit(1);

  return row ?? null;
}

export async function upsertOlharVoiceConfig(
  input: UpsertOlharVoiceConfigInput
): Promise<ClientProfileOlharConfig> {
  const now = new Date();

  const [row] = await db
    .insert(clientProfileOlharConfig)
    .values({
      workspaceId: input.workspaceId,
      clientProfileId: input.clientProfileId,
      voiceId: input.voiceId,
      displayName: input.displayName,
      config: input.config,
      reviewStatus: input.reviewStatus,
      source: input.source ?? "seeded",
      approvedAt: input.approvedAt ?? null,
      approvedBy: input.approvedBy ?? null,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: clientProfileOlharConfig.clientProfileId,
      set: {
        workspaceId: input.workspaceId,
        voiceId: input.voiceId,
        displayName: input.displayName,
        config: input.config,
        reviewStatus: input.reviewStatus,
        source: input.source ?? "seeded",
        approvedAt: input.approvedAt ?? null,
        approvedBy: input.approvedBy ?? null,
        updatedAt: now,
      },
    })
    .returning();

  return row;
}
