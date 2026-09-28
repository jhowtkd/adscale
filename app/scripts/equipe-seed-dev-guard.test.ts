import { describe, expect, it } from "vitest";
import {
  assertSeedTargetSafe,
  assertWriteFlagPresent,
  databaseNameOf,
  parseSeedArgs,
} from "./equipe-seed-dev-guard";

const ARGS = [
  "--workspace",
  "11111111-1111-4111-8111-111111111111",
  "--client-profile",
  "22222222-2222-4222-8222-222222222222",
  "--user",
  "user-1",
  "--staff-user",
  "owner-1",
];

describe("equipe-seed-dev guard", () => {
  it("parses the required args and the write flag", () => {
    const parsed = parseSeedArgs([...ARGS, "--i-know-this-writes"]);
    expect(parsed).toMatchObject({
      workspace: "11111111-1111-4111-8111-111111111111",
      clientProfile: "22222222-2222-4222-8222-222222222222",
      user: "user-1",
      staffUser: "owner-1",
      iKnowThisWrites: true,
    });
    expect(parseSeedArgs(ARGS).iKnowThisWrites).toBe(false);
    expect(() => parseSeedArgs(ARGS.slice(2))).toThrow(/missing required --workspace/);
    expect(() =>
      parseSeedArgs([...ARGS.slice(0, 1), "not-a-uuid", ...ARGS.slice(2)]),
    ).toThrow(/must be a uuid/);
  });

  it("reads the database name out of DATABASE_URL", () => {
    expect(databaseNameOf("postgres://u:p@localhost:5432/adscale_dev")).toBe("adscale_dev");
    expect(databaseNameOf("postgres://u:p@localhost:5432/adscale_dev?ssl=true")).toBe(
      "adscale_dev",
    );
    expect(databaseNameOf("not a url")).toBeNull();
    expect(databaseNameOf("postgres://u:p@localhost:5432/")).toBeNull();
  });

  it("refuses production envs and production-looking databases", () => {
    expect(
      assertSeedTargetSafe({
        nodeEnv: "development",
        databaseUrl: "postgres://u:p@localhost:5432/adscale_dev",
      }),
    ).toBe("adscale_dev");
    expect(() =>
      assertSeedTargetSafe({
        nodeEnv: "production",
        databaseUrl: "postgres://u:p@localhost:5432/adscale_dev",
      }),
    ).toThrow(/NODE_ENV=production/);
    for (const name of ["adscale_prod", "production", "myapp_live", "PROD_eu"]) {
      expect(() =>
        assertSeedTargetSafe({
          nodeEnv: "development",
          databaseUrl: `postgres://u:p@localhost:5432/${name}`,
        }),
      ).toThrow(/production-looking/);
    }
    expect(() =>
      assertSeedTargetSafe({ nodeEnv: "development", databaseUrl: undefined }),
    ).toThrow(/without DATABASE_URL/);
  });

  it("requires the explicit write flag", () => {
    expect(() => assertWriteFlagPresent(false)).toThrow(/--i-know-this-writes/);
    expect(() => assertWriteFlagPresent(true)).not.toThrow();
  });
});
