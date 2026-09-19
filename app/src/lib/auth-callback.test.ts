import { describe, expect, it } from "vitest";
import { authEntryHref, relativeCallbackPath, safeCallbackPath, unauthorizedLoginHref } from "./auth-callback";

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

describe("safeCallbackPath hardening", () => {
  it.each([
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "/\n/evil.example",
    "/%2Fevil.example",
    "/%252Fevil.example",
    "javascript:alert(1)",
    "",
  ])("recusa retorno inseguro %s", (value) => expect(safeCallbackPath(value)).toBe("/"));

  it("preserva callbacks internos legítimos", () => {
    expect(safeCallbackPath("/?compose=1&guestDraft=aa111111-1111-4111-8111-111111111111"))
      .toBe("/?compose=1&guestDraft=aa111111-1111-4111-8111-111111111111");
    expect(safeCallbackPath("/invite?token=invite-1")).toBe("/invite?token=invite-1");
    expect(safeCallbackPath("/settings?tab=billing")).toBe("/settings?tab=billing");
    expect(safeCallbackPath(null)).toBe("/");
  });
});

describe("authEntryHref", () => {
  it("preserva a continuação no link de cadastro", () => {
    const callback = "/?compose=1&guestDraft=aa111111-1111-4111-8111-111111111111";
    const href = authEntryHref("/signup", callback);
    expect(new URL(href, "https://app.example").searchParams.get("callbackUrl")).toBe(callback);
  });

  it("evita loop para as próprias páginas de auth", () => {
    expect(authEntryHref("/signup", "/login?callbackUrl=%2F")).toBe("/signup");
    expect(authEntryHref("/login", "/reset-password?token=x")).toBe("/login");
  });

  it("retorna a entrada sem query para callback vazio ou inseguro", () => {
    expect(authEntryHref("/forgot-password", null)).toBe("/forgot-password");
    expect(authEntryHref("/signup", "https://evil.example")).toBe("/signup");
  });
});
