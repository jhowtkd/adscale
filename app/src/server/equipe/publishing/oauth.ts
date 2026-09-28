import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/server/validation/env";

/**
 * OAuth do Instagram da Equipe (#548). Reaproveita o state HMAC da Conexão
 * Meta (`served-ads/oauth.ts`): o state amarra workspace + conta da Equipe +
 * custodiante com HMAC (BETTER_AUTH_SECRET) e expira em 10 min. A URL do
 * callback é fixa; a conta vem do state assinado, nunca da query.
 *
 * Escopos: publicar conteúdo numa conta profissional ligada a uma Página
 * (validação final no App Review da Meta).
 */

const STATE_TTL_MS = 10 * 60 * 1000;

export const EQUIPE_IG_OAUTH_SCOPES = [
  "instagram_basic",
  "instagram_content_publish",
  "pages_show_list",
];

export type EquipeIgOAuthState = {
  workspaceId: string;
  accountId: string;
  custodianPersonId: string;
  userId: string;
};

function stateSecret(): string {
  return env.BETTER_AUTH_SECRET;
}

export function signEquipeIgState(state: EquipeIgOAuthState, now = Date.now()): string {
  const payload = Buffer.from(JSON.stringify({ ...state, exp: now + STATE_TTL_MS })).toString(
    "base64url",
  );
  const sig = createHmac("sha256", stateSecret()).update(payload).digest("hex");
  return `${payload}.${sig}`;
}

export function verifyEquipeIgState(raw: string, now = Date.now()): EquipeIgOAuthState | null {
  const [payload, sig] = raw.split(".");
  if (!payload || !sig) return null;
  const expected = createHmac("sha256", stateSecret()).update(payload).digest();
  const given = Buffer.from(sig, "hex");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as
      EquipeIgOAuthState & { exp: number };
    if (typeof parsed.workspaceId !== "string") return null;
    if (typeof parsed.accountId !== "string") return null;
    if (typeof parsed.custodianPersonId !== "string") return null;
    if (typeof parsed.userId !== "string") return null;
    if (typeof parsed.exp !== "number" || parsed.exp < now) return null;
    return {
      workspaceId: parsed.workspaceId,
      accountId: parsed.accountId,
      custodianPersonId: parsed.custodianPersonId,
      userId: parsed.userId,
    };
  } catch {
    return null;
  }
}

export function equipeIgCallbackUrl(): string {
  return `${env.APP_URL}/api/equipe/instagram/callback`;
}

export function buildEquipeIgStartUrl(params: {
  appId: string;
  redirectUri: string;
  state: string;
}): string {
  const url = new URL("https://www.facebook.com/v26.0/dialog/oauth");
  url.searchParams.set("client_id", params.appId);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("state", params.state);
  url.searchParams.set("scope", EQUIPE_IG_OAUTH_SCOPES.join(","));
  url.searchParams.set("response_type", "code");
  return url.toString();
}
