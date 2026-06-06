import { auth } from "@/server/auth";
import { toNextJsHandler } from "better-auth/next-js";
import type { NextRequest } from "next/server";

const handler = toNextJsHandler(auth);

async function logAuthDebug(
  hypothesisId: string,
  message: string,
  data: Record<string, unknown>,
) {
  // #region agent log
  fetch("http://127.0.0.1:7899/ingest/cfdc6907-57c9-49e8-855d-2427aa77ea62", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Debug-Session-Id": "021503",
    },
    body: JSON.stringify({
      sessionId: "021503",
      runId: "auth-sign-in",
      hypothesisId,
      location: "api/auth/[...all]/route.ts",
      message,
      data,
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion
}

export const GET = handler.GET;

export async function POST(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const isSignInEmail = path.endsWith("/sign-in/email");

  if (isSignInEmail) {
    await logAuthDebug("H1-schema", "sign-in/email request", { path });
  }

  try {
    const response = await handler.POST(req);

    if (isSignInEmail) {
      await logAuthDebug("H1-schema", "sign-in/email response", {
        status: response.status,
      });
    }

    return response;
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error("[auth] POST handler error", { path, errMsg });
    await logAuthDebug("H1-schema", "sign-in/email handler threw", {
      path,
      errMsg: errMsg.slice(0, 200),
    });
    throw error;
  }
}
