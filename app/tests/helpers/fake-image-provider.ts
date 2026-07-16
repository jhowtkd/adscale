import { vi } from "vitest";
import type {
  ImageCandidate,
  ImageGenerationProvider,
} from "@/server/ai/providers/image-provider";

/**
 * Test seam for image generation. Returns a provider whose
 * `generate` either resolves with `result` or rejects with `error`.
 */
export function fakeProvider(
  name: "openai",
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
