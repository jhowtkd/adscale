import { afterEach, describe, expect, it, vi } from "vitest";

describe("mem0 client configuration", () => {
  afterEach(() => {
    vi.resetModules();
    delete process.env.MEM0_ENABLED;
    delete process.env.MEM0_API_KEY;
    delete process.env.MEM0_USER_PREFIX;
  });

  it("keeps brand memory disabled without explicit opt-in", async () => {
    process.env.NODE_ENV = "test";
    const mod = await import("./mem0-client");
    expect(mod.isBrandMemoryEnabled()).toBe(false);
    expect(mod.getMem0Client()).toBeNull();
  });

  it("uses a workspace user id with a configurable prefix", async () => {
    process.env.NODE_ENV = "test";
    process.env.MEM0_USER_PREFIX = "adscale_test";
    const mod = await import("./mem0-client");
    expect(mod.getBrandMemoryUserId("workspace-1")).toBe("adscale_test_workspace-1");
  });

  it("scopes user ids by client profile when provided", async () => {
    process.env.NODE_ENV = "test";
    process.env.MEM0_USER_PREFIX = "adscale_test";
    const mod = await import("./mem0-client");
    expect(mod.getBrandMemoryUserId("workspace-1", "profile-a")).toBe(
      "adscale_test_workspace-1_profile-a"
    );
  });
});
