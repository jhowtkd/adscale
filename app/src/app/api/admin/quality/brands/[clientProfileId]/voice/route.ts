import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { requirePlatformOwner } from "@/server/auth/require-platform-owner";
import { db } from "@/server/db";
import { clientProfiles } from "@/server/db/schema";
import { getOlharVoiceConfigByClientProfileId } from "@/server/repositories/client-profile-olhar-config";

const paramsSchema = z.object({
  clientProfileId: z.string().uuid(),
});

export async function GET(
  request: Request,
  context: { params: Promise<{ clientProfileId: string }> }
) {
  try {
    await requirePlatformOwner(request);
    const rawParams = await context.params;
    const parsed = paramsSchema.safeParse(rawParams);

    if (!parsed.success) {
      return apiError("validation_error", 400);
    }

    const { clientProfileId } = parsed.data;

    const [profile] = await db
      .select({
        id: clientProfiles.id,
        workspaceId: clientProfiles.workspaceId,
      })
      .from(clientProfiles)
      .where(eq(clientProfiles.id, clientProfileId))
      .limit(1);

    if (!profile) {
      return apiError("not_found", 404);
    }

    const voiceConfig = await getOlharVoiceConfigByClientProfileId({
      workspaceId: profile.workspaceId,
      clientProfileId: profile.id,
    });

    if (!voiceConfig) {
      return NextResponse.json({ error: "voice_config_not_found" }, { status: 404 });
    }

    return NextResponse.json({
      clientProfileId: voiceConfig.clientProfileId,
      workspaceId: voiceConfig.workspaceId,
      voiceId: voiceConfig.voiceId,
      displayName: voiceConfig.displayName,
      reviewStatus: voiceConfig.reviewStatus,
      source: voiceConfig.source,
      config: voiceConfig.config,
      approvedAt: voiceConfig.approvedAt?.toISOString() ?? null,
    });
  } catch (error) {
    return handleApiError(error, "admin.quality.brands.voice.GET");
  }
}
