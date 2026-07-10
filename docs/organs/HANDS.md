# Hands — Organ Deep Dive

> Character-level map of ADScale image production (Touch).  
> Parent atlas: [`../COGNITIVE-ATLAS.md`](../COGNITIVE-ATLAS.md) · ADR: [`../adr/0012-cognitive-atlas.md`](../adr/0012-cognitive-atlas.md)  
> Sibling deep dive: [`CORTEX.md`](./CORTEX.md)  
> Version: **v0.1** · 2026-07-10

---

## 1. What Hands are

Hands **fabricate pixels**. They receive a decided request (campaign API or Cortex-confirmed action), assemble a prompt from Gaze / Taste / Memory / Contract, call image providers, store outputs in R2, then hand off to **Gaze ⟂ Skin** via the quality gate.

They do not chat (Cortex), do not own art constitution (Gaze), and do not own export policy (Skin).

| Layer | Path |
|-------|------|
| Job spine | `app/src/server/jobs/derivation.ts` — `derivationJob` |
| Gesture helpers | `app/src/server/ai/derivation-pipeline.ts` |
| Prompt assembly | `app/src/server/ai/prompt-builder.ts` |
| Dual-engine fingers | `app/src/server/ai/image-generation.ts` + `ai/providers/` |
| Sibling muscle | `app/src/server/creative-work/` + `jobs/creative-work.ts` |

**Event:** `derivation.generate` (Inngest)  
**Job id:** `generate-derivation`

---

## 2. Who wakes Hands

Anything that sends `derivation.generate` after Energy has been spent (or policy allows):

| Source | Examples |
|--------|----------|
| **Cortex handlers** | `quick_restyle`, `quick_format_adapt`, `quick_regenerate`, `quick_package`, `generate_creative_triplet`, `revise_creative`, `revise_creative_annotations`, `start_complete_campaign`, `generate_goal_package` |
| **Classic APIs** | `POST /api/campaigns/[id]/derivations`, restyle, regenerate, delivery-package children |

Energy is charged at the **API / confirm boundary**, not inside the Inngest step. Hands may **refund** on eligible failures (`refundPolicy`, creative_revision paths).

---

## 3. One gesture (`derivationJob`)

File: `jobs/derivation.ts` (~1400 lines). Concurrency: 8 account / 3 per workspace. Retries: 2.

```text
onFailure
  → mark-failed, sync Cortex action, optional refund, notify, Sentry

happy path
  1. init-generation-log
  2. check-idempotency (skip if already completed)
  3. mark-processing + realtime status
  4. load campaign, plan, asset, parent, brand kit, competitors, client profile
  5. fetch-client-references
  6. parallel:
       · fetch-brand-memory          → Memory
       · fetch-campaign-memory       → Memory
       · load-prompt-calibration     → Taste + Marrow corpus_quality
  7. generate-and-store-output
       · resolve mode / source package / restyling assets
       · buildGenerationPromptContext
       · executeGenerationStep → prompt-builder → image-generation → R2
       · persist prompt provenance, candidates
  8. mark-completed + realtime + notifications
  9. create-creative-version (if Cortex creative_revision)
 10. score-derivation
 11. quality-gate                 → Gaze ⟂ Skin
 12. capture-corpus-candidate     → Marrow (on fail / sample)
 13. auto-retry-on-text-failure   (optional second generate)
 14. finalize-goal-derivation     → Cortex agent
 15. track-usage + finalize-generation-log
```

Realtime: `derivationChannel({ derivationId }).status` (processing / completed / failed).

---

## 4. Modes of touch

| Mode | Meaning | Source package |
|------|---------|----------------|
| `art_variation` | Vary art from campaign base | `campaign_asset` |
| `format_adaptation` | Refit format (often from approved parent) | `approved_derivation` when parent output exists |
| `restyling` | Apply style reference onto base | Requires base + `style_reference` assets |
| `creative_revision` | Cortex iteration child (job flag / mode) | Tied to artifact lineage + action |

Sibling path **creative-work** (social post): fixed copy contract → generate base → **deterministic** `composeExactBrandAssets` (sharp). Same family of Hands, different muscle (`creativeWorkOutputJob`).

---

## 5. Lobes (module map)

### 5.1 Spine — `jobs/derivation.ts`

Owns Inngest steps, idempotency, notifications, Cortex action sync, goal finalize, corpus capture trigger, auto-retry orchestration. Does **not** own provider SDKs directly — delegates to pipeline + image-generation.

### 5.2 Gesture — `ai/derivation-pipeline.ts`

| Export | Job |
|--------|-----|
| `buildGenerationPromptContext` | Shape formerly inlined in the job → stable input for `buildDerivationPrompt` |
| `executeGenerationStep` | Prompt (+ optional auto-retry suffix) → `generateAndStoreImage` |
| `normalizeGeneratedImage` | Re-exported from image-generation |

`GenerationReferenceInput`: `none` | `single` | `restyling` (base + style buffers).

### 5.3 Prompt — `ai/prompt-builder.ts`

Cognitive stack (order matters):

```text
identity as derivation engine
  → hard rules (locale, format)
  → canonical Contract + integrity
  → input source classification + allowed entities
  → restyling transfer rules (if restyling)
  → Gaze: buildGenerationDirectionSection (Olhar + client voice)
  → Taste: brandTasteSection
  → Marrow: corpusQualitySection
  → brand kit / preflight / competitors (mode-gated)
  → Memory: brand memory block + campaign memory block
  → per-mode rules, plan hooks, feedback, CTA, diagnosis…
```

Hands **execute** criteria injected by other organs; they do not invent Gaze/Taste policy.

### 5.4 Fingers — `ai/image-generation.ts` + `providers/`

```text
CompositeImageProvider
  → OpenAIImageProvider
  → SeedreamImageProvider   (gated by SEEDREAM_SAMPLE_RATE)
  → normalize each candidate (sharp)
  → upload candidates to R2 (allSettled — one R2 fail ≠ kill job)
  → pick winner (MVP: provider order / first success; per-candidate score is follow-up)
  → return outputKey + candidates[] metadata
```

`normalizeGeneratedImage`: format_adaptation uses cover+attention; other modes use blurred cover background + contain foreground.

### 5.5 Contract tissue — `ai/creative-contract.ts` (+ canonical)

Sacred facts, CTA semantics, fidelity level, generation mode on the contract. Prompt and gate both read it. Not a full organ card yet (see atlas “outside”).

### 5.6 Score & gate handoff

| Step | Module | Organ |
|------|--------|-------|
| `score-derivation` | `creative-score.ts` | analytics / issues (not primary art truth) |
| `quality-gate` | `creative-quality-gate.ts` | **Gaze** + **Skin** dual verdict |
| `capture-corpus-candidate` | `human-quality/candidate-capture.ts` | **Marrow** |
| auto-retry | `derivation-auto-retry.ts` + policy | Hands second attempt on text/export-ish failures |

### 5.7 Sibling — `creative-work/`

| File | Job |
|------|-----|
| `prompt.ts` | Fixed copy contract + brand kit / identity rules |
| `composite.ts` | Exact brand asset overlay after generation |
| `jobs/creative-work.ts` | Generate → composite → score; refund on low quality |

---

## 6. Dual engine notes

- Both candidates persist under `candidates/<provider>.png` and on `derivations.candidates` jsonb.
- Telemetry event `image.generation.candidates` supports future win-rate by score.
- Rollback to OpenAI-only: `SEEDREAM_SAMPLE_RATE=0` (no code change).
- Documented in `app/AGENTS.md` (dual-engine section).

---

## 7. Auto-retry

After first quality gate, if `shouldAutoRetryDerivation` says yes:

1. Build correction feedback from hard failures / QA.  
2. `executeGenerationStep` with `autoRetry.correctionFeedback` and `-retry` output key.  
3. Re-score + re-gate.  
4. Emit beta analytics (`derivation-auto-retry-telemetry`).

Policy lives in `derivation-auto-retry-policy.ts` — Hands retry; they still do not redefine Gaze/Skin.

---

## 8. Nerves to the rest of the body

| Direction | Organ | How |
|-----------|-------|-----|
| In | **Cortex** | `assistantActionId`, `goalRunId`, `refundPolicy` on event |
| In | **Energy** | Already spent; refunds on failure when allowed |
| In | **Taste / Marrow** | `loadPromptCalibrationContext` |
| In | **Memory** | brand + campaign memory blocks |
| In | **Gaze** | direction section inside prompt-builder |
| In | **Contract** | creative contract on derivation / campaign |
| Out | **Gaze ⟂ Skin** | `runCompletedDerivationQualityGate` |
| Out | **Marrow** | corpus candidate capture |
| Out | **Cortex** | `syncAssistantActionFromJob`, `finalizeGoalDerivation`, artifact versions |
| Out | **Human / UI** | realtime status, email, in-app notification |

---

## 9. Safety & ops invariants

1. **Idempotency** — completed derivation is not regenerated by a replayed event.  
2. **No large blobs across Inngest steps** — download/generate/store stay inside one step.  
3. **User-safe errors** — `derivation-error-sanitizer.ts`; technical detail → logs/Sentry.  
4. **Restyling requires two assets** — missing base or style → hard throw.  
5. **Parent factual lineage** — format adaptation from parent asserts lineage rules (`factual-visual-separation`).  
6. **Goal non-refundable** — `refundPolicy: "none"` skips creative-revision refund.  
7. **Cancel during creative_revision** — skip creating child version; source stays current.

---

## 10. What Hands are not

- Not Cortex (no intent / chat)  
- Not Gaze (constitution lives in `ai/olhar/`; Hands only embed direction text)  
- Not Skin (`export-validation` runs in the gate after generation)  
- Not Energy (spend is upstream)  
- Not Memory/Taste owners (only consumers at generate time)

---

## 11. File cheat sheet (start here)

| Priority | File | Why |
|----------|------|-----|
| 1 | `jobs/derivation.ts` | Full gesture + handoffs |
| 2 | `ai/derivation-pipeline.ts` | Prompt context + generate step |
| 3 | `ai/prompt-builder.ts` | Cognitive stack order |
| 4 | `ai/image-generation.ts` | Dual engine + R2 |
| 5 | `ai/creative-quality-gate.ts` | Where Gaze/Skin take over |
| 6 | `ai/derivation-auto-retry.ts` | Second touch |
| 7 | `brand-taste/prompt-calibration-loader.ts` | Taste/corpus injection |
| 8 | `creative-work/` + `jobs/creative-work.ts` | Sibling social-post muscle |

---

## 12. Maintenance

When changing Hands:

1. New generation mode → update contract types, prompt-builder per-mode rules, job asset resolution, and this doc.  
2. New prompt organ section → preserve order **Gaze → Taste → corpus → Memory → …** (atlas circulation).  
3. Provider changes → keep composite + candidate persistence; don’t break R2 allSettled behavior lightly.  
4. Do not move dual-verdict logic into the generate step — that is Gaze/Skin territory.  
5. Update [`COGNITIVE-ATLAS.md`](../COGNITIVE-ATLAS.md) Hands card if the public shape changes.
