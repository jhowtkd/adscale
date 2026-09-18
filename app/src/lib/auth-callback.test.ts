import { describe, expect, it } from "vitest";
import {
  authEntryHref,
  postAuthRedirect,
  relativeCallbackPath,
  safeCallbackPath,
  unauthorizedLoginHref,
} from "./auth-callback";

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

  it.each([
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "/\n/evil.example",
  ])("recusa retorno inseguro %s", (value) => {
    expect(safeCallbackPath(value)).toBe("/");
  });

  it("rejects evasive encodings and malformed callbacks", () => {
    // Single-encoded protocol-relative and backslash.
    expect(safeCallbackPath("/%2Fevil.example")).toBe("/");
    expect(safeCallbackPath("/%5cevil.example")).toBe("/");
    // Double-encoded protocol-relative.
    expect(safeCallbackPath("/%252Fevil.example")).toBe("/");
    // Encoded control characters and DEL.
    expect(safeCallbackPath("/%0ainvite")).toBe("/");
    expect(safeCallbackPath("/invite%7f")).toBe("/");
    // Malformed percent-encoding.
    expect(safeCallbackPath("/%zz")).toBe("/");
    // Visitor domain never becomes an authorized origin.
    expect(safeCallbackPath("https://adscale.jhonatansoares.com/hi")).toBe("/");
    expect(safeCallbackPath("")).toBe("/");
    expect(safeCallbackPath(null)).toBe("/");
  });

  it("preserves legitimate internal callbacks with search and hash", () => {
    expect(
      safeCallbackPath(
        "/?compose=1&fresh=1&intent=single&guestDraft=aa111111-1111-4111-8111-111111111111",
      ),
    ).toBe(
      "/?compose=1&fresh=1&intent=single&guestDraft=aa111111-1111-4111-8111-111111111111",
    );
    expect(safeCallbackPath("/settings?tab=billing#plan")).toBe(
      "/settings?tab=billing#plan",
    );
    expect(safeCallbackPath("/invite?token=invite-1")).toBe(
      "/invite?token=invite-1",
    );
  });
});

describe("authEntryHref", () => {
  it("preserva a continuação no link de cadastro", () => {
    const callback =
      "/?compose=1&guestDraft=aa111111-1111-4111-8111-111111111111";
    const href = authEntryHref("/signup", callback);
    expect(new URL(href, "https://app.example").searchParams.get("callbackUrl")).toBe(
      callback,
    );
  });

  it("collapses auth-entry and unsafe callbacks to the bare entry path", () => {
    expect(authEntryHref("/signup", "/login?callbackUrl=%2F")).toBe("/signup");
    expect(authEntryHref("/login", "/signup")).toBe("/login");
    expect(authEntryHref("/login", "https://evil.example/")).toBe("/login");
    expect(authEntryHref("/forgot-password", null)).toBe("/forgot-password");
    expect(authEntryHref("/reset-password", "/")).toBe("/reset-password");
  });

  it("preserves guestDraft continuations across every entry path", () => {
    const callback = "/?compose=1&fresh=1&guestDraft=bb222222-2222-4222-8222-222222222222";
    for (const entry of [
      "/login",
      "/signup",
      "/forgot-password",
      "/reset-password",
    ] as const) {
      const href = authEntryHref(entry, callback);
      expect(
        new URL(href, "https://app.example").searchParams.get("callbackUrl"),
      ).toBe(callback);
    }
  });
});

describe("postAuthRedirect", () => {
  it("preserves the continuation for already-authenticated visitors", () => {
    const callback = "/?compose=1&guestDraft=aa111111-1111-4111-8111-111111111111";
    expect(postAuthRedirect(callback)).toBe(callback);
  });

  it("collapses bare, missing, unsafe, or auth-entry callbacks to /", () => {
    expect(postAuthRedirect(null)).toBe("/");
    expect(postAuthRedirect("/")).toBe("/");
    expect(postAuthRedirect("https://evil.example/")).toBe("/");
    expect(postAuthRedirect("/login?callbackUrl=%2Fsettings")).toBe("/");
    expect(postAuthRedirect("/signup")).toBe("/");
    expect(postAuthRedirect("/reset-password?token=abc")).toBe("/");
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
    expect(unauthorizedLoginHref("/\\evil.example")).toBe("/login");
    expect(unauthorizedLoginHref("/%2Fevil.example")).toBe("/login");
  });
});
