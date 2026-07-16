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
