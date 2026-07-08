# Dual-Engine Image Generation

**Date:** 2026-07-08
**Status:** Approved design
**Scope:** Server-side image generation pipeline (derivation, creative-work, brand-training)

## Problem

ADScale generates all static ad creative images through a single provider: OpenAI's `gpt-image-2`. This creates two business problems:

1. **Reproduction failures** — the gpt-image-2 model has observable weaknesses in two areas that matter for ad creative: (a) preserving the exact appearance of branded products/objects across restyling and format adaptations, and (b) replicating a base creative's scene composition faithfully into a new format. Operators compensate via manual retries, but the underlying capability gap remains.
2. **Provider single point of failure** — rate limits, regional outages, content moderation differences, or model deprecations on OpenAI's side translate directly into failed derivations for users, even when the QA gate, scoring, and refund logic are all working correctly.

Seedream 5 Pro (ByteDance / BytePlus ModelArk) launched in 2026 and is positioned to be materially better at the two reproduction failure modes. We want to harness it **alongside** gpt-image-2 rather than as a replacement, so we keep the strengths of both engines and avoid coupling the product to a single vendor.

## Goals

- Run two image generation providers (OpenAI gpt-image-2 and Seedream 5 Pro) in parallel for every derivation, then let the existing quality gate / scoring choose the best candidate.
- Improve the reproduction rate of branded products and base-creative composition without regressing art direction, style, or cost predictability.
- Keep the existing public API surface and downstream contracts (`generateAndStoreImage()` signature, derivation aggregate status, refund flow) intact — the dual-engine capability must be invisible to consumers and reversible by config.
- Ship to production immediately, behind a sample-rate knob (not a per-workspace feature flag).

## Non-goals

- Replacing the OpenAI provider with Seedream. Both run; OpenAI is the floor.
- A user-facing UI change. The cockpit, derivation review, and export flow do not change.
- A new scoring rubric. The existing `creative-score.ts` evaluates each candidate individually; no new "compare two images" judge.
- Per-workspace feature flags. A global sample rate is enough to control rollout and rollback.
- Adding a third provider. The interface is designed to allow it later, but only two are built now.
- Image-to-image reference fidelity tuning (e.g. reference strength knobs). We use whatever defaults each provider exposes.

## Architecture

### High-level flow

```
                                      ┌──────────────────────────┐
                                      │  existing consumers      │
                                      │  - derivation-pipeline   │
                                      │  - creative-work         │
                                      │  - brand-training        │
                                      └────────────┬─────────────┘
                                                   │ generateAndStoreImage()
                                                   ▼
                          ┌────────────────────────────────────────┐
                          │  image-generation.ts (refactored)       │
                          │  - resolve target dimensions            │
                          │  - call CompositeImageProvider          │
                          │  - normalize all candidates             │
                          │  - upload all to R2                     │
                          │  - score each candidate in parallel     │
                          │  - return winner + candidates metadata  │
                          └────────────┬───────────────────────────┘
                                       │
                          ┌────────────▼─────────────────────────┐
                          │      CompositeImageProvider          │
                          │  Promise.allSettled([openai, seed])  │
                          │  returns { candidates: [1..2] }       │
                          │  one provider failing ≠ job failing  │
                          └────────┬──────────────────┬──────────┘
                                   │                  │
                          ┌────────▼──────┐  ┌───────▼──────────┐
                          │ OpenAIProvider│  │ SeedreamProvider │
                          │ (gpt-image-2) │  │ (seedream-5-...) │
                          └───────────────┘  └──────────────────┘
```

### Provider interface

New module `app/src/server/ai/providers/image-provider.ts`:

```ts
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

export type ProviderGenerateInput = {
  prompt: string;
  dimensions: { width: number; height: number };
  referenceImages: { buffer: Buffer; mimeType: string; name: string }[];
  generationMode: "art_variation" | "format_adaptation" | "restyling";
  outputPrefix: string;
  seed?: number;
};

export interface ImageGenerationProvider {
  readonly name: "openai" | "seedream";
  generate(input: ProviderGenerateInput): Promise<ImageCandidate>;
}
```

### OpenAIProvider

`app/src/server/ai/providers/openai-image-provider.ts` — extracted from the current `image-generation.ts`. Preserves the existing `isGptImage2` size-mapping logic, `toOpenAISdkImageSize()`, and the `edit` vs `generate` branching. Wraps the existing 5-minute `withTimeout` and surfaces the model name from `env.OPENAI_IMAGE_MODEL`.

### SeedreamProvider

`app/src/server/ai/providers/seedream-image-provider.ts` — new. Talks to BytePlus ModelArk via an OpenAI-compatible client (`baseURL: https://ark.byteplus.com/v1`, `apiKey: env.BYTEPLUS_API_KEY`, `model: env.SEEDREAM_MODEL_NAME`).

- Uses `openai.images.generate()` / `openai.images.edit()` against the ModelArk endpoint, so the request shape is the same as OpenAI.
- Uploads `referenceImages[]` as base64 in the `image[]` field of the edit request. (If the live ModelArk endpoint rejects base64, the provider falls back to uploading to R2 first and passing URLs — the rest of the pipeline is unaware of this detail.)
- Owns its own `withTimeout` budget (5 minutes, same ceiling as OpenAI) and its own retry policy.
- Maps ModelArk-specific errors to the same error classes OpenAI surfaces, so the composite provider can treat failures uniformly.

### CompositeImageProvider

`app/src/server/ai/providers/composite-image-provider.ts` — new. Calls both providers via `Promise.allSettled`, collects successes, and returns `{ candidates: ImageCandidate[] }` containing 1 or 2 entries.

Failure semantics:

| OpenAI | Seedream | Result |
|---|---|---|
| ok | ok | 2 candidates |
| ok | fail (rate limit / 5xx / content) | 1 candidate (OpenAI), error logged with context |
| fail | ok | 1 candidate (Seedream), error logged with context |
| fail | fail | throw aggregate error; existing retry/refund pipeline handles |

A sample-rate env var `SEEDREAM_SAMPLE_RATE` (0.0–1.0, default 1.0) controls how often Seedream is included. When the rate excludes a job, only OpenAI runs. The default keeps both engines on for every job; a workspace operator can drop to 0.0 to roll back without redeploying.

### Refactored `image-generation.ts`

The public function `generateAndStoreImage()` keeps the same signature, but its body now:

1. Resolves target dimensions and prompt as today.
2. Calls `CompositeImageProvider.generate()`.
3. Applies `normalizeGeneratedImage()` to each candidate buffer.
4. Uploads each normalized candidate to R2 under `candidates/<outputPrefix>/<provider>.png`.
5. Scores each candidate in parallel using the existing `creative-score.ts`.
6. Picks the winner by highest score; ties broken by lower latency, then by provider order (OpenAI first).
7. Uploads the winner to its expected `outputPrefix` location (preserving today's R2 key shape for downstream consumers).
8. Returns the winner plus a `candidates` array describing all evaluated outputs.

The downstream pipeline (`derivation-pipeline.ts`, `creative-work`, `brand-training`) does not change its call site — it still receives a single image, plus an enriched return value with the candidates metadata.

## Data Model

The `derivation_outputs` table (or the equivalent `creative_work_outputs` table, depending on which job is calling) gains a new nullable column:

```ts
candidates: jsonb  // [{ provider, model, r2Key, score, quality, latencyMs, costCredits }, ...]
```

Migration characteristics:

- **Additive only.** Existing rows keep `candidates = null` and the pipeline continues to work.
- **Backwards-compatible reads.** If `candidates` is null, the UI and analytics treat the output as a single-provider result.
- No change to `image_url`, `quality`, `score`, or any other existing column.

The same `candidates` column is added to any other table that stores image generation outputs and currently has a single `image_url`. Tables in scope are discovered during implementation (start with the derivation outputs table; expand to creative-work and brand-training outputs only if they share the same image-generation entry point).

## Telemetry

A new event is emitted to the existing `generation-log.ts` after each dual-engine generation:

```ts
{
  event: "image.generation.candidates",
  campaignId, derivationId, workspaceId, jobType,
  candidates: [
    { provider, model, latencyMs, score, quality, costCredits, r2Key },
    ...
  ],
  winnerProvider: "openai" | "seedream",
  winnerScore: number,
  aggregateLatencyMs,
}
```

This joins the existing telemetry stream and surfaces in the cockpit's owner analytics view without any new dashboard work. The QA team can compute, from these events:

- Win rate per provider
- Per-provider average score
- Per-provider quality-gate pass rate
- p50 / p95 latency per provider
- Cost per candidate vs. score gain

No new dashboard is built in this scope; the events are enough to support ad-hoc analysis and a future dedicated panel.

## Error Handling

Per provider, separately. The composite provider never throws because one engine failed; only throws when both fail. The downstream retry pipeline (`derivation-auto-retry.ts`) already handles a derivation that produced no usable output, and the refund logic refunds credits for failed outputs — both work unchanged.

Each provider also maps its own provider-specific errors:

- OpenAI: 429 (rate limit), 5xx, content policy violations, timeout — already mapped today.
- Seedream: equivalent mapping. The provider's error class carries the original error message and the request ID for log correlation.

When both providers fail on the same job, the composite error includes the first provider's error and a list of all provider errors so the existing logging surfaces enough context for ops triage.

## Cost

Adding a second provider can double image generation cost per derivation. Mitigations:

- `SEEDREAM_SAMPLE_RATE` lets ops dial Seedream in or out globally.
- The `costCredits` recorded per candidate feeds back into the billing/usage forecast pipeline so per-derivation cost tracking stays accurate.
- If Seedream is materially cheaper than gpt-image-2 (TBD with real pricing), the average cost per derivation may not move; the worst case is the sample rate covers a temporary period of dual pricing.

We do not build per-workspace cost splitting in this scope; the credit deduction already happens once at the aggregate level, and Seedream participation is treated as a quality investment rather than a separately billed feature.

## Configuration

New env vars (added to `app/src/server/validation/env.ts` with Zod validation):

| Env var | Type | Default | Purpose |
|---|---|---|---|
| `BYTEPLUS_API_KEY` | string | (required when `SEEDREAM_SAMPLE_RATE > 0`) | BytePlus ModelArk API key |
| `SEEDREAM_MODEL_NAME` | string | (required) | Exact model ID from ModelArk console (e.g. `doubao-seedream-5-0-pro-250...`) |
| `SEEDREAM_SAMPLE_RATE` | number 0..1 | `1.0` | Probability of including Seedream in a generation |
| `SEEDREAM_BASE_URL` | string | `https://ark.byteplus.com/v1` | Override only if BytePlus exposes a regional endpoint |

All four are required at startup when `SEEDREAM_SAMPLE_RATE > 0`; the app refuses to boot otherwise with a clear error. When `SEEDREAM_SAMPLE_RATE = 0`, the env vars are optional (and the Seedream provider is not even instantiated).

## Testing

### Unit

- `OpenAIProvider` — extracted from the current `image-generation.test.ts`; behavior must match the current `generateAndStoreImage` for every existing fixture.
- `SeedreamProvider` — mocked HTTP client; covers success, rate limit, content policy, timeout, malformed response.
- `CompositeImageProvider` — covers the four scenarios in the failure-semantics table; verifies that one failure does not throw; verifies the aggregate throw when both fail.

### Integration

- End-to-end derivation with both providers active (mocked at the HTTP boundary), verifying that:
  - The output row has `candidates` populated with 2 entries.
  - The winner's `image_url` matches the highest-scoring candidate.
  - The downstream quality gate runs against the winner (not the candidates).
- End-to-end with `SEEDREAM_SAMPLE_RATE = 0`, verifying behavior reverts to the single-provider flow with no schema-level regressions (i.e. `candidates` is null for those rows, or has 1 entry — TBD during implementation, whichever matches the existing analytics expectations).

### E2E (Playwright)

- New scenario: both providers fail → derivation row goes to `invalid` → refund credit event fires (covers the failure path that today only happens with OpenAI down).
- Existing e2e flows for derivation, creative-work, and brand-training must pass unchanged.

### Manual / staging

- Run a representative batch (e.g. 20 derivations across art_variation, restyling, format_adaptation) with both providers active. Compare win rate, average score, and operator "approve" rate vs. the previous single-provider baseline.
- Confirm reproduction quality of branded products and base-creative composition against the operator's eye test.

## Rollout & Rollback

- **Rollout:** ship behind `SEEDREAM_SAMPLE_RATE = 1.0` immediately (per the user's "production direct, no flag" decision). The first 100 derivations are observed in the cockpit's owner analytics view to confirm the win rate is non-degenerate.
- **Rollback:** set `SEEDREAM_SAMPLE_RATE = 0` (env-only change, redeploy not required if the app reads env at request time, otherwise a redeploy) → Seedream is skipped on every job, OpenAI runs alone, behavior reverts to pre-change. No data migration needed for the rollback path.
- **Targeted dial-back:** set the rate to 0.1 or 0.5 to gather more data per ratio. Useful during the first week to understand cost vs. quality tradeoffs.

## Open Questions for Implementation

These are explicit decisions to make in the implementation plan, not blockers for the design:

1. Whether the `candidates` column should be added to all image-output tables upfront, or only `derivation_outputs` first and the others in a follow-up.
2. The exact ModelArk model ID string for `SEEDREAM_MODEL_NAME` (user confirmed it exists in the console; the implementation will read it from env at boot and fail fast if missing).
3. Whether to upload reference images to R2 as URLs (more robust against byte limits) or send as base64 (simpler) — the SeedreamProvider picks one, with a fallback to the other if the live API rejects it.

## Future Work (out of scope)

- A third provider (e.g. Imagen 4, Flux Pro) when the interface has proven it stays clean.
- Per-workspace provider preference (e.g. "I trust Seedream more for my product line").
- A dedicated "provider comparison" dashboard in the cockpit.
- Per-provider prompt tuning (some providers may benefit from different prompt phrasing; not addressed in this scope).
- Caching of generated images across providers — would let us serve a winner from a cache if the same job re-runs.
