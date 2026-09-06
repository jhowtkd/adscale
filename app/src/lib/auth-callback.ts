export type CallbackLocation = {
  pathname: string;
  search: string;
  hash: string;
};

export function safeCallbackPath(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/";
  }
  return value;
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
