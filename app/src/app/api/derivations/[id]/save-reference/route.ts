import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { assertDerivationApprovable } from "@/server/ai/creative-quality-gate";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { getDerivationById } from "@/server/repositories/derivation";
import { createClientReference, getClientProfile } from "@/server/repositories/client-reference";
import { recordBrandMemoryEvent } from "@/server/memory/brand-memory-dispatch";

const referenceKindSchema = z.enum([
  "style",
  "product",
  "layout",
  "logo",
  "negative",
  "other",
]);

const saveDerivationReferenceSchema = z.object({
  clientProfileId: z.string().uuid(),
  label: z.string().trim().min(1).max(120),
  kind: referenceKindSchema.default("style"),
  notes: z.string().trim().max(1000).optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const [{ workspace }, { id }] = await Promise.all([
      requireWorkspaceAccess(request),
      params,
    ]);

    const derivation = await getDerivationById(id, workspace.id);
    if (!derivation) {
      return apiError("derivationNotFound", 404);
    }
    if (derivation.status !== "approved") {
      return apiError("derivationNotApprovedForQa", 409);
    }
    if (!derivation.outputKey) {
      return apiError("derivationMissingOutput", 400);
    }

    const approvable = assertDerivationApprovable(derivation);
    if (!approvable.ok) {
      return apiError("derivationHardFailures", 409, {
        qualityVerdict: approvable.qualityVerdict,
        hardFailures: approvable.hardFailures,
      });
    }

    const body = await request.json();
    const parsed = saveDerivationReferenceSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("invalidInput", 400, parsed.error.flatten());
    }

    const profile = await getClientProfile(workspace.id, parsed.data.clientProfileId);
    if (!profile) {
      return apiError("clientProfileNotFound", 404);
    }

    const reference = await createClientReference(workspace.id, {
      clientProfileId: parsed.data.clientProfileId,
      assetKey: derivation.outputKey,
      label: parsed.data.label,
      kind: parsed.data.kind,
      notes: parsed.data.notes,
      sourceDerivationId: id,
    });

    await recordBrandMemoryEvent({
      type: "creative_saved_as_reference",
      workspaceId: workspace.id,
      clientProfileId: profile.id,
      campaignId: derivation.campaignId,
      derivationId: derivation.id,
      occurredAt: reference.createdAt,
      summary: `Approved creative was saved as "${reference.label}" (${reference.kind}) for brand/client profile "${profile.name}".`,
      payload: {
        action: "approved_creative_saved_as_reference",
        profile: { id: profile.id, name: profile.name },
        reference: {
          label: reference.label,
          kind: reference.kind,
          notes: reference.notes,
          assetKey: reference.assetKey,
        },
        derivation: {
          id: derivation.id,
          format: derivation.format,
          generationMode: derivation.generationMode,
          ctaText: derivation.ctaText,
          qualityScore: derivation.qualityScore,
          qaStatus: derivation.qaStatus,
        },
      },
    });

    return NextResponse.json({ reference }, { status: 201 });
  } catch (error) {
    return handleApiError(error, "derivations.[id].save-reference.POST");
  }
}
