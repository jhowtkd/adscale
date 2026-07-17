import type {
  ImageCandidate,
  ImageGenerationProvider,
  ProviderGenerateInput,
} from "./image-provider";
import type { ScoreResult } from "../creative-score";

// Small valid PNG used only by the local Playwright provider lifecycle. The
// normal generation pipeline still normalises and stores it, so persistence,
// billing, Inngest and UI polling remain real while the external model is
// deterministic.
const CONTROLLED_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64"
);

const controlledFailures = new Map<string, number>();

export function isE2EControlledProviderEnabled(
  environment: NodeJS.ProcessEnv = process.env
): boolean {
  if (environment.E2E_CONTROLLED_PROVIDER !== "true") return false;
  if (environment.NODE_ENV !== "production") return true;

  // A local optimized build is the stable way to run the long Gate 6 suite.
  // Keep the seam unavailable to any deployed production URL even if someone
  // accidentally copies the flag there.
  if (environment.E2E_DISABLE_RATE_LIMIT !== "true") return false;
  try {
    const host = new URL(environment.APP_URL ?? "").hostname;
    return host === "localhost" || host === "127.0.0.1";
  } catch {
    return false;
  }
}

export class E2EControlledImageProvider implements ImageGenerationProvider {
  readonly name = "openai" as const;

  async generate(input: ProviderGenerateInput): Promise<ImageCandidate> {
    const failureLimit = input.prompt.includes("[e2e:retry-twice-bold]")
      ? 2
      : input.prompt.includes("[e2e:retry-once-bold]")
        ? 1
        : 0;
    const failures = controlledFailures.get(input.outputPrefix) ?? 0;
    if (failureLimit > failures && input.prompt.includes("CREATIVE LEVEL: bold")) {
      controlledFailures.set(input.outputPrefix, failures + 1);
      throw Object.assign(new Error("controlled_retryable_failure"), {
        retryable: true,
        status: 503,
      });
    }
    return {
      buffer: CONTROLLED_PNG,
      mimeType: "image/png",
      providerMeta: {
        provider: "openai",
        model: "e2e-controlled-image",
        durationMs: 0,
        rawRequestId: `e2e:${input.outputPrefix}`,
        revisedPrompt: input.prompt,
      },
    };
  }
}

export function createE2EControlledScore(): ScoreResult {
  return {
    qualityScore: 92,
    scoreStatus: "analyzed",
    scoreBreakdown: {
      ctaClarity: 92,
      textLegibility: 92,
      briefMatch: 92,
      visualQuality: 92,
      formatFit: 92,
      variationLevelFit: 92,
      informationPreservation: 92,
    },
    scoreIssues: [],
    regenerationSuggestion: "",
    olharVerdict: "pronta",
    whatWorks: ["Controlled E2E creative"],
    whatBlocks: [],
    directionNote: "Deterministic local E2E score",
  };
}
