# ADScale Cognitive Atlas

> **Ludic map of the creative head.**  
> English organ names for an international product language. Product alias in code: **Olhar** = **Gaze**.  
> Scope: cognition (intent → make → judge → learn). Cockpit missions stay outside this atlas for now.
> Companion to [`ARCHITECTURE.md`](./ARCHITECTURE.md) and [`SERVER-MODULES.md`](./SERVER-MODULES.md).  
> Decision record: [`adr/0012-cognitive-atlas.md`](./adr/0012-cognitive-atlas.md).  
> Version: **v0.1** · 2026-07-09  
> Organ deep dives (all nine): [`organs/`](./organs/) — Cortex, Hands, Gaze, Skin, Nerve, Taste, Memory, Marrow, Energy.

---

## How to read this

| Layer | Meaning |
|-------|---------|
| **Organ** | Named cognitive responsibility (what the body *is doing*) |
| **Motor** | Active transform pipeline |
| **Code home** | Where to open the repo |
| **Nerves** | Inputs / outputs to other organs |

This atlas is a **mental model**, not a second architecture. When docs disagree with code, **code wins** — then update this file.

---

## Body diagram

```text
                         HUMAN
                      (who decides)
                            │
                            ▼
                    ┌───────────────┐
                    │    CORTEX     │  assistant/
                    │  intent →     │  chat → plan → action
                    │  orchestration│
                    └───────┬───────┘
                            │
              ┌─────────────┼─────────────┐
              ▼             ▼             ▼
         ┌────────┐   ┌────────┐   ┌──────────┐
         │ MEMORY │   │ TASTE  │   │ CONTRACT │
         │ Mem0 + │   │ brand  │   │ creative │
         │campaign│   │ rules  │   │ (facts)  │
         └────┬───┘   └───┬────┘   └────┬─────┘
              └───────────┼─────────────┘
                          ▼
                    ┌───────────────┐
                    │     HANDS     │  ai/ + jobs/derivation
                    │   (Touch)     │  makes the image
                    └───────┬───────┘
                            │
                    ┌───────┴───────┐
                    ▼               ▼
              ┌──────────┐   ┌──────────┐
              │   GAZE   │   │   SKIN   │
              │ (Olhar)  │   │  export  │
              │ art eye  │   │ boundary │
              │          │   │ + Peça   │
              │          │   │   PSD    │
              └────┬─────┘   └────┬─────┘
                   └───────┬──────┘
                           ▼
                    HUMAN approve/reject
                           │
               ┌───────────┼───────────┐
               ▼           ▼           ▼
          ┌────────┐  ┌────────┐  ┌────────┐
          │ NERVE  │  │ MARROW │  │ ENERGY │
          │ fast   │  │ deep   │  │ credits│
          │ learn  │  │ calib. │  │ access │
          └────┬───┘  └───┬────┘  └────────┘
               └──────────┘
                     ▼
              back into prompt / Gaze
```

**Energy** gates motors; it does not think.  
**Contract** (canonical creative facts) is tissue shared by Hands / Gaze / Skin — not a full organ card yet.

---

## Circulations

### 1. Vital — brief → image → judgment → out

```text
Cortex (or classic campaign API)
  → Energy spend gate
  → Hands (Inngest derivation)
  → Gaze ⟂ Skin (dual verdict)
  → Human review
  → export / delivery (Skin must allow)
```

### 2. Reflex — user decision → preference

```text
approve / reject / regenerate / save reference
  → Nerve (output_decision_events)
  → client output learnings
  → Memory projection (+ Taste calibration signals)
```

### 3. Calibration — owner lab → gates & corpus rules

```text
failed / sampled derivation
  → Marrow corpus → owner evaluation
  → learning proposals → accepted adjustments
  → score ceilings / corpus_quality rules
  → Taste loader → Hands prompt
```

### 4. Brand — references & episodes → next prompt

```text
brand training / approvals / QA episodes
  → Memory (Mem0 + campaign memory)
  → Hands prompt (auxiliary block)
```

Prompt stack order (cognitive):

**Gaze (Olhar) → Taste → corpus → Memory → Contract / mode rules**

---

## Organ index

| Organ | One-liner | Code home |
|-------|-----------|-----------|
| [Cortex](#cortex) | Intent, conversation, confirmed actions | `app/src/server/assistant/` · [deep dive](./organs/CORTEX.md) |
| [Hands](#hands) | Produce the image | `app/src/server/ai/` + `jobs/derivation.ts` · [deep dive](./organs/HANDS.md) |
| [Gaze](#gaze-olhar) | Art judgment (figure, gestalt, voice, invite) | `app/src/server/ai/olhar/` · [deep dive](./organs/GAZE.md) |
| [Skin](#skin) | Export / factual readiness | `app/src/server/ai/export-validation.ts` · [deep dive](./organs/SKIN.md) |
| [Nerve](#nerve) | Fast user-decision learning | `app/src/server/output-learning/` · [deep dive](./organs/NERVE.md) |
| [Taste](#taste) | Approved brand constraints on the prompt | `app/src/server/brand-taste/` · [deep dive](./organs/TASTE.md) |
| [Memory](#memory) | Recalled brand & campaign context | `app/src/server/memory/` · [deep dive](./organs/MEMORY.md) |
| [Marrow](#marrow) | Deep owner calibration | `human-quality/` + `olhar-calibration/` · [deep dive](./organs/MARROW.md) |
| [Energy](#energy) | Credits & access | `app/src/server/billing/` · [deep dive](./organs/ENERGY.md) |

---

## Cortex

**Role:** The head. Turns human language into **confirmed** actions that wake Hands, Memory, Taste, etc. Does **not** paint pixels or judge art.

**Deep dive:** [`organs/CORTEX.md`](./organs/CORTEX.md) — turn spine, lobes, action vocabulary, API/UI nerves, safety invariants.

| | |
|--|--|
| **Home** | `app/src/server/assistant/` |
| **Face** | `app/src/components/assistant/`, `app/src/app/api/assistant/` |
| **LLM** | MiniMax — `assistant/model/minimax-adapter.ts` |
| **Main nerve** | `orchestrator.ts` → `runAssistantTurn()` |
| **Confirm nerve** | `action-execution/execute.ts` → `executeConfirmedAssistantAction()` |

**Modes:** `classic` (guided `from_zero` / `existing_creative`) · `agent` (goal loop, owners/testers) — `goal/pilot.ts`.

**Lobes:** context · guided-conversation / guided-paths · action-contracts · action-execution · plan-iteration · creative-iteration · artifact-version · goal · tools.

**Not:** Gaze, Hands, Marrow, or the non-chat campaign wizard (classic UI remains; Cortex is the conversational head on top).

---

## Hands

**Role:** Touch. Fabricate the image from a decided request. Judgment runs **after** the pixel.

**Deep dive:** [`organs/HANDS.md`](./organs/HANDS.md) — Inngest gesture, modes, prompt stack, image generation, auto-retry, Cortex/Marrow handoffs.

| | |
|--|--|
| **Home** | `app/src/server/ai/`, `app/src/server/jobs/derivation.ts` |
| **Job** | Inngest `generate-derivation` |
| **Pipeline** | `derivation-pipeline.ts` |
| **Provider** | OpenAI GPT Image 2 — `image-generation.ts` |

**Modes:** `art_variation` · `format_adaptation` · `restyling` (+ creative revision / creative-work siblings).

**Gesture:** load context → Taste/Memory/corpus → `prompt-builder` → generate → R2 → score → **quality-gate (Gaze ⟂ Skin)** → optional auto-retry → corpus candidate / goal finalize.

**Not:** chat, art constitution ownership, export policy ownership, credit accounting (only refunds when policy allows).

---

## Gaze (Olhar)

**Role:** Art eye. Judges figure, gestalt, voice, invite — **before** (prompt direction) and **after** (Passagem Olhar). Separate truth from export compliance.

**Deep dive:** [`organs/GAZE.md`](./organs/GAZE.md) — constitution, Leitura do base, generation direction, Passagem Olhar, dual verdict, vocabulary, client voice.

| | |
|--|--|
| **Home** | `app/src/server/ai/olhar/` |
| **Constitution** | `constitution.ts` — axes + principles |
| **Direction** | `generation-direction.ts` — `DIRECAO DE ARTE PARA GERACAO` |
| **Pass** | `olhar-qa.ts` → `OlharVerdictPayload` |
| **Gate** | `creative-quality-gate.ts` → `runCompletedDerivationQualityGate` |

**Verdicts:** `pronta` · `quase` · `sem_opiniao` · `confusa`  
**Blocking:** `sem_opiniao`, `confusa`.

**Axes:** `figura` · `gestalt` · `voz` · `convite`.

**Not:** Skin, Hands, Marrow (Marrow *calibrates* Gaze offline), numeric `qualityScore` as primary creative truth.

---

## Skin

**Role:** Boundary. What may leave the body for ads / delivery packages. Factual & format integrity — not soul.

**Deep dive:** [`organs/SKIN.md`](./organs/SKIN.md) — `validateExportReadiness`, CTA normalize, failure taxonomy, dual door with Gaze, package/override.

| | |
|--|--|
| **Home** | `app/src/server/ai/export-validation.ts` |
| **Layerize** | `app/src/server/layerize/` — post-approval Peça PSD/ZIP + fidelity |
| **Payload** | `exportStatus` in `olhar/dual-verdict.ts` |
| **Door** | `assertDerivationApprovable` (Gaze **and** Skin) |

**Status:** `ok` · `ajuste_menor` · `bloqueado`  
**Blocking:** `bloqueado` only.

Art-direction failures are **ignored** here (they belong to Gaze). CTA drift that disappears after typographic normalization becomes a warning, not a hard block.

**Used by:** review API, delivery package, client approval package, review UI.

---

## Nerve

**Role:** Fast reflex. User decisions become durable evidence and per-client preferences. Capture is **best-effort** — review must not fail if learning fails.

**Deep dive:** [`organs/NERVE.md`](./organs/NERVE.md) — actions/semantics, snapshot sanitize, aggregate → learnings, recommendation guards, vs Marrow.

| | |
|--|--|
| **Home** | `app/src/server/output-learning/` |
| **Source of truth** | Postgres `output_decision_events` |
| **Record** | `output-decision-recorder.ts` |
| **Aggregate** | `aggregate.ts` + `service.ts` |

**Actions:** `approved` · `rejected` · `regenerated` · `saved_reference` · `selected_for_delivery`.

**Variables:** `cta` · `generation_mode` · `format` · `style_policy` · `avoid_pattern` · `creative_level`.

**Out:** Memory projection · Taste calibration signals · recommendation prefill (approved + safety guards only).

**Not:** Gaze/Skin (only snapshots them) · Marrow · Hands.

---

## Taste

**Role:** Brand palate. Human teaching → approved calibration rules injected into the next prompt. **Refines** global Olhar; never weakens Skin.

**Deep dive:** [`organs/TASTE.md`](./organs/TASTE.md) — signals, evidence levels, rule lifecycle, Hands loader, uncertainty queue, vs Memory/Nerve.

| | |
|--|--|
| **Home** | `app/src/server/brand-taste/` |
| **Signals** | `calibration-signal*.ts` |
| **Profile** | `taste-profile.ts` (`uncalibrated` → no prompt injection) |
| **Rules** | `rule-extraction.ts`, `calibration-rules.ts` |
| **Apply** | `taste-application.ts`, `prompt-calibration-loader.ts` |

**Human verdicts:** `entra` · `quase` · `nao_entra`.  
**Rule statuses:** `candidate` → `approved` | `rejected` → `deprecated`.

Loader also pulls Marrow `corpus_quality` rules into a **separate** prompt section.

---

## Memory

**Role:** Recalled context. Soft auxiliary block for Hands. If Mem0 is off, the body continues without it.

**Deep dive:** [`organs/MEMORY.md`](./organs/MEMORY.md) — Brand vs Campaign layers, Mem0 ingest/search, projections, vs Taste/Nerve.

| | |
|--|--|
| **Home** | `app/src/server/memory/` |
| **Brand** | Mem0 — `brand-memory-*.ts`, job `brand-memory.ingest` |
| **Campaign** | Postgres — `campaign-memory.ts` (~24 entries) |
| **Projections** | `output-learning-projection.ts` |

Prompt header: `BRAND MEMORY / LEARNED CONTEXT:` + “auxiliary only” disclaimer.

**vs Taste:** Memory = retrieved text/vectors · Taste = typed approved rules.  
Nerve’s source of truth remains Postgres; Mem0 is a **projection**.

`brand-training/` is an ingestion doorway, not this organ.

---

## Marrow

**Role:** Deep lab. Owner corpus, rubrics, learning proposals, score-ceiling apply plans, Olhar release evidence. Automated green ≠ live quality.

**Deep dive:** [`organs/MARROW.md`](./organs/MARROW.md) — capture→evaluate→propose→apply, corpus_quality, Cenbrap lab, vs Nerve.

| | |
|--|--|
| **Home** | `app/src/server/human-quality/` |
| **Olhar lab** | `app/src/server/olhar-calibration/` |
| **Cron** | `jobs/learning-proposal-aggregator.ts` |
| **Capture** | `candidate-capture.ts` (from Hands after gate) |

**Loop:** candidate → queue → owner eval → proposals → accepted adjustments → ceilings / `corpus_quality` → Taste loader → Hands.

Also writes Nerve/Taste evidence via `human-decision-calibration.ts`.

**Not:** hot-path Gaze · auto-ship without accept · proof of quality from CI alone.

---

## Energy

**Role:** Fuel. Credits, Stripe, access kind (`paid` | `beta` | `tester` | `none`). Gates motors with `spendOrApiError()` (HTTP 402). Does not judge creatives.

**Deep dive:** [`organs/ENERGY.md`](./organs/ENERGY.md) — access kinds, costs, FIFO spend, 402 conversion, Stripe/beta, refunds vs Hands.

| | |
|--|--|
| **Home** | `app/src/server/billing/` |
| **Access** | `access.ts` → `getWorkspaceBillingAccess()` |
| **Spend** | `credits.ts` — FIFO grants, `CREDIT_COSTS` |

Typical costs: plan `1` · derivation/regen/restyle `5` · QA `1` · persona `3` · landing `10`.

Past-due: existing balance still spendable; new monthly grants suspended until recovery.

---

## Outside this atlas (for later)

| Nickname | Reality | Why deferred |
|----------|---------|--------------|
| **Progression** | `app/src/server/progression/` | Onboarding missions — UX journey |
| **Contract** | `ai/creative-contract.ts`, canonical creative | Shared tissue; deserves its own card later |
| **Circulation** | `app/src/server/jobs/` (Inngest) | Tissue connecting motors |

---

## Quick wiring

| From | To | Via |
|------|----|-----|
| Cortex | Hands | confirmed action → derivation / Inngest |
| Hands | Gaze ⟂ Skin | `runCompletedDerivationQualityGate` |
| Human | Nerve | review / regen / reference / delivery APIs |
| Nerve | Memory | `projectOutputLearnings` |
| Nerve / Marrow | Taste | calibration signals |
| Taste + Marrow | Hands | `loadPromptCalibrationContext` |
| Memory | Hands | `getBrandMemoryContext` + campaign memory block |
| Energy | all metered motors | `spendOrApiError` at API boundary |
| Marrow | Gaze | ceilings / release evidence (offline) |

---

## Maintenance

1. New cognitive subsystem → add an organ row + card, or mark as tissue/limb.  
2. Rename in product copy → update **alias** line at the top; keep English organ names stable.  
3. Prefer linking to paths over duplicating algorithm detail — deep specs stay in phase docs / ADRs.

When in doubt: **Cortex thinks, Hands make, Gaze judges art, Skin guards the exit, Nerve twitches, Taste seasons, Memory recalls, Marrow studies, Energy fuels.**
