import { describe, it, expect } from "vitest";
import {
  BETA_SESSION_STORAGE_KEY,
  getBetaSessionIdFromRequest,
} from "./session";

const VALID_SESSION_ID = "550e8400-e29b-41d4-a716-446655440000";

function createRequest(headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/test", { headers });
}

describe("BETA_SESSION_STORAGE_KEY", () => {
  it("equals adscale_beta_session_id for client sessionStorage contract", () => {
    expect(BETA_SESSION_STORAGE_KEY).toBe("adscale_beta_session_id");
  });
});

describe("getBetaSessionIdFromRequest", () => {
  it("returns UUID from x-beta-session-id when valid", () => {
    const request = createRequest({
      "x-beta-session-id": VALID_SESSION_ID,
    });

    expect(getBetaSessionIdFromRequest(request)).toBe(VALID_SESSION_ID);
  });

  it("returns undefined when header is missing", () => {
    expect(getBetaSessionIdFromRequest(createRequest())).toBeUndefined();
  });

  it("returns undefined when header is not a valid UUID", () => {
    const request = createRequest({
      "x-beta-session-id": "not-a-uuid",
    });

    expect(getBetaSessionIdFromRequest(request)).toBeUndefined();
  });
});
