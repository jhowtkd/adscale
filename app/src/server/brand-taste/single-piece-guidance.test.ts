import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("./prompt-calibration-loader", () => ({ loadLocalLearningPromptCalibrationContext: vi.fn() }));
import { loadLocalLearningPromptCalibrationContext } from "./prompt-calibration-loader";
import { resolveSinglePieceGuidance } from "./single-piece-guidance";
import { getCreativeWorkPromptVersion } from "../shared-skills";

const load = vi.mocked(loadLocalLearningPromptCalibrationContext);
beforeEach(() => {
  vi.resetAllMocks();
  load.mockResolvedValue({ lines: [], appliedRefs: [], setHash: null, omissions: [] });
});
describe("Single-piece selection (not application)", () => {
  it("resolves every pertinent role and retains denial and omission reasons", async () => {
    load.mockResolvedValue({ lines: [], appliedRefs: [], setHash: null, omissions: [], omissionReason: "brand_out_of_scope" });
    const selection = await resolveSinglePieceGuidance({ workspaceId: "workspace", clientProfileId: "brand", generationMode: "single", format: "4:5" });
    expect(load.mock.calls.map(([input]) => input.role)).toEqual(["copy", "art_direction", "image_prompt"]);
    expect(load.mock.calls.find(([input]) => input.role === "image_prompt")?.[0]).toMatchObject({
      fixedPromptVersion: getCreativeWorkPromptVersion("image_prompt"), language: "pt-BR",
    });
    for (const role of ["copy", "art_direction", "image_prompt"] as const) {
      expect(selection.roles[role]).toEqual({ lines: [], appliedRefs: [], setHash: null, omissions: [], omissionReason: "brand_out_of_scope" });
    }
    expect(selection).toMatchObject({ version: 1, generationMode: "single", format: "4:5" });
  });
});
