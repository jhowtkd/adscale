import { NextResponse } from "next/server";

import { env } from "@/server/validation/env";
import { isRateLimitDisabled } from "@/lib/rate-limit";
import { getRememberedReset } from "@/server/auth/e2e-reset-store";

/**
 * E2E-only helper: returns the most recent password-reset token/URL for an email
 * so a cloud test runner can complete the reset flow without an inbox.
 *
 * Flow: the test first submits /forgot-password for the email (which triggers
 * Better Auth's sendResetPassword and stashes the URL), then calls this endpoint.
 *
 * Guarded by E2E_DISABLE_RATE_LIMIT — returns 404 in normal/production runs.
 */
export async function GET(request: Request) {
  if (!isRateLimitDisabled()) {
    return new NextResponse("Not found", { status: 404 });
  }

  const email = new URL(request.url).searchParams.get("email");
  if (!email) {
    return NextResponse.json({ error: "email query param required" }, { status: 400 });
  }

  const entry = getRememberedReset(email);
  if (!entry || !entry.token) {
    return NextResponse.json(
      { found: false, hint: "Submit /forgot-password for this email first." },
      { status: 404 }
    );
  }

  const appUrl = env.APP_URL.replace(/\/$/, "");
  return NextResponse.json({
    found: true,
    token: entry.token,
    url: entry.url,
    resetPageUrl: `${appUrl}/reset-password?token=${encodeURIComponent(entry.token)}`,
  });
}
