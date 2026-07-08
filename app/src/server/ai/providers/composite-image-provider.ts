import { logger } from "@/lib/logger";
import { env } from "@/server/validation/env";
import type {
  ImageCandidate,
  ImageGenerationProvider,
  ProviderGenerateInput,
} from "./image-provider";

export type CompositeGenerateResult = {
  candidates: ImageCandidate[];
};

/**
 * Runs multiple image generation providers in parallel and collects their
 * candidates. Failure of one provider does not fail the whole job — the
 * surviving candidates are returned. If every provider fails, an aggregated
 * error is thrown with the first provider's error preserved for log
 * correlation.
 *
 * Sample rate (SEEDREAM_SAMPLE_RATE) is consulted per call so operators can
 * dial Seedream in or out without redeploying.
 */
export class CompositeImageProvider {
  constructor(
    private providers: ImageGenerationProvider[],
    private opts?: { sampleRate?: number; random?: () => number }
  ) {}

  private shouldRunSeedream(): boolean {
    const rate = this.opts?.sampleRate ?? env.SEEDREAM_SAMPLE_RATE ?? 1.0;
    if (rate <= 0) return false;
    if (rate >= 1) return true;
    const rnd = this.opts?.random ?? Math.random;
    return rnd() < rate;
  }

  async generate(input: ProviderGenerateInput): Promise<CompositeGenerateResult> {
    const seedreamEnabled = this.shouldRunSeedream();
    const activeProviders = seedreamEnabled
      ? this.providers
      : this.providers.filter((p) => p.name !== "seedream");

    const results = await Promise.allSettled(
      activeProviders.map((p) => p.generate(input))
    );

    const candidates: ImageCandidate[] = [];
    const errors: { provider: string; error: unknown }[] = [];

    results.forEach((r, idx) => {
      const providerName = activeProviders[idx].name;
      if (r.status === "fulfilled") {
        candidates.push(r.value);
      } else {
        logger.warn(
          `[CompositeImageProvider] ${providerName} failed:`,
          r.reason instanceof Error ? r.reason.message : r.reason
        );
        errors.push({ provider: providerName, error: r.reason });
      }
    });

    if (candidates.length === 0) {
      const summary = errors
        .map((e) => `${e.provider}: ${e.error instanceof Error ? e.error.message : String(e.error)}`)
        .join("; ");
      throw new Error(`All image providers failed: ${summary}`);
    }

    return { candidates };
  }
}
