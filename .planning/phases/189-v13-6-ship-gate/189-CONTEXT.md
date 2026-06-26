# Phase 189 Context — v13.6 Ship Gate

## Why This Phase Exists

v13.6 implemented the guided chat journeys, but the audit correctly kept the milestone `not_shippable`.

Resolved P0s:
- Production build no longer pulls server repository code into the client bundle.
- Drizzle journal includes migration `0058_assistant_guided_flow`.

Still open:
- QA-04 only proved the `/assistant` entry cards, not first action-card confirmation in the browser.
- Live diagnosis/auto-briefing quality still needs staging human verification with real assets/provider behavior.

## Scope

- Add an authenticated Playwright smoke that renders a guided assistant action card and confirms it through the browser confirmation path.
- Normalize planning docs so v13.6 is not simultaneously marked `shipped` and `not_shippable`.
- Keep staging/human verification explicit if it cannot be proven locally.

## Out of Scope

- Real OpenAI quality judgment for diagnosis/briefing.
- Real Inngest lifecycle smoke.
- New guided journey product behavior beyond release verification.
