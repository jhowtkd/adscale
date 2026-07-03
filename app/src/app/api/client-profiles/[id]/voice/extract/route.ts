import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { checkRateLimit } from "@/lib/with-rate-limit";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { spendOrApiError } from "@/server/billing/paywall";
import {
  extractVoiceFromBrandInputs,
  toOlharVoiceConfigPayload,
} from "@/server/ai/voices/voice-extractor";
import { getBrandKit } from "@/server/db/repositories/brand-kit";
import { getClientProfile, getClientReferences } from "@/server/repositories/client-reference";
import { upsertOlharVoiceConfig } from "@/server/repositories/client-profile-olhar-config";

const extractVoiceSchema = z
  .object({
    creativeDescriptions: z.array(z.string().trim().min(1).max(500)).max(20).optional(),
  })
  .strict();

/**
 * Generate a proposed brand voice from the profile's textual inputs (plan Fase 4.4).
 *
 * Charges 1 credit, runs the text-conditioned voice extractor, and persists the
 * result as a `pending_review` voice config. The voice is only injected into
 * generation once the user approves it via the sibling `/approve` route (the
 * existing review gate enforces this).
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

    const rateLimitResult = await checkRateLimit(request, {
      category: "ai",
      workspaceId: workspace.id,
    });
    if (rateLimitResult) return rateLimitResult;

    const body = await request.json().catch(() => ({}));
    const parsed = extractVoiceSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("invalidInput", 400, parsed.error.flatten());
    }

    const profile = await getClientProfile(workspace.id, id);
    if (!profile) {
      return apiError("clientProfileNotFound", 404);
    }

    const [brandKit, references] = await Promise.all([
      getBrandKit(workspace.id, id),
      getClientReferences(workspace.id, id),
    ]);

    // Build captions for example creatives from style/product/layout refs.
    const creativeDescriptions = parsed.data.creativeDescriptions ??
      references
        .filter((r) => r.kind === "style" || r.kind === "product" || r.kind === "layout")
        .map((r) => r.notes ?? r.label)
        .filter((s): s is string => Boolean(s && s.trim()));

    const inputsHash = createHash("sha256")
      .update(
        JSON.stringify({
          toneOfVoice: brandKit?.toneOfVoice ?? null,
          visualNotes: brandKit?.visualNotes ?? null,
          toneNotes: brandKit?.toneNotes ?? null,
          constraints: brandKit?.constraints ?? null,
          creativeDescriptions,
        }),
      )
      .digest("hex");

    const creditError = await spendOrApiError({
      workspaceId: workspace.id,
      action: "creative_qa",
      amount: 1,
      idempotencyKey: `voice-extract:${workspace.id}:${id}:${inputsHash}`,
      metadata: { workspaceId: workspace.id, clientProfileId: id },
    });
    if (creditError) return creditError;

    const extracted = await extractVoiceFromBrandInputs({
      toneOfVoice: brandKit?.toneOfVoice ?? null,
      visualNotes: brandKit?.visualNotes ?? null,
      toneNotes: brandKit?.toneNotes ?? null,
      constraints: brandKit?.constraints ?? null,
      creativeDescriptions,
    });

    const configPayload = toOlharVoiceConfigPayload(extracted);
    const config = await upsertOlharVoiceConfig({
      workspaceId: workspace.id,
      clientProfileId: id,
      voiceId: `brand-${id}`,
      displayName: profile.name,
      config: configPayload,
      reviewStatus: "pending_review",
      source: "wizard",
      approvedBy: user.id,
    });

    return NextResponse.json({ config }, { status: 201 });
  } catch (error) {
    return handleApiError(error, "client-profiles.[id].voice.extract.POST");
  }
}
