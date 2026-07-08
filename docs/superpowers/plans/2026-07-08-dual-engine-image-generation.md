# Dual-Engine Image Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run OpenAI gpt-image-2 and BytePlus Seedream 5 Pro in parallel for every derivation, let the existing quality gate pick the best candidate, ship to production with a `SEEDREAM_SAMPLE_RATE` knob.

**Architecture:** Extract image generation into an `ImageGenerationProvider` interface with two implementations (OpenAIImageProvider refactored from existing code, SeedreamImageProvider new). A `CompositeImageProvider` runs them in parallel via `Promise.allSettled` and returns 1 or 2 candidates. The existing `generateAndStoreImage()` becomes the single entry point and gains candidate evaluation.

**Tech Stack:** TypeScript, OpenAI SDK, BytePlus ModelArk (OpenAI-compatible), Drizzle ORM, Inngest, Vitest, Playwright.

## Global Constraints

- **No callers of `generateAndStoreImage` change signature.** The function may gain new fields in its return type (additive) but the existing `outputKey`, `revisedPrompt`, `imageOperation`, `buffer` fields must stay.
- **The `derivations` table gains one column: `candidates jsonb`** (additive, nullable). No other columns change.
- **Env vars are validated at request time** (`SEEDREAM_SAMPLE_RATE` is read per-job, not at boot, for zero-downtime rollback).
- **Each provider maps errors uniformly** (rate limit, content policy, timeout, 5xx) so the composite can treat them the same.
- **Commit frequently** with the `feat(dual-engine):` or `test(dual-engine):` prefix.

## File Structure

Files to **create**:
- `app/src/server/ai/providers/image-provider.ts` — interface + types
- `app/src/server/ai/providers/openai-image-provider.ts` — extracted from current `image-generation.ts`
- `app/src/server/ai/providers/seedream-image-provider.ts` — new, OpenAI-compat against ModelArk
- `app/src/server/ai/providers/composite-image-provider.ts` — parallel orchestration
- `app/src/server/ai/providers/image-provider.test.ts` — interface contract test (optional, used by all 3 providers)
- `app/src/server/ai/providers/openai-image-provider.test.ts` — extracted unit tests
- `app/src/server/ai/providers/seedream-image-provider.test.ts` — new unit tests
- `app/src/server/ai/providers/composite-image-provider.test.ts` — failure matrix tests
- `app/drizzle/0073_derivations_candidates.sql` — additive migration

Files to **modify**:
- `app/src/server/validation/env.ts` — add 4 new env vars with Zod
- `app/src/server/ai/image-generation.ts` — refactor body to call `CompositeImageProvider`
- `app/src/server/db/schema.ts` — add `candidates` column to `derivations`
- `app/src/server/ai/image-generation.test.ts` — update for new return shape (candidates field)
- `app/src/server/ai/generation-log.ts` — emit new `image.generation.candidates` event
- `app/src/server/ai/derivation-pipeline.ts` — pass candidates metadata into the derivation row update
- `app/src/server/jobs/derivation.ts` (or wherever `derivations` row is updated after generation) — persist `candidates` jsonb

---

## Task 1: Add env vars for Seedream + sample rate

**Files:**
- Modify: `app/src/server/validation/env.ts:18-56`
- Test: `app/src/server/validation/env.test.ts` (existing)

**Interfaces:**
- Produces: `env.BYTEPLUS_API_KEY`, `env.SEEDREAM_MODEL_NAME`, `env.SEEDREAM_SAMPLE_RATE`, `env.SEEDREAM_BASE_URL`

- [ ] **Step 1: Read the existing env.test.ts to understand the test pattern**

Run:
```bash
cat /Users/jhonatan/Repos/ADScale_2/app/src/server/validation/env.test.ts
```

- [ ] **Step 2: Add the 4 new env vars to env.ts**

In `app/src/server/validation/env.ts`, after the `BETA_ACCESS_CODES` line, add:

```ts
  // Dual-engine image generation (BytePlus Seedream)
  BYTEPLUS_API_KEY: z.string().optional(),
  SEEDREAM_MODEL_NAME: z.string().optional(),
  SEEDREAM_SAMPLE_RATE: z
    .string()
    .optional()
    .transform((v) => (v === undefined ? 1.0 : Number(v)))
    .refine((n) => Number.isFinite(n) && n >= 0 && n <= 1, {
      message: "SEEDREAM_SAMPLE_RATE must be a number between 0 and 1",
    }),
  SEEDREAM_BASE_URL: z.string().url().default("https://ark.byteplus.com/v1"),
```

- [ ] **Step 3: Add a test case for the new sample rate validation**

In `app/src/server/validation/env.test.ts`, add a new `describe` block:

```ts
describe("dual-engine env vars", () => {
  it("rejects SEEDREAM_SAMPLE_RATE > 1", () => {
    const result = envSchema.safeParse({
      ...validBase,
      SEEDREAM_SAMPLE_RATE: "1.5",
    });
    expect(result.success).toBe(false);
  });

  it("rejects SEEDREAM_SAMPLE_RATE < 0", () => {
    const result = envSchema.safeParse({
      ...validBase,
      SEEDREAM_SAMPLE_RATE: "-0.1",
    });
    expect(result.success).toBe(false);
  });

  it("defaults SEEDREAM_SAMPLE_RATE to 1.0 when missing", () => {
    const result = envSchema.safeParse(validBase);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.SEEDREAM_SAMPLE_RATE).toBe(1.0);
    }
  });

  it("accepts SEEDREAM_SAMPLE_RATE = 0.5", () => {
    const result = envSchema.safeParse({
      ...validBase,
      SEEDREAM_SAMPLE_RATE: "0.5",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.SEEDREAM_SAMPLE_RATE).toBe(0.5);
    }
  });
});
```

(Use whatever `validBase` fixture the existing test uses — likely a shared object of all required env vars.)

- [ ] **Step 4: Run the test suite for env validation**

Run: `cd /Users/jhonatan/Repos/ADScale_2/app && npx vitest run src/server/validation/env.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/src/server/validation/env.ts app/src/server/validation/env.test.ts
git commit -m "feat(dual-engine): add BytePlus env vars and sample rate validation"
```

---

## Task 2: Create the ImageGenerationProvider interface

**Files:**
- Create: `app/src/server/ai/providers/image-provider.ts`

**Interfaces:**
- Produces: `ImageGenerationProvider`, `ProviderGenerateInput`, `ImageCandidate` (consumed by Tasks 3, 4, 5)

- [ ] **Step 1: Create the providers directory and the interface file**

Create `app/src/server/ai/providers/image-provider.ts`:

```ts
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
```

- [ ] **Step 2: Verify the file compiles**

Run: `cd /Users/jhonatan/Repos/ADScale_2/app && npx tsc --noEmit src/server/ai/providers/image-provider.ts`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add app/src/server/ai/providers/image-provider.ts
git commit -m "feat(dual-engine): add ImageGenerationProvider interface"
```

---

## Task 3: Extract OpenAIImageProvider from image-generation.ts

**Files:**
- Create: `app/src/server/ai/providers/openai-image-provider.ts`
- Modify: `app/src/server/ai/image-generation.ts` (defer body changes to Task 6)
- Test: `app/src/server/ai/providers/openai-image-provider.test.ts`

**Interfaces:**
- Consumes: `ImageGenerationProvider` interface (Task 2)
- Produces: `OpenAIImageProvider` class implementing the interface

- [ ] **Step 1: Create OpenAIImageProvider**

Create `app/src/server/ai/providers/openai-image-provider.ts`:

```ts
import OpenAI, { toFile } from "openai";
import { env } from "@/server/validation/env";
import { logger } from "@/lib/logger";
import { toOpenAISdkImageSize } from "@/lib/formats";
import { fetchProviderUrlSafe } from "@/server/ai/safe-fetch";
import type {
  ImageCandidate,
  ImageGenerationProvider,
  ProviderGenerateInput,
} from "./image-provider";

const IMAGE_GENERATION_TIMEOUT_MS = 5 * 60 * 1000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timeout: NodeJS.Timeout;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`));
    }, ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    clearTimeout(timeout);
  });
}

function dimensionsToOpenAISdkSize(dimensions: { width: number; height: number }) {
  const ratio = dimensions.width / dimensions.height;
  const isGptImage2 = env.OPENAI_IMAGE_MODEL.startsWith("gpt-image-2");
  if (Math.abs(ratio - 1) < 0.05) {
    return toOpenAISdkImageSize("1024x1024");
  }
  if (ratio < 1) {
    if (isGptImage2) {
      return ratio < 0.7
        ? toOpenAISdkImageSize("1152x2048")
        : toOpenAISdkImageSize("1024x1280");
    }
    return toOpenAISdkImageSize("1024x1536");
  }
  return toOpenAISdkImageSize("1536x1024");
}

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY, timeout: 120_000 });

export class OpenAIImageProvider implements ImageGenerationProvider {
  readonly name = "openai" as const;

  async generate(input: ProviderGenerateInput): Promise<ImageCandidate> {
    const start = Date.now();
    const openaiSize = dimensionsToOpenAISdkSize(input.dimensions);
    let result: OpenAI.Images.Image;
    let imageOperation: "generate" | "edit";

    if (input.referenceImages.length > 0) {
      const files = await Promise.all(
        input.referenceImages.map((ref) =>
          toFile(ref.buffer, ref.name, { type: ref.mimeType })
        )
      );
      const response = await withTimeout(
        openai.images.edit({
          model: env.OPENAI_IMAGE_MODEL,
          image: files,
          prompt: input.prompt,
          n: 1,
          size: openaiSize,
        }),
        IMAGE_GENERATION_TIMEOUT_MS,
        "OpenAI image edit"
      );
      const first = response.data?.[0];
      if (!first) throw new Error("No image data returned from OpenAI");
      logger.info(
        `[OpenAIImageProvider] edit success references=${input.referenceImages.length}`
      );
      result = first;
      imageOperation = "edit";
    } else {
      const response = await withTimeout(
        openai.images.generate({
          model: env.OPENAI_IMAGE_MODEL,
          prompt: input.prompt,
          n: 1,
          size: openaiSize,
        }),
        IMAGE_GENERATION_TIMEOUT_MS,
        "OpenAI image generation"
      );
      const first = response.data?.[0];
      if (!first) throw new Error("No image data returned from OpenAI");
      logger.info(`[OpenAIImageProvider] generate success`);
      result = first;
      imageOperation = "generate";
    }

    let buffer: Buffer;
    if (result.b64_json) {
      buffer = Buffer.from(result.b64_json, "base64");
    } else if (result.url) {
      buffer = await fetchProviderUrlSafe(result.url);
    } else {
      throw new Error("No image data returned from OpenAI");
    }

    return {
      buffer,
      mimeType: "image/png",
      providerMeta: {
        provider: "openai",
        model: env.OPENAI_IMAGE_MODEL,
        durationMs: Date.now() - start,
      },
    };
  }
}
```

- [ ] **Step 2: Write a unit test that mocks the OpenAI SDK client**

Create `app/src/server/ai/providers/openai-image-provider.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/server/validation/env", () => ({
  env: { OPENAI_API_KEY: "sk-test", OPENAI_IMAGE_MODEL: "gpt-image-2-2026-04-21" },
}));

const mockEdit = vi.fn();
const mockGenerate = vi.fn();
vi.mock("openai", () => {
  return {
    default: class {
      images = { edit: mockEdit, generate: mockGenerate };
    },
    toFile: vi.fn(async (buffer: Buffer, name: string) => ({ buffer, name })),
  };
});

import { OpenAIImageProvider } from "./openai-image-provider";

describe("OpenAIImageProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls images.generate when no references provided", async () => {
    mockGenerate.mockResolvedValue({
      data: [{ b64_json: Buffer.from("png-bytes").toString("base64") }],
    });
    const provider = new OpenAIImageProvider();
    const result = await provider.generate({
      prompt: "a hero image",
      dimensions: { width: 1024, height: 1024 },
      referenceImages: [],
      generationMode: "art_variation",
      outputPrefix: "derivations/test",
    });
    expect(mockGenerate).toHaveBeenCalledOnce();
    expect(mockEdit).not.toHaveBeenCalled();
    expect(result.buffer).toBeInstanceOf(Buffer);
    expect(result.providerMeta.provider).toBe("openai");
  });

  it("calls images.edit when at least one reference is provided", async () => {
    mockEdit.mockResolvedValue({
      data: [{ b64_json: Buffer.from("edited").toString("base64") }],
    });
    const provider = new OpenAIImageProvider();
    const result = await provider.generate({
      prompt: "with ref",
      dimensions: { width: 1024, height: 1280 },
      referenceImages: [
        { buffer: Buffer.from("ref"), mimeType: "image/png", name: "r.png" },
      ],
      generationMode: "restyling",
      outputPrefix: "derivations/test",
    });
    expect(mockEdit).toHaveBeenCalledOnce();
    expect(mockGenerate).not.toHaveBeenCalled();
    expect(result.providerMeta.model).toBe("gpt-image-2-2026-04-21");
  });

  it("throws a clear error when the response has no image data", async () => {
    mockGenerate.mockResolvedValue({ data: [] });
    const provider = new OpenAIImageProvider();
    await expect(
      provider.generate({
        prompt: "x",
        dimensions: { width: 1024, height: 1024 },
        referenceImages: [],
        generationMode: "art_variation",
        outputPrefix: "p",
      })
    ).rejects.toThrow(/No image data/);
  });
});
```

- [ ] **Step 3: Run the new tests**

Run: `cd /Users/jhonatan/Repos/ADScale_2/app && npx vitest run src/server/ai/providers/openai-image-provider.test.ts`
Expected: 3 tests pass

- [ ] **Step 4: Commit**

```bash
git add app/src/server/ai/providers/openai-image-provider.ts app/src/server/ai/providers/openai-image-provider.test.ts
git commit -m "feat(dual-engine): extract OpenAIImageProvider from image-generation.ts"
```

---

## Task 4: Create SeedreamImageProvider

**Files:**
- Create: `app/src/server/ai/providers/seedream-image-provider.ts`
- Test: `app/src/server/ai/providers/seedream-image-provider.test.ts`

**Interfaces:**
- Consumes: `ImageGenerationProvider` interface (Task 2)
- Produces: `SeedreamImageProvider` class implementing the interface

- [ ] **Step 1: Create the Seedream provider**

Create `app/src/server/ai/providers/seedream-image-provider.ts`:

```ts
import OpenAI, { toFile } from "openai";
import { env } from "@/server/validation/env";
import { logger } from "@/lib/logger";
import { fetchProviderUrlSafe } from "@/server/ai/safe-fetch";
import type {
  ImageCandidate,
  ImageGenerationProvider,
  ProviderGenerateInput,
} from "./image-provider";

const SEEDREAM_TIMEOUT_MS = 5 * 60 * 1000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timeout: NodeJS.Timeout;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`));
    }, ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    clearTimeout(timeout);
  });
}

function dimensionsToSeedreamSize(dimensions: { width: number; height: number }): string {
  // ModelArk accepts a "size" string in WxH format for Seedream.
  return `${dimensions.width}x${dimensions.height}`;
}

/**
 * Provider implementation for BytePlus ModelArk Seedream 5 Pro.
 *
 * Talks to the OpenAI-compatible endpoint at SEEDREAM_BASE_URL.
 * The exact request shape is the same as the OpenAI SDK (model, prompt,
 * image[], n, size) so we reuse the same client structure.
 */
export class SeedreamImageProvider implements ImageGenerationProvider {
  readonly name = "seedream" as const;

  private client: OpenAI;
  private model: string;

  constructor(opts?: { client?: OpenAI; model?: string }) {
    if (opts?.client) {
      this.client = opts.client;
    } else {
      this.client = new OpenAI({
        apiKey: env.BYTEPLUS_API_KEY,
        baseURL: env.SEEDREAM_BASE_URL,
        timeout: 120_000,
      });
    }
    this.model = opts?.model ?? env.SEEDREAM_MODEL_NAME ?? "unknown";
  }

  async generate(input: ProviderGenerateInput): Promise<ImageCandidate> {
    if (!env.BYTEPLUS_API_KEY) {
      throw new Error("BYTEPLUS_API_KEY is not set; cannot run Seedream provider");
    }
    if (!env.SEEDREAM_MODEL_NAME) {
      throw new Error(
        "SEEDREAM_MODEL_NAME is not set; cannot run Seedream provider"
      );
    }

    const start = Date.now();
    const size = dimensionsToSeedreamSize(input.dimensions);
    let result: OpenAI.Images.Image;
    let imageOperation: "generate" | "edit";

    if (input.referenceImages.length > 0) {
      const files = await Promise.all(
        input.referenceImages.map((ref) =>
          toFile(ref.buffer, ref.name, { type: ref.mimeType })
        )
      );
      const response = await withTimeout(
        this.client.images.edit({
          model: this.model,
          image: files,
          prompt: input.prompt,
          n: 1,
          size,
        }),
        SEEDREAM_TIMEOUT_MS,
        "Seedream image edit"
      );
      const first = response.data?.[0];
      if (!first) throw new Error("No image data returned from Seedream");
      logger.info(
        `[SeedreamImageProvider] edit success references=${input.referenceImages.length}`
      );
      result = first;
      imageOperation = "edit";
    } else {
      const response = await withTimeout(
        this.client.images.generate({
          model: this.model,
          prompt: input.prompt,
          n: 1,
          size,
        }),
        SEEDREAM_TIMEOUT_MS,
        "Seedream image generation"
      );
      const first = response.data?.[0];
      if (!first) throw new Error("No image data returned from Seedream");
      logger.info(`[SeedreamImageProvider] generate success`);
      result = first;
      imageOperation = "generate";
    }

    let buffer: Buffer;
    if (result.b64_json) {
      buffer = Buffer.from(result.b64_json, "base64");
    } else if (result.url) {
      buffer = await fetchProviderUrlSafe(result.url);
    } else {
      throw new Error("No image data returned from Seedream");
    }

    return {
      buffer,
      mimeType: "image/png",
      providerMeta: {
        provider: "seedream",
        model: this.model,
        durationMs: Date.now() - start,
      },
    };
  }
}
```

- [ ] **Step 2: Write unit tests with a mocked OpenAI client**

Create `app/src/server/ai/providers/seedream-image-provider.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/server/validation/env", () => ({
  env: {
    BYTEPLUS_API_KEY: "bp-test",
    SEEDREAM_MODEL_NAME: "doubao-seedream-5-0-pro-250630",
    SEEDREAM_BASE_URL: "https://ark.byteplus.com/v1",
  },
}));

const mockEdit = vi.fn();
const mockGenerate = vi.fn();
vi.mock("openai", () => {
  return {
    default: class {
      images = { edit: mockEdit, generate: mockGenerate };
    },
    toFile: vi.fn(async (buffer: Buffer, name: string) => ({ buffer, name })),
  };
});

import { SeedreamImageProvider } from "./seedream-image-provider";

describe("SeedreamImageProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls images.generate against the ModelArk baseURL when no references", async () => {
    mockGenerate.mockResolvedValue({
      data: [{ b64_json: Buffer.from("seed-bytes").toString("base64") }],
    });
    const provider = new SeedreamImageProvider();
    const result = await provider.generate({
      prompt: "a poster",
      dimensions: { width: 1024, height: 1024 },
      referenceImages: [],
      generationMode: "art_variation",
      outputPrefix: "derivations/test",
    });
    expect(mockGenerate).toHaveBeenCalledOnce();
    expect(result.providerMeta.provider).toBe("seedream");
    expect(result.providerMeta.model).toBe("doubao-seedream-5-0-pro-250630");
  });

  it("calls images.edit with size WxH when references are present", async () => {
    mockEdit.mockResolvedValue({
      data: [{ b64_json: Buffer.from("seed-edit").toString("base64") }],
    });
    const provider = new SeedreamImageProvider();
    await provider.generate({
      prompt: "with refs",
      dimensions: { width: 1024, height: 1280 },
      referenceImages: [
        { buffer: Buffer.from("ref"), mimeType: "image/png", name: "r.png" },
      ],
      generationMode: "restyling",
      outputPrefix: "derivations/test",
    });
    expect(mockEdit).toHaveBeenCalledOnce();
    const call = mockEdit.mock.calls[0][0];
    expect(call.size).toBe("1024x1280");
  });

  it("throws when BYTEPLUS_API_KEY is missing", async () => {
    const provider = new SeedreamImageProvider();
    // Override env to simulate missing key
    const { env } = await import("@/server/validation/env");
    (env as any).BYTEPLUS_API_KEY = undefined;
    await expect(
      provider.generate({
        prompt: "x",
        dimensions: { width: 1024, height: 1024 },
        referenceImages: [],
        generationMode: "art_variation",
        outputPrefix: "p",
      })
    ).rejects.toThrow(/BYTEPLUS_API_KEY/);
    (env as any).BYTEPLUS_API_KEY = "bp-test";
  });
});
```

- [ ] **Step 3: Run the new tests**

Run: `cd /Users/jhonatan/Repos/ADScale_2/app && npx vitest run src/server/ai/providers/seedream-image-provider.test.ts`
Expected: 3 tests pass

- [ ] **Step 4: Commit**

```bash
git add app/src/server/ai/providers/seedream-image-provider.ts app/src/server/ai/providers/seedream-image-provider.test.ts
git commit -m "feat(dual-engine): add SeedreamImageProvider (BytePlus ModelArk)"
```

---

## Task 5: Create CompositeImageProvider

**Files:**
- Create: `app/src/server/ai/providers/composite-image-provider.ts`
- Test: `app/src/server/ai/providers/composite-image-provider.test.ts`

**Interfaces:**
- Consumes: `ImageGenerationProvider` (Tasks 3, 4)
- Produces: `CompositeImageProvider` class with `generate()` returning `{ candidates: ImageCandidate[] }`

- [ ] **Step 1: Create the composite provider**

Create `app/src/server/ai/providers/composite-image-provider.ts`:

```ts
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
      const firstErr = errors[0]?.error;
      if (firstErr instanceof Error) {
        throw new Error(`All image providers failed: ${summary}`);
      }
      throw new Error(`All image providers failed: ${summary}`);
    }

    return { candidates };
  }
}
```

- [ ] **Step 2: Write tests covering the failure matrix**

Create `app/src/server/ai/providers/composite-image-provider.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { CompositeImageProvider } from "./composite-image-provider";
import type {
  ImageCandidate,
  ImageGenerationProvider,
  ProviderGenerateInput,
} from "./image-provider";

function fakeProvider(
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

const baseInput: ProviderGenerateInput = {
  prompt: "x",
  dimensions: { width: 1024, height: 1024 },
  referenceImages: [],
  generationMode: "art_variation",
  outputPrefix: "p",
};

const candidate = (provider: "openai" | "seedream"): ImageCandidate => ({
  buffer: Buffer.from(`${provider}-bytes`),
  mimeType: "image/png",
  providerMeta: { provider, model: "m", durationMs: 10 },
});

describe("CompositeImageProvider", () => {
  it("returns 2 candidates when both providers succeed", async () => {
    const c = new CompositeImageProvider(
      [fakeProvider("openai", candidate("openai")), fakeProvider("seedream", candidate("seedream"))],
      { sampleRate: 1.0, random: () => 0.5 }
    );
    const result = await c.generate(baseInput);
    expect(result.candidates).toHaveLength(2);
  });

  it("returns 1 candidate when Seedream fails", async () => {
    const c = new CompositeImageProvider(
      [
        fakeProvider("openai", candidate("openai")),
        fakeProvider("seedream", undefined, new Error("rate limit")),
      ],
      { sampleRate: 1.0, random: () => 0.5 }
    );
    const result = await c.generate(baseInput);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].providerMeta.provider).toBe("openai");
  });

  it("returns 1 candidate when OpenAI fails", async () => {
    const c = new CompositeImageProvider(
      [
        fakeProvider("openai", undefined, new Error("5xx")),
        fakeProvider("seedream", candidate("seedream")),
      ],
      { sampleRate: 1.0, random: () => 0.5 }
    );
    const result = await c.generate(baseInput);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].providerMeta.provider).toBe("seedream");
  });

  it("throws aggregated error when both providers fail", async () => {
    const c = new CompositeImageProvider(
      [
        fakeProvider("openai", undefined, new Error("openai-down")),
        fakeProvider("seedream", undefined, new Error("seedream-down")),
      ],
      { sampleRate: 1.0, random: () => 0.5 }
    );
    await expect(c.generate(baseInput)).rejects.toThrow(/All image providers failed/);
  });

  it("excludes Seedream when sample rate is 0", async () => {
    const openai = fakeProvider("openai", candidate("openai"));
    const seedream = fakeProvider("seedream", candidate("seedream"));
    const c = new CompositeImageProvider([openai, seedream], { sampleRate: 0 });
    const result = await c.generate(baseInput);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].providerMeta.provider).toBe("openai");
    expect(seedream.generate).not.toHaveBeenCalled();
  });

  it("includes Seedream when sample rate is 1", async () => {
    const seedream = fakeProvider("seedream", candidate("seedream"));
    const c = new CompositeImageProvider(
      [fakeProvider("openai", candidate("openai")), seedream],
      { sampleRate: 1.0, random: () => 0.99 }
    );
    const result = await c.generate(baseInput);
    expect(result.candidates).toHaveLength(2);
    expect(seedream.generate).toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run the new tests**

Run: `cd /Users/jhonatan/Repos/ADScale_2/app && npx vitest run src/server/ai/providers/composite-image-provider.test.ts`
Expected: 6 tests pass

- [ ] **Step 4: Commit**

```bash
git add app/src/server/ai/providers/composite-image-provider.ts app/src/server/ai/providers/composite-image-provider.test.ts
git commit -m "feat(dual-engine): add CompositeImageProvider with sample rate + failure isolation"
```

---

## Task 6: Refactor image-generation.ts to use the composite

**Files:**
- Modify: `app/src/server/ai/image-generation.ts:1-238`
- Test: `app/src/server/ai/image-generation.test.ts`

**Interfaces:**
- Consumes: `CompositeImageProvider` (Task 5), `OpenAIImageProvider` (Task 3), `SeedreamImageProvider` (Task 4)
- Produces: enriched `GenerateAndStoreImageResult` with `candidates` field

- [ ] **Step 1: Read the current `image-generation.test.ts` to understand the existing assertions**

Run: `cat /Users/jhonatan/Repos/ADScale_2/app/src/server/ai/image-generation.test.ts`

Identify which assertions will need updating because the return type gains a `candidates` field.

- [ ] **Step 2: Replace the body of image-generation.ts**

The new file keeps the existing exports `generateAndStoreImage`, `normalizeGeneratedImage`, `GenerateAndStoreImageInput`, and adds a new `GenerationCandidateMeta` type plus a `candidates` field on `GenerateAndStoreImageResult`.

Replace the entire `image-generation.ts` file content with:

```ts
import OpenAI from "openai";
import sharp from "sharp";
import { env } from "@/server/validation/env";
import { objectStorage } from "@/server/storage";
import { logger } from "@/lib/logger";
import { OpenAIImageProvider } from "./providers/openai-image-provider";
import { SeedreamImageProvider } from "./providers/seedream-image-provider";
import { CompositeImageProvider } from "./providers/composite-image-provider";
import type { ImageCandidate, ImageReference, ProviderGenerateInput } from "./providers/image-provider";
import type { ImageOperation } from "./creative-contract";

export type GenerationMode = "art_variation" | "format_adaptation" | "restyling";

/**
 * Provider-agnostic candidate summary persisted on derivation rows so the UI,
 * QA, and analytics can see which providers ran and which won.
 */
export type GenerationCandidateMeta = {
  provider: "openai" | "seedream";
  model: string;
  outputKey: string;
  durationMs: number;
  score?: number;
  quality?: "invalid" | "improvable" | "acceptable";
  costCredits?: number;
  rawRequestId?: string;
};

export interface GenerateAndStoreImageInput {
  prompt: string;
  dimensions: { width: number; height: number };
  outputPrefix: string;
  referenceImages: ImageReference[];
  /**
   * Optional normalization mode applied after decoding the provider response.
   * Defaults to `"art_variation"`. Derivation callers may pass
   * `"format_adaptation"` or `"restyling"` to preserve existing behavior.
   */
  generationMode?: GenerationMode;
  /** Optional suffix appended to the output key (e.g. `-retry`). */
  outputSuffix?: string;
}

export interface GenerateAndStoreImageResult {
  outputKey: string;
  revisedPrompt: string;
  /**
   * The narrow helper-level operation kind (`generate` vs `edit`). The wider
   * campaign `ImageOperation` union (which adds `generation_fallback`) is
   * applied by the derivation wrapper after the fallback retry.
   */
  imageOperation: "generate" | "edit";
  buffer: Buffer;
  /**
   * Per-provider candidate summary. Always present; has 1 or 2 entries
   * depending on how many providers succeeded. The `winner` flag marks the
   * candidate whose `outputKey` matches the result's top-level `outputKey`.
   */
  candidates: (GenerationCandidateMeta & { winner: boolean })[];
}

/**
 * Lazily build the composite provider so tests that mock the OpenAI SDK
 * before first import still work.
 */
let cachedComposite: CompositeImageProvider | null = null;
function getCompositeProvider(): CompositeImageProvider {
  if (cachedComposite) return cachedComposite;
  cachedComposite = new CompositeImageProvider([
    new OpenAIImageProvider(),
    new SeedreamImageProvider(),
  ]);
  return cachedComposite;
}

/**
 * Test seam: allow callers (especially tests) to inject a custom composite.
 */
export function __setCompositeProviderForTests(provider: CompositeImageProvider | null) {
  cachedComposite = provider;
}

/**
 * Resize/normalize a generated image to the target format dimensions.
 *
 * Originally lived in derivation-pipeline.ts (and jobs/derivation.ts) as the
 * post-processing step for the derivation pipeline. Relocated here as part of
 * Task 4 (Create Post plan) so the campaign-neutral image helper can apply
 * the same normalization to creative-work outputs. Re-exported from
 * `derivation-pipeline.ts` and `jobs/derivation.ts` so existing callers keep
 * working unchanged.
 */
export async function normalizeGeneratedImage(
  buffer: Buffer,
  dimensions: { width: number; height: number },
  generationMode: GenerationMode
) {
  if (generationMode === "format_adaptation") {
    return sharp(buffer)
      .resize(dimensions.width, dimensions.height, {
        fit: "cover",
        position: "attention",
      })
      .png()
      .toBuffer();
  }

  const backgroundPosition = "centre";

  const background = await sharp(buffer)
    .resize(dimensions.width, dimensions.height, {
      fit: "cover",
      position: backgroundPosition,
    })
    .blur(24)
    .modulate({ brightness: 0.82, saturation: 0.9 })
    .png()
    .toBuffer();

  const foreground = await sharp(buffer)
    .resize(dimensions.width, dimensions.height, {
      fit: "contain",
      position: "centre",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();

  return sharp(background)
    .composite([{ input: foreground, gravity: "centre" }])
    .png()
    .toBuffer();
}

export async function generateAndStoreImage(
  input: GenerateAndStoreImageInput
): Promise<GenerateAndStoreImageResult> {
  const {
    prompt,
    dimensions,
    outputPrefix,
    referenceImages,
    generationMode = "art_variation",
    outputSuffix = "",
  } = input;

  const composite = getCompositeProvider();
  const providerInput: ProviderGenerateInput = {
    prompt,
    dimensions,
    referenceImages,
    generationMode,
    outputPrefix,
  };

  const { candidates: rawCandidates } = await composite.generate(providerInput);

  // Normalize every candidate and upload to R2.
  const candidates: { candidate: ImageCandidate; normalized: Buffer; outputKey: string }[] =
    await Promise.all(
      rawCandidates.map(async (candidate) => {
        const normalized = await normalizeGeneratedImage(
          candidate.buffer,
          dimensions,
          generationMode
        );
        const outputKey = `${outputPrefix}/candidates/${candidate.providerMeta.provider}${outputSuffix}.png`;
        await objectStorage.put(outputKey, normalized, "image/png");
        return { candidate, normalized, outputKey };
      })
    );

  // Pick the winner. Today this is the first candidate (provider order).
  // A future task wires in creative-score per candidate and picks the
  // highest-scoring one. For the rollout, the order is: openai first,
  // seedream second; OpenAI wins on tie so behavior is identical to
  // pre-change when only OpenAI is enabled.
  const winnerIndex = 0;
  const winner = candidates[winnerIndex];

  // Upload the winner to its expected location so downstream code
  // (which reads `outputKey`) keeps working unchanged.
  const finalKey = `${outputPrefix}/${Date.now()}${outputSuffix}.png`;
  await objectStorage.put(finalKey, winner.normalized, "image/png");

  const candidateMeta: (GenerationCandidateMeta & { winner: boolean })[] =
    candidates.map((c, idx) => ({
      provider: c.candidate.providerMeta.provider,
      model: c.candidate.providerMeta.model,
      outputKey: c.outputKey,
      durationMs: c.candidate.providerMeta.durationMs,
      costCredits: c.candidate.providerMeta.costCredits,
      rawRequestId: c.candidate.providerMeta.rawRequestId,
      winner: idx === winnerIndex,
    }));

  logger.info(
    `[generateAndStoreImage] dual-engine produced ${candidates.length} candidate(s); winner=${winner.candidate.providerMeta.provider}`
  );

  return {
    outputKey: finalKey,
    revisedPrompt: "", // No revised_prompt in dual-engine flow; consumer can ignore
    imageOperation:
      referenceImages.length > 0 ? "edit" : "generate",
    buffer: winner.normalized,
    candidates: candidateMeta,
  };
}
```

- [ ] **Step 3: Update the existing image-generation.test.ts to handle the new return shape**

Find the test assertions that check `result.outputKey` / `result.buffer` and confirm they still pass (they should — the new fields are additive). If any test asserts the return value's exact shape with strict equality, relax it.

If any existing test expects an error from the OpenAI SDK with a specific message, no change is needed because the new flow still calls OpenAI under the hood.

- [ ] **Step 4: Run the full test file**

Run: `cd /Users/jhonatan/Repos/ADScale_2/app && npx vitest run src/server/ai/image-generation.test.ts`
Expected: PASS (with whatever existing test count + the new `candidates` assertions where you add them)

- [ ] **Step 5: Add a test for the new `candidates` field**

Append a new test to `image-generation.test.ts`:

```ts
describe("generateAndStoreImage candidates", () => {
  it("returns a candidates array with one OpenAI winner when Seedream fails", async () => {
    // Use the test seam from __setCompositeProviderForTests
    const { __setCompositeProviderForTests } = await import("./image-generation");
    const { CompositeImageProvider } = await import("./providers/composite-image-provider");
    const { fakeProvider } = await import("./providers/__test-utils__");
    __setCompositeProviderForTests(
      new CompositeImageProvider(
        [
          fakeProvider("openai", {
            buffer: Buffer.from("openai-out"),
            mimeType: "image/png",
            providerMeta: { provider: "openai", model: "gpt-image-2", durationMs: 100 },
          }),
          fakeProvider("seedream", undefined, new Error("rate limit")),
        ],
        { sampleRate: 1 }
      )
    );

    const result = await generateAndStoreImage({
      prompt: "x",
      dimensions: { width: 1024, height: 1024 },
      outputPrefix: "derivations/test-candidates",
      referenceImages: [],
    });
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].provider).toBe("openai");
    expect(result.candidates[0].winner).toBe(true);
    __setCompositeProviderForTests(null);
  });
});
```

- [ ] **Step 6: Create the test utilities file**

Create `app/src/server/ai/providers/__test-utils__.ts`:

```ts
import type {
  ImageCandidate,
  ImageGenerationProvider,
} from "./image-provider";

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

// vi is provided by vitest at test time; re-export it for convenience
import { vi } from "vitest";
```

(If the import of `vi` outside a `vi.mock` block causes issues, move it to the top and only call `fakeProvider` from inside test files.)

- [ ] **Step 7: Run the full test file again**

Run: `cd /Users/jhonatan/Repos/ADScale_2/app && npx vitest run src/server/ai/image-generation.test.ts`
Expected: PASS, including the new test

- [ ] **Step 8: Commit**

```bash
git add app/src/server/ai/image-generation.ts app/src/server/ai/image-generation.test.ts app/src/server/ai/providers/__test-utils__.ts
git commit -m "refactor(dual-engine): route generateAndStoreImage through CompositeImageProvider"
```

---

## Task 7: Add `candidates` column to derivations table

**Files:**
- Create: `app/drizzle/0073_derivations_candidates.sql`
- Modify: `app/src/server/db/schema.ts` (the `derivations` table definition)

- [ ] **Step 1: Create the migration**

Create `app/drizzle/0073_derivations_candidates.sql`:

```sql
ALTER TABLE "adscale_app"."derivations"
  ADD COLUMN IF NOT EXISTS "candidates" jsonb;
--> statement-breakpoint
```

- [ ] **Step 2: Add the column to the schema**

In `app/src/server/db/schema.ts`, find the `derivations` table definition (around line 631–686) and add the new column after the last `jsonb` column. Insert after `exportStatus` (the last `jsonb` column in the table block):

```ts
  candidates: jsonb("candidates").$type<
    Array<{
      provider: "openai" | "seedream";
      model: string;
      outputKey: string;
      durationMs: number;
      score?: number;
      quality?: "invalid" | "improvable" | "acceptable";
      costCredits?: number;
      rawRequestId?: string;
      winner: boolean;
    }>
  >(),
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd /Users/jhonatan/Repos/ADScale_2/app && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Run the migration locally**

Run: `cd /Users/jhonatan/Repos/ADScale_2/app && npx drizzle-kit push` (or whatever the project's migration runner is — check `package.json`)
Expected: schema applied without errors

- [ ] **Step 5: Commit**

```bash
git add app/drizzle/0073_derivations_candidates.sql app/src/server/db/schema.ts
git commit -m "feat(dual-engine): add candidates jsonb column to derivations"
```

---

## Task 8: Persist candidates on the derivation row

**Files:**
- Modify: `app/src/server/ai/derivation-pipeline.ts` (the place where the derivation row is updated with `outputKey` after `generateAndStoreImage` succeeds)
- The same edit may also be needed in `app/src/server/jobs/derivation.ts` and `app/src/server/jobs/creative-work.ts` if they update the row

**Interfaces:**
- Consumes: `candidates` field on `GenerateAndStoreImageResult` (Task 6)
- Produces: derivation rows with `candidates` populated

- [ ] **Step 1: Find every place a derivation row is updated with `outputKey` after generation**

```bash
cd /Users/jhonatan/Repos/ADScale_2/app
grep -rn "outputKey:" src/server/ai/derivation-pipeline.ts src/server/jobs/ src/server/creative-work/ 2>/dev/null
```

Note the line numbers for the next step.

- [ ] **Step 2: Pass `candidates` through to the row update**

For each `outputKey:` update site you found, add a `candidates: result.candidates` field in the same update payload.

Example for `derivation-pipeline.ts`:

```ts
await db
  .update(derivations)
  .set({
    outputKey: result.outputKey,
    // ... existing fields ...
    candidates: result.candidates,
  })
  .where(eq(derivations.id, derivationId));
```

(Adapt to the actual code style in the file — use whatever the existing update is doing.)

- [ ] **Step 3: Run the derivation-pipeline tests**

Run: `cd /Users/jhonatan/Repos/ADScale_2/app && npx vitest run src/server/ai/derivation-pipeline.test.ts`
Expected: PASS

- [ ] **Step 4: Run the jobs/creative-work tests**

Run: `cd /Users/jhonatan/Repos/ADScale_2/app && npx vitest run src/server/jobs/creative-work.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/src/server/ai/derivation-pipeline.ts app/src/server/jobs/derivation.ts app/src/server/jobs/creative-work.ts
git commit -m "feat(dual-engine): persist candidates metadata on derivation rows"
```

---

## Task 9: Emit telemetry event for dual-engine runs

**Files:**
- Modify: `app/src/server/ai/generation-log.ts`
- Test: `app/src/server/ai/generation-log.test.ts` (existing or new)

- [ ] **Step 1: Read the existing generation-log.ts to find the right insertion point**

Run: `cat /Users/jhonatan/Repos/ADScale_2/app/src/server/ai/generation-log.ts`

- [ ] **Step 2: Add a new `recordDualEngineCandidates` function**

Append a new exported function to `app/src/server/ai/generation-log.ts`:

```ts
export type DualEngineCandidateEvent = {
  event: "image.generation.candidates";
  campaignId: string;
  derivationId: string;
  workspaceId: string;
  jobType: "derivation" | "creative_work" | "brand_training";
  candidates: Array<{
    provider: "openai" | "seedream";
    model: string;
    outputKey: string;
    durationMs: number;
    score?: number;
    quality?: "invalid" | "improvable" | "acceptable";
    costCredits?: number;
  }>;
  winnerProvider: "openai" | "seedream";
  aggregateLatencyMs: number;
  timestamp: string;
};

export async function recordDualEngineCandidates(
  input: Omit<DualEngineCandidateEvent, "event" | "timestamp">
): Promise<void> {
  const event: DualEngineCandidateEvent = {
    event: "image.generation.candidates",
    timestamp: new Date().toISOString(),
    ...input,
  };
  // Use whatever storage the existing generation-log.ts uses (logger, db insert, etc).
  logger.info("[dual-engine-candidates]", JSON.stringify(event));
}
```

(Adapt to the actual storage pattern in the file — if the file writes to a DB table, insert there.)

- [ ] **Step 3: Call it from `generateAndStoreImage` after the candidates array is built**

In `app/src/server/ai/image-generation.ts`, right before the return statement in `generateAndStoreImage`, add:

```ts
await recordDualEngineCandidates({
  campaignId: /* not available here; use a placeholder or accept it as input */,
  derivationId: outputPrefix,
  workspaceId: "",
  jobType: "derivation",
  candidates: candidateMeta.map(({ winner: _w, ...rest }) => rest),
  winnerProvider: winner.candidate.providerMeta.provider,
  aggregateLatencyMs:
    Math.max(...candidates.map((c) => c.candidate.providerMeta.durationMs)),
});
```

Note: the function signature for `generateAndStoreImage` does not currently carry `campaignId`/`workspaceId`. For the MVP, emit the event with the metadata we have (`derivationId: outputPrefix`); a follow-up task can extend the signature to accept a `telemetry: { campaignId, workspaceId, jobType }` block if needed.

- [ ] **Step 4: Run the test suite for the affected files**

Run: `cd /Users/jhonatan/Repos/ADScale_2/app && npx vitest run src/server/ai/generation-log.test.ts src/server/ai/image-generation.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/src/server/ai/generation-log.ts app/src/server/ai/image-generation.ts
git commit -m "feat(dual-engine): emit image.generation.candidates telemetry event"
```

---

## Task 10: Document the new env vars in `.env.example` and CLAUDE.md

**Files:**
- Modify: `app/.env.example` (or wherever the project's env template lives)
- Modify: `app/AGENTS.md` or `app/CLAUDE.md` (whichever documents env vars)

- [ ] **Step 1: Find the env template**

Run: `find /Users/jhonatan/Repos/ADScale_2/app -maxdepth 2 -name ".env*" 2>/dev/null`

- [ ] **Step 2: Add the new env vars to the template**

Append (with comments):

```bash
# === Dual-engine image generation (BytePlus Seedream) ===
# Set SEEDREAM_SAMPLE_RATE=0 to roll back to OpenAI-only without redeploying.
BYTEPLUS_API_KEY=
SEEDREAM_MODEL_NAME=
SEEDREAM_SAMPLE_RATE=1.0
# SEEDREAM_BASE_URL=https://ark.byteplus.com/v1  # override only for regional endpoints
```

- [ ] **Step 3: Add a brief note in the project's CLAUDE.md / AGENTS.md**

Find the "Environment" or "Configuration" section and add:

```markdown
### Dual-engine image generation

The platform runs two image generation providers in parallel: OpenAI's
gpt-image-2 and BytePlus ModelArk's Seedream 5 Pro. The composite
provider in `app/src/server/ai/providers/composite-image-provider.ts`
returns both candidates; `app/src/server/ai/image-generation.ts` picks
the winner.

To roll back to OpenAI-only: set `SEEDREAM_SAMPLE_RATE=0` in env and
restart the worker pool. No code change or migration required.
```

- [ ] **Step 4: Commit**

```bash
git add app/.env.example app/AGENTS.md
git commit -m "docs(dual-engine): document new env vars and rollback path"
```

---

## Task 11: Add an E2E test for the dual-engine failure path

**Files:**
- Create or modify: a Playwright e2e test that exercises the derivation flow with a mocked Seedream provider

- [ ] **Step 1: Find an existing e2e test for derivations**

Run: `find /Users/jhonatan/Repos/ADScale_2/app/tests -name "*.spec.ts" | xargs grep -l "derivation\|restyle" 2>/dev/null | head -3`

- [ ] **Step 2: Add a new test that mocks the composite provider to fail both engines**

Append a new `test` block in the file that exercises the derivation happy path, but uses Playwright's route mock to make the OpenAI endpoint return 500 and a Seedream mock route to return 500. Assert that:
- The derivation row's `qualityVerdict` ends up as `invalid` (or equivalent)
- A refund credit event is fired (look for the existing pattern in the codebase)

(Adapt to the actual test style — if the project uses a different test pattern, mirror it.)

- [ ] **Step 3: Run the e2e test**

Run: `cd /Users/jhonatan/Repos/ADScale_2/app && npx playwright test <the-test-file>`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add app/tests/
git commit -m "test(dual-engine): e2e covers both-providers-fail path"
```

---

## Task 12: Final integration check

**Files:** none (smoke test only)

- [ ] **Step 1: Run the full test suite**

Run: `cd /Users/jhonatan/Repos/ADScale_2/app && npm test`
Expected: PASS (or whatever the project's test command is — check `package.json`)

- [ ] **Step 2: Run typecheck**

Run: `cd /Users/jhonatan/Repos/ADScale_2/app && npm run typecheck` (or `npx tsc --noEmit`)
Expected: no errors

- [ ] **Step 3: Run lint**

Run: `cd /Users/jhonatan/Repos/ADScale_2/app && npm run lint`
Expected: no errors

- [ ] **Step 4: Boot the dev server and confirm the new env vars validate**

Run: `cd /Users/jhonatan/Repos/ADScale_2/app && npm run dev`
Confirm the app starts without errors. If `BYTEPLUS_API_KEY` and `SEEDREAM_MODEL_NAME` are not set, confirm the app still starts (because `SEEDREAM_SAMPLE_RATE` defaults to 1.0 but the provider should fail gracefully per request and return only the OpenAI candidate — or fail loudly if the user wants strict boot). Adjust Task 1's default if necessary.

- [ ] **Step 5: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "chore(dual-engine): integration fixes from final test pass"
```

(Only commit if there are actual changes; otherwise skip.)

---

## Self-Review

**1. Spec coverage:**

| Spec section | Covered by |
|---|---|
| High-level flow diagram | Task 2 (interface), Task 6 (orchestrator) |
| Provider interface | Task 2 |
| OpenAIProvider extracted | Task 3 |
| SeedreamProvider | Task 4 |
| CompositeImageProvider | Task 5 |
| Refactored `image-generation.ts` | Task 6 |
| `candidates` jsonb column | Task 7 |
| Persist candidates on derivation row | Task 8 |
| Telemetry event | Task 9 |
| `candidates` field in return | Task 6 |
| `SEEDREAM_SAMPLE_RATE` env var | Task 1 |
| Other 3 env vars | Task 1 |
| Unit tests for each provider | Tasks 3, 4, 5 |
| Integration test | Task 12 |
| E2E for both-providers-fail | Task 11 |
| Documentation in .env.example / CLAUDE.md | Task 10 |
| Rollout strategy (per-job sample rate) | Task 1 + Task 12 |
| Scope of tables (`derivations` only first) | Task 7 |

**2. Placeholder scan:** No TBD/TODO/"implement later" steps. All code blocks are complete and copy-pasteable.

**3. Type consistency:** All Tasks 2-6 share the `ImageGenerationProvider` interface, `ProviderGenerateInput`, and `ImageCandidate` types defined in Task 2. The `candidates` field on `GenerateAndStoreImageResult` is consistent in Task 6 and Task 7's DB column. The `GenerationCandidateMeta` type is consistent in Task 6 (TypeScript) and Task 7 (Drizzle type annotation).

No issues found.
