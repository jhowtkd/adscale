import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { buildBrandTasteProfile } from "@/server/brand-taste/taste-profile";
import { requirePlatformOwner } from "@/server/auth/require-platform-owner";
import { db } from "@/server/db";
import { clientProfiles } from "@/server/db/schema";
import { listCalibrationSignalsForClientProfile } from "@/server/repositories/calibration-signal";

const paramsSchema = z.object({
  clientProfileId: z.string().uuid(),
});

const CORPUS_SIGNALS_NOTE_PT =
  "Nenhum sinal de calibração registrado ainda; avaliações de corpus podem existir separadamente até a ponte de sinais ser liberada.";

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

    const signals = await listCalibrationSignalsForClientProfile({
      workspaceId: profile.workspaceId,
      clientProfileId: profile.id,
    });

    const tasteProfile = buildBrandTasteProfile({
      clientProfileId: profile.id,
      workspaceId: profile.workspaceId,
      signals,
    });

    const fixtureOnly =
      tasteProfile.sourceComposition.real_customer === 0 &&
      tasteProfile.decisionCount > 0;

    const corpusSignalsNote =
      tasteProfile.decisionCount === 0 ? CORPUS_SIGNALS_NOTE_PT : null;

    return NextResponse.json({
      ...tasteProfile,
      fixtureOnly,
      corpusSignalsNote,
    });
  } catch (error) {
    return handleApiError(error, "admin.quality.brands.profile.GET");
  }
}
