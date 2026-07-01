/**
 * E2E-only capture of the most recent password-reset URL/token per email.
 *
 * Better Auth generates the reset token and emails a link via `sendResetPassword`.
 * During E2E runs (E2E_DISABLE_RATE_LIMIT) we also stash the URL here so a
 * dev-only endpoint can hand the token to the test runner — there is no inbox
 * to read in the cloud browser. Never enabled in production.
 *
 * Entries auto-expire after RESET_ENTRY_TTL_MS so a stale token cannot be
 * harvested even if the dev endpoint is somehow reached. The TTL mirrors the
 * short lifetime of a Better Auth reset token.
 */
type ResetEntry = { url: string; token: string; at: number };

const RESET_ENTRY_TTL_MS = 60 * 60 * 1000; // 1 hour

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
  const key = email.toLowerCase();
  const entry = store.get(key);
  if (!entry) return null;

  // Expire stale entries — never hand out a token beyond its useful lifetime.
  if (Date.now() - entry.at > RESET_ENTRY_TTL_MS) {
    store.delete(key);
    return null;
  }
  return entry;
}
