import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/server/validation/env";

/**
 * OAuth Meta para a Conexão (#347). `state` amarra workspace+usuário com
 * HMAC (BETTER_AUTH_SECRET) e expira em 10 min. Sem Meta App (#348),
 * o start faz loopback para o callback com code mock.
 */

const STATE_TTL_MS = 10 * 60 * 1000;

export interface OAuthState {
  workspaceId: string;
  userId: string;
}

function stateSecret(): string {
  return env.BETTER_AUTH_SECRET;
}

export function signOAuthState(state: OAuthState, now = Date.now()): string {
  const payload = Buffer.from(
    JSON.stringify({ ...state, exp: now + STATE_TTL_MS })
  ).toString("base64url");
  const sig = createHmac("sha256", stateSecret()).update(payload).digest("hex");
  return `${payload}.${sig}`;
}

export function verifyOAuthState(raw: string, now = Date.now()): OAuthState | null {
  const [payload, sig] = raw.split(".");
  if (!payload || !sig) return null;
  const expected = createHmac("sha256", stateSecret()).update(payload).digest();
  const given = Buffer.from(sig, "hex");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as OAuthState & {
      exp: number;
    };
    if (typeof parsed.workspaceId !== "string" || typeof parsed.userId !== "string") return null;
    if (typeof parsed.exp !== "number" || parsed.exp < now) return null;
    return { workspaceId: parsed.workspaceId, userId: parsed.userId };
  } catch {
    return null;
  }
}

export function metaCallbackUrl(): string {
  return `${env.APP_URL}/api/workspace/meta-connection/oauth/callback`;
}
