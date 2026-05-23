# Persona Simulator — Design Document

**Date:** 2026-05-23
**Status:** Approved

---

## 1. Goal

Add a new ADScale function that simulates how different audience personas react to an approved creative (derivation or landing page). Output: per-persona insights on what they understand, reject, want, and would click.

---

## 2. Product Direction

The source of truth is an approved creative asset (derivation or landing page) plus the campaign briefing. The briefing provides audience, offer, CTA, tone, constraints, and client context. The creative provides the actual visual and copy being evaluated.

This is a new analysis function, not a generation feature. It produces structured insights that help the user refine creatives before spending ad budget.

---

## 3. UX Flow

1. User approves a derivation or generates a landing page.
2. The creative card shows a "Simular personas" action (alongside export, landing page, delivery package).
3. User triggers simulation.
4. ADScale reads the campaign briefing and the creative asset.
5. The model analyzes the creative through 4 fixed persona lenses.
6. Results are cached for 24h.
7. User sees a modal with 4 cards side-by-side, each representing one persona.

---

## 4. Personas

Four fixed personas, each with a defined lens:

| Persona | Lens | Focus |
|---------|------|-------|
| **Comprador Cético** | Skepticism | What's suspicious? What's missing? Would they trust this? |
| **Lead Quente** | Enthusiasm | What excites them? What pushes them to convert now? |
| **Decisor Financeiro** | ROI / Cost | What's the business case? Is the value clear? Is the price justified? |
| **Iniciante / Noob** | Clarity | Do they understand the offer? Is the message too complex? Would they know what to do? |

Each persona output includes:
- **Understands** — what the persona clearly grasps from the creative
- **Rejects** — what the persona distrusts, ignores, or disagrees with
- **Wants** — what the persona desires after seeing the creative
- **Would Click** — yes/no with rationale

---

## 5. Data Model

Add a `persona_simulations` table:

```
id
workspaceId
campaignId
sourceType        -- "derivation" | "landing_page"
sourceId          -- derivationId or landingPageId
status            -- "pending" | "completed" | "failed"
results           -- JSONB: { personaKey: { understands, rejects, wants, wouldClick, rationale } }
cacheExpiresAt    -- timestamp (24h from creation)
error
createdAt
updatedAt
```

**Cache behavior:**
- On create: set `cacheExpiresAt = now + 24h`
- On read: if `cacheExpiresAt > now`, return cached results
- On trigger: if cache expired or missing, re-generate

---

## 6. API

### POST /api/creatives/[id]/persona-simulation

Generic endpoint that works for both derivations and landing pages. Accepts `sourceType` in body.

**Rules:**
- Require workspace access
- Require the source creative to exist in the workspace
- For derivations: require `status === "approved"` and `outputKey` present
- For landing pages: require `status === "completed"` and `htmlKey` present
- Check cache: return cached results if valid
- Generate via OpenAI if no valid cache
- Persist results and cache expiry
- Return `{ simulation, results, cached }`

### GET /api/creatives/[id]/persona-simulation

Read existing simulation for a creative.

**Rules:**
- Require workspace access
- Return 404 if no simulation exists
- Return cached results if `cacheExpiresAt > now`
- Return stale results with `stale: true` if cache expired (client decides to re-trigger)

---

## 7. Generation Rules

### Prompt Design

The prompt must:
- Include the campaign briefing (objective, audience, offer, CTA, tone, constraints)
- Include the creative context (image description or landing page structure)
- Instruct the model to analyze through each of the 4 persona lenses
- Require structured JSON output
- Use the campaign's language (PT-BR or EN)

### Output Schema

```json
{
  "skeptical_buyer": {
    "understands": "string",
    "rejects": "string",
    "wants": "string",
    "would_click": "boolean",
    "rationale": "string"
  },
  "warm_lead": { ... },
  "financial_decision_maker": { ... },
  "beginner": { ... }
}
```

### Constraints
- Model must not invent persona demographics beyond the defined lens
- Each analysis must reference specific elements from the creative (copy, image, CTA, offer)
- "Would click" must have explicit rationale tied to creative elements
- Keep responses concise (2-3 sentences per field)

---

## 8. UI Placement

### Trigger Location

Add action to:
- Approved derivation cards (DerivationCard.tsx)
- Landing page list items (if a landing page list exists)

Icon: `Users` (Lucide)
Label: `t("simulatePersonas")`

### Result Modal

**Modal:** `PersonaSimulationModal`
**Layout:** 2×2 grid on desktop, single column on mobile
**Width:** `max-w-5xl`

Each persona card:
- Header: persona icon + persona name
- Section 1: Understands (green/positive tone)
- Section 2: Rejects (red/skeptical tone)
- Section 3: Wants (amber/opportunity tone)
- Section 4: Would Click — yes/no badge + rationale

**Loading state:** Skeleton cards with shimmer effect
**Error state:** Retry button + error message
**Empty:** Not applicable (always generates 4 personas)

---

## 9. Errors And Edge Cases

| Scenario | Behavior |
|----------|----------|
| Creative not approved/completed | 409 error — "Creative must be approved before simulation" |
| Creative has no image/HTML | 400 error — "Creative output is missing" |
| Model returns invalid JSON | Persist failure, return 500 with retry option |
| OpenAI rate limit | Return 429, client shows "try again in a moment" |
| Campaign briefing is sparse | Generate conservative analysis, avoid fake specificity |
| Cache hit | Return immediately with `cached: true` |
| Cache expired | Return stale data + `stale: true`, offer re-generate button |

---

## 10. Testing Strategy

### Unit Tests
- `persona-simulator.ts` (prompt builder): prompt includes briefing + creative context
- `persona-simulator.ts` (normalizer): rejects invalid JSON, fills safe defaults
- `persona-simulator.ts` (cache logic): respects 24h expiry
- Repository: creates/reads simulations scoped to workspace

### Integration Tests
- API rejects unapproved derivations
- API returns cached results on second call
- API regenerates after cache expiry
- Modal renders 4 persona cards with correct structure

### Component Tests
- `PersonaSimulationModal`: renders loading, success, error states
- `DerivationCard`: shows simulate action only for approved derivations with output
- Hook: caches data, invalidates on re-trigger

---

## 11. Later Extensions

- Custom personas (user-defined in settings)
- Persona comparison across multiple creatives (A/B test view)
- Persona heatmap overlay on creative image
- Export persona insights as PDF report
