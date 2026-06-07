import { z } from "zod";

export const BETA_SESSION_STORAGE_KEY = "adscale_beta_session_id";

const sessionIdSchema = z.string().uuid();

export function getBetaSessionIdFromRequest(
  request: Request
): string | undefined {
  const headerValue = request.headers.get("x-beta-session-id");
  if (!headerValue) {
    return undefined;
  }

  const parsed = sessionIdSchema.safeParse(headerValue);
  return parsed.success ? parsed.data : undefined;
}
