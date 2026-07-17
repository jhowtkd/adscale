import { beforeEach, describe, expect, it, vi } from "vitest";

const create = vi.hoisted(() => vi.fn());
vi.mock("@/server/validation/env", () => ({ env: { OPENAI_TEXT_MODEL: "test-model" } }));
vi.mock("@/server/ai/utils", () => ({ getOpenAI: () => ({ chat: { completions: { create } } }) }));

import { analyzeImageContent } from "@/server/ai/image-analysis";

describe("image analysis schema boundary", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects a provider JSON result that does not match ContentBrief", async () => {
    create.mockResolvedValue({ choices: [{ message: { content: JSON.stringify({ product: "Tênis" }) } }] });
    await expect(analyzeImageContent(Buffer.from("image"), "image/png")).rejects.toThrow();
  });
});
