import { afterEach, describe, expect, it, vi } from "vitest";
import { main } from "./jev-process";

describe("Jev processing CLI guards", () => {
  afterEach(() => vi.unstubAllEnvs());

  it.each([[[]], [["process"]], [["demo", "extra"]], [["demo", "--workspace", "x"]], [["collect"]]])(
    "rejects arguments %j before opening any database",
    async (args) => {
      vi.stubEnv("TEST_DATABASE_URL", "postgres://u:p@db.example.com:5432/adscale_test");
      await expect(main(args as string[])).rejects.toThrow("invalid_arguments");
    },
  );

  it("never falls back to DATABASE_URL", async () => {
    vi.stubEnv("TEST_DATABASE_URL", "");
    vi.stubEnv("DATABASE_URL", "postgres://test:test@localhost:5433/adscale_test");
    await expect(main(["demo"])).rejects.toThrow("explicit_test_database_required");
  });

  it.each([
    "postgres://u:p@db.example.com:5432/adscale_test",
    "postgres://u:p@localhost:5432/adscale",
    "postgres://test:test@localhost:5433/adscale_test?sslmode=disable",
  ])("refuses unsafe database %s without running the demo", async (url) => {
    vi.stubEnv("TEST_DATABASE_URL", url);
    const fetchSentinel = vi.fn();
    vi.stubGlobal("fetch", fetchSentinel);
    await expect(main(["demo"])).rejects.toThrow("unsafe_test_database");
    expect(fetchSentinel).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
