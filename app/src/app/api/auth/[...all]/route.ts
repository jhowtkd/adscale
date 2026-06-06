import { auth } from "@/server/auth";
import { ensureDevAdminEmailVerified } from "@/server/auth/dev-admin";
import { toNextJsHandler } from "better-auth/next-js";
import type { NextRequest } from "next/server";

const handler = toNextJsHandler(auth);

async function verifyDevAdminBeforeSignIn(req: NextRequest) {
  if (!req.nextUrl.pathname.includes("/sign-in/email")) return;

  try {
    const body = (await req.clone().json()) as { email?: string };
    if (body.email) {
      await ensureDevAdminEmailVerified(body.email);
    }
  } catch {
    // Non-JSON or malformed body — Better Auth will handle the error.
  }
}

export async function GET(req: NextRequest) {
  return handler.GET(req);
}

export async function POST(req: NextRequest) {
  await verifyDevAdminBeforeSignIn(req);
  return handler.POST(req);
}
