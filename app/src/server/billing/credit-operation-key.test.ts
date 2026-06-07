import { describe, expect, it } from "vitest";
import { resolveCreditOperationKey } from "./credit-operation-key";

describe("resolveCreditOperationKey", () => {
  it("prefers explicit operation_key in metadata", () => {
    expect(
      resolveCreditOperationKey("image_derivation", { operation_key: "batch" })
    ).toBe("batch");
  });

  it("maps preview flag to preview and batch", () => {
    expect(resolveCreditOperationKey("image_derivation", { preview: true })).toBe(
      "preview"
    );
    expect(resolveCreditOperationKey("image_derivation", { preview: false })).toBe(
      "batch"
    );
  });

  it("maps creative_qa action", () => {
    expect(resolveCreditOperationKey("creative_qa", {})).toBe("creative_qa");
  });

  it("falls back to billing action", () => {
    expect(resolveCreditOperationKey("regeneration", {})).toBe("regeneration");
  });
});
