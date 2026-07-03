# Persona Simulator — Implementation Plan

**Date:** 2026-05-23
**Phase:** v6.0 — Persona Intelligence
**Estimated Duration:** 2–3 days
**Parallelizable:** Yes (backend + frontend can split)

---

## Prerequisites

- [ ] `npm run build` passes on `main`
- [ ] `npm test -- --run` passes (321/321)
- [ ] Design doc approved (`docs/plans/2026-05-23-persona-simulator-design.md`)

---

## Task Breakdown

### Day 1 — Backend Foundation

#### T1: Schema + Migration
**Files:** `src/server/db/schema.ts`, `drizzle/0019_persona_simulations.sql`

- [ ] Add `persona_simulations` table to schema
- [ ] Add `persona_simulations` to `adscale_app` schema export
- [ ] Write migration `0018_persona_simulations.sql`
- [ ] Run `drizzle-kit check`
- [ ] Export `PersonaSimulation` type

**Verification:**
```bash
cd app && npx drizzle-kit check
```

#### T2: Repository
**Files:** `src/server/repositories/persona-simulation.ts`, `src/server/repositories/persona-simulation.test.ts`

- [ ] `createPersonaSimulation(workspaceId, campaignId, sourceType, sourceId, results)`
- [ ] `getPersonaSimulationBySource(workspaceId, sourceType, sourceId)`
- [ ] `updatePersonaSimulation(id, results)` — for re-generation
- [ ] `isCacheValid(simulation)` — checks `cacheExpiresAt > now`

**Verification:**
```bash
cd app && npm test -- src/server/repositories/persona-simulation.test.ts --run
```

#### T3: AI Module
**Files:** `src/server/ai/persona-simulator.ts`, `src/server/ai/persona-simulator.test.ts`

- [ ] `buildPersonaSimulationPrompt(campaign, creative, locale)` — includes briefing + creative context
- [ ] `normalizePersonaSimulationResults(raw: unknown)` — Zod schema validation
- [ ] `simulatePersonas(input)` — calls OpenAI, returns structured results
- [ ] Zod schema for the 4 personas with `understands`, `rejects`, `wants`, `wouldClick`, `rationale`

**Prompt requirements:**
- Include campaign briefing fields
- Include creative description (derivation: image context; landing page: structure)
- Instruct model to analyze through 4 lenses
- Request structured JSON output
- Use campaign locale (PT-BR or EN)

**Verification:**
```bash
cd app && npm test -- src/server/ai/persona-simulator.test.ts --run
```

#### T4: API Routes
**Files:** `src/app/api/creatives/[id]/persona-simulation/route.ts`, `route.test.ts`

**POST handler:**
- [ ] Validate workspace access
- [ ] Validate `sourceType` body ("derivation" | "landing_page")
- [ ] Fetch source creative (derivation or landing page)
- [ ] Validate approval/completion status
- [ ] Check cache via repository
- [ ] If cache valid → return cached results
- [ ] If no cache → call `simulatePersonas()`, persist results, set 24h expiry
- [ ] Return `{ simulation, results, cached: boolean }`

**GET handler:**
- [ ] Validate workspace access
- [ ] Check if simulation exists
- [ ] Return 404 if not found
- [ ] Return results with `stale: boolean` flag if cache expired

**Verification:**
```bash
cd app && npm test -- src/app/api/creatives/[id]/persona-simulation/route.test.ts --run
```

---

### Day 2 — Frontend

#### T5: Hook
**Files:** `src/lib/hooks/use-persona-simulation.ts`, `use-persona-simulation.test.tsx`

- [ ] `usePersonaSimulation(sourceType, sourceId)` — query hook for GET
- [ ] `useCreatePersonaSimulation()` — mutation hook for POST
- [ ] Toast on success: "t('personaSimulationComplete')"
- [ ] Toast on error with retry option
- [ ] Invalidates `["persona-simulation", sourceType, sourceId]` on mutate

**Verification:**
```bash
cd app && npm test -- src/lib/hooks/use-persona-simulation.test.tsx --run
```

#### T6: Modal Component
**Files:** `src/components/workspace/PersonaSimulationModal.tsx`, `.test.tsx` <!-- VERIFY: src/components/workspace/PersonaSimulationModal.tsx — file not found; see verification in .planning/tmp/ -->

- [ ] `PersonaSimulationModal` — shadcn Dialog, `max-w-5xl`
- [ ] 2×2 grid on desktop, 1 column on mobile
- [ ] Each persona card:
  - Icon + persona name header
  - "Understands" section (green accent)
  - "Rejects" section (red accent)
  - "Wants" section (amber accent)
  - "Would Click" badge (yes/no) + rationale
- [ ] Loading state: 4 skeleton cards
- [ ] Error state: retry button
- [ ] Re-generate button (bypass cache)

**Persona card component:**
- [ ] `PersonaCard` — reusable sub-component

**Verification:**
```bash
cd app && npm test -- src/components/workspace/PersonaSimulationModal.test.tsx --run
```

#### T7: Trigger Integration
**Files:** `src/components/workspace/DerivationCard.tsx`, `DerivationsStep.tsx` <!-- VERIFY: DerivationsStep.tsx — no DerivationsStep component anywhere in app/src; see verification in .planning/tmp/ -->, campaign page

- [ ] Add "Simular personas" action to approved derivation cards
- [ ] Icon: `Users` (Lucide)
- [ ] Show only when derivation is approved and has `outputKey`
- [ ] Wire `onSimulatePersonas` through `DerivationsStep` to campaign page
- [ ] Wire modal open/close state in campaign page

**For landing pages (if landing page list exists):**
- [ ] Add same action to landing page items

**Verification:**
```bash
cd app && npm test -- src/components/workspace/DerivationCard.test.tsx --run
```

#### T8: Translations
**Files:** `messages/en.json`, `messages/pt-BR.json`

- [ ] `simulatePersonas` — action label
- [ ] `personaSimulationComplete` — toast success
- [ ] `personaSimulationFailed` — toast error
- [ ] `personaSkepticalBuyer` — card title
- [ ] `personaWarmLead` — card title
- [ ] `personaFinancialDecisionMaker` — card title
- [ ] `personaBeginner` — card title
- [ ] `understands` — section label
- [ ] `rejects` — section label
- [ ] `wants` — section label
- [ ] `wouldClick` — section label
- [ ] `rationale` — section label
- [ ] `yes` / `no` — badge labels
- [ ] `reGenerate` — button label
- [ ] `cachedResult` — indicator label

**Verification:**
```bash
cd app && node -e "JSON.parse(require('fs').readFileSync('messages/en.json')); JSON.parse(require('fs').readFileSync('messages/pt-BR.json')); console.log('OK')"
```

---

### Day 3 — Polish & Integration

#### T9: Integration & Smoke Test
- [ ] Run full test suite
- [ ] Run build
- [ ] Manual smoke: create campaign → approve derivation → click "Simular personas" → verify modal renders 4 cards with real data
- [ ] Verify cache: click again → should be instant (cached)
- [ ] Verify re-generate: click re-generate → should call API again

#### T10: Cleanup
- [ ] Remove any `console.log` added during dev
- [ ] Run lint
- [ ] Update `tasks/todo.md` with implementation review

---

## Execution Order

```
Day 1 (Backend)
├── T1: Schema + Migration
├── T2: Repository
├── T3: AI Module
└── T4: API Routes

Day 2 (Frontend)
├── T5: Hook
├── T6: Modal Component
├── T7: Trigger Integration
└── T8: Translations

Day 3 (Integration)
├── T9: Smoke Test
└── T10: Cleanup + Commit
```

---

## Success Criteria

1. Approved derivations show "Simular personas" action
2. Modal opens with 4 persona cards side-by-side
3. Each card shows: understands, rejects, wants, would click (yes/no + rationale)
4. Results are cached for 24h — second click is instant
5. Re-generate button bypasses cache
6. All tests pass (new + existing)
7. Build clean
8. i18n keys present in PT-BR and EN

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| OpenAI JSON mode unreliable | Medium | High | Strong Zod normalization with safe defaults |
| Persona output too generic | Medium | Medium | Prompt requires specific creative element references |
| Modal too wide on mobile | Low | Low | Responsive grid: 2×2 → 1 column below 768px |
| Cache logic race condition | Low | Low | Use DB unique constraint on (workspaceId, sourceType, sourceId) |
| Landing page source not ready | Medium | Low | Implement derivation source first, landing page as follow-up |

---

## Files to Create

```
app/src/server/db/schema.ts                          (modify)
app/drizzle/0018_persona_simulations.sql              (new)
app/src/server/repositories/persona-simulation.ts     (new)
app/src/server/repositories/persona-simulation.test.ts (new)
app/src/server/ai/persona-simulator.ts                (new)
app/src/server/ai/persona-simulator.test.ts           (new)
app/src/app/api/creatives/[id]/persona-simulation/route.ts      (new)
app/src/app/api/creatives/[id]/persona-simulation/route.test.ts (new)
app/src/lib/hooks/use-persona-simulation.ts           (new)
app/src/lib/hooks/use-persona-simulation.test.tsx     (new)
app/src/components/workspace/PersonaSimulationModal.tsx          (new)
app/src/components/workspace/PersonaSimulationModal.test.tsx     (new)
app/messages/en.json                                  (modify)
app/messages/pt-BR.json                               (modify)
```
