<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Environment

### Dual-engine image generation

The platform runs two image generation providers in parallel: OpenAI's
gpt-image-2 and BytePlus ModelArk's Seedream 5 Pro. The composite
provider in `app/src/server/ai/providers/composite-image-provider.ts`
returns both candidates; `app/src/server/ai/image-generation.ts` picks
the winner.

To roll back to OpenAI-only: set `SEEDREAM_SAMPLE_RATE=0` in env and
restart the worker pool. No code change or migration required.

#### MVP winner selection (known limitation, follow-up scheduled)

The MVP orchestrator picks the first candidate in provider order (OpenAI
on tie). Both candidates are persisted to the `derivations.candidates`
jsonb column and uploaded to R2 under `candidates/<provider>.png`, so
no work is lost — but the winner is not selected by score today. A
follow-up will wire `creative-score.ts` per candidate and select the
highest-scoring one; the telemetry event `image.generation.candidates`
is structured to support that addition without a schema change.

The MVP is shipped because: (a) Seedream participation is gated by
`SEEDREAM_SAMPLE_RATE` so cost is controlled, (b) the existing quality
gate + scoring already runs on the chosen output downstream, and (c) the
win-rate metric in the telemetry event is acceptable to read as
"OpenAI always wins today" until per-candidate scoring lands.
