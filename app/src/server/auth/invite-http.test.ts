import { describe, expect, it } from "vitest";
import { getInviteErrorHttpStatus } from "./invite-http";

describe("getInviteErrorHttpStatus", () => {
  it.each([
    ["inviteNotFound", 404],
    ["inviteRemoved", 410],
    ["inviteAlreadyAccepted", 409],
    ["inviteExpired", 410],
    ["inviteEmailMismatch", 403],
  ] as const)("maps %s at the HTTP boundary", (code, status) => {
    expect(getInviteErrorHttpStatus(code)).toBe(status);
  });
});
