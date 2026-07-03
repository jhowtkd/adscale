import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { getClientProfile } from "@/server/repositories/client-reference";
import {
  getOlharVoiceConfigByClientProfileId,
  upsertOlharVoiceConfig,
} from "@/server/repositories/client-profile-olhar-config";
import type { OlharVoiceConfigPayload } from "@/server/db/schema";

const approveVoiceSchema = z
  .object({
    /**
     * Optional edited payload. When omitted, the existing `pending_review`
     * config is approved as-is. When provided, it replaces the config before
     * approval so the user can tweak the proposal in the wizard first.
     */
    config: z
      .object({
        principles: z.array(z.string()),
        positiveSignals: z.array(z.string()),
        negativeSignals: z.array(z.string()),
        authorityAndClaims: z.array(z.string()),
        inviteRhythm: z.array(z.string()),
        correctButSoulless: z.array(z.string()),
        matchTerms: z.array(z.string()).optional(),
      })
      .optional(),
  })
  .strict();

/**
 * Approve the brand voice for a client profile (plan Fase 4.4).
 *
 * Transitions the voice config to `approved`, which is the only status the
 * review gate (`voice-review-gate.ts`) allows to be injected into generation.
 * Voice is never injected for profiles without an approved config — there is no
 * global fallback.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const [{ workspace, user }, { id }] = await Promise.all([
      requireWorkspaceAccess(request),
      params,
    ]);

    const body = await request.json().catch(() => ({}));
    const parsed = approveVoiceSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("invalidInput", 400, parsed.error.flatten());
    }

    const profile = await getClientProfile(workspace.id, id);
    if (!profile) {
      return apiError("clientProfileNotFound", 404);
    }

    const existing = await getOlharVoiceConfigByClientProfileId({
      workspaceId: workspace.id,
      clientProfileId: id,
    });
    if (!existing) {
      return apiError("voiceConfigNotFound", 404, {
        detail: "No voice proposal to approve. Run extraction first.",
      });
    }

    const config = (parsed.data.config ?? existing.config) as OlharVoiceConfigPayload;
    const approved = await upsertOlharVoiceConfig({
      workspaceId: workspace.id,
      clientProfileId: id,
      voiceId: existing.voiceId,
      displayName: existing.displayName,
      config,
      reviewStatus: "approved",
      source: "wizard",
      approvedAt: new Date(),
      approvedBy: user.id,
    });

    return NextResponse.json({ config: approved });
  } catch (error) {
    return handleApiError(error, "client-profiles.[id].voice.approve.POST");
  }
}
