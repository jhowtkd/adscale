import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("rate-limit edge import boundaries", () => {
  it("proxy imports only the edge-safe rate-limit entry", () => {
    const proxySource = readFileSync(resolve(__dirname, "../proxy.ts"), "utf8");
    expect(proxySource).toContain('@/lib/rate-limit-proxy');
    expect(proxySource).not.toContain('@/lib/rate-limit"');
    expect(proxySource).not.toContain("@/lib/rate-limit'");
  });

  it("edge entry does not import server route helpers or logger", () => {
    const edgeSource = readFileSync(resolve(__dirname, "rate-limit-proxy.ts"), "utf8");
    expect(edgeSource).not.toMatch(/from "\.\/rate-limit"/);
    expect(edgeSource).not.toContain("./logger");
  });
});
