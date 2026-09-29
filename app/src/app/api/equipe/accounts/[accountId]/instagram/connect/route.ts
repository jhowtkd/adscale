import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import {
  AUTH_ERROR_CODES,
  requireWorkspaceAccess,
  WorkspaceAuthError,
} from "@/server/auth/workspace";
import { db } from "@/server/db";
import { getSessionFromHeaders } from "@/server/auth/session";
import { createEquipeIgOAuthState } from "@/server/equipe/publishing/oauth-nonce";
import { createPostgresEquipeUnitOfWork } from "@/server/equipe/data/postgres";
import { isEquipeEnabledForWorkspace } from "@/server/equipe/module/equipe-enabled";
import { findCustodianPersonForUser } from "@/server/equipe/module/instagram-connect";
import {
  buildEquipeIgStartUrl,
  equipeIgCallbackUrl,
} from "@/server/equipe/publishing/oauth";
import { env } from "@/server/validation/env";

/**
 * GET: starts the Equipe Instagram OAuth, custodian only. The session user
 * is bound to the account's custodian row through the module; the signed
 * state binds the account and a single-use nonce to this authenticated session.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ accountId: string }> },
) {
  try {
    const { user, workspace } = await requireWorkspaceAccess(request);
    const session = await getSessionFromHeaders(request.headers);
    if (!session || session.user.id !== user.id) {
      throw new WorkspaceAuthError(AUTH_ERROR_CODES.unauthorized, "Unauthorized");
    }
    if (!isEquipeEnabledForWorkspace(workspace.id)) {
      throw new WorkspaceAuthError(AUTH_ERROR_CODES.forbidden, "Forbidden");
    }
    const { accountId } = await params;
    if (!z.string().uuid().safeParse(accountId).success) {
      return apiError("invalidAccountId", 400);
    }
    const uow = createPostgresEquipeUnitOfWork(db);
    const account = await uow.repos.accounts.get(workspace.id, accountId);
    if (!account) {
      return apiError("accountNotFound", 404);
    }
    const custodian = await findCustodianPersonForUser(
      uow.repos,
      { workspaceId: workspace.id, accountId },
      user.id,
    );
    if (!custodian) {
      throw new WorkspaceAuthError(AUTH_ERROR_CODES.forbidden, "Forbidden");
    }
    const appId = env.EQUIPE_IG_APP_ID;
    if (!appId) return apiError("instagramNotConfigured", 503);
    const state = await createEquipeIgOAuthState({
      workspaceId: workspace.id,
      accountId,
      custodianPersonId: custodian.id,
      userId: user.id,
      sessionId: session.session.id,
    });
    const callback = equipeIgCallbackUrl();
    return NextResponse.redirect(
      buildEquipeIgStartUrl({ appId, redirectUri: callback, state }),
    );
  } catch (error) {
    return handleApiError(error, "equipe.instagram.connect");
  }
}
