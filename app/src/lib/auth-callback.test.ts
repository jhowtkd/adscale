import { describe, expect, it } from "vitest";
import { relativeCallbackPath, safeCallbackPath, unauthorizedLoginHref } from "./auth-callback";

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

describe("unauthorizedLoginHref", () => {
  it("preserves a relative Studio resume path", () => {
    expect(unauthorizedLoginHref("/?workId=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")).toBe(
      "/login?callbackUrl=%2F%3FworkId%3Daaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    );
    expect(unauthorizedLoginHref("/campaigns?tab=review")).toBe(
      "/login?callbackUrl=%2Fcampaigns%3Ftab%3Dreview",
    );
  });

  it("does not loop on auth entry or the bare home path", () => {
    expect(unauthorizedLoginHref("/")).toBe("/login");
    expect(unauthorizedLoginHref("/login")).toBe("/login");
    expect(unauthorizedLoginHref("/login?callbackUrl=%2Fsettings")).toBe("/login");
    expect(unauthorizedLoginHref("/signup")).toBe("/login");
  });

  it("rejects open redirects the same way as safeCallbackPath", () => {
    expect(unauthorizedLoginHref("https://evil.example/")).toBe("/login");
    expect(unauthorizedLoginHref("//evil.example")).toBe("/login");
  });
});
