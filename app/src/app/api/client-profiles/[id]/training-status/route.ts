import { NextResponse } from "next/server";
import { apiError, handleApiError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { getBrandKit } from "@/server/db/repositories/brand-kit";
import { getClientProfile, getClientReferences } from "@/server/repositories/client-reference";
import { getOlharVoiceConfigByClientProfileId } from "@/server/repositories/client-profile-olhar-config";
import { resolveBrandProfileStatus } from "@/server/brand-profile/trained-status";

/**
 * Read-only training status for a client profile.
 *
 * Used by the brand-training wizard and by the assistant when the user asks
 * "how is the Acme training going?". State is fully derived at runtime from
 * the profile + its references + its voice config — nothing is persisted as a
 * status flag.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const [{ workspace }, { id }] = await Promise.all([
      requireWorkspaceAccess(request),
      params,
    ]);

    const profile = await getClientProfile(workspace.id, id);
    if (!profile) {
      return apiError("clientProfileNotFound", 404);
    }

    const [brandKit, references, voiceConfig] = await Promise.all([
      getBrandKit(workspace.id, id),
      getClientReferences(workspace.id, id),
      getOlharVoiceConfigByClientProfileId({ workspaceId: workspace.id, clientProfileId: id }),
    ]);

    const status = resolveBrandProfileStatus(
      {
        logoAssetKey: (brandKit?.logoAssetKey ?? null) as string | null,
        brandColors: (brandKit?.brandColors ?? null) as string[] | null,
        brandFonts: (brandKit?.brandFonts ?? null) as string[] | null,
      },
      references.map((r) => ({ kind: r.kind as never })),
    );

    return NextResponse.json({
      profile: { id: profile.id, name: profile.name },
      trained: status.trained,
      missing: status.missing,
      voice: {
        configured: Boolean(voiceConfig),
        reviewStatus: voiceConfig?.reviewStatus ?? null,
      },
    });
  } catch (error) {
    return handleApiError(error, "client-profiles.[id].training-status.GET");
  }
}
