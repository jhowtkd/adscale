# Requirements: ADScale v11.6 Creative Strategy Cockpit

**Core Value:** Users can go from a single base creative and a brief to multiple platform-ready ad variations in minutes, with full creative control and review.

## Scope

v11.6 turns existing ADScale capabilities into a guided creative decision flow:

1. Diagnose whether the base creative and brief are ready.
2. Help the user strengthen weak briefing inputs one question at a time.
3. Suggest concrete generation recipes.
4. Generate one low-cost preview before full batch spend.
5. Package approved outputs for client review and delivery.

## Requirements

### Creative Readiness

- [x] **READY-01**: User can run a pre-generation Creative Readiness Score on a campaign with a base creative.
- [x] **READY-02**: User can see readiness breakdown by offer clarity, text legibility, visual hierarchy, CTA prominence, brand fit, and platform fit.
- [x] **READY-03**: User can see blocking issues separately from improvement suggestions before generation.
- [x] **READY-04**: User can rerun readiness after changing briefing or base creative without losing prior derivation history.
- [x] **READY-05**: Readiness uses existing campaign, brand kit, creative contract, and preflight/QA concepts without adding a new AI provider.

### Guided Briefing

- [x] **GUIDE-01**: User with a weak brief can answer guided questions one at a time instead of filling a full form up front.
- [x] **GUIDE-02**: Guided briefing starts from product/offer and derives audience, promise, objections, CTA, platforms, and constraints.
- [x] **GUIDE-03**: User can accept, edit, or skip each guided briefing suggestion.
- [x] **GUIDE-04**: Guided answers persist as campaign draft data and remain editable in the normal campaign form.
- [x] **GUIDE-05**: Guided briefing supports PT-BR and EN copy without changing generation language rules.

### Strategy Recipes

- [x] **RECIPE-01**: User can choose from strategy recipes such as Safe Iteration, Performance Push, and Visual Differentiation.
- [x] **RECIPE-02**: Each recipe maps to concrete generation settings: mode, creative level, CTA set, formats, preservation emphasis, and style intensity where relevant.
- [x] **RECIPE-03**: Recipes explain the tradeoff in user terms before generation.
- [x] **RECIPE-04**: Recipe suggestions use readiness findings, brand kit data, and campaign context.
- [x] **RECIPE-05**: User can override recipe settings before queueing generation.

### Preview Gate

- [x] **PREVIEW-01**: User can generate one preview derivation before creating a full batch.
- [x] **PREVIEW-02**: Preview derivation uses the same creative contract and quality gate as full generation.
- [x] **PREVIEW-03**: User can approve preview settings into a full batch or revise the recipe/brief first.
- [x] **PREVIEW-04**: Preview-first flow makes credit spend visible before the batch is queued.

### Client Delivery

- [x] **DELIVER-01**: User can create a client approval package from approved derivations.
- [x] **DELIVER-02**: Package includes selected formats, creative notes, status, and download actions.
- [x] **DELIVER-03**: Package uses workspace-safe share links and signed asset access.
- [x] **DELIVER-04**: User can regenerate or update the package after approval changes.

### Verification and Handoff

- [x] **CQA-01**: Automated tests cover readiness normalization, guided briefing state, recipe mapping, and preview gating.
- [x] **CQA-02**: Browser smoke verifies the cockpit path from campaign draft to preview to delivery package.
- [x] **CQA-03**: Handoff documents cost, privacy, and known AI limitations for beta users.

## Future Requirements

- Direct Meta/TikTok/Google Ads publishing from approved packages.
- Multi-stakeholder comment threads on public share pages.
- Automatic budget optimizer across recipes and target formats.
- Competitor upload workflow as a first-class campaign setup path.

## Out of Scope

- New AI model or provider migration.
- Real-time collaborative editing.
- Paid media platform integrations.
- Replacing the existing campaign form entirely.
- Public marketing site changes.

## Traceability

| Requirement | Phase |
|-------------|-------|
| READY-01 | 61 |
| READY-02 | 61 |
| READY-03 | 61 |
| READY-04 | 61 |
| READY-05 | 61 |
| GUIDE-01 | 62 |
| GUIDE-02 | 62 |
| GUIDE-03 | 62 |
| GUIDE-04 | 62 |
| GUIDE-05 | 62 |
| RECIPE-01 | 63 |
| RECIPE-02 | 63 |
| RECIPE-03 | 63 |
| RECIPE-04 | 63 |
| RECIPE-05 | 63 |
| PREVIEW-01 | 63 |
| PREVIEW-02 | 63 |
| PREVIEW-03 | 63 |
| PREVIEW-04 | 63 |
| DELIVER-01 | 64 |
| DELIVER-02 | 64 |
| DELIVER-03 | 64 |
| DELIVER-04 | 64 |
| CQA-01 | 65 |
| CQA-02 | 65 |
| CQA-03 | 65 |
