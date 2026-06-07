import { z } from "zod";
import { BETA_SESSION_STORAGE_KEY } from "@/lib/beta-analytics/constants";

export { BETA_SESSION_STORAGE_KEY };

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
