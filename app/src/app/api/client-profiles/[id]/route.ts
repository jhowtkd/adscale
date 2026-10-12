import { z } from "zod";
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { apiError, handleApiError } from "@/lib/api-response";
import { requireRole, requireWorkspaceAccess } from "@/server/auth/workspace";
import { deleteEmptyClientProfile, getClientProfile } from "@/server/repositories/client-reference";
import { getCorpusConsent, grantCorpusConsent, revokeCorpusConsent } from "@/server/repositories/assistant-goal";
import { CorpusConsentError } from "@/server/human-quality/corpus";

const profileIdSchema = z.string().uuid();
const consentSchema = z.object({ action: z.enum(["grant", "revoke"]) });

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user, workspace } = await requireWorkspaceAccess(request);
    const { id } = await params;
    if (!profileIdSchema.safeParse(id).success || !await getClientProfile(workspace.id, id)) {
      return apiError("clientProfileNotFound", 404);
    }
    const { role } = await requireRole(workspace.id, user.id, ["owner", "admin", "member"]);
    const consent = await getCorpusConsent(workspace.id, id);
    return NextResponse.json({ purpose: "corpus_between_brands", consent, canDecide: role === "owner" || role === "admin" });
  } catch (error) {
    return handleApiError(error, "client-profiles.[id].GET");
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user, workspace } = await requireWorkspaceAccess(request);
    await requireRole(workspace.id, user.id, ["owner", "admin"]);
    const { id } = await params;
    if (!profileIdSchema.safeParse(id).success || !await getClientProfile(workspace.id, id)) {
      return apiError("clientProfileNotFound", 404);
    }
    const parsed = consentSchema.safeParse(await request.json());
    if (!parsed.success) return apiError("invalidInput", 400, parsed.error.flatten());
    const consent = await (parsed.data.action === "grant" ? grantCorpusConsent : revokeCorpusConsent)({
      workspaceId: workspace.id,
      clientProfileId: id,
      reviewedByUserId: user.id,
      idempotencyKey: request.headers.get("idempotency-key")?.trim() || request.headers.get("x-idempotency-key")?.trim() || randomUUID(),
    });
    return NextResponse.json({ consent });
  } catch (error) {
    if (error instanceof CorpusConsentError) return apiError(error.code, error.code === "idempotency_conflict" ? 409 : 404);
    return handleApiError(error, "client-profiles.[id].PATCH");
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const [{ workspace }, { id }] = await Promise.all([
      requireWorkspaceAccess(request),
      params,
    ]);
    if (!profileIdSchema.safeParse(id).success) {
      return apiError("clientProfileNotFound", 404);
    }

    const result = await deleteEmptyClientProfile(workspace.id, id);
    if (result.status === "not_found") return apiError("clientProfileNotFound", 404);
    if (result.status === "in_use") return apiError("clientProfileInUse", 409);
    return new Response(null, { status: 204 });
  } catch (error) {
    return handleApiError(error, "client-profiles.[id].DELETE");
  }
}
