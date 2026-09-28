// Safety-guard unit tests for the Equipe load harness (#555).
// Pure: no server imports, no env needed.

import { describe, expect, it } from "vitest";
import { assertSafeToWrite } from "./guards";

const LOCAL = "postgres://load:load@localhost:55434/equipe_load";
const STAGING = "postgres://u:p@staging.db.render.example:5432/adscale_staging";
const PROD = "postgres://u:p@db.example:5432/adscale_prod";

describe("assertSafeToWrite", () => {
  it("allows a throwaway local database", () => {
    expect(
      assertSafeToWrite({
        target: "local",
        databaseUrl: LOCAL,
        iKnowThisWrites: false,
        nodeEnv: "test",
      }),
    ).toBe("equipe_load");
  });

  it("refuses NODE_ENV=production even for a local database", () => {
    expect(() =>
      assertSafeToWrite({
        target: "local",
        databaseUrl: LOCAL,
        iKnowThisWrites: false,
        nodeEnv: "production",
      }),
    ).toThrow(/NODE_ENV=production/);
  });

  it("refuses a non-throwaway name on local", () => {
    expect(() =>
      assertSafeToWrite({
        target: "local",
        databaseUrl: "postgres://u:p@localhost:5432/adscale",
        iKnowThisWrites: false,
        nodeEnv: "test",
      }),
    ).toThrow(/throwaway-looking/);
  });

  it("refuses production-looking names on every target", () => {
    for (const target of ["local", "staging"] as const) {
      expect(() =>
        assertSafeToWrite({
          target,
          databaseUrl: PROD,
          iKnowThisWrites: true,
          nodeEnv: "test",
        }),
      ).toThrow(/production-looking/);
    }
  });

  it("refuses staging without the explicit flag", () => {
    expect(() =>
      assertSafeToWrite({
        target: "staging",
        databaseUrl: STAGING,
        iKnowThisWrites: false,
        nodeEnv: "test",
      }),
    ).toThrow(/--i-know-this-writes/);
  });

  it("refuses staging against a non-staging name even with the flag", () => {
    expect(() =>
      assertSafeToWrite({
        target: "staging",
        databaseUrl: LOCAL,
        iKnowThisWrites: true,
        nodeEnv: "test",
      }),
    ).toThrow(/staging-looking/);
  });

  it("allows staging with the flag and a staging name", () => {
    expect(
      assertSafeToWrite({
        target: "staging",
        databaseUrl: STAGING,
        iKnowThisWrites: true,
        nodeEnv: "test",
      }),
    ).toBe("adscale_staging");
  });
});
