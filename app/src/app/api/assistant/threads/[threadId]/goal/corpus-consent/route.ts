import { NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { apiError, handleApiError } from "@/lib/api-response";
import { requireRole, requireWorkspaceAccess } from "@/server/auth/workspace";
import { getAssistantThreadById } from "@/server/repositories/assistant-thread";
import {
  grantCorpusConsent,
  revokeCorpusConsent,
} from "@/server/repositories/assistant-goal";
import { CorpusConsentError } from "@/server/human-quality/corpus";

const consentSchema = z.object({
  action: z.enum(["grant", "revoke"]),
});

/**
 * Workspace owner/admin grants or revokes client corpus consent for the
 * thread's client. Consent gates global corpus promotion: without an active
 * grant, promotion fails closed with `client_consent_required`. The client
 * retains ownership of their creative preferences; nothing reaches the global
 * corpus without both consent and platform-owner review.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ threadId: string }> }
) {
  try {
    const { threadId } = await params;
    const { user, workspace } = await requireWorkspaceAccess(request);
    await requireRole(workspace.id, user.id, ["owner", "admin"]);

    const thread = await getAssistantThreadById(workspace.id, threadId);
    if (!thread) {
      return apiError("threadNotFound", 404);
    }

    const body = await request.json();
    const parsed = consentSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("invalidInput", 400, parsed.error.flatten());
    }

    const result = await (parsed.data.action === "grant" ? grantCorpusConsent : revokeCorpusConsent)({
      workspaceId: workspace.id,
      clientProfileId: thread.clientProfileId,
      reviewedByUserId: user.id,
      idempotencyKey: request.headers.get("idempotency-key")?.trim() || request.headers.get("x-idempotency-key")?.trim() || randomUUID(),
    });

    return NextResponse.json({ consent: result });
  } catch (error) {
    if (error instanceof CorpusConsentError) return apiError(error.code, error.code === "idempotency_conflict" ? 409 : 404);
    return handleApiError(error, "assistant.goal.corpus-consent.POST");
  }
}
