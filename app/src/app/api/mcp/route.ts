import { env } from "@/server/validation/env";
import { mcpHandler } from "@/server/mcp/server";
import { extractBearerToken, verifyBearerToken } from "@/server/mcp/tokens";

/**
 * POST /api/mcp — MCP remoto, Streamable HTTP stateless dual-era (#354).
 * Primeira fatia: Bearer por workspace atrás de flag (#356 rev. 2).
 * GET/DELETE não são exportados (stateless responde 405 a sessões legadas;
 * o Next devolve 405 sozinho). OAuth+CIMD é a fatia seguinte.
 */
export async function POST(request: Request) {
  if (env.MCP_BEARER_ENABLED !== "true") {
    return new Response("Not found.", { status: 404 });
  }
  const token = extractBearerToken(request.headers.get("authorization"));
  if (!token) {
    return unauthorized();
  }
  const verified = await verifyBearerToken(token).catch(() => null);
  if (!verified) {
    return unauthorized();
  }
  try {
    return await mcpHandler.fetch(request, {
      authInfo: {
        token,
        clientId: "mcp-bearer",
        scopes: ["workspace"],
        extra: {
          workspaceId: verified.workspaceId,
          userId: verified.userId,
          tokenPrefix: verified.prefix,
        },
      },
    });
  } catch {
    return new Response("Internal error.", { status: 500 });
  }
}

function unauthorized(): Response {
  return new Response("Unauthorized.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Bearer realm="mcp", error="invalid_token"' },
  });
}
