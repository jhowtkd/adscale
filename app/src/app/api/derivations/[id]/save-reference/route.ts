import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { saveDerivationReference } from "@/server/application/save-derivation-reference";

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
    const [{ user, workspace }, { id }] = await Promise.all([
      requireWorkspaceAccess(request),
      params,
    ]);

    const body = await request.json();
    const parsed = saveDerivationReferenceSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("invalidInput", 400, parsed.error.flatten());
    }

    const result = await saveDerivationReference({
      workspaceId: workspace.id,
      derivationId: id,
      clientProfileId: parsed.data.clientProfileId,
      label: parsed.data.label,
      kind: parsed.data.kind,
      notes: parsed.data.notes,
      actorUserId: user.id,
      evidenceSource: "derivations.save-reference.POST",
    });

    if (!result.ok) {
      switch (result.error.code) {
        case "derivation_not_found":
          return apiError("derivationNotFound", 404);
        case "derivation_not_approved":
          return apiError("derivationNotApprovedForQa", 409);
        case "derivation_missing_output":
          return apiError("derivationMissingOutput", 400);
        case "derivation_hard_failures":
          return apiError("derivationHardFailures", 409, {
            qualityVerdict: result.error.qualityVerdict,
            hardFailures: result.error.hardFailures,
          });
        case "client_profile_not_found":
          return apiError("clientProfileNotFound", 404);
        default:
          return apiError("invalidRequest", 400);
      }
    }

    return NextResponse.json(
      { reference: result.value.reference },
      { status: 201 }
    );
  } catch (error) {
    return handleApiError(error, "derivations.[id].save-reference.POST");
  }
}
