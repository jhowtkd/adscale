import fs from "node:fs";
import path from "node:path";
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

/**
 * R-010: every controlled call (success AND failure) is appended as one
 * JSONL record so the Playwright matrix can prove, per output: mode,
 * dimensions, reference order, attempt and the absolute 2-call ceiling.
 * Local-only seam — the path is overridable for hermetic runs.
 */
const DEFAULT_EVIDENCE_PATH = path.resolve("tests/e2e/.evidence/provider-calls.jsonl");

function evidencePath(): string {
  return process.env.E2E_PROVIDER_EVIDENCE_PATH ?? DEFAULT_EVIDENCE_PATH;
}

function recordProviderCall(input: ProviderGenerateInput, outcome: "success" | "failure", error?: unknown): void {
  try {
    const file = evidencePath();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.appendFileSync(file, `${JSON.stringify({
      ts: new Date().toISOString(),
      outputPrefix: input.outputPrefix,
      attempt: input.attempt ?? 0,
      generationMode: input.generationMode,
      dimensions: input.dimensions,
      referenceNames: input.referenceImages.map((reference) => reference.name),
      referenceMimeTypes: input.referenceImages.map((reference) => reference.mimeType),
      promptMarkers: [...input.prompt.matchAll(/\[e2e:[a-z-]+\]/g)].map((match) => match[0]),
      promptHasObjectiveCorrection: input.prompt.includes("OBJECTIVE CORRECTION"),
      promptHasDeterministicText: input.prompt.includes("DETERMINISTIC TEXT CONTRACT"),
      outcome,
      error: outcome === "failure" ? (error instanceof Error ? error.message : String(error)) : null,
    })}\n`);
  } catch {
    // Evidence is best-effort: it must never break a generation.
  }
}

function isLocalAppUrl(value: string | undefined): boolean {
  try {
    const host = new URL(value ?? "").hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host === "::1";
  } catch {
    return false;
  }
}

function isRenderPullRequestPreviewUrl(value: string | undefined): boolean {
  try {
    const url = new URL(value ?? "");
    return url.protocol === "https:" && /-pr-\d+\.onrender\.com$/.test(url.hostname);
  } catch {
    return false;
  }
}

export function isE2EControlledProviderEnabled(
  environment: NodeJS.ProcessEnv = process.env
): boolean {
  if (environment.E2E_CONTROLLED_PROVIDER !== "true") return false;
  if (isLocalAppUrl(environment.APP_URL)) {
    if (environment.NODE_ENV !== "production") return true;

    // A local optimized build is the stable way to run the long Gate 6 suite.
    // Keep the seam unavailable to any deployed production URL even if someone
    // accidentally copies the flag there.
    return environment.E2E_DISABLE_RATE_LIMIT === "true";
  }

  // Explicit, non-default escape hatch for a disposable Render PR preview.
  // The URL gate keeps this seam out of the production custom domain and the
  // flag must be configured on the preview itself.
  return (
    environment.NODE_ENV === "production" &&
    environment.E2E_CONTROLLED_PROVIDER_PREVIEW === "true" &&
    isRenderPullRequestPreviewUrl(environment.APP_URL)
  );
}

function retryableTransportError(): Error {
  return Object.assign(new Error("controlled_retryable_failure"), {
    retryable: true,
    status: 503,
  });
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
    const attempt = input.attempt ?? 0;
    const fixtures = this.failureFixturesEnabled;
    const prompt = input.prompt;

    // R-010 failure matrix (prompt markers travel inside the frozen request,
    // so they are authoritative per output, never per process):
    // - [e2e:timeout-once]: first call fails retryable → transport retry uses
    //   the second (and final) call.
    // - [e2e:always-fail]: every call fails retryable → both calls burn, the
    //   output settles terminally with the idempotent refund.
    // - [e2e:hard-fail-once]: first call fails NON-retryable → terminal fail
    //   with budget left, exercising the manual-retry reactivation path.
    const failRetryable =
      (fixtures && prompt.includes("[e2e:always-fail]")) ||
      (fixtures && prompt.includes("[e2e:timeout-once]") && attempt === 0);
    const failHard = fixtures && prompt.includes("[e2e:hard-fail-once]") && attempt === 0;

    // Legacy triplet markers (pre-R-010 contract, bold level only).
    const legacyFailureAttempts = fixtures && prompt.includes("[e2e:retry-twice-bold]")
      ? 2
      : fixtures && prompt.includes("[e2e:retry-once-bold]")
        ? 1
        : 0;
    const failLegacy =
      legacyFailureAttempts > attempt && prompt.includes("CREATIVE LEVEL: bold");

    if (failRetryable || failLegacy) {
      recordProviderCall(input, "failure", "controlled_retryable_failure");
      throw retryableTransportError();
    }
    if (failHard) {
      recordProviderCall(input, "failure", "controlled_hard_failure");
      throw Object.assign(new Error("controlled_hard_failure"), { status: 400 });
    }
    // The canonical runtime generates three candidates concurrently. Fail all
    // candidates in the controlled attempt, then hold the successful retry
    // open long enough for the polling UI to render its partial state.
    if (legacyFailureAttempts > 0 && attempt >= legacyFailureAttempts && this.retrySettleDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.retrySettleDelayMs));
    }
    recordProviderCall(input, "success");
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
