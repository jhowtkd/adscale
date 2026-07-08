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
