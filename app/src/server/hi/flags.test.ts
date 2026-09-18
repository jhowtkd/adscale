import { describe, expect, it } from "vitest";
import { assertHiFlagsValid, resolveHiFlags } from "./flags";

describe("resolveHiFlags", () => {
  it("defaults to all-false containment when unset", () => {
    const { flags, errors } = resolveHiFlags({});
    expect(errors).toEqual([]);
    expect(flags).toEqual({
      importEnabled: false,
      pageEnabled: false,
      attachmentsEnabled: false,
    });
  });

  it.each([
    [{}, true],
    [{ HI_IMPORT_ENABLED: "true" }, true],
    [{ HI_IMPORT_ENABLED: "true", HI_PAGE_ENABLED: "true" }, true],
    [{ HI_IMPORT_ENABLED: "true", HI_ATTACHMENTS_ENABLED: "true" }, true],
    [
      {
        HI_IMPORT_ENABLED: "true",
        HI_PAGE_ENABLED: "true",
        HI_ATTACHMENTS_ENABLED: "true",
      },
      true,
    ],
    [{ HI_PAGE_ENABLED: "true" }, false],
    [{ HI_ATTACHMENTS_ENABLED: "true" }, false],
    [{ HI_PAGE_ENABLED: "true", HI_ATTACHMENTS_ENABLED: "true" }, false],
  ])("flag matrix %j valid=%s", (env, valid) => {
    const { errors } = resolveHiFlags(env);
    expect(errors.length === 0).toBe(valid);
  });

  it("rejects non-boolean literals", () => {
    const { errors } = resolveHiFlags({ HI_PAGE_ENABLED: "1" });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain("HI_PAGE_ENABLED");
  });

  it("assertHiFlagsValid throws naming the offending combination", () => {
    expect(() =>
      assertHiFlagsValid({ HI_PAGE_ENABLED: "true" }),
    ).toThrowError(/HI_PAGE_ENABLED=true requires HI_IMPORT_ENABLED=true/);
  });

  it("assertHiFlagsValid returns flags when valid", () => {
    expect(
      assertHiFlagsValid({
        HI_IMPORT_ENABLED: "true",
        HI_PAGE_ENABLED: "true",
      }),
    ).toEqual({
      importEnabled: true,
      pageEnabled: true,
      attachmentsEnabled: false,
    });
  });
});
