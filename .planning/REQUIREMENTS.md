# Requirements: ADScale v11.7.1 Stabilization

**Defined:** 2026-06-06  
**Core Value:** Users can go from a single base creative and a brief to multiple platform-ready ad variations in minutes, with full creative control and review.

## Scope

v11.7.1 stabilizes the Ads Scientist Progression milestone before beta. It is intentionally narrow: fix the production build blocker, harden runtime data integrity, make mission CTAs resume into the intended surfaces, apply the required migration, and complete UAT evidence.

This milestone should not add new progression mechanics, gamification layers, pricing experiments, or unrelated cockpit features.

## Requirements

### Build and Verification

- [x] **STAB-01**: Developer can run `npm run build` successfully without disabling Next.js TypeScript checks.
- [x] **STAB-02**: Developer can run lint and the focused progression/missions/insights/feedback test suite successfully after fixes.
- [ ] **STAB-03**: Developer can apply migration `0032_workspace_progression.sql` in the target environment and verify the `workspace_progression` table is available.
- [ ] **STAB-04**: Release notes identify any remaining accepted caveats before beta.

### Data Integrity

- [x] **DATA-01**: Mission insight API rejects invalid `missionKey` values at runtime before recording feedback.
- [x] **DATA-02**: Progression snapshot persistence uses an atomic upsert or equivalent conflict-safe path for concurrent first access.
- [x] **DATA-03**: Tests cover invalid mission insight keys and concurrent progression snapshot creation.

### Mission Resume UX

- [ ] **UX-01**: User who clicks a progression or mission CTA lands on the intended campaign workflow surface, not only the campaign detail page.
- [ ] **UX-02**: Existing campaign workspace behavior remains unchanged when no mission/progression resume target is present.

### Beta UAT Readiness

- [ ] **UAT-01**: Beta operator can complete the `71-UAT-EVIDENCE.md` path from a fresh workspace through at least Analista Criativo.
- [ ] **UAT-02**: UAT evidence captures build, migration, mission completion, insight capture, credit display, and owner triage checks.
- [ ] **UAT-03**: Milestone archive/handoff clearly states whether v11.7.1 is beta-ready.

## Future Requirements

- Owner analytics for mission conversion by beta cohort.
- Automated E2E for the full Ads Scientist path.
- Direct top-up or plan purchase flow tied to mission value moments.
- More granular mission resume anchors once the campaign workspace has formal routeable subviews.

## Out of Scope

| Feature | Reason |
|---------|--------|
| New Ads Scientist levels or rewards | v11.7.1 is stabilization, not expansion |
| New pricing or Stripe purchase flow | Requires product and billing decisions beyond beta readiness |
| New AI generation behavior | Current blockers are build, persistence, resume UX, and UAT |
| Public beta onboarding campaign | Should wait until stabilization gates pass |
| Full redesign of campaign workspace navigation | Only the mission/progression resume path is in scope |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| STAB-01 | Phase 72 | Planned |
| STAB-02 | Phase 72 | Planned |
| DATA-01 | Phase 72 | Planned |
| DATA-02 | Phase 72 | Planned |
| DATA-03 | Phase 72 | Planned |
| UX-01 | Phase 73 | Planned |
| UX-02 | Phase 73 | Planned |
| STAB-03 | Phase 74 | Planned |
| STAB-04 | Phase 74 | Planned |
| UAT-01 | Phase 74 | Planned |
| UAT-02 | Phase 74 | Planned |
| UAT-03 | Phase 74 | Planned |

**Coverage:**
- v11.7.1 requirements: 12 total
- Mapped to phases: 12
- Unmapped: 0

---
*Requirements defined: 2026-06-06*
