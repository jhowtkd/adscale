<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Environment

### Image generation

The platform uses OpenAI GPT Image 2 as its only **image-generation** provider.
Keep the provider seam because local E2E tests inject a deterministic
implementation. Candidate metadata remains part of the canonical result so
route-level generation and ranking can store multiple OpenAI candidates without
changing downstream persistence contracts.

Seedream 5 Pro Layerize is not a generator. It is an optional post-approval
export of an already selected Peça (`src/server/layerize/`,
`creative-work.layerize`) available to workspace members only through an
active `layer_editor_v1` entitlement, per the accepted 2026-08-21 native
Layer Editor decision. Diagnostic ZIP remains platform-owner/ops-only. It
must stay disabled when its provider configuration is absent and must not
enter generation routing or fallback.

### Creative work (home composer)

Standalone creative flows use the `creative_work` aggregate (ADR 0013), not campaigns:

- **UI:** `src/components/creative-work/` (`CreativeComposer`, `BrandInspirations`)
- **API:** `/api/creative-work/*` — create draft, attach sources, generate outputs
- **Jobs:** `creativeWorkOutputJob`, `creativeWorkSourceAnalyzeJob` (Inngest)
- **Library:** `/library` lists workspace assets with `excludeSources` for curated inspirations
