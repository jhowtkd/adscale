/**
 * Provider-agnostic interface for image generation providers.
 *
 * Both OpenAI and BytePlus Seedream implement this interface so the
 * CompositeImageProvider can run them interchangeably and the
 * `image-generation.ts` orchestrator can stay provider-agnostic.
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
  seed?: number;
};

export type ImageCandidate = {
  buffer: Buffer;
  mimeType: string;
  providerMeta: {
    provider: "openai" | "seedream";
    model: string;
    durationMs: number;
    costCredits?: number;
    rawRequestId?: string;
  };
};

export interface ImageGenerationProvider {
  readonly name: "openai" | "seedream";
  generate(input: ProviderGenerateInput): Promise<ImageCandidate>;
}
