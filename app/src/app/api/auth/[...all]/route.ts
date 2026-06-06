import { auth } from "@/server/auth";
import {
  ensureDevAdminEmailVerified,
  isDevAdminEmail,
} from "@/server/auth/dev-admin";
import { toNextJsHandler } from "better-auth/next-js";
import type { NextRequest } from "next/server";

const handler = toNextJsHandler(auth);

function debugAuthLog(
  location: string,
  message: string,
  data: Record<string, unknown>,
  hypothesisId: string
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
      runId: "post-fix",
      hypothesisId,
      location,
      message,
      data,
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion
}

async function prepareDevAdminAuth(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const isSignIn = path.includes("/sign-in/email");
  const isSignUp = path.includes("/sign-up/email");
  if (!isSignIn && !isSignUp) return { path, email: null as string | null };

  try {
    const body = (await req.clone().json()) as { email?: string };
    const email = body.email?.trim().toLowerCase() ?? null;
    if (!email) return { path, email: null };

    debugAuthLog(
      "auth/route.ts:prepareDevAdminAuth",
      "auth request",
      { path, email, devAdmin: isDevAdminEmail(email) },
      isSignIn ? "H3" : "H2"
    );

    if (isDevAdminEmail(email)) {
      await ensureDevAdminEmailVerified(email);
    }

    return { path, email };
  } catch {
    return { path, email: null };
  }
}

export async function GET(req: NextRequest) {
  return handler.GET(req);
}

export async function POST(req: NextRequest) {
  const prepared = await prepareDevAdminAuth(req);
  const response = await handler.POST(req);

  if (
    prepared.path.includes("/sign-in/email") &&
    prepared.email &&
    isDevAdminEmail(prepared.email)
  ) {
    debugAuthLog(
      "auth/route.ts:POST",
      "dev admin sign-in response",
      { email: prepared.email, status: response.status },
      "H3"
    );
  }

  return response;
}
