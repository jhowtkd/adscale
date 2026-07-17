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

const RETRY_SETTLE_DELAY_MS = 3_500;

function isLocalAppUrl(value: string | undefined): boolean {
  try {
    const host = new URL(value ?? "").hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host === "::1";
  } catch {
    return false;
  }
}

export function isE2EControlledProviderEnabled(
  environment: NodeJS.ProcessEnv = process.env
): boolean {
  if (environment.E2E_CONTROLLED_PROVIDER !== "true") return false;
  if (!isLocalAppUrl(environment.APP_URL)) return false;
  if (environment.NODE_ENV !== "production") return true;

  // A local optimized build is the stable way to run the long Gate 6 suite.
  // Keep the seam unavailable to any deployed production URL even if someone
  // accidentally copies the flag there.
  if (environment.E2E_DISABLE_RATE_LIMIT !== "true") return false;
  return true;
}

export class E2EControlledImageProvider implements ImageGenerationProvider {
  readonly name = "openai" as const;

  private constructor(
    private readonly failureFixturesEnabled: boolean,
    private readonly retrySettleDelayMs: number,
  ) {}

  static forLocalRuntime(): E2EControlledImageProvider {
    return new E2EControlledImageProvider(
      isE2EControlledProviderEnabled(),
      RETRY_SETTLE_DELAY_MS,
    );
  }

  static forUnitTests(retrySettleDelayMs = 0): E2EControlledImageProvider {
    if (process.env.NODE_ENV !== "test") {
      throw new Error("E2E controlled provider unit fixture is test-only");
    }
    return new E2EControlledImageProvider(true, retrySettleDelayMs);
  }

  async generate(input: ProviderGenerateInput): Promise<ImageCandidate> {
    const failureAttempts = this.failureFixturesEnabled && input.prompt.includes("[e2e:retry-twice-bold]")
      ? 2
      : this.failureFixturesEnabled && input.prompt.includes("[e2e:retry-once-bold]")
        ? 1
        : 0;
    const attempt = input.attempt ?? 0;
    if (failureAttempts > attempt && input.prompt.includes("CREATIVE LEVEL: bold")) {
      throw Object.assign(new Error("controlled_retryable_failure"), {
        retryable: true,
        status: 503,
      });
    }
    // The canonical runtime generates three candidates concurrently. Fail all
    // candidates in the controlled attempt, then hold the successful retry
    // open long enough for the polling UI to render its partial state.
    if (failureAttempts > 0 && attempt >= failureAttempts && this.retrySettleDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.retrySettleDelayMs));
    }
    return {
      buffer: CONTROLLED_PNG,
      mimeType: "image/png",
      providerMeta: {
        provider: "openai",
        model: "e2e-controlled-image",
        durationMs: 0,
        rawRequestId: `e2e:${input.outputPrefix}:attempt-${attempt}`,
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
