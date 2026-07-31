import { describe, expect, it, vi } from "vitest";

const create = vi.hoisted(() => vi.fn());

vi.mock("./utils", () => ({
  getOpenAI: () => ({ responses: { create } }),
  extractOutputText: (response: { output_text?: string }) => response.output_text,
}));

vi.mock("@/server/validation/env", () => ({ env: { OPENAI_TEXT_MODEL: "gpt-5.6-sol" } }));
vi.mock("@/server/ai/providers/e2e-controlled-provider", () => ({
  isE2EControlledProviderEnabled: () => false,
}));

import { analyzeImageContent } from "./image-analysis";

describe("analyzeImageContent", () => {
  it("uses the Responses vision input and parses its JSON output", async () => {
    create.mockResolvedValueOnce({ output_text: JSON.stringify({
      product: "Curso", offer: "20%", cta: { text: "Inscreva-se", style: "botão" },
      brandElements: ["CENBRAP"], keyVisual: "professor", textContent: { headline: "Ao vivo", bullets: [] }, format: "4:5",
    }) });

    await expect(analyzeImageContent(Buffer.from("image"), "image/png")).resolves.toMatchObject({ product: "Curso" });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      model: "gpt-5.6-sol",
      input: expect.arrayContaining([expect.objectContaining({ role: "user", content: expect.arrayContaining([
        expect.objectContaining({ type: "input_image", image_url: "data:image/png;base64,aW1hZ2U=" }),
      ]) })]),
      text: { format: { type: "json_object" } },
    }));
  });
});
