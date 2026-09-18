import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { proxy } from "./proxy";

function requestFor(path: string, cookies: Record<string, string> = {}) {
  const url = `http://localhost:3000${path}`;
  const req = new NextRequest(url);
  for (const [name, value] of Object.entries(cookies)) {
    req.cookies.set(name, value);
  }
  return req;
}

describe("proxy auth routing", () => {
  const originalMarketingUrl = process.env.MARKETING_URL;

  beforeEach(() => {
    process.env.MARKETING_URL = "https://www.example.com";
  });

  afterEach(() => {
    if (originalMarketingUrl === undefined) {
      delete process.env.MARKETING_URL;
    } else {
      process.env.MARKETING_URL = originalMarketingUrl;
    }
  });

  it("redirects unauthenticated / to MARKETING_URL when configured", async () => {
    const res = await proxy(requestFor("/"));
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location")!).origin).toBe("https://www.example.com");
  });

  it("redirects unauthenticated /campaigns to login with callbackUrl", async () => {
    const res = await proxy(requestFor("/campaigns"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost:3000/login?callbackUrl=%2Fcampaigns");
  });

  it("allows authenticated / through", async () => {
    const res = await proxy(
      requestFor("/", { "better-auth.session_token": "test" })
    );
    expect(res.status).toBe(200);
  });

  it("redirects authenticated /login to dashboard", async () => {
    const res = await proxy(
      requestFor("/login", { "better-auth.session_token": "test" })
    );
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost:3000/");
  });

  it("sets X-Robots-Tag on auth entry paths", async () => {
    const res = await proxy(requestFor("/login"));
    expect(res.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
  });

  it("falls back to /login for / when MARKETING_URL is unset", async () => {
    delete process.env.MARKETING_URL;
    const res = await proxy(requestFor("/"));
    expect(res.headers.get("location")).toBe("http://localhost:3000/login");
  });

  it("sends unauthenticated Studio resume on / to login instead of MARKETING_URL", async () => {
    const res = await proxy(requestFor(`/?workId=${"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}`));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(
      "http://localhost:3000/login?callbackUrl=%2F%3FworkId%3Daaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    );
  });

  it("sends unauthenticated /?compose=1 to login with callbackUrl", async () => {
    const res = await proxy(requestFor("/?compose=1"));
    expect(res.headers.get("location")).toBe(
      "http://localhost:3000/login?callbackUrl=%2F%3Fcompose%3D1",
    );
  });

  it("still sends bare unauthenticated / to MARKETING_URL", async () => {
    const res = await proxy(requestFor("/"));
    expect(new URL(res.headers.get("location")!).origin).toBe("https://www.example.com");
  });

  it("preserves query on /campaigns callbackUrl", async () => {
    const res = await proxy(requestFor("/campaigns?tab=review"));
    expect(res.headers.get("location")).toBe(
      "http://localhost:3000/login?callbackUrl=%2Fcampaigns%3Ftab%3Dreview",
    );
  });

  it("sets callbackUrl for / when MARKETING_URL is unset and Studio query is present", async () => {
    delete process.env.MARKETING_URL;
    const res = await proxy(requestFor("/?compose=1"));
    expect(res.headers.get("location")).toBe(
      "http://localhost:3000/login?callbackUrl=%2F%3Fcompose%3D1",
    );
  });

  it("leaves unauthenticated /hi public with no redirect (#439)", async () => {
    const res = await proxy(requestFor("/hi"));
    expect(res.headers.get("location")).toBeNull();
  });

  it("locks the no-loop contract / -> /hi -> 200, never back to / (#439)", async () => {
    process.env.MARKETING_URL = "http://localhost:3000/hi";
    const root = await proxy(requestFor("/"));
    expect(root.headers.get("location")).toBe("http://localhost:3000/hi");
    const hi = await proxy(requestFor("/hi"));
    expect(hi.headers.get("location")).toBeNull();
  });
});
