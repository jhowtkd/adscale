import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "./api-client";

describe("apiFetch 401", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("location", {
      href: "http://localhost:3000/?workId=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      pathname: "/",
      search: "?workId=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends the operator to login with the current path as callbackUrl", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 401 }));

    await expect(apiFetch("/api/creative-work/x")).rejects.toThrow("Unauthorized");
    expect(window.location.href).toBe(
      "/login?callbackUrl=%2F%3FworkId%3Daaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    );
  });

  it("does not replace href when already on /login", async () => {
    vi.stubGlobal("location", {
      href: "http://localhost:3000/login",
      pathname: "/login",
      search: "",
    });
    fetchMock.mockResolvedValue(new Response(null, { status: 401 }));

    await expect(apiFetch("/api/creative-work/x")).rejects.toThrow("Unauthorized");
    expect(window.location.href).toBe("http://localhost:3000/login");
  });
});
