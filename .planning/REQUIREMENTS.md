# Requirements: ADScale v11.9 UX de Entrega e Créditos

**Defined:** 2026-06-07  
**Milestone:** v11.9 UX de Entrega e Créditos  
**Core Value:** Users can go from a single base creative and a brief to multiple platform-ready ad variations in minutes, with full creative control and review.

## Scope

v11.9 reduces credit surprises and delivery friction (approval package, share link, batch gate) based on the v11.8 learning gate (Q7–Q9). Builds on beta analytics, owner dashboard, and F-01 preview credit copy from v11.8.

**In scope:** Credit estimate transparency, batch gate messaging, credit event enrichment, delivery/stale package UX, owner credit surprise ranking, session timeline gaps, CSV export columns, regression tests.

**Out of scope:** `recipe_selected` events, tradeoff events (F-08/F-09), readiness threshold tuning (F-11), new AI models, third-party analytics.

## Requirements

### Créditos (CRED)

- [ ] **CRED-01**: User sees credit estimate breakdown before confirming batch derivation.
- [ ] **CRED-02**: Batch gate blocks with clear reason when balance is insufficient (estimate vs balance).
- [ ] **CRED-03**: `credit_spend` / `credit_blocked` events include `operation_key` and estimate vs actual delta when applicable.
- [ ] **CRED-04**: Preview gate shows credits already spent plus estimate disclaimer (extends v11.8 F-01).

### Entrega (DELIV)

- [ ] **DELIV-01**: Approval package shows stale state with actionable tooltip/copy (F-10).
- [ ] **DELIV-02**: Share link flow includes self-serve guidance without operator hand-holding (Q7).
- [ ] **DELIV-03**: Approval package refresh communicates when assets are outdated.

### Analytics Owner (DASH)

- [ ] **DASH-01**: Owner sees credit surprise ranking by operation on `OwnerAnalyticsPanel` (F-15).
- [ ] **DASH-02**: Session timeline with stage gaps on owner dashboard (F-07).
- [ ] **DASH-03**: CSV export includes credit surprise by operation columns.

### Verificação (QA)

- [ ] **QA-01**: Regression tests for credit copy, batch gate, and stale package states.
- [ ] **QA-02**: `npm test`, `npm run lint`, and `npm run build` pass in `app/`.

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| CRED-01 | Phase 80 | Pending |
| CRED-02 | Phase 80 | Pending |
| CRED-04 | Phase 80 | Pending |
| CRED-03 | Phase 81 | Pending |
| DELIV-01 | Phase 82 | Pending |
| DELIV-02 | Phase 82 | Pending |
| DELIV-03 | Phase 82 | Pending |
| DASH-01 | Phase 83 | Pending |
| DASH-02 | Phase 83 | Pending |
| DASH-03 | Phase 83 | Pending |
| QA-01 | Phase 84 | Pending |
| QA-02 | Phase 84 | Pending |

**Coverage:** 13/13 v1 requirements mapped ✓

## Deferred from v11.8

See `milestones/v11.8-phases/79-evidence-driven-friction-fixes/79-V11.9-BACKLOG.md` for F-06..F-14 items not in v11.9 scope.

| ID | Item | v11.9 status |
|----|------|--------------|
| F-06 | Preview abandoned vs operator approved mismatch | Deferred |
| F-08 | Tradeoff copy readership | Out of scope |
| F-09 | Recipe selection analytics | Out of scope |
| F-11 | Readiness false-positive workflow | Deferred |
| F-12 | Guided briefing skip patterns | Deferred |
| F-14 | Build test drift (`creative-quality-gate-orchestration`) | Deferred |

## Out of Scope

| Feature | Reason |
|---------|--------|
| `recipe_selected` / tradeoff events | Learning gate chose delivery/credits over recipe instrumentation |
| Readiness threshold tuning | Second priority per LEARN-03; not this milestone |
| New AI models or generation behavior | Confounds credit/delivery UX learning |
| Third-party analytics SDK | First-party events sufficient for operator beta |
