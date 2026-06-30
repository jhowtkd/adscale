import { describe, expect, it, vi, beforeEach } from "vitest";

const mockOpenAIImages = vi.hoisted(() => ({
  edit: vi.fn(() =>
    Promise.resolve({
      data: [{ b64_json: "bW9ja2ltYWdl", revised_prompt: "revised" }],
    })
  ),
}));

vi.mock("openai", () => ({
  default: class MockOpenAI {
    images = mockOpenAIImages;
  },
  toFile: vi.fn((buffer: Buffer, name: string, opts: { type: string }) => ({
    buffer,
    name,
    type: opts.type,
  })),
}));

vi.mock("@/server/storage", () => ({
  objectStorage: {
    get: vi.fn((key: string) => Promise.resolve(Buffer.from(`buffer:${key}`))),
    put: vi.fn(() => Promise.resolve()),
  },}));

vi.mock("../repositories/derivation", () => ({
  getDerivationById: vi.fn(),
  updateDerivationPromptProvenance: vi.fn(() => Promise.resolve({})),
}));

vi.mock("../jobs/derivation", () => ({
  normalizeGeneratedImage: vi.fn((buffer: Buffer) => Promise.resolve(buffer)),
}));

vi.mock("../validation/env", () => ({
  env: {
    OPENAI_API_KEY: "test-key",
    OPENAI_IMAGE_MODEL: "gpt-image-1",
  },
}));

vi.mock("./prompt-builder", () => ({
  buildDerivationPrompt: vi.fn(() => "prompt"),
}));

import { getDerivationById } from "../repositories/derivation";
import { objectStorage } from "@/server/storage";
import { runDerivationAutoRetry } from "./derivation-auto-retry";

const mockGetDerivationById = vi.mocked(getDerivationById);
const mockDownloadBuffer = vi.mocked(objectStorage.get);

const baseContract = {
  generationMode: "restyling" as const,
  targetFormat: "1:1",
  ctaSemantics: { kind: "inherited" as const },
  baseAssetId: "base-asset-id",
  styleAssetId: "style-asset-id",
  client: null,
  product: null,
  offer: null,
  constraints: null,
  sourcePackage: "campaign_asset" as const,
  factualSourceRules: {
    campaignAsset: "visual_and_copy_from_campaign_asset" as const,
    approvedDerivation: "visual_from_parent_output" as const,
    restyling: { factual: "base_asset" as const, styleOnly: "style_asset" as const },
  },
};

const baseInput = {
  derivationId: "derivation-id",
  workspaceId: "workspace-1",
  campaignId: "campaign-id",
  referenceKey: "assets/base-factual.png",
  referenceMimeType: "image/png",
  correctionFeedback: "Fix style contamination",
  promptContext: {
    campaign: { name: "Test" },
    generationMode: "restyling" as const,
    targetFormat: "1:1",
    contract: baseContract,
  },
  contract: baseContract,
  targetFormat: "1:1",
  generationMode: "restyling" as const,
};

describe("runDerivationAutoRetry restyling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDerivationById.mockResolvedValue({
      id: "derivation-id",
      hardFailures: [{ code: "style_reference_contamination", message: "Contaminated" }],
      generationLog: { autoRetryAttempted: false },
      promptProvenance: null,
    } as Awaited<ReturnType<typeof getDerivationById>>);
  });

  it("calls images.edit with base and style files for restyling", async () => {
    await runDerivationAutoRetry({
      ...baseInput,
      styleReferenceKey: "assets/style-reference.png",
      styleReferenceMimeType: "image/png",
    });

    expect(mockDownloadBuffer).toHaveBeenCalledWith("assets/base-factual.png");
    expect(mockDownloadBuffer).toHaveBeenCalledWith("assets/style-reference.png");
    expect(mockOpenAIImages.edit).toHaveBeenCalledWith(
      expect.objectContaining({
        image: [
          expect.objectContaining({ name: "base-image" }),
          expect.objectContaining({ name: "style-reference" }),
        ],
      })
    );
  });

  it("uses single base image when restyling styleReferenceKey is missing", async () => {
    await runDerivationAutoRetry(baseInput);

    expect(mockDownloadBuffer).toHaveBeenCalledTimes(1);
    expect(mockOpenAIImages.edit).toHaveBeenCalledWith(
      expect.objectContaining({
        image: expect.objectContaining({ name: "base-image" }),
      })
    );
  });

  it("uses single image for non-restyling modes", async () => {
    mockGetDerivationById.mockResolvedValue({
      id: "derivation-id",
      hardFailures: [{ code: "cta_drift", message: "CTA drift" }],
      generationLog: { autoRetryAttempted: false },
      promptProvenance: null,
    } as Awaited<ReturnType<typeof getDerivationById>>);

    await runDerivationAutoRetry({
      ...baseInput,
      generationMode: "art_variation",
      styleReferenceKey: "assets/style-reference.png",
      promptContext: { ...baseInput.promptContext, generationMode: "art_variation" },
      contract: { ...baseContract, generationMode: "art_variation" },
    });

    expect(mockDownloadBuffer).toHaveBeenCalledTimes(1);
    expect(mockOpenAIImages.edit).toHaveBeenCalledWith(
      expect.objectContaining({
        image: expect.objectContaining({ name: "reference-image" }),
      })
    );
  });
});
