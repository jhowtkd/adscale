# Phase 47: Workspace Review and Error Feedback - Context

**Gathered:** 2026-06-01
**Status:** Ready for planning
**Mode:** discuss --auto (roadmap defaults, no user interview)

<domain>
## Phase Boundary

This phase makes the **campaign workspace diagnosable**: users can tell whether a problem is **access/loading** vs **output quality**, inspect **contract context** when reviewing a derivation, and **regenerate with failure reasons** without reading server logs.

The phase delivers (WUI-01..04):
- Typed campaign workspace load errors when the API returns `code` (auth, workspace, not found, timeout, server).
- Derivation gallery cards that surface **hard failures** vs **polish suggestions** with clear next steps (Phase 46 fields consumed in UI).
- A **review surface** (preview/detail) showing generation mode, target format, CTA contract, base asset, and style reference when relevant.
- Regenerate/retry flows that **pre-fill feedback** from hard failures / `regenerationSuggestion` while preserving mode/format/CTA on the server.

This phase does **not** own:
- New quality-gate classification logic (Phase 46).
- Creative contract resolution or prompt changes (Phases 45–46).
- Full side-by-side source/target asset diff or compare-mode UX completion (Phase 29 partial; REV-01 backlog).
- E2E visual UAT fixtures (Phase 48).

Prerequisite: Phase 46 persists `qualityVerdict`, `hardFailures`, `polishSuggestions`, and `regenerationSuggestion` on derivation API reads. Phase 47 **maps and renders** them; it must not re-run the gate in the browser.

</domain>

<decisions>
## Implementation Decisions

### Campaign load error taxonomy (WUI-01)

Introduce a small client helper (recommended: `app/src/lib/campaign-load-error.ts`) that classifies fetch failures from `GET /api/campaigns/[id]`:

| UI kind | HTTP / signal | API `code` (when present) | User-facing intent |
|---------|---------------|---------------------------|-------------------|
| `session` | 401 | `unauthorized` | Re-login; `apiFetch` already redirects to `/login` — workspace page should not flash generic error after redirect |
| `workspace` | 403 | `noWorkspace`, `forbidden` | Wrong/missing workspace membership; link to settings or campaigns list |
| `not_found` | 404 | `campaignNotFound` | Keep `CampaignNotFoundState`; distinct copy from generic error |
| `timeout` | `AbortError`, `TimeoutError`, fetch failed with timeout | (none) | Retry button + “connection timed out” |
| `server` | 500, 503 | `internalError`, `generationWorkerUnavailable` | Retry + support hint (`errorId` in dev only) |
| `unknown` | Other / missing code | — | Generic message + retry (fallback only) |

**Changes:**
- `fetchCampaign` in `use-campaigns.ts` must throw a **typed error** `{ kind, code?, status?, message }` parsed from JSON `{ error, code }`, not only `Error(message)`.
- `useCampaign` exposes `errorKind` (or parsed error) alongside `isError`.
- Replace single `CampaignErrorState` with **variant props** (`kind`, `onRetry`) or dedicated subcomponents sharing layout.
- `campaigns/[id]/page.tsx`: map `bootstrapError`, `isError`, and `!campaign` separately — do not treat all as the same “Erro ao carregar campanha”.
- Add i18n keys under `campaign.errors.*` (pt-BR + en); stop hardcoding Portuguese in `fetchCampaign` fallbacks.

**Rule:** When API returns a known `code`, show the matching localized title/body. When signal is timeout/network without JSON, show timeout variant. Never show “campaign not found” for 403 workspace errors.

### Derivation card quality surfacing (WUI-02)

Wire Phase 46 fields through the workspace data path:

1. `use-derivations.ts` types already include `qualityVerdict`, `hardFailures`, `polishSuggestions`.
2. `use-campaign-workspace.ts` `allDerivations` mapper must pass these fields (and `regenerationSuggestion`) into card props / mock `Derivation` shape.
3. `DerivationCard.tsx` displays verdict-driven UI:

| `qualityVerdict` | Card treatment | Primary next step |
|------------------|----------------|-------------------|
| `invalid` | Prominent badge **“Saída inválida”** (rose); list up to 3 `hardFailures[].message`; cap score via `scoreCappedForDisplay` | **Regenerar com correções** (uses WUI-04 feedback) |
| `improvable` | Badge **“Melhoria sugerida”** (amber); show first `polishSuggestions` or `scoreIssues[0]` | Optional regenerate; approve allowed (server already allows) |
| `acceptable` | Existing score chip only (no alarm badge) | Standard actions |

**Hard vs polish:** Never show only `qualityScore` for invalid outputs. `qaStatus` colors remain supplementary; **verdict badge is primary** (Phase 46: `qaStatus` ≠ approval gate).

**Approve / reference / delivery:** When user triggers actions blocked by API 409 (`derivationHardFailures`), show toast with first hard-failure message — do not silently fail.

**Derivation list load errors:** If `useDerivations` fails, show inline banner on workspace (not full-page campaign error) using `fetchDerivations` error mapping — same `code` pattern as campaigns.

### Output review surface (WUI-03)

**Decision:** Implement **`DerivationReviewModal`** opened from card **Preview** (`onPreview(derivationId)`), replacing the current toast-only `handlePreview` in `use-campaign-workspace.ts`.

**Modal content (minimum contract panel):**

| Field | Source | Display |
|-------|--------|---------|
| Generation mode | `derivation.generationMode` | Localized label (`art_variation` / `format_adaptation` / `restyling`) |
| Target format | `derivation.format` | Aspect label |
| CTA contract | `derivation.ctaText` + mode | Show text; if empty on format/restyling, show “herdado do criativo base” per CNTR-03 semantics |
| Base asset | campaign pilot asset or `parentId` chain | Thumbnail + filename when `useCampaignAssets` resolves |
| Style reference | `styleAssetId` on derivation row (when restyling) | Thumbnail or “não informado” |
| Quality | `qualityVerdict`, `hardFailures`, `polishSuggestions` | Same copy as card, expanded list in modal |

**Layout:** Image left (or top on mobile), contract + quality panel right; footer: Close, Regenerate (with failures), Approve/Reject if completed.

**Compare:** Do not block this phase on Phase 29 compare selection mode. If `DerivationComparisonModal` is still absent, ship review modal first; compare button may remain disabled or hidden until a follow-up — document in planner tasks, not scope creep into multi-derivation compare.

### Regenerate with carried failure reasons (WUI-04)

**Decision:** One-click **“Regenerar com correções”** builds feedback server-side preference order:

1. `regenerationSuggestion` from API (already structured from hard failures in Phase 46).
2. Else concatenate `hardFailures` codes + messages.
3. Else user-editable textarea in confirm step (existing `review.feedbackPlaceholder` pattern).

**Client:** `onRegenerate(id, feedback)` already posts to `POST /api/derivations/[id]/regenerate` with `{ feedback }`. Pre-fill that string; user may edit in a small dialog before submit.

**Server (verify only, minimal change):** Regenerate route already copies `generationMode`, `format`, `ctaText` to child derivation. Job must pass `feedback` into prompt (already on derivation row). Planner confirms `buildHardFailureRegenerationSuggestion` output is stored on parent and reused when feedback omitted — optional enhancement: default feedback from parent `regenerationSuggestion` when body empty.

**Invalid outputs:** Primary CTA on card and review modal is regenerate with failures; de-emphasize approve (disabled or tooltip explaining 409).

### Portuguese product copy (roadmap / Phase 46 handoff)

| Key concept | pt-BR label |
|-------------|-------------|
| Invalid | Saída inválida |
| Improvable | Melhoria sugerida |
| Hard failure list title | Problemas que impedem uso |
| Polish list title | Sugestões de melhoria |
| Regenerate with fixes | Regenerar com correções |

English keys mirror under `derivation.quality.*` or `review.*`.

### Claude's Discretion

- Single `CampaignErrorState` with variants vs separate components.
- Whether review modal also opens from failed card overlay “Tentar novamente”.
- Asset thumbnail resolution (signed URL vs placeholder) when keys missing.
- Collapse contract panel into accordion on narrow viewports.
- Unit tests: `campaign-load-error.test.ts`, `DerivationCard` verdict badges, review modal smoke test.

</decisions>

<canonical_refs>
## Canonical References

### Milestone requirements
- `.planning/REQUIREMENTS.md` — WUI-01 through WUI-04
- `.planning/ROADMAP.md` — Phase 47 scope and success criteria
- `.planning/PROJECT.md` — v11.1 workspace error visibility goal

### Prior phase contracts
- `.planning/phases/46-hard-quality-gate/46-CONTEXT.md` — verdict fields, approve 409, regeneration suggestion structure, UI deferred to this phase
- `.planning/phases/45-creative-contract-and-restyling/45-CONTEXT.md` — CTA semantics, base vs style assets
- `.planning/phases/29-comparacao-lado-a-lado/29-CONTEXT.md` — compare UX intent (modal metadata); implementation may lag

### Research
- `.planning/research/SUMMARY.md` — Phase 47 rationale (generic load error hid real outputs)
- `.planning/research/ARCHITECTURE.md` — Pattern 3: gallery surfaces hard failures + actions

</canonical_refs>

<code_context>
## Existing Code Insights

### Campaign errors are collapsed today

- `fetchCampaign` throws `new Error(err.error || "Erro ao carregar campanha")` — **discards `code`**.
- `page.tsx`: `isError` → `CampaignErrorState` (single string `errorLoadingCampaign`); `!campaign` → `CampaignNotFoundState`.
- API `GET campaigns/[id]` returns `apiError("campaignNotFound", 404)` and `handleApiError` maps auth to `unauthorized` / `forbidden` / `noWorkspace`.
- `apiFetch` redirects on 401 before React Query surfaces error.

### Quality fields exist server-side but not in workspace UI

- `use-derivations.ts` includes `qualityVerdict`, `hardFailures`, `polishSuggestions`.
- `use-campaign-workspace.ts` mapper **omits** these fields when building `allDerivations`.
- `DerivationCard.tsx` shows `qualityScore` + `qaStatus` only; **no verdict badge**.
- `app/src/lib/derivation-quality.ts` exports `scoreCappedForDisplay` — unused in components.

### Preview / review is a stub

- `handlePreview` → toast `openingComparison` only; no modal.
- Phase 29 planned `DerivationComparisonModal` — **not present** in `app/src/components/workspace/`.
- Card has Compare button wired but compare flow not connected on campaign page.

### Regenerate partially wired

- `DerivationCard` can pass `regenerationSuggestion` as feedback on one action.
- Generic regenerate button calls `onRegenerate(id)` **without** feedback.
- `use-regenerate.ts` posts optional `feedback`; server creates child with same mode/format/cta.

### Integration points

| Location | Change |
|----------|--------|
| `app/src/lib/hooks/use-campaigns.ts` | Typed fetch errors + `errorKind` |
| `app/src/lib/campaign-load-error.ts` | New classifier (recommended) |
| `app/src/components/campaigns/CampaignErrorState.tsx` | Variants + retry |
| `app/src/app/(dashboard)/campaigns/[id]/page.tsx` | Branch on error kind |
| `app/src/lib/hooks/use-campaign-workspace.ts` | Map quality fields; real `handlePreview` |
| `app/src/components/workspace/DerivationCard.tsx` | Verdict UI + next steps |
| `app/src/components/workspace/DerivationReviewModal.tsx` | New review surface (recommended) |
| `app/messages/pt-BR.json`, `en.json` | `campaign.errors`, `derivation.quality` |
| Tests | Card + error mapper + modal render |

</code_context>

<specifics>
## Specific Ideas (from roadmap / UAT)

- Primary pain observed in research: UAT campaign workspace showed generic **“Erro ao carregar campanha”** while outputs were fine — users could not inspect quality issues (SUMMARY Phase 47).
- Distinguish **load failure** from **invalid output** visually (different page regions: full-page vs card/modal).
- Reuse UAT campaign `fd018597-f2c8-49f5-86d9-7ca82267605c` for manual verification after implementation.
- Approve blocked on invalid (409) — UI should explain why, not look like a bug.

</specifics>

<deferred>
## Deferred Ideas

- Full two-derivation compare mode + `DerivationComparisonModal` completion → backlog / Phase 29 follow-up or REV-01.
- Side-by-side **source vs output** pixel diff → REV-01.
- Per-workspace configurable quality thresholds in UI → REV-03.
- Blocking export for invalid outputs → out of scope (export remains allowed per Phase 46).
- Automatic retry of failed **campaign fetch** with exponential backoff → nice-to-have, not required for WUI-01.
- Multi-turn image repair loop → REPAIR-01.

</deferred>

---

*Phase: 47-workspace-review-and-error-feedback*
*Context gathered: 2026-06-01*
