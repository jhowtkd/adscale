import { auth } from "@/server/auth";
import {
  ensureDevAdminEmailVerified,
  isDevAdminEmail,
  repairDevAdminAccount,
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

type EmailAuthBody = {
  email?: string;
  password?: string;
  name?: string;
};

async function readEmailAuthBody(req: NextRequest): Promise<EmailAuthBody | null> {
  try {
    return (await req.clone().json()) as EmailAuthBody;
  } catch {
    return null;
  }
}

async function prepareDevAdminAuth(req: NextRequest, body: EmailAuthBody | null) {
  const path = req.nextUrl.pathname;
  const isSignIn = path.includes("/sign-in/email");
  const isSignUp = path.includes("/sign-up/email");
  if (!isSignIn && !isSignUp) return { path, email: null as string | null };

  const email = body?.email?.trim().toLowerCase() ?? null;
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
}

async function recreateDevAdminAccount(body: EmailAuthBody) {
  const email = body.email?.trim().toLowerCase();
  const password = body.password;
  if (!email || !password || !isDevAdminEmail(email)) return false;

  const removed = await repairDevAdminAccount(email);
  debugAuthLog(
    "auth/route.ts:recreateDevAdminAccount",
    "repair dev admin account",
    { email, removed },
    "H2"
  );

  await auth.api.signUpEmail({
    body: {
      email,
      password,
      name: body.name?.trim() || "Dev Admin",
    },
  });
  await ensureDevAdminEmailVerified(email);
  return true;
}

async function maybeRepairDevAdminSignIn(
  req: NextRequest,
  response: Response,
  body: EmailAuthBody | null
) {
  if (!req.nextUrl.pathname.includes("/sign-in/email") || !body?.email || !body.password) {
    return response;
  }

  const email = body.email.trim().toLowerCase();
  if (!isDevAdminEmail(email) || response.status !== 401) {
    return response;
  }

  const payload = (await response.clone().json().catch(() => null)) as {
    code?: string;
  } | null;

  if (payload?.code !== "INVALID_EMAIL_OR_PASSWORD") {
    return response;
  }

  const recreated = await recreateDevAdminAccount(body);
  if (!recreated) return response;

  const retry = await handler.POST(req);
  debugAuthLog(
    "auth/route.ts:maybeRepairDevAdminSignIn",
    "dev admin sign-in retry",
    { email, status: retry.status },
    "H2"
  );
  return retry;
}

export async function GET(req: NextRequest) {
  return handler.GET(req);
}

export async function POST(req: NextRequest) {
  const body = await readEmailAuthBody(req);
  await prepareDevAdminAuth(req, body);

  let response = await handler.POST(req);
  response = await maybeRepairDevAdminSignIn(req, response, body);

  if (
    req.nextUrl.pathname.includes("/sign-in/email") &&
    body?.email &&
    isDevAdminEmail(body.email)
  ) {
    debugAuthLog(
      "auth/route.ts:POST",
      "dev admin sign-in response",
      { email: body.email, status: response.status },
      "H3"
    );
  }

  return response;
}
