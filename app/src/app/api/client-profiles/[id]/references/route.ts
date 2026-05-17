import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import {
  createClientReference,
  getClientProfile,
  getClientReferences,
} from "@/server/repositories/client-reference";

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
    const { workspace } = await requireWorkspaceAccess(request);
    const { id } = await params;
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
    const { workspace } = await requireWorkspaceAccess(request);
    const { id } = await params;
    const body = await request.json();
    const parsed = createReferenceSchema.safeParse(body);

    if (!parsed.success) {
      return apiError("invalidInput", 400, parsed.error.flatten());
    }

    const profile = await getClientProfile(workspace.id, id);
    if (!profile) {
      return apiError("clientProfileNotFound", 404);
    }

    const reference = await createClientReference(workspace.id, {
      clientProfileId: id,
      ...parsed.data,
    });

    return NextResponse.json({ reference }, { status: 201 });
  } catch (error) {
    return handleApiError(error, "client-profiles.[id].references.POST");
  }
}
