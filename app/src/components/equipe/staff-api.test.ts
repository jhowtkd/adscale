import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/api-client", () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from "@/lib/api-client";
import {
  STAFF_ROLE_FOR_COMMAND,
  StaffApiError,
  roleForCloseEscalation,
  roleForResumePause,
  sendStaffCommand,
  staffFetchJson,
} from "./staff-api";

const mockApiFetch = vi.mocked(apiFetch);

const WORKSPACE_ID = "550e8400-e29b-41d4-a716-446655440001";
const ACCOUNT_ID = "550e8400-e29b-41d4-a716-446655440002";

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

describe("staff-api", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends commands through the staff envelope", async () => {
    mockApiFetch.mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    await sendStaffCommand({
      type: "assume_exception",
      payload: { exceptionId: "exc-1" },
      role: "support",
      workspaceId: WORKSPACE_ID,
      accountId: ACCOUNT_ID,
    });

    expect(mockApiFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockApiFetch.mock.calls[0]!;
    expect(url).toBe("/api/equipe/staff/commands");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({
      type: "assume_exception",
      payload: { exceptionId: "exc-1" },
      role: "support",
      workspaceId: WORKSPACE_ID,
      accountId: ACCOUNT_ID,
    });
  });

  it("keeps the module error code and status on failures", async () => {
    mockApiFetch.mockResolvedValueOnce(
      jsonResponse(409, {
        error: "item cannot go out as-is",
        code: "release_blocked_low_score",
      }),
    );
    const failure = await staffFetchJson("/api/equipe/staff/quality").catch(
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(StaffApiError);
    expect((failure as StaffApiError).status).toBe(409);
    expect((failure as StaffApiError).code).toBe("release_blocked_low_score");
  });

  it("maps every staff command to the role the API authorizes", () => {
    expect(STAFF_ROLE_FOR_COMMAND.assume_exception).toBe("support");
    expect(STAFF_ROLE_FOR_COMMAND.post_staff_message).toBe("support");
    expect(STAFF_ROLE_FOR_COMMAND.register_contact).toBe("support");
    expect(STAFF_ROLE_FOR_COMMAND.close_exception).toBe("support");
    expect(STAFF_ROLE_FOR_COMMAND.score_attempt).toBe("quality");
    expect(STAFF_ROLE_FOR_COMMAND.return_item_for_fix).toBe("quality");
    expect(STAFF_ROLE_FOR_COMMAND.release_item_to_client).toBe("quality");
    expect(STAFF_ROLE_FOR_COMMAND.mark_critical_failure).toBe("quality");
    expect(STAFF_ROLE_FOR_COMMAND.classify_rejection).toBe("quality");
    expect(STAFF_ROLE_FOR_COMMAND.close_round).toBe("quality");
    expect(STAFF_ROLE_FOR_COMMAND.resolve_content_escalation).toBe("quality");
    expect(STAFF_ROLE_FOR_COMMAND.resolve_technical_escalation).toBe("operations");
    expect(STAFF_ROLE_FOR_COMMAND.reopen_front_calibration).toBe("quality");
    expect(STAFF_ROLE_FOR_COMMAND.revoke_connection).toBe("operations");
  });

  it("closes escalations as the owner role", () => {
    expect(roleForCloseEscalation("quality")).toBe("quality");
    expect(roleForCloseEscalation("operations")).toBe("operations");
  });

  it("resumes pauses as the role their origin needs", () => {
    expect(roleForResumePause("content_incident")).toBe("quality");
    expect(roleForResumePause("security")).toBe("operations");
    expect(roleForResumePause("global_stop")).toBe("operations");
    expect(roleForResumePause("team")).toBe("support");
    expect(roleForResumePause("client")).toBeNull();
    expect(roleForResumePause("connection")).toBeNull();
    expect(roleForResumePause("delinquency")).toBeNull();
  });
});
