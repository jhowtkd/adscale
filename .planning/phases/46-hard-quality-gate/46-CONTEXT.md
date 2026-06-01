# Phase 46: Hard Quality Gate - Context

**Gathered:** 2026-06-01
**Status:** Ready for planning
**Mode:** discuss --auto (roadmap defaults, no user interview)

<domain>
## Phase Boundary

This phase makes **contract-invalid outputs actionable** by separating **blocking hard-rule failures** from **advisory polish suggestions**, running that classification automatically when a derivation completes, and ensuring scoring/regeneration cannot mask invalid ads.

The phase delivers:
- A typed hard-failure taxonomy aligned with QA-02 (CTA drift, wrong brand, unsupported offer, copied style facts, cropped critical content, unreadable required text, invalid format layout).
- Persisted `hardFailures`, `polishSuggestions`, and `qualityVerdict` on every completed derivation after the job finishes.
- Score/QA normalization so a high `qualityScore` cannot imply the output is approvable when hard failures exist.
- Regeneration suggestions structured from hard failures while preserving `CreativeContract` (mode, target format, CTA semantics, base/style assets).
- Automated tests with at least one invalid fixture per major hard-failure type (including visually polished but contract-invalid cases).

This phase does **not** own full workspace UX for cards, compare view, or campaign load errors — that is Phase 47. Phase 46 must persist and expose API fields so Phase 47 can render them without re-running analysis.

Prerequisite: Phase 45 `CreativeContract` is resolved once in the derivation job and passed to prompt, scoring, and manual QA. Phase 46 extends that pipeline with a **quality gate** step and shared classification logic.

</domain>

<decisions>
## Implementation Decisions

### Hard failure vs polish (QA-01, QA-02)

Introduce a single server module (recommended: `app/src/server/ai/creative-quality-gate.ts`) that classifies output quality **after** vision scoring/QA checklist results exist, using the same `CreativeContract` as generation.

**Hard failures (blocking contract violations)** — stored as a typed array:

| Code | Trigger (minimum) | Source signal |
|------|-------------------|---------------|
| `cta_drift` | CTA missing, replaced, or contradicts contract | `ctaOffer` checklist `failed`, or scoring `ctaClarity` below threshold with explicit CTA contract |
| `wrong_brand` | Client/brand in image contradicts contract | `briefMatch` `failed` with brand/client mismatch note, or dedicated model flag |
| `unsupported_offer` | Offer/claim not in contract | `briefMatch` / `ctaOffer` `failed` for unsupported claims |
| `copied_style_reference_facts` | Restyling-only: factual claims from style ref | `styleFidelity` checklist `failed` |
| `cropped_critical_content` | Logo, product, face, legal, CTA zone cropped/hidden | `informationPreservation` `failed` |
| `unreadable_required_text` | Required CTA/offer/headline illegible | `legibility` `failed` |
| `invalid_format_layout` | Format adaptation: bands, pasted poster, crowded modules, non-native layout | `formatFit` `failed` when `generationMode === format_adaptation` |

**Polish suggestions (advisory only)** — stored separately:
- Checklist `warning` on `briefMatch`, `creativeRisk`, `formatFit` (non-adaptation), `variationLevelFit`, subjective score issues without a hard code.
- `scoreIssues` entries that do not map to a hard-failure code.
- Model “regenerationSuggestion” prose when no hard failure fired.

**Rule:** Any criterion mapped to a hard code with `failed` status → hard failure. `warning` alone never produces a hard failure. `creativeRisk: failed` becomes hard only when the note indicates an **unsupported factual claim** (`unsupported_offer`); otherwise it stays polish.

### Blocking vs advisory (QA-01, QA-05)

| Action | Hard failures present | Polish only |
|--------|----------------------|-------------|
| Approve derivation (`PATCH .../review`) | **Block** — HTTP 409 with `derivationHardFailures` | Allowed |
| Save as reference | **Block** — 409 | Allowed |
| Start delivery package from derivation | **Block** — 409 | Allowed |
| Export individual / ZIP | **Allowed** — output flagged `qualityVerdict: invalid` (user may still download; matches existing “QA copilot” export policy) | Allowed |
| Regenerate | **Allowed** — encouraged; suggestion must list hard failure codes | Allowed |

**Quality verdict** (new persisted field, not optional for completed derivations):
- `invalid` — one or more hard failures.
- `improvable` — no hard failures; polish suggestions and/or score &lt; threshold (default: score &lt; 70 or any checklist warning).
- `acceptable` — no hard failures; score ≥ 70; no blocking checklist failures.

Users must be able to tell **invalid** vs **improvable** from API fields before approve/export (QA-05). Full card copy and badges are Phase 47; Phase 46 must return `qualityVerdict`, `hardFailures`, and `polishSuggestions` on derivation reads.

### Automatic quality analysis (QA-01)

Add an Inngest step **`quality-gate`** immediately after **`score-derivation`** in `app/src/server/jobs/derivation.ts`:
1. Reuse the same normalized image buffer and `CreativeContract` from the job.
2. Run vision analysis once for gate purposes (may share/refactor `analyzeDerivationCreative` + `analyzeCreativeQa` outputs, or one combined JSON call — planner’s discretion).
3. Classify hard vs polish; persist via repository update.
4. Non-blocking on failure: log warn, set `qualityVerdict` to `improvable` and empty hard failures rather than failing the job.

Manual `POST /api/derivations/[id]/qa` on **approved** derivations may remain for optional re-check, but must call the **same classifier** so results stay consistent. Do not maintain two divergent QA philosophies.

### Score no longer hides hard failures (QA-03)

- Keep storing the model’s numeric `qualityScore` for analytics.
- When `hardFailures.length > 0`, force `qualityVerdict = invalid` regardless of score.
- Downstream UI (Phase 47) shows invalid state prominently; Phase 46 adds optional `scoreCappedForDisplay` in API mapper as `min(qualityScore, 59)` when invalid — planner may implement either capped display helper or verdict-only; **verdict is source of truth**.

Scoring prompt update: instruct the model that contract violations must appear in `scoreIssues` with explicit wording and must not be offset by high `visualQuality`.

### Regeneration from hard failures (QA-04)

Extend `buildRegenerationSuggestion` (or parallel `buildHardFailureRegenerationSuggestion`) to accept:
```ts
hardFailures: Array<{ code: CreativeHardFailureCode; message: string }>;
contract: CreativeContract;
```

Output structure:
1. `Hard failures: [code1, code2].`
2. Per-failure fix instructions (from classifier messages).
3. Existing contract preservation tail from Phase 45 (CTA semantics text, format, mode, base/style asset IDs).

Regenerate API and Inngest retry must pass the stored suggestion (or reconstruct from persisted hard failures + contract on the derivation row).

### Data model

Add to `derivations` (Drizzle migration):
- `qualityVerdict`: `text` — `invalid` | `improvable` | `acceptable`
- `hardFailures`: `jsonb` — `{ code, message, criterion? }[]`
- `polishSuggestions`: `jsonb` — `string[]`
- `qualityGatedAt`: `timestamp`

Do not overload `qaStatus` as the hard gate; `qaStatus` remains the assistive checklist summary. `qualityVerdict` is the approval gate.

### Test fixtures (roadmap success #5)

Add unit tests under `app/src/server/ai/` with **normalized mock vision JSON** (no live OpenAI in unit tests):
- At least one fixture per hard-failure code in QA-02.
- Include **“high score, invalid contract”** case: `qualityScore: 88` + `ctaOffer: failed` → `qualityVerdict: invalid`.
- Restyling: `styleFidelity: failed` with unrelated discount in note → `copied_style_reference_facts`.
- Format adaptation: `formatFit: failed` with blur-band note → `invalid_format_layout`.

Optional: extend `app/scripts/test-creatives.ts` blocking logic to use the shared classifier (already has `blockingIssues` pattern).

### Claude's Discretion

- Single vs dual vision API calls for score + gate (cost/latency tradeoff).
- Exact numeric threshold for `improvable` vs `acceptable` when no hard failures.
- Whether `POST /qa` remains approved-only or also allowed on `completed` with invalid verdict.
- Migration naming and whether to backfill `qualityVerdict` for existing rows (`acceptable` default).
- Fixture images on disk vs inline JSON only for tests.

</decisions>

<canonical_refs>
## Canonical References

### Milestone requirements
- `.planning/REQUIREMENTS.md` — QA-01 through QA-05 (quality gate and regeneration)
- `.planning/ROADMAP.md` — Phase 46 scope and success criteria
- `.planning/PROJECT.md` — v11.1 milestone intent (automatic quality gates, actionable bad outputs)

### Architecture and pitfalls
- `.planning/research/ARCHITECTURE.md` — Pattern 3: Hard Failures vs Polish Suggestions; data flow through scoring/QA/UI
- `.planning/research/PITFALLS.md` — Pitfall 4 (score hides hard failures); integration table scoring vs QA

### Prior phase contracts
- `.planning/phases/45-creative-contract-and-restyling/45-CONTEXT.md` — `CreativeContract`, CTA semantics, style fidelity (deferred hard blocking to this phase)
- `.planning/phases/44-native-format-adaptation/44-CONTEXT.md` — format layout failure examples (blur bands, pasted poster)

### Product docs (historical; export stays permissive)
- `docs/plans/2026-05-16-creative-qa-before-export-design.md` — assistive QA UX; export-not-blocked policy for warnings (hard invalid is stricter on **approve**, not export API)

### Implementation anchors
- `app/src/server/ai/creative-contract.ts` — contract types
- `app/src/server/ai/creative-score.ts` — scoring and `buildRegenerationSuggestion`
- `app/src/server/ai/creative-qa.ts` — checklist criteria including `styleFidelity`
- `app/src/server/jobs/derivation.ts` — post-complete `score-derivation` hook
- `app/src/app/api/derivations/[id]/review/route.ts` — approve path to guard
- `app/src/components/workspace/DerivationCard.tsx` — current score + manual QA display (Phase 47 extends)

</canonical_refs>

<code_context>
## Existing Code Insights

### Scoring runs automatically; QA does not

After `generate-and-store-output`, `derivation.ts` runs **`score-derivation`** (heuristic then `analyzeDerivationCreative` with `contract`). There is **no** automatic QA step. `qaStatus` defaults to `pending` until the user runs `POST /api/derivations/[id]/qa` on an **approved** derivation (409 otherwise).

### Checklist criteria already map to QA-02 themes

`creative-qa.ts` defines: `legibility`, `ctaOffer`, `informationPreservation`, `briefMatch`, `formatFit`, `creativeRisk`, and conditional `styleFidelity` (restyling). Prompt explicitly says “Export must remain allowed” — Phase 46 must extend the model JSON schema to emit **hardFailureCandidates** or rely on post-classification from checklist `failed` states without changing export API behavior.

### Quality score shown without validity context

`DerivationCard.tsx` displays `qualityScore` with labels (`scoreStrong` / `scoreWeak`) but has **no** `qualityVerdict` or hard-failure badge. Manual QA shows `qaStatus` colors only after user-triggered QA on approved items.

### Regeneration suggestion partially contract-aware

`buildRegenerationSuggestion` in `creative-score.ts` already appends mode, format, CTA, and restyling asset IDs when `contract` is passed. It does not yet consume structured hard-failure codes.

### Approval is unguarded

`review/route.ts` approves any completed derivation without checking QA or score issues.

### Script precedent for blocking classification

`app/scripts/test-creatives.ts` already aggregates `blockingIssues` from QA status, score issues, and preflight — useful reference for unified classifier behavior in CI/dev scripts.

### Integration points

| Location | Change |
|----------|--------|
| `app/src/server/jobs/derivation.ts` | New `quality-gate` step after scoring |
| `app/src/server/ai/creative-quality-gate.ts` | New classifier + types (recommended) |
| `app/src/server/ai/creative-qa.ts` | Prompt/schema alignment for failure detection |
| `app/src/server/ai/creative-score.ts` | Score issues must reflect contract violations; regen input |
| `app/src/server/repositories/derivation.ts` | Persist new fields |
| `app/src/server/db/schema.ts` | Migration for verdict + failures |
| `app/src/app/api/derivations/[id]/review/route.ts` | 409 on approve when invalid |
| `app/src/lib/hooks/use-derivations.ts` | Types for new fields (UI in 47) |
| Tests: `creative-qa.test.ts`, `creative-score.test.ts`, new gate tests, `derivation.test.ts` job step |

</code_context>

<specifics>
## Specific Ideas (from roadmap / UAT)

- Primary user pain: outputs that **look good** (score 70+) but violate CTA, brand, offer, or format contract — must surface as **invalid**, not “weak score”.
- Portuguese product copy direction (Phase 47): distinguish **“Saída inválida”** vs **“Melhoria sugerida”** — Phase 46 uses English codes in API; i18n keys deferred to 47.
- Reuse UAT campaign `fd018597-f2c8-49f5-86d9-7ca82267605c` outputs as manual fixture references for format/restyling failures when building test JSON.
- `test-creatives.ts` quality aggregation should call the same gate function to avoid drift between dev script and production path.

</specifics>

<deferred>
## Deferred Ideas

- Derivation card / grid badges, failure tooltips, and “next step” CTAs → **Phase 47** (WUI-02, WUI-03, WUI-04).
- Campaign page load error taxonomy → **Phase 47** (WUI-01).
- Side-by-side source/target contract review UI → future REV-01.
- Per-workspace quality threshold for warnings vs blocking → future REV-03.
- Multi-turn image repair loop → future REPAIR-01.
- Blocking export at API level → out of scope (export remains allowed; invalid flag + Phase 47 warning UX).
- Full E2E visual UAT fixtures → **Phase 48** (UAT-01..04).

</deferred>

---

*Phase: 46-hard-quality-gate*
*Context gathered: 2026-06-01*
