import { expect, it } from "vitest";
import { resolveCreativeWorkRenderPolicy } from "./render-policy";

it.each([undefined, null, {}, { renderPolicy: "future" }])("preserves historical rendering for %o", (snapshot) => {
  expect(resolveCreativeWorkRenderPolicy(snapshot)).toEqual({
    integrated: false, quality: undefined, maxImageCalls: 2, automaticCorrection: true,
  });
});

it("pins high quality and one image call without automatic correction", () => {
  expect(resolveCreativeWorkRenderPolicy({ creativeRenderPolicy: "integrated_v1" })).toEqual({
    integrated: true, quality: "high", maxImageCalls: 1, automaticCorrection: false,
  });
});
