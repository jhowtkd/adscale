import { describe, expect, it } from "vitest";
import { GET } from "./route";

const FORBIDDEN_HEALTH_KEYS = ["cwd", "staticAssets", "brandMemory", "chunkCount", "logoExists"];

describe("GET /api/health", () => {
  it("returns a minimal public payload with HTTP 200 semantics", async () => {
    const response = await GET();
    const body = await response.json();

    expect(body).toEqual({
      ok: true,
      service: "adscale-app",
      timestamp: expect.any(String),
    });
    expect(new Date(body.timestamp).toString()).not.toBe("Invalid Date");
  });

  it("does not expose process, memory, or asset diagnostics", async () => {
    const response = await GET();
    const body = await response.json();

    for (const key of FORBIDDEN_HEALTH_KEYS) {
      expect(body).not.toHaveProperty(key);
    }

    const serialized = JSON.stringify(body);
    expect(serialized).not.toMatch(/process\.cwd|"cwd"/i);
    expect(serialized).not.toMatch(/chunkCount|staticExists|publicExists|logoExists/i);
    expect(serialized).not.toMatch(/brandMemory/i);
  });
});
