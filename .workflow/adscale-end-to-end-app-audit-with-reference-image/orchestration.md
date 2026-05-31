# Orchestration: ADScale end-to-end app audit with reference image

## Execution Rules

- Keep the original objective intact.
- Ask for approval before risky, expensive, external, or destructive actions.
- Keep immediate blocking work local.
- Delegate only bounded, disjoint, materially useful packets.
- Integrate packet results before final verification.

## Branching Rules

1. If the app does not start, record the blocker and inspect fallback routes or tests that can still be verified locally.
2. If auth or external services are required, use the live UI to confirm where the flow breaks and document the dependency explicitly.
3. If the reference image maps to an existing feature, test the exact matching flow first, then probe adjacent flows exposed by the same screen.
4. If a screen exposes ambiguous actions, inspect source or nearby routes before guessing the intent.

## Packet Prompts

### Packet 1: Live discovery
Objective: map the app surface, key routes, and main task entry points.
Do: inspect the app routes, route groups, and page files that correspond to user-facing flows.
Do not: change code or assume hidden features exist.
Expected output: a short route map and a list of candidate flows to smoke test.

### Packet 2: Reference-image test design and smoke
Objective: turn the provided image into concrete UI and workflow checks.
Do: identify what the image implies about the expected ad, offer, CTA, and layout; then exercise the matching app flow in the browser.
Do not: invent product behavior that the UI does not expose.
Expected output: a test script, observations from the browser, and any gaps between the reference and the app.

### Packet 3: Findings and improvements
Objective: synthesize issues, missing functions, and recommended improvements.
Do: rank issues by severity and note positive findings worth keeping.
Do not: duplicate raw notes without synthesis.
Expected output: final audit report content and improvement list.

## Completion Audit

- The app was opened in a browser.
- The reference image informed the test cases.
- Findings include both usability and functional observations.
- The report distinguishes blockers, major issues, and polish items.
