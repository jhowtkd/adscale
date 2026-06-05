# Phase 48: End-to-End UAT and Verification - Context

**Gathered:** 2026-06-01
**Status:** Ready for planning
**Mode:** discuss --auto (roadmap defaults, no user interview)

<domain>
## Phase Boundary

This phase **proves v11.1** with repeatable fixtures, automated checks, production build, and browser/manual visual review. It does not add product features.

The phase delivers (UAT-01..04):
- **UAT-01:** Documented, repeatable local scenario that verifies **1:1 → 9:16** and **1:1 → 4:5** format adaptation on a real campaign asset.
- **UAT-02:** Documented restyling scenario that verifies **unrelated style-reference factual claims are not copied** into the output.
- **UAT-03:** Focused test suite passes for prompt contracts, post-processing, creative contract resolution, scoring/QA classification, and workspace error mapping.
- **UAT-04:** `npm run build` passes; at least one **browser/manual** check confirms outputs are inspectable through the campaign workspace.

This phase does **not** own:
- New generation modes, prompt redesign, or quality-gate logic (Phases 44–46).
- Workspace UI implementation (Phase 47) — Phase 48 **verifies** it when present; UAT-04 manual steps assume Phase 47 shipped.
- Full compare-mode / side-by-side diff UI (REV-01 backlog).
- CI pipeline changes unless required to run the documented UAT commands.

**Prerequisites:** Phases 44–47 complete (or 47 explicitly waived with residual risk recorded). Phase 48 may reference Phase 44 visual evidence as a baseline but must record **post-milestone** verification status in `48-UAT.md`.

</domain>

<decisions>
## Implementation Decisions

### Evidence artifact (all UAT requirements)

**Decision:** Single milestone evidence doc **`.planning/phases/48-end-to-end-uat-and-verification/48-UAT.md`** (mirror structure of `44-UAT.md`).

Sections (required):
1. **Environment** — Node version, `app/` cwd, dev DB, Inngest dev URL, OpenAI model id used.
2. **UAT-01 — Format adaptation** — campaign/asset IDs, derivation IDs or generation commands, output URLs/paths, visual verdicts for 4:5 and 9:16.
3. **UAT-02 — Restyling factual isolation** — fixture description, style vs base contradiction, derivation ID, visual + QA/gate notes.
4. **UAT-03 — Automated tests** — exact command, pass count, list of test files exercised.
5. **UAT-04 — Build + browser** — build log summary; manual checklist with campaign URL and what was inspected.
6. **Residual risks** — model non-determinism, inconclusive visuals, known follow-ups (separate **fixed** vs **accepted risk** vs **deferred**).

Planner may add `48-VERIFICATION.md` during verify-phase; not required in discuss output.

### UAT-01: Format adaptation fixture

**Decision:** Reuse the **canonical UAT campaign** from research and Phase 44:

| Field | Value |
|-------|-------|
| Campaign ID | `fd018597-f2c8-49f5-86d9-7ca82267605c` |
| Base asset ID | `0c87205c-d7f6-4915-ab4b-ec5c4ae0b2e0` |
| Prior accepted 4:5 derivation | `bb4da8fe-a9e3-401e-a42f-6067275e3cdb` |
| Prior accepted 9:16 derivation | `e9029139-4099-45ed-99cf-5955097ee8f1` |

**Repeatability path (auto default):**
1. **Regression path (minimum):** Re-open existing outputs in workspace + re-run visual checklist from `44-UAT.md` hard criteria (no blurred bands, no pasted square poster, portrait-feed spacing for 4:5, vertical zones for 9:16). Record pass/fail in `48-UAT.md`.
2. **Refresh path (recommended if Phases 46–47 changed job/UI):** Queue two new `format_adaptation` derivations (4:5, 9:16) via the same pattern as Phase 44 Plan 02 — Inngest dev `derivation.generate` with real API — document new IDs and R2/local paths under `tmp/phase-48-uat/` (gitignored).

**Pass criteria:** Both formats show **native layout** per Phase 44 success criteria; dimensions 1080×1350 (4:5) and 1080×1920 (9:16) after `normalizeGeneratedImage`.

**Fail handling:** If model/API fails, record concrete error in `48-UAT.md` (do not mark UAT-01 satisfied without evidence or documented blocker).

### UAT-02: Restyling factual-source fixture

**Decision:** **Contradiction fixture** — base creative and style reference must encode **distinct factual claims** (e.g. different offer text, brand name, or course title visible in the image). Output must preserve **base** facts; style reference supplies **palette/typography/layout** only.

**Fixture setup (auto default):**
- **Option A (preferred):** Dedicated UAT campaign in dev DB with:
  - One `base` asset (factual set A),
  - One `style_reference` asset (factual set B, visually distinct),
  - Brief aligned with base facts only.
- **Option B:** Extend `fd018597` only if a suitable style_reference asset already exists; otherwise create Option A.

**Generation:** `generationMode: "restyling"`, explicit `styleAssetId` on derivation create / Inngest event (Phase 45 contract path).

**Verification layers (all required in `48-UAT.md`):**
| Layer | Check |
|-------|--------|
| Prompt/contract | `buildDerivationPrompt` includes RESTYLING factual-source rule when `styleAssetId` set (already unit-tested in Phase 45). |
| Automated QA | `styleFidelity` / information-preservation signals on completed derivation (gate may mark `invalid` if style facts leak). |
| Visual/manual | Human confirms output does **not** display style-only claims (price/brand/offer/CTA from B) unless also on base. |

**Pass criteria:** No unrelated style-reference factual claims in output; base offer/brand/CTA preserved. **Fail** if obvious contamination (document with screenshots in `tmp/phase-48-uat/`).

### UAT-03: Focused automated tests

**Decision:** Run from `app/`:

```bash
cd app && npm test && npm run build
```

**Minimum test files** (must pass; expand only if regressions found):

| Concern | File(s) |
|---------|---------|
| Prompt contracts, CTA semantics, restyling rules | `src/server/ai/prompt-builder.test.ts` |
| Creative contract resolution | `src/server/ai/creative-contract.test.ts` |
| Post-processing (`normalizeGeneratedImage`, format_adaptation no-blur) | `src/server/jobs/derivation.test.ts` |
| QA prompts / styleFidelity | `src/server/ai/creative-qa.test.ts` |
| Quality gate classification | `tests/unit/ai/creative-quality-gate.test.ts`, `tests/unit/ai/creative-quality-gate-orchestration.test.ts` |
| Workspace error mapping (Phase 47) | `src/lib/campaign-load-error.test.ts` (or path chosen in Phase 47) |

**Optional dev script alignment:** `app/scripts/test-creatives.ts` should call the same `classifyCreativeQualityGate` / gate orchestration as production (Phase 46 handoff) — run once locally only if planner wants script parity evidence; not a substitute for `npm test`.

**Record in `48-UAT.md`:** vitest summary line (files passed, total tests). If any file is skipped because Phase 47 is incomplete, list under **Residual risks** — do not claim UAT-03 fully satisfied.

### UAT-04: Build and browser/manual workspace check

**Build:** `cd app && npm run build` must exit 0. Capture last lines or CI-equivalent success note in `48-UAT.md`.

**Browser/manual (auto default checklist):**

| Step | Expectation |
|------|-------------|
| Open `/campaigns/fd018597-f2c8-49f5-86d9-7ca82267605c` (or dedicated restyling campaign) | Page loads without generic-only error when API is healthy (WUI-01) |
| Gallery | Completed derivations visible; invalid outputs show verdict badge + hard failures (WUI-02) |
| Preview / review | Modal or review surface shows mode, format, CTA contract, base asset, style ref when restyling (WUI-03) |
| Invalid output | “Regenerar com correções” pre-fills feedback; child preserves mode/format (WUI-04) |
| Inspect outputs | At least one 4:5 or 9:16 and one restyling (if generated) — zoom/preview usable |

**Tooling:** Manual browser (local `npm run dev`) or `agent-browser` / Playwright smoke — planner picks one; evidence is narrative + optional screenshot paths, not a new E2E suite unless trivial.

**Pass criteria:** User (or verifier) can **inspect generated outputs through the campaign workspace** without reading server logs.

### Verification notes structure (roadmap SC #5)

**Decision:** `48-UAT.md` ends with three subsections:

1. **Fixed in v11.1** — behaviors proven by this UAT (format native layout, contract-aware prompts, gate invalid vs improvable, workspace diagnostics).
2. **Remaining model-risk** — non-deterministic visual drift, edge layouts, inconclusive runs.
3. **Follow-up scope** — REV-01 compare UI, REPAIR-01, export blocking, extra campaign archetypes.

### Claude's Discretion

- Whether UAT-01 uses regression-only vs fresh generations.
- Restyling fixture campaign ID and asset upload method (UI vs script).
- Contact sheet generation under `tmp/phase-48-uat/`.
- Adding a thin `app/scripts/uat-v11.mjs` wrapper vs documenting copy-paste commands only.
- Running `npm run lint` in addition to test/build (recommended, not a separate requirement id).

</decisions>

<canonical_refs>
## Canonical References

### Milestone requirements
- `.planning/REQUIREMENTS.md` — UAT-01 through UAT-04
- `.planning/ROADMAP.md` — Phase 48 scope and success criteria
- `.planning/PROJECT.md` — v11.1 milestone goal

### Prior phase evidence and contracts
- `.planning/phases/44-native-format-adaptation/44-UAT.md` — format adaptation baseline IDs and visual criteria
- `.planning/phases/44-native-format-adaptation/44-CONTEXT.md` — FMT hard rules
- `.planning/phases/45-creative-contract-and-restyling/45-CONTEXT.md` — restyling factual-source, styleAssetId
- `.planning/phases/46-hard-quality-gate/46-CONTEXT.md` — verdict fields, test-creatives gate parity
- `.planning/phases/47-workspace-review-and-error-feedback/47-CONTEXT.md` — WUI manual verification steps for UAT-04

### Research
- `.planning/research/SUMMARY.md` — Phase 48 rationale (model behavior needs visual evidence)
- `.planning/research/PITFALLS.md` — restyling contamination, hidden contract pitfalls

</canonical_refs>

<code_context>
## Existing Code Insights

### Format UAT already exists (Phase 44)

- `44-UAT.md` documents campaign `fd018597`, base asset, and accepted derivations `bb4da8fe` (4:5) and `e9029139` (9:16).
- `derivation.test.ts` guards `format_adaptation` post-processing (no blur/composite/contain).
- Contact sheet path referenced: `tmp/phase-44-format-uat/contact-sheet.png` (local, gitignored).

### Restyling UAT not yet centralized

- Unit coverage: `prompt-builder.test.ts` (RESTYLING factual-source), `creative-qa.test.ts` (styleFidelity), `creative-contract.test.ts`.
- No milestone-level `*-UAT.md` for restyling visual proof — Phase 48 owns UAT-02 doc + run.

### Quality gate and dev script

- `creative-quality-gate.ts` + tests under `app/tests/unit/ai/`.
- `app/scripts/test-creatives.ts` imports gate classifiers (Phase 46) — useful for offline image folder runs, not CI.

### Workspace verification depends on Phase 47

- Prior pain: generic **“Erro ao carregar campanha”** while outputs existed (`SUMMARY.md` Phase 47).
- `47-CONTEXT.md` specifies `DerivationReviewModal`, typed load errors, verdict on cards — UAT-04 manual steps assume these exist.

### Commands

| Command | Cwd | Purpose |
|---------|-----|---------|
| `npm test` | `app/` | UAT-03 |
| `npm run build` | `app/` | UAT-04 |
| `npm run dev` | `app/` | Browser manual |
| Inngest dev + `derivation.generate` | local | Optional fresh UAT-01/02 generations |

</code_context>

<specifics>
## Specific Ideas (from roadmap / research)

- Primary UAT campaign: `fd018597-f2c8-49f5-86d9-7ca82267605c` (original “faixas” complaint campaign).
- Phase 48 closes the milestone loop started in Phase 44 visual UAT — **re-verify after** quality gate and workspace changes.
- Restyling UAT should use **intentionally conflicting** base vs style facts (PITFALLS.md) — not same-brand references.
- Distinguish **automated pass** (UAT-03/04 build) from **visual accept** (UAT-01/02/04 browser) in `48-UAT.md`.
- Portuguese UI labels for invalid/improvable are Phase 47; UAT-04 confirms they appear in manual check.

</specifics>

<deferred>
## Deferred Ideas

- Automated Playwright E2E for full derive → review → export → **out of scope** (audit P2 backlog).
- Additional campaign archetypes (product-heavy, text-heavy) in UAT — note as follow-up, not blocking v11.1.
- `48-VERIFICATION.md` goal-backward report — created during `/gsd-verify-work` or plan checker, not discuss.
- Per-platform safe-area overlay UAT — REV-02.
- Blocking export for invalid derivations — explicitly out of scope (Phase 46).

</deferred>

---

*Phase: 48-end-to-end-uat-and-verification*
*Context gathered: 2026-06-01*
