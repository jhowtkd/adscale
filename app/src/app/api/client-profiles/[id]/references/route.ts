import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import {
  createClientReference,
  getClientProfile,
  getClientReferences,
  isWorkspaceReferenceAssetKey,
} from "@/server/repositories/client-reference";
import { recordBrandMemoryEvent } from "@/server/memory/brand-memory-dispatch";

const referenceKindSchema = z.enum([
  "style",
  "product",
  "layout",
  "logo",
  "negative",
  "other",
]);

const createReferenceSchema = z.object({
  assetKey: z.string().trim().min(1),
  label: z.string().trim().min(1).max(120),
  kind: referenceKindSchema.default("other"),
  notes: z.string().trim().max(1000).optional(),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const [{ workspace }, { id }] = await Promise.all([
      requireWorkspaceAccess(request),
      params,
    ]);
    const references = await getClientReferences(workspace.id, id);
    return NextResponse.json({ references });
  } catch (error) {
    return handleApiError(error, "client-profiles.[id].references.GET");
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const [{ workspace }, { id }] = await Promise.all([
      requireWorkspaceAccess(request),
      params,
    ]);
    const body = await request.json();
    const parsed = createReferenceSchema.safeParse(body);

    if (!parsed.success) {
      return apiError("invalidInput", 400, parsed.error.flatten());
    }

    const profile = await getClientProfile(workspace.id, id);
    if (!profile) {
      return apiError("clientProfileNotFound", 404);
    }

    const ownsAssetKey = await isWorkspaceReferenceAssetKey(
      workspace.id,
      parsed.data.assetKey
    );
    if (!ownsAssetKey) {
      return apiError("referenceAssetNotFound", 400);
    }

    const reference = await createClientReference(workspace.id, {
      clientProfileId: id,
      ...parsed.data,
    });

    await recordBrandMemoryEvent({
      type: "creative_saved_as_reference",
      workspaceId: workspace.id,
      clientProfileId: id,
      occurredAt: reference.createdAt,
      summary: `Reference "${reference.label}" was added to brand/client profile "${profile.name}".`,
      payload: {
        action: "manual_reference_added",
        profile: { id: profile.id, name: profile.name },
        reference: {
          label: reference.label,
          kind: reference.kind,
          notes: reference.notes,
          assetKey: reference.assetKey,
          sourceDerivationId: reference.sourceDerivationId,
        },
      },
    });

    return NextResponse.json({ reference }, { status: 201 });
  } catch (error) {
    return handleApiError(error, "client-profiles.[id].references.POST");
  }
}
