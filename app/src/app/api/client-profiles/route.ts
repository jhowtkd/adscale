import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import {
  createClientProfile,
  getClientProfiles,
} from "@/server/repositories/client-reference";
import { recordBrandMemoryEvent } from "@/server/memory/brand-memory-dispatch";

const createProfileSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional(),
  visualNotes: z.string().trim().max(1000).optional(),
  toneNotes: z.string().trim().max(1000).optional(),
  constraints: z.string().trim().max(1000).optional(),
});

export async function GET(request: Request) {
  try {
    const { workspace } = await requireWorkspaceAccess(request);
    const profiles = await getClientProfiles(workspace.id);
    return NextResponse.json({ profiles });
  } catch (error) {
    return handleApiError(error, "client-profiles.GET");
  }
}

export async function POST(request: Request) {
  try {
    const { workspace } = await requireWorkspaceAccess(request);
    const body = await request.json();
    const parsed = createProfileSchema.safeParse(body);

    if (!parsed.success) {
      return apiError("invalidInput", 400, parsed.error.flatten());
    }

    const profile = await createClientProfile(workspace.id, parsed.data);
    await recordBrandMemoryEvent({
      type: "brand_profile_created_or_updated",
      workspaceId: workspace.id,
      clientProfileId: profile.id,
      occurredAt: profile.createdAt,
      summary: `Brand/client profile "${profile.name}" was created.`,
      payload: {
        action: "created",
        profile: {
          name: profile.name,
          description: profile.description,
          visualNotes: profile.visualNotes,
          toneNotes: profile.toneNotes,
          constraints: profile.constraints,
          brandColors: profile.brandColors,
          brandFonts: profile.brandFonts,
          toneOfVoice: profile.toneOfVoice,
          prohibitedElements: profile.prohibitedElements,
          requiredElements: profile.requiredElements,
        },
      },
    });
    return NextResponse.json({ profile }, { status: 201 });
  } catch (error) {
    return handleApiError(error, "client-profiles.POST");
  }
}
