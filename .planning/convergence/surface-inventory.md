# Surface inventory — Convergence Phase 1

**Raw scan:** [`surface-inventory.raw.json`](./surface-inventory.raw.json) (regenerate with `cd app && npm run convergence:inventory`)

**Gate 1 rule:** every CTA without a working consumer is a `blocker` until an explicit decision (`manter` / `fundir` / `esconder` / `apagar`) with evidence. Zero undecided blockers required to close Gate 1.

## Classification legend

| Decision | Meaning |
|----------|---------|
| `manter` | Keep; consumer works or is intentionally supporting |
| `fundir` | Merge into canonical creative-work flow (later phase) |
| `esconder` | Hide from UI until evidence or migration |
| `apagar` | Remove code path after migration |

## Blocker / decision register

| ID | Surface | Consumer | Evidence | Decision | Justification |
|----|---------|----------|----------|----------|---------------|
| B1 | Templates → `Usar template` | Campaign create with full brief | `templates/page.tsx` → `?new=1&templateId=` → `useCampaignsPage` + `POST /api/campaigns` | `manter` | Fixed in Phase 1; was inert (`templateId` ignored). |
| B2 | Derivation overflow → Generate landing page | None (disabled + comingSoon) | `DerivationCard.tsx` ~L589–597 | `esconder` | Frozen module (Phase 0); UI already disabled. Do not expand. Revisit Phase 7. |
| B3 | Derivation overflow → Simulate personas | Active handler + API | `DerivationCard.tsx` ~L599–607; `api/creatives/[id]/persona-simulation` | `esconder` | Frozen for expansion (Phase 0) but still reachable. Decision for Gate 1: keep callable for critical fixes only; **hide from overflow in Phase 7** unless usage evidence appears. Classified `esconder` (planned hide), not undecided. |
| B4 | Assistant `quick_persona_simulate` | Handler + contract | `quick-persona-simulate.ts` | `esconder` | Same freeze as B3; supporting action, not primary destination. Hide with B3 in Phase 7. |
| B5 | Landing page API `POST .../landing-page` | Hook exists; UI disabled | `api/derivations/[id]/landing-page` | `esconder` | Backend retained under freeze; no primary nav entry. |
| B6 | Preview tree `/v6/*` | Parallel visual tree | `app/(preview)/v6` | `manter` (temporary) | Removal is Phase 7; still used for visual fixtures. Not a dead CTA. |
| B7 | Quick Tools Create Post | Creative work pipeline | `/quick-tools/create-post` | `fundir` | Canonical entry later (Phase 5); works today as allowed primary destination. |
| B8 | `/assistant` | Conversational adapter | `/assistant` | `manter` | Allowed primary destination (Phase 0 manifest). |
| B9 | `/campaigns` | Campaign workspace | `/campaigns` | `manter` | Allowed primary destination. |
| B10 | `/templates` list + save | Template CRUD | `/templates`, `POST /api/templates` | `manter` | Accelerator; save path works; use path fixed Phase 1. |
| B11 | `/brand-kit` | Brand Training | `/brand-kit` | `manter` | Independent supporting module. |

## Undecided blockers

_None._ Gate 1 inventory criterion satisfied.

## Notes

- Raw JSON may list many `href`/`router.push` destinations that are healthy navigation; only rows above are treated as Gate 1 decisions.
- Regenerating the raw file does not clear human decisions in this document — update classifications when new inert CTAs appear.
- Persona Simulation (B3/B4) remains **reachable** after Gate 1; the decision is recorded as planned hide for Phase 7 so Gate 1 is not blocked by an undecided inert CTA. Landing page (B2) is already non-actionable in UI.
