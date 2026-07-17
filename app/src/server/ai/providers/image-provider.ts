/**
 * Provider-agnostic interface for image generation providers.
 *
 * OpenAI and the deterministic E2E provider implement this interface so
 * `image-generation.ts` remains testable without external calls.
 *
 * Each provider is responsible for:
 *  - Translating `ProviderGenerateInput` to its native API call
 *  - Applying its own timeout (5 minutes ceiling)
 *  - Mapping native errors to a uniform shape so the composite can
 *    treat all providers the same
 *  - Reporting its model name and request id in `ImageCandidate.providerMeta`
 *    for log correlation
 */

export type GenerationMode = "art_variation" | "format_adaptation" | "restyling";

export type ImageReference = {
  buffer: Buffer;
  mimeType: string;
  name: string;
};

export type ProviderGenerateInput = {
  prompt: string;
  dimensions: { width: number; height: number };
  referenceImages: ImageReference[];
  generationMode: GenerationMode;
  outputPrefix: string;
  /** Zero-based durable generation attempt. */
  attempt?: number;
  quality?: "medium" | "high";
  seed?: number;
};

export type ImageCandidate = {
  buffer: Buffer;
  mimeType: string;
  providerMeta: {
    provider: "openai";
    model: string;
    durationMs: number;
    costCredits?: number;
    rawRequestId?: string;
    /**
     * Provider-supplied revised prompt, surfaced on the top-level result for
     * downstream callers.
     */
    revisedPrompt?: string;
  };
};

export interface ImageGenerationProvider {
  readonly name: "openai";
  generate(input: ProviderGenerateInput): Promise<ImageCandidate>;
}
