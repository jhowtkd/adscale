# Requirements: ADScale v11.7 Ads Scientist Progression

**Defined:** 2026-06-06  
**Core Value:** Users can go from a single base creative and a brief to multiple platform-ready ad variations in minutes, with full creative control and review.

## Scope

v11.7 adds a progression system that helps beta users learn the product by doing real work. The system should make the app feel more playful and directed while capturing actionable insight and connecting credit usage to visible creative value.

The milestone balances activation and monetization: missions should naturally lead users through credit-consuming actions, but the product must explain why a credit spend matters and avoid manipulative dark patterns.

## Requirements

### Progression Status

- [x] **PROG-01**: User can see their current Ads Scientist status in the dashboard or workspace shell.
- [x] **PROG-02**: User can progress through at least four named levels: Jovem Aprendiz, Analista Criativo, Estrategista de Ads, and Cientista de Ads.
- [x] **PROG-03**: Status progression is based on completed product actions, not only page visits or time spent.
- [x] **PROG-04**: User can see what actions unlock the next status and which actions are already complete.
- [x] **PROG-05**: Progress state persists per workspace and does not reset across sessions.

### Guided Missions

- [x] **MISS-01**: User can view a mission list that teaches the core ADScale workflow in a recommended order.
- [x] **MISS-02**: User can complete missions for campaign setup, base creative upload, readiness analysis, guided briefing, strategy recipe selection, preview generation, batch generation, review, regeneration, export, and share.
- [x] **MISS-03**: Mission completion can be inferred from existing product events where possible instead of requiring manual checkboxes.
- [x] **MISS-04**: User can resume an incomplete mission from a clear call to action that deep-links to the relevant app surface.
- [x] **MISS-05**: Missions include concise learning copy that explains why the action matters for better ads.
- [x] **MISS-06**: Mission UI handles empty, loading, completed, and blocked states without disrupting the existing cockpit workflow.

### Insight Capture

- [x] **INS-01**: User can answer lightweight contextual prompts after key mission moments, including first readiness run, first preview, first rejection, first regeneration, and first share/export.
- [x] **INS-02**: Insight prompts capture structured stage, sentiment, reason, and optional free-text without exposing raw prompts or model internals.
- [x] **INS-03**: Product owner can view mission-linked insight in the existing feedback/triage surface or a clearly connected owner view.
- [x] **INS-04**: Skipped missions and abandoned credit-spend moments are recorded as product signals when privacy-safe.
- [x] **INS-05**: Insight capture respects workspace boundaries and avoids collecting secrets, API keys, full prompts, or unrelated user content.

### Credit-Aware Activation

- [x] **CRED-01**: Credit-consuming missions show expected credit cost before the user starts the action.
- [x] **CRED-02**: User can see remaining beta allowance or credit balance in the progression context when a mission involves generation.
- [x] **CRED-03**: Upgrade or top-up prompts appear only after meaningful value moments or clear insufficiency, not before the user understands the workflow.
- [x] **CRED-04**: Owner can distinguish healthy credit consumption from frustration signals using mission completion and insight data.

### Verification

- [x] **QA-01**: Automated tests cover progression state calculation, mission completion rules, and workspace isolation.
- [x] **QA-02**: Automated tests cover insight creation, sanitization, and owner visibility.
- [x] **QA-03**: Automated tests cover credit estimate display and insufficient-credit progression states.
- [x] **QA-04**: Beta UAT checklist verifies that a new user can progress from Jovem Aprendiz to at least Analista Criativo using real app actions.

## Future Requirements

- Seasonal or campaign-specific challenge packs.
- Team leaderboard or multi-user workspace competition.
- Reward credits or discounts based on progression completion.
- Adaptive mission ordering based on observed user behavior.
- Public certificate or shareable "Cientista de Ads" achievement.
- In-app academy with longer lessons, examples, and quizzes.

## Out of Scope

| Feature | Reason |
|---------|--------|
| Direct Meta/TikTok/Google publishing | Too large for the activation milestone and not needed to teach current workflow |
| Client approval comments on public share links | Useful later, but v11.7 focuses on beta user activation inside the app |
| Full admin CRM for beta cohorts | Owner only needs mission-linked insight and signals for now |
| Manipulative streaks or forced credit burn | Progression must feel useful and transparent, not like a dark pattern |
| Monetary rewards or coupons | Requires billing/product policy decisions beyond this milestone |
| New AI model/provider behavior | Existing cockpit/generation capabilities are enough for progression |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| PROG-01 | Phase 68 | Complete |
| PROG-02 | Phase 68 | Complete |
| PROG-03 | Phase 68 | Complete |
| PROG-04 | Phase 68 | Complete |
| PROG-05 | Phase 68 | Complete |
| MISS-01 | Phase 69 | Complete |
| MISS-02 | Phase 69 | Complete |
| MISS-03 | Phase 69 | Complete |
| MISS-04 | Phase 69 | Complete |
| MISS-05 | Phase 69 | Complete |
| MISS-06 | Phase 69 | Complete |
| INS-01 | Phase 70 | Complete |
| INS-02 | Phase 70 | Complete |
| INS-03 | Phase 70 | Complete |
| INS-04 | Phase 70 | Complete |
| INS-05 | Phase 70 | Complete |
| CRED-01 | Phase 71 | Complete |
| CRED-02 | Phase 71 | Complete |
| CRED-03 | Phase 71 | Complete |
| CRED-04 | Phase 71 | Complete |
| QA-01 | Phase 71 | Complete |
| QA-02 | Phase 71 | Complete |
| QA-03 | Phase 71 | Complete |
| QA-04 | Phase 71 | Complete |

**Coverage:**
- v11.7 requirements: 24 total
- Mapped to phases: 24
- Unmapped: 0

---
*Requirements defined: 2026-06-06*
*Last updated: 2026-06-06 after v11.7 milestone initialization*
