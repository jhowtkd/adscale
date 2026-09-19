export type CallbackLocation = {
  pathname: string;
  search: string;
  hash: string;
};

const CALLBACK_ORIGIN = "https://callback.invalid";
const UNSAFE_CHARS = /[\\\u0000-\u001f\u007f]/;

function decodedPathname(pathname: string): string | null {
  let current = pathname;
  for (let round = 0; round < 3; round += 1) {
    let next = current;
    try {
      next = decodeURIComponent(current);
    } catch {
      return null;
    }
    if (next === current) return current;
    current = next;
    if (current.startsWith("//") || UNSAFE_CHARS.test(current)) return null;
  }
  return current;
}

export function safeCallbackPath(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || UNSAFE_CHARS.test(value)) {
    return "/";
  }
  try {
    const url = new URL(value, CALLBACK_ORIGIN);
    const decoded = decodedPathname(url.pathname);
    if (url.origin !== CALLBACK_ORIGIN || decoded === null) return "/";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/";
  }
}

export type AuthEntryPath = "/login" | "/signup" | "/forgot-password" | "/reset-password";

export function authEntryHref(entryPath: AuthEntryPath, callback: string | null): string {
  const safe = safeCallbackPath(callback);
  const pathname = new URL(safe, CALLBACK_ORIGIN).pathname;
  const destination = ["/login", "/signup", "/forgot-password", "/reset-password"].includes(pathname)
    ? "/"
    : safe;
  return destination === "/" ? entryPath : `${entryPath}?${new URLSearchParams({ callbackUrl: destination })}`;
}

export function relativeCallbackPath(location: CallbackLocation): string {
  return `${location.pathname}${location.search}${location.hash}`;
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
