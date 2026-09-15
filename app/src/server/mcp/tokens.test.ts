import { describe, it, expect } from "vitest";
import { extractBearerToken, generateBearerToken, hashBearerToken } from "./tokens";

describe("mcp tokens (pure helpers)", () => {
  it("gera token com prefixo identificável e segredo único", () => {
    const first = generateBearerToken();
    const second = generateBearerToken();
    expect(first.token.startsWith("adscale-mcp-")).toBe(true);
    expect(first.token).not.toBe(second.token);
    expect(first.prefix).toBe(first.token.slice(0, "adscale-mcp-".length + 4));
  });

  it("hash é determinístico e não reversível no formato", () => {
    const { token } = generateBearerToken();
    expect(hashBearerToken(token)).toBe(hashBearerToken(token));
    expect(hashBearerToken(token)).not.toContain("adscale-mcp-");
    expect(hashBearerToken(token)).toHaveLength(64);
  });

  it("extrai Bearer do header, rejeita o resto", () => {
    expect(extractBearerToken("Bearer abc123")).toBe("abc123");
    expect(extractBearerToken(null)).toBeNull();
    expect(extractBearerToken("Basic abc123")).toBeNull();
    expect(extractBearerToken("Bearer")).toBeNull();
    expect(extractBearerToken("bearer abc123")).toBeNull();
  });
});
