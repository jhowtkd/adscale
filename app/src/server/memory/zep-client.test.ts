import { afterEach, describe, expect, it, vi } from "vitest";

describe("zep client configuration", () => {
  afterEach(() => {
    vi.resetModules();
    delete process.env.ZEP_ENABLED;
    delete process.env.ZEP_API_KEY;
    delete process.env.ZEP_GRAPH_PREFIX;
  });

  it("keeps brand memory disabled without explicit opt-in", async () => {
    process.env.NODE_ENV = "test";
    const mod = await import("./zep-client");
    expect(mod.isBrandMemoryEnabled()).toBe(false);
    expect(mod.getZepClient()).toBeNull();
  });

  it("uses a workspace graph id with a configurable prefix", async () => {
    process.env.NODE_ENV = "test";
    process.env.ZEP_GRAPH_PREFIX = "adscale_test";
    const mod = await import("./zep-client");
    expect(mod.getBrandMemoryGraphId("workspace-1")).toBe("adscale_test_workspace-1");
  });
});

