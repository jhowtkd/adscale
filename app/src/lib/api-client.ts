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
    window.location.href = "/login";
    throw new Error("Unauthorized");
  }

  return res;
}
