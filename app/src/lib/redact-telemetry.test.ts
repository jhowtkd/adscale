import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

import { redactTelemetry } from "./redact-telemetry";

describe("redactTelemetry", () => {
  it("redacts well-known secret keys without touching siblings", () => {
    const input = {
      event: "model.call.completed",
      workspaceId: "ws-1",
      password: "hunter2",
      api_key: "sk-live-123",
      access_token: "tok-abc",
      authorization: "Bearer tok-abc",
      cookie: "session=abc",
      client_secret: "shh",
      inputTokens: 20,
      outputTokens: 10,
    };
    const out = redactTelemetry(input) as Record<string, unknown>;
    expect(out.event).toBe("model.call.completed");
    expect(out.workspaceId).toBe("ws-1");
    expect(out.password).toBe("[REDACTED]");
    expect(out.api_key).toBe("[REDACTED]");
    expect(out.access_token).toBe("[REDACTED]");
    expect(out.authorization).toBe("[REDACTED]");
    expect(out.cookie).toBe("[REDACTED]");
    expect(out.client_secret).toBe("[REDACTED]");
    expect(out.inputTokens).toBe(20);
    expect(out.outputTokens).toBe(10);
  });

  it("matches secret keys case-insensitively across naming styles", () => {
    const out = redactTelemetry({
      apiKey: "a",
      accessToken: "b",
      "X-Api-Secret": "c",
      refresh_token: "d",
      sessionCookie: "e",
    }) as Record<string, unknown>;
    expect(out).toMatchObject({
      apiKey: "[REDACTED]",
      accessToken: "[REDACTED]",
      "X-Api-Secret": "[REDACTED]",
      refresh_token: "[REDACTED]",
      sessionCookie: "[REDACTED]",
    });
  });

  it("redacts secrets nested in objects and arrays", () => {
    const out = redactTelemetry({
      attempts: [
        { attemptNumber: 1, apiKey: "a" },
        { attemptNumber: 2, headers: { authorization: "Bearer b" } },
      ],
      nested: { deep: { password: "c" } },
    }) as any;
    expect(out.attempts[0]).toMatchObject({ attemptNumber: 1, apiKey: "[REDACTED]" });
    expect(out.attempts[1].headers.authorization).toBe("[REDACTED]");
    expect(out.nested.deep.password).toBe("[REDACTED]");
  });

  it("redacts signed URL query params and userinfo while preserving host and path", () => {
    const out = redactTelemetry({
      url: "https://cdn.example.com/asset.png?workspaceId=ws-1&signature=abc123&token=tok-9",
      clean: "https://example.com/a?b=c",
    }) as Record<string, unknown>;
    const redacted = new URL(String(out.url));
    expect(redacted.host).toBe("cdn.example.com");
    expect(redacted.pathname).toBe("/asset.png");
    expect(redacted.searchParams.get("workspaceId")).toBe("ws-1");
    expect(redacted.searchParams.get("signature")).toBe("[REDACTED]");
    expect(redacted.searchParams.get("token")).toBe("[REDACTED]");
    expect(out.clean).toBe("https://example.com/a?b=c");

    const withUserinfo = redactTelemetry({
      url: "https://user:pass@example.com/path",
    }) as Record<string, unknown>;
    expect(String(withUserinfo.url)).not.toContain("pass");
    expect(String(withUserinfo.url)).toContain("example.com/path");
  });

  it("serializes Errors and redacts secrets in message, stack and cause chains", () => {
    const cause = new Error("connect with api_key=sk-cause");
    const error = new Error("call failed", { cause });
    (error as any).accessToken = "tok-err";
    const out = redactTelemetry({ error }) as any;
    expect(out.error.name).toBe("Error");
    expect(String(out.error.message)).not.toContain("sk-cause");
    expect(out.error.accessToken).toBe("[REDACTED]");
    expect(String(out.error.cause.message)).not.toContain("sk-cause");
    expect(String(out.error.stack)).toContain("Error");
    // The caller's Error instance is untouched.
    expect(error.message).toBe("call failed");
    expect((error as any).accessToken).toBe("tok-err");
  });

  it("is safe against circular references", () => {
    const circular: Record<string, unknown> = { event: "x" };
    circular.self = circular;
    circular.items = [circular];
    let out: unknown;
    expect(() => {
      out = redactTelemetry(circular);
    }).not.toThrow();
    expect(JSON.stringify(out)).toContain("[Circular]");
  });

  it("never mutates the caller's object", () => {
    const input = {
      apiKey: "a",
      nested: { password: "b", list: [{ token: "c" }] },
    };
    const snapshot = JSON.parse(JSON.stringify(input));
    redactTelemetry(input);
    expect(input).toEqual(snapshot);
  });

  it("redacts bearer tokens and private keys inside free-form strings", () => {
    const out = redactTelemetry({
      detail: "upstream said Bearer abcDEF123-_.~+/= ok",
      key: "-----BEGIN PRIVATE KEY-----\nMIIBok\n-----END PRIVATE KEY-----",
      plain: "plain message with no secrets",
    }) as Record<string, unknown>;
    expect(String(out.detail)).toContain("Bearer [REDACTED]");
    expect(String(out.detail)).not.toContain("abcDEF123");
    expect(out.key).toBe("[REDACTED]");
    expect(out.plain).toBe("plain message with no secrets");
  });

  it("never throws and returns JSON-serializable output for hostile inputs", () => {
    const evil = Object.defineProperty({}, "boom", {
      enumerable: true,
      get() {
        throw new Error("getter exploded");
      },
    });
    const input = {
      big: 10n,
      fn: () => 1,
      sym: Symbol("s"),
      undef: undefined,
      date: new Date("2026-01-01T00:00:00.000Z"),
      evil,
    };
    let out: unknown;
    expect(() => {
      out = redactTelemetry(input);
    }).not.toThrow();
    expect(() => JSON.stringify(out)).not.toThrow();
  });

  it("survives deeply nested payloads without throwing", () => {
    let deep: Record<string, unknown> = { leaf: "ok" };
    for (let i = 0; i < 60; i++) deep = { next: deep };
    let out: unknown;
    expect(() => {
      out = redactTelemetry(deep);
    }).not.toThrow();
    expect(() => JSON.stringify(out)).not.toThrow();
  });

  it("stays browser-compatible: the shared module has no Node-only imports", () => {
    const source = readFileSync(
      path.join(__dirname, "redact-telemetry.ts"),
      "utf8"
    );
    expect(source).not.toMatch(/from\s+["']node:/);
    expect(source).not.toMatch(/require\(\s*["']node:/);
    expect(source).not.toContain("process.env");
  });
});
