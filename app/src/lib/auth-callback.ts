export type CallbackLocation = {
  pathname: string;
  search: string;
  hash: string;
};

const CALLBACK_ORIGIN = "https://callback.invalid";

const AUTH_ENTRY_PATHS = [
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
] as const;

export type AuthEntryPath = (typeof AUTH_ENTRY_PATHS)[number];

/**
 * Accept only internal relative destinations (#441). Rejects absolute URLs,
 * protocol-relative URLs, backslashes, control characters, and evasive
 * encodings (single and double) — a visitor-supplied domain is never an
 * authorized origin. Legitimate internal callbacks (invite tokens, Studio
 * resume query, settings) pass through with path, search, and hash intact.
 */
export function safeCallbackPath(value: string | null): string {
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    /[\\\u0000-\u001f\u007f]/.test(value)
  ) {
    return "/";
  }
  try {
    const url = new URL(value, CALLBACK_ORIGIN);
    if (url.origin !== CALLBACK_ORIGIN) return "/";
    // Decode iteratively so double-encoded evasions (%252F, %255c) surface
    // before the boundary check; malformed encoding rejects.
    let decodedPath = url.pathname;
    for (let i = 0; i < 3; i++) {
      let next: string;
      try {
        next = decodeURIComponent(decodedPath);
      } catch {
        return "/";
      }
      if (next === decodedPath) break;
      decodedPath = next;
    }
    if (
      decodedPath.startsWith("//") ||
      /[\\\u0000-\u001f\u007f]/.test(decodedPath)
    ) {
      return "/";
    }
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/";
  }
}

export function relativeCallbackPath(location: CallbackLocation): string {
  return `${location.pathname}${location.search}${location.hash}`;
}

/**
 * Link to an auth entry screen preserving a sanitized continuation (#441).
 * A callback pointing at another auth entry collapses to the bare entry
 * path (no ping-pong between login and signup); anything unsafe collapses
 * to the bare entry path as well.
 */
export function authEntryHref(
  entryPath: AuthEntryPath,
  callback: string | null,
): string {
  const safe = safeCallbackPath(callback);
  const pathname = new URL(safe, CALLBACK_ORIGIN).pathname;
  const destination = (AUTH_ENTRY_PATHS as readonly string[]).includes(
    pathname,
  )
    ? "/"
    : safe;
  return destination === "/"
    ? entryPath
    : `${entryPath}?${new URLSearchParams({ callbackUrl: destination })}`;
}

export function isAuthEntryPathname(pathname: string): boolean {
  return (AUTH_ENTRY_PATHS as readonly string[]).includes(pathname);
}

/**
 * Where an already-authenticated visitor on an auth entry screen goes (#441):
 * the sanitized continuation, collapsing to `/` when it is bare, missing,
 * or points at another auth entry (no ping-pong, no loop).
 */
export function postAuthRedirect(callback: string | null): string {
  const safe = safeCallbackPath(callback);
  if (safe === "/") return "/";
  const pathname = new URL(safe, CALLBACK_ORIGIN).pathname;
  return isAuthEntryPathname(pathname) ? "/" : safe;
}

export function unauthorizedLoginHref(currentPathWithSearch: string): string {
  const callback = safeCallbackPath(currentPathWithSearch);
  if (
    callback === "/" ||
    callback === "/login" ||
    callback.startsWith("/login?") ||
    callback === "/signup" ||
    callback.startsWith("/signup?")
  ) {
    return "/login";
  }
  return `/login?callbackUrl=${encodeURIComponent(callback)}`;
}
