import { NextResponse } from "next/server";
import { z } from "zod";
import { handleApiError } from "@/lib/api-response";
import { inngest } from "@/server/jobs/client";
import { env } from "@/server/validation/env";
import { encryptMetaToken } from "@/server/served-ads/crypto";
import { getGraphClient } from "@/server/served-ads/graph";
import { metaCallbackUrl, verifyOAuthState } from "@/server/served-ads/oauth";
import {
  createConnection,
  getConnectionByWorkspace,
  updateConnectionToken,
} from "@/server/served-ads/repository";

const querySchema = z.object({
  code: z.string().min(1).optional(),
  state: z.string().min(1),
  error: z.string().optional(),
  error_description: z.string().optional(),
});

function settingsRedirect(flag: string): NextResponse {
  return NextResponse.redirect(`${env.APP_URL}/settings?tab=integrations&meta=${flag}`);
}

/**
 * GET: callback OAuth (sem sessão; o state amarra workspace+usuário).
 * Troca code por token, cifra, salva a conexão e agenda o sync inicial.
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
    if (!parsed.success || parsed.data.error || !parsed.data.code) {
      return settingsRedirect("error");
    }
    const state = verifyOAuthState(parsed.data.state);
    if (!state) return settingsRedirect("error");

    const client = getGraphClient("oauth");
    const { accessToken } = await client.exchangeCode(parsed.data.code, metaCallbackUrl());
    const tokenCiphertext = encryptMetaToken(accessToken);

    const existing = await getConnectionByWorkspace(state.workspaceId);
    let connectionId: string;
    if (existing) {
      await updateConnectionToken(existing.id, tokenCiphertext);
      connectionId = existing.id;
    } else {
      const created = await createConnection({
        workspaceId: state.workspaceId,
        userId: state.userId,
        tokenCiphertext,
      });
      connectionId = created.id;
    }

    await inngest.send({ name: "meta.ads.sync", data: { connectionId } });
    return settingsRedirect("connected");
  } catch (error) {
    return handleApiError(error, "meta-connection.oauth.callback");
  }
}
