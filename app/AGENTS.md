<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Environment

### Image generation

The platform uses OpenAI GPT Image 2 as its only image provider. Keep the
provider seam because local E2E tests inject a deterministic implementation.
Candidate metadata remains part of the canonical result so route-level
generation and ranking can store multiple OpenAI candidates without changing
downstream persistence contracts.

### Creative work (home composer)

Standalone creative flows use the `creative_work` aggregate (ADR 0013), not campaigns:

- **UI:** `src/components/creative-work/` (`CreativeComposer`, `BrandInspirations`)
- **API:** `/api/creative-work/*` — create draft, attach sources, generate outputs
- **Jobs:** `creativeWorkOutputJob`, `creativeWorkSourceAnalyzeJob` (Inngest)
- **Library:** `/library` lists workspace assets with `excludeSources` for curated inspirations
