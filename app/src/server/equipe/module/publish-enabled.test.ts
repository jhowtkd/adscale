import { describe, expect, it } from "vitest";
import { isEquipePublishEnabled } from "./publish-enabled";

describe("isEquipePublishEnabled", () => {
  it("is on only for exactly \"true\"", () => {
    expect(isEquipePublishEnabled({ enabledRaw: "true" })).toBe(true);
    expect(isEquipePublishEnabled({ enabledRaw: "false" })).toBe(false);
    expect(isEquipePublishEnabled({ enabledRaw: "1" })).toBe(false);
    expect(isEquipePublishEnabled({ enabledRaw: "" })).toBe(false);
    expect(isEquipePublishEnabled({ enabledRaw: undefined })).toBe(false);
  });
});
