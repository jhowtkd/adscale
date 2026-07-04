import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { getAssistantThreadById } from "@/server/repositories/assistant-thread";
import {
  grantCorpusConsent,
  revokeCorpusConsent,
} from "@/server/repositories/assistant-goal";

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

    const thread = await getAssistantThreadById(workspace.id, threadId);
    if (!thread) {
      return apiError("threadNotFound", 404);
    }

    const body = await request.json();
    const parsed = consentSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("invalidInput", 400, parsed.error.flatten());
    }

    const result =
      parsed.data.action === "grant"
        ? await grantCorpusConsent({
            workspaceId: workspace.id,
            clientProfileId: thread.clientProfileId,
            reviewedByUserId: user.id,
          })
        : await revokeCorpusConsent({
            workspaceId: workspace.id,
            clientProfileId: thread.clientProfileId,
            reviewedByUserId: user.id,
          });

    return NextResponse.json({ consent: result });
  } catch (error) {
    return handleApiError(error, "assistant.goal.corpus-consent.POST");
  }
}
