import { describe, it, expect } from "vitest";
import { buildRiskCopyLines } from "./risk-copy";
import { quickRestyleContract } from "./contracts/quick-restyle";

describe("buildRiskCopyLines", () => {
  it("returns style-reference warning when styleReferenceId is absent", () => {
    const lines = buildRiskCopyLines(quickRestyleContract, {
      baseCreativeId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
    });

    expect(lines).toEqual([
      "Sem referência de estilo, o resultado pode divergir mais da marca.",
    ]);
  });

  it("returns empty array when styleReferenceId is present", () => {
    const lines = buildRiskCopyLines(quickRestyleContract, {
      baseCreativeId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
      styleReferenceId: "b1ffcd00-ad1c-5fg9-cc7e-7cc0ce491b22",
    });

    expect(lines).toEqual([]);
  });
});
