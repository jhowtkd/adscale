import { describe, expect, it } from "vitest";
import { relativeCallbackPath, safeCallbackPath } from "./auth-callback";

describe("auth callback paths", () => {
  it("preserves an invite token as a relative callback", () => {
    expect(
      relativeCallbackPath({ pathname: "/invite", search: "?token=invite-1", hash: "" })
    ).toBe("/invite?token=invite-1");
  });

  it("rejects absolute and protocol-relative callbacks", () => {
    expect(safeCallbackPath("https://evil.example/invite")).toBe("/");
    expect(safeCallbackPath("//evil.example/invite")).toBe("/");
    expect(safeCallbackPath("/invite?token=invite-1")).toBe("/invite?token=invite-1");
  });
});
