# Gaze (Olhar) — Organ Deep Dive

> Character-level map of ADScale art judgment.  
> Parent atlas: [`../COGNITIVE-ATLAS.md`](../COGNITIVE-ATLAS.md) · ADR: [`../adr/0012-cognitive-atlas.md`](../adr/0012-cognitive-atlas.md)  
> Siblings: [`CORTEX.md`](./CORTEX.md) · [`HANDS.md`](./HANDS.md)  
> Product / code alias: **Olhar** = **Gaze**  
> Version: **v0.1** · 2026-07-10

---

## 1. What Gaze is

Gaze is the **art eye**. It defines what “good creative” means for ADScale (figure, gestalt, voice, invite), injects that into Hands’ prompts, and after generation builds a **Passagem Olhar** verdict — **separate** from export compliance (**Skin**).

| Layer | Path |
|-------|------|
| Constitution | `app/src/server/ai/olhar/constitution.ts` |
| Pre-generation direction | `olhar/generation-direction.ts` |
| Leitura do base | `olhar/base-reading.ts` |
| Failure → verdict map | `olhar/art-direction-verdict.ts` |
| Passagem Olhar | `olhar/olhar-qa.ts` |
| Dual payload types | `olhar/dual-verdict.ts` |
| Vocabulary hygiene | `olhar/vocabulary.ts` |
| Client voice (overlay) | `app/src/server/ai/voices/` |
| Gate orchestration | `app/src/server/ai/creative-quality-gate.ts` |
| Offline calibration | `app/src/server/olhar-calibration/` (Marrow lab for Gaze) |

**Thesis:** creative quality and export readiness are **two truths**. Compliance is necessary; it is not the heart of creative judgment.

---

## 2. Two moments

```text
BEFORE (instruction to Hands)
  constitution + generation-direction (+ optional client voice)
  → prompt-builder embeds DIRECAO DE ARTE PARA GERACAO
  → Hands paint

AFTER (Passagem Olhar)
  Hands deliver image
  → creative-qa checklist + score issues
  → quality-gate classifies hard failures vs polish
  → buildPassagemOlharVerdict (art only)
  → persist olharVerdict ⟂ exportStatus (Skin)
  → assertDerivationApprovable (both must pass)
```

Gaze does **not** generate pixels. Hands do. Gaze judges and directs.

---

## 3. Constitution — four axes

File: `constitution.ts`

| Axis | Question |
|------|----------|
| **figura** | Does the eye know where to land? Dominant idea clear? |
| **gestalt** | Rhythm, axis, figure-ground, silence — before counting “modules”? |
| **voz** | Aesthetic opinion present, or generic AI template? |
| **convite** | CTA as invite in the reading path — not a UI button widget? |

**Verdict vocabulary:** `pronta` · `quase` · `sem_opiniao` · `confusa`  
**Blocking for approval:** `sem_opiniao`, `confusa` (`isBlockingOlharVerdict`).

`buildOlharAdscaleSection()` also feeds hard-rules / constitution text into the prompt stack (see Hands deep dive).

---

## 4. Leitura do base (preflight reading)

File: `base-reading.ts`

```ts
BaseCreativeReading {
  dominantIdea, gestaltRead, inviteWeight,
  thumbnailRead, brandPresence, risks[]
}
```

Normalized from model/preflight output; required fields missing → `null`.  
When present, `generation-direction` prefers this over bare canonical fallbacks for gestalt lines.

Invite weights: `absent` | `weak` | `balanced` | `overpowering`  
Brand presence: `absent` | `weak` | `present` | `dominant`

---

## 5. Generation direction (before Hands)

File: `generation-direction.ts`  
Header: `DIRECAO DE ARTE PARA GERACAO`

Section typically includes:

1. **Sacred facts** — dominant idea, hook/proof, CTA contract, format, mandatory tiers, client/product/offer  
2. **Variation range** — by mode (`art_variation` / `format_adaptation` / `restyling`) + creative level guides  
3. **Gestalt lines** — from `baseReading` or canonical creative  
4. **Global anti-patterns** — template aesthetics, decorative-only variation, equal-weight groups, fake CTA chrome, export language overriding art  
5. **Axis guards** — from `OLHAR_ADSCALE_PRINCIPLES`  
6. **Exportacao reminder** — second pass is Skin (do not conflate)  
7. **Client voice** — only if `isClientVoiceInjectionAllowed` (`voices/voice-review-gate.ts`; default deny until `approved`)

Called from `prompt-builder.ts` inside Hands’ prompt assembly.

---

## 6. Art-direction failures → verdict

File: `art-direction-verdict.ts`

| Failure code | Verdict |
|--------------|---------|
| `generic_template_aesthetic` | `sem_opiniao` |
| `decorative_only_variation` | `sem_opiniao` |
| `missing_dominant_idea` | `confusa` |
| `visual_overload` | `confusa` |

**Export-only codes** (Skin territory — ignored by Gaze mapping):  
`wrong_brand`, `cta_drift`, `unsupported_offer`, `unreadable_required_text`, `invalid_format_layout`, …

Severity tie-break (worst first): `confusa` > `sem_opiniao` > `quase` > `pronta`.

---

## 7. Passagem Olhar (after Hands)

File: `olhar-qa.ts` → `buildPassagemOlharVerdict`

```text
hardFailures + QA checklist
  → if no art-direction signal → return null
       (export-only failures do not invent an Olhar verdict)
  → derive axes 0–3 from checklist (conservative min across related criteria)
  → whatWorks / whatBlocks / directionNote
  → buildOlharVerdictFromFailures → OlharVerdictPayload
```

Axis derivation (sketch):

| Axis | From checklist (min score) |
|------|----------------------------|
| figura | legibility, informationPreservation |
| gestalt | formatFit, briefMatch |
| voz | briefMatch, creativeRisk |
| convite | ctaOffer |

Payload shape (`dual-verdict.ts`):

```ts
OlharVerdictPayload {
  value, axes, whatWorks, whatBlocks,
  directionNote, source, evaluatedAt
}
```

`source`: `quality_gate` | `manual` | `migration_fallback`

Persisted in `persistDualVerdictFromQualityGate` alongside Skin’s `exportStatus`.

Also reachable from `POST /api/derivations/[id]/qa` for on-demand QA paths.

---

## 8. Dual verdict & approval door

Gaze and Skin share the gate file but **not** the judgment:

| Field | Organ | Blocking values |
|-------|-------|-----------------|
| `olharVerdict` | **Gaze** | `sem_opiniao`, `confusa` |
| `exportStatus` | **Skin** | `bloqueado` |

`assertDerivationApprovable`:

1. Reject if `qualityVerdict === invalid` or hard failures present  
2. Reject if Gaze blocking  
3. Reject if Skin blocking  

Used by: review API (`entra` / approve), delivery package, client approval package, some Cortex quick jobs that require an approvable source.

UI: `lib/derivation-display.ts` + review surfaces show Olhar separately from export.

---

## 9. Vocabulary hygiene

File: `vocabulary.ts`

Forbids UI-first creative language in live prompts (`CTA button`, `card grid`, `clickable-looking`, …) and maps replacements to reading-path / gestalt language.  
`SCANNED_OLHAR_PROMPT_FILES` lists prompt modules that must stay clean.

This is how Gaze defends the thesis that the product learned **graphic design**, not dashboard UX.

---

## 10. Client voice (overlay, not constitution)

Under `ai/voices/`:

- Resolve per client profile (`voice-config-resolver.ts`)  
- Build prompt section (`client-voice.ts`, `voice-prompt-section.ts`)  
- **Gate:** injection only when review status is `approved` (or force in tests)  
- Cenbrap is the first productized voice (`voices/cenbrap.ts`)

Voice refines **voz** for a brand; it must not override global Olhar principles or Skin facts.

---

## 11. Offline lab (Marrow × Gaze)

`olhar-calibration/` measures human decisions vs system `olharVerdict` / `exportStatus` (Cenbrap cohort), builds release evidence. That is **Marrow’s lab for Gaze** — not the hot path.

Taste / Marrow may later inject brand or corpus rules into the prompt **after** Gaze’s direction section; they refine, they do not replace constitution.

---

## 12. Nerves

| Direction | Organ | How |
|-----------|-------|-----|
| Out → Hands | direction + constitution in `prompt-builder` | before generate |
| In ← Hands | image + QA + score after generate | quality-gate |
| Out ⟂ Skin | dual verdict persistence | same gate, separate payloads |
| Out → Human | review UI / approval blocks | `assertDerivationApprovable` |
| Out → Nerve | snapshot `olharVerdict` on decisions | output-learning |
| Out → Taste | mismatch vs human → calibration signals | brand-taste |
| Out → Marrow | corpus candidates + Cenbrap calibration | human-quality / olhar-calibration |
| In ← Contract | sacred facts / canonical creative | generation-direction |

---

## 13. Safety invariants

1. **Dual truth** — never collapse Olhar into exportStatus (or vice versa).  
2. **Export-only failures do not force an Olhar verdict** — `buildPassagemOlharVerdict` returns `null` without art signal.  
3. **Client voice default deny** until approved.  
4. **Blocking Olhar blocks approve/package** even if Skin is `ok`.  
5. **Numeric `qualityScore` is secondary** — direction / verdict language is primary for creative judgment.  
6. **UI-first terms stay out** of generation prompts (`vocabulary.ts`).

---

## 14. What Gaze is not

- Not Hands (no providers / R2)  
- Not Skin (`export-validation.ts`)  
- Not Marrow (no owner corpus queue in the hot path)  
- Not Taste (no candidate→approved rule lifecycle)  
- Not the score number alone

---

## 15. File cheat sheet (start here)

| Priority | File | Why |
|----------|------|-----|
| 1 | `olhar/constitution.ts` | Axes + principles |
| 2 | `olhar/generation-direction.ts` | What Hands are told |
| 3 | `olhar/olhar-qa.ts` | Passagem Olhar builder |
| 4 | `olhar/art-direction-verdict.ts` | Failure → verdict map |
| 5 | `olhar/dual-verdict.ts` | Payload + blocking helpers |
| 6 | `creative-quality-gate.ts` | Orchestration + approval door |
| 7 | `olhar/base-reading.ts` | Leitura do base |
| 8 | `olhar/vocabulary.ts` | Anti UI-first language |
| 9 | `voices/voice-review-gate.ts` | Client voice injection gate |

---

## 16. Maintenance

1. New art failure code → map in `art-direction-verdict.ts` **and** keep export-only set accurate.  
2. New axis → constitution + QA axis derivation + UI copy.  
3. Prompt wording changes → run vocabulary expectations; do not reintroduce UI-first terms.  
4. Scorer narrative vs Passagem Olhar — if bridging scorer `directionNote` into the gate, keep Skin independent (see research notes under `docs/research/`).  
5. Update this deep dive + atlas Gaze card when the public dual-verdict contract changes.
