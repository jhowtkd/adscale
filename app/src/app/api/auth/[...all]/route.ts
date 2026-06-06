import { auth } from "@/server/auth";
import {
  ensureDevAdminEmailVerified,
  isDevAdminEmail,
  repairDevAdminAccount,
} from "@/server/auth/dev-admin";
import { toNextJsHandler } from "better-auth/next-js";
import type { NextRequest } from "next/server";

const handler = toNextJsHandler(auth);

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

async function prepareDevAdminAuth(body: EmailAuthBody | null) {
  const email = body?.email?.trim().toLowerCase() ?? null;
  if (!email || !isDevAdminEmail(email)) return;
  await ensureDevAdminEmailVerified(email);
}

async function recreateDevAdminAccount(body: EmailAuthBody) {
  const email = body.email?.trim().toLowerCase();
  const password = body.password;
  if (!email || !password || !isDevAdminEmail(email)) return false;

  await repairDevAdminAccount(email);
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

  return handler.POST(req);
}

export async function GET(req: NextRequest) {
  return handler.GET(req);
}

export async function POST(req: NextRequest) {
  const body = await readEmailAuthBody(req);
  await prepareDevAdminAuth(body);

  let response = await handler.POST(req);
  response = await maybeRepairDevAdminSignIn(req, response, body);

  return response;
}
