import { NextResponse } from "next/server";
import { z } from "zod";
import { handleApiError } from "@/lib/api-response";
import { db } from "@/server/db";
import { getSessionFromHeaders } from "@/server/auth/session";
import { getWorkspaceForUserInWorkspace } from "@/server/repositories/workspace";
import { systemClock } from "@/server/equipe/domain";
import { createPostgresEquipeUnitOfWork } from "@/server/equipe/data/postgres";
import { LiveAdscaleGateway } from "@/server/equipe/agents/gateway";
import { executeCommand } from "@/server/equipe/module/commands";
import { findCustodianPersonForUser } from "@/server/equipe/module/instagram-connect";
import type { EquipeModuleDeps } from "@/server/equipe/module/ports";
import { encryptEquipeIgToken } from "@/server/equipe/publishing/crypto";
import { InstagramGraphClient } from "@/server/equipe/publishing/graph";
import { equipeIgCallbackUrl, verifyEquipeIgState } from "@/server/equipe/publishing/oauth";
import { consumeEquipeIgOAuthState } from "@/server/equipe/publishing/oauth-nonce";
import { env } from "@/server/validation/env";

const querySchema = z.object({
  code: z.string().min(1).optional(),
  state: z.string().min(1),
  error: z.string().optional(),
  error_description: z.string().optional(),
});

function pipelineRedirect(flag: string, reason?: string): NextResponse {
  const params = reason ? `?instagram=${flag}&reason=${reason}` : `?instagram=${flag}`;
  return NextResponse.redirect(`${env.APP_URL}/pipeline${params}`);
}

/**
 * GET: fixed OAuth callback bound to the initiating session and one-use nonce.
 * Revalidates the custodian before exchanging and persisting credentials.
 * Exchanges the code, resolves the IG account,
 * encrypts the bundle and records the outcome through the module — success
 * connects, failure records a plain-language error (two failures open a
 * "conexão travada" support exception). A denial at the provider redirects
 * without recording anything: denials are not failures.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const parsed = querySchema.safeParse({
      code: searchParams.get("code") ?? undefined,
      state: searchParams.get("state"),
      error: searchParams.get("error") ?? undefined,
      error_description: searchParams.get("error_description") ?? undefined,
    });
    if (!parsed.success) {
      return pipelineRedirect("error", "invalid_request");
    }
    const state = verifyEquipeIgState(parsed.data.state);
    if (!state) {
      return pipelineRedirect("error", "invalid_state");
    }
    if (!env.EQUIPE_IG_APP_ID || !env.EQUIPE_IG_APP_SECRET) {
      return pipelineRedirect("error", "app_not_configured");
    }

    const session = await getSessionFromHeaders(request.headers);
    if (!session || session.user.id !== state.userId || session.session.id !== state.sessionId) {
      return pipelineRedirect("error", "invalid_session");
    }
    const workspace = await getWorkspaceForUserInWorkspace(session.user.id, state.workspaceId);
    if (!workspace) {
      return pipelineRedirect("error", "invalid_session");
    }
    if (!(await consumeEquipeIgOAuthState(parsed.data.state, state.nonce))) {
      return pipelineRedirect("error", "invalid_state");
    }

    const deps: EquipeModuleDeps = {
      uow: createPostgresEquipeUnitOfWork(db),
      clock: systemClock(),
      gateway: new LiveAdscaleGateway(state.workspaceId),
    };
    const context = {
      actor: {
        kind: "client_person" as const,
        role: "custodian" as const,
        personId: state.custodianPersonId,
      },
      workspaceId: state.workspaceId,
      accountId: state.accountId,
    };
    const stillAuthorized = async () => {
      const account = await deps.uow.repos.accounts.get(state.workspaceId, state.accountId);
      const custodian = await findCustodianPersonForUser(deps.uow.repos, state, session.user.id);
      return account && custodian?.id === state.custodianPersonId;
    };
    if (!(await stillAuthorized())) return pipelineRedirect("error", "invalid_custodian");
    if (parsed.data.error || !parsed.data.code) {
      return pipelineRedirect("error", parsed.data.error ? "access_denied" : "missing_code");
    }
    const recordFailure = async (code: string): Promise<void> => {
      if (!(await stillAuthorized())) return;
      await executeCommand(deps, context, {
        type: "fail_instagram_connect",
        payload: { code },
      });
    };

    const client = new InstagramGraphClient();
    let accessToken: string;
    let ig: { igUserId: string; igUsername: string | null } | null;
    try {
      const short = await client.exchangeCode(parsed.data.code, equipeIgCallbackUrl());
      const long = await client.exchangeLongLivedToken(short.accessToken);
      accessToken = long.accessToken;
      ig = await client.resolveInstagramAccount(accessToken);
    } catch {
      await recordFailure("oauth_failed");
      return pipelineRedirect("error", "oauth_failed");
    }
    if (!ig) {
      await recordFailure("no_instagram_account");
      return pipelineRedirect("error", "no_instagram_account");
    }
    const encryptedToken = encryptEquipeIgToken({
      accessToken,
      igUserId: ig.igUserId,
      igUsername: ig.igUsername,
    });
    if (!(await stillAuthorized())) return pipelineRedirect("error", "invalid_custodian");
    const completed = await executeCommand(deps, context, {
      type: "complete_instagram_connect",
      payload: { encryptedToken, igUsername: ig.igUsername ?? undefined },
    });
    if (!completed.ok) {
      return pipelineRedirect("error", "complete_failed");
    }
    return pipelineRedirect("connected");
  } catch (error) {
    return handleApiError(error, "equipe.instagram.callback");
  }
}
