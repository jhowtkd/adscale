import { unauthorizedLoginHref } from "@/lib/auth-callback";

export async function apiFetch(
  input: RequestInfo | URL,
  init?: RequestInit & { timeoutMs?: number }
): Promise<Response> {
  const { timeoutMs = 15_000, ...fetchInit } = init ?? {};
  const res = await fetch(input, {
    ...fetchInit,
    credentials: "include",
    signal: fetchInit.signal ?? AbortSignal.timeout(timeoutMs),
  });

  if (res.status === 401) {
    if (typeof window !== "undefined" && window.location.pathname !== "/login") {
      window.location.href = unauthorizedLoginHref(
        `${window.location.pathname}${window.location.search}`,
      );
    }
    throw new Error("Unauthorized");
  }

  return res;
}

export function isApiRequestUncertain(error: unknown): boolean {
  if (error instanceof TypeError) return true;
  return error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");
}
