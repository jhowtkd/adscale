import { vi } from "vitest";
import type {
  ImageCandidate,
  ImageGenerationProvider,
} from "./image-provider";

/**
 * Test seam for the composite provider. Returns a provider whose
 * `generate` either resolves with `result` or rejects with `error`.
 * Imported by composite-image-provider.test.ts and image-generation.test.ts.
 */
export function fakeProvider(
  name: "openai" | "seedream",
  result?: ImageCandidate,
  error?: Error
): ImageGenerationProvider {
  return {
    name,
    generate: vi.fn(async () => {
      if (error) throw error;
      if (!result) throw new Error("no result configured");
      return result;
    }),
  };
}
