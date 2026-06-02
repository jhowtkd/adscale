/**
 * E2E-only capture of the most recent password-reset URL/token per email.
 *
 * Better Auth generates the reset token and emails a link via `sendResetPassword`.
 * During E2E runs (E2E_DISABLE_RATE_LIMIT) we also stash the URL here so a
 * dev-only endpoint can hand the token to the test runner — there is no inbox
 * to read in the cloud browser. Never enabled in production.
 */
type ResetEntry = { url: string; token: string; at: number };

const store = new Map<string, ResetEntry>();

function extractToken(url: string): string {
  try {
    const parsed = new URL(url);
    const queryToken = parsed.searchParams.get("token");
    if (queryToken) return queryToken;

    // Better Auth may embed the token as a path segment:
    //   /api/auth/reset-password/<token>?callbackURL=...
    const segments = parsed.pathname.split("/").filter(Boolean);
    const resetIdx = segments.findIndex((segment) => segment === "reset-password");
    if (resetIdx >= 0 && segments[resetIdx + 1]) {
      return segments[resetIdx + 1];
    }
    return segments[segments.length - 1] ?? "";
  } catch {
    return "";
  }
}

export function rememberResetUrl(email: string, url: string): void {
  store.set(email.toLowerCase(), { url, token: extractToken(url), at: Date.now() });
}

export function getRememberedReset(email: string): ResetEntry | null {
  return store.get(email.toLowerCase()) ?? null;
}
