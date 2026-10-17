import { afterEach, describe, expect, it, vi } from "vitest";
import { main, requireJevTestDatabaseUrl } from "./jev-collect";

describe("Jev collection CLI database guard", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("never falls back to DATABASE_URL", () => {
    vi.stubEnv("TEST_DATABASE_URL", "");
    vi.stubEnv("DATABASE_URL", "postgres://test:test@localhost:5433/adscale_test");
    expect(() => requireJevTestDatabaseUrl()).toThrow("explicit_test_database_required");
    expect(() => requireJevTestDatabaseUrl(undefined)).toThrow("explicit_test_database_required");
  });

  it.each([
    "postgres://u:p@db.example.com:5432/adscale_test",
    "postgres://u:p@localhost:5432/adscale",
    "postgres://u:p@localhost:5432/adscale_prod",
    "postgres://u:p@localhost:5432/adscale_test_prod",
    "postgres://u:p@localhost:5432/",
    "http://localhost:5432/adscale_test",
    "not a url",
    "postgres://test:test@localhost:5433/adscale_test?host=production.invalid&port=5432",
    "postgres://test:test@localhost:5433/adscale_test?dbname=adscale_prod",
    "postgres://test:test@localhost:5433/adscale_test?service=prod",
    "postgres://test:test@localhost:5433/adscale_test?options=-c%20search_path%3Dx",
    "postgres://test:test@localhost:5433/adscale_test?sslmode=disable",
    "postgres://test:test@localhost:5433/adscale_test#frag",
  ])("rejects %s", (value) => {
    expect(() => requireJevTestDatabaseUrl(value)).toThrow("unsafe_test_database");
  });

  it.each([
    "postgres://test:test@localhost:5433/adscale_test",
    "postgres://test:test@localhost:5432/adscale_test",
    "postgresql://test:test@127.0.0.1:5432/other_test",
  ])("accepts local *_test database %s", (value) => {
    expect(requireJevTestDatabaseUrl(value)).toBe(value);
  });

  it("fails before touching any database when TEST_DATABASE_URL is absent or unsafe", async () => {
    vi.stubEnv("TEST_DATABASE_URL", "");
    vi.stubEnv("DATABASE_URL", "postgres://test:test@localhost:5433/adscale_test");
    await expect(main(["collect"])).rejects.toThrow("explicit_test_database_required");
    vi.stubEnv("TEST_DATABASE_URL", "postgres://u:p@db.example.com:5432/adscale_test");
    await expect(main(["demo"])).rejects.toThrow("unsafe_test_database");
  });
});
