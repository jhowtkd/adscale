import { auth } from "@/server/auth";
import { toNextJsHandler } from "better-auth/next-js";
import type { NextRequest } from "next/server";

const handler = toNextJsHandler(auth);

function logAuthProbe(
  hypothesisId: string,
  message: string,
  data: Record<string, unknown>,
) {
  const payload = {
    sessionId: "021503",
    runId: "auth-sign-in-v2",
    hypothesisId,
    location: "api/auth/[...all]/route.ts",
    message,
    data,
    timestamp: Date.now(),
  };
  console.log("[debug-auth]", JSON.stringify(payload));
  // #region agent log
  fetch("http://127.0.0.1:7899/ingest/cfdc6907-57c9-49e8-855d-2427aa77ea62", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Debug-Session-Id": "021503",
    },
    body: JSON.stringify(payload),
  }).catch(() => {});
  // #endregion
}

export const GET = handler.GET;

export async function POST(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const isSignInEmail = path.endsWith("/sign-in/email");

  if (isSignInEmail) {
    logAuthProbe("H10-orphan-migration", "sign-in/email request", { path });
  }

  const response = await handler.POST(req);

  if (isSignInEmail) {
    logAuthProbe("H10-orphan-migration", "sign-in/email response", {
      status: response.status,
    });
  }

  return response;
}
