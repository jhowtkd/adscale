import { NextResponse } from "next/server";
import { apiError, handleApiError } from "@/lib/api-response";
import { requireRole, requireWorkspaceAccess } from "@/server/auth/workspace";
import { env } from "@/server/validation/env";
import { buildOAuthStartUrl, isMockMode } from "@/server/served-ads/graph";
import { metaCallbackUrl, signOAuthState } from "@/server/served-ads/oauth";

/**
 * GET: inicia o OAuth Meta (owner/admin). Sem Meta App (#348), faz
 * loopback para o callback com code mock — fluxo completo sem a Meta.
 */
export async function GET(request: Request) {
  try {
    const { user, workspace } = await requireWorkspaceAccess(request);
    await requireRole(workspace.id, user.id, ["owner", "admin"]);
    const state = signOAuthState({ workspaceId: workspace.id, userId: user.id });
    const callback = metaCallbackUrl();
    if (isMockMode()) {
      const url = new URL(callback);
      // URL absoluta fora do request (APP_URL); em teste APP_URL é exemplo.
      url.searchParams.set("code", "mock-code");
      url.searchParams.set("state", state);
      return NextResponse.redirect(url.toString());
    }
    const appId = env.META_APP_ID;
    if (!appId) return apiError("metaAppNotConfigured", 503);
    return NextResponse.redirect(buildOAuthStartUrl({ appId, redirectUri: callback, state }));
  } catch (error) {
    return handleApiError(error, "meta-connection.oauth.start");
  }
}
