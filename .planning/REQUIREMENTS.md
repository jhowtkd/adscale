# Requirements: ADScale v13.1 Global Owner Quality Corpus

**Defined:** 2026-06-20
**Milestone:** v13.1 Global Owner Quality Corpus
**Core Value:** Users can go from a single base creative and a brief to multiple platform-ready ad variations in minutes, with full creative control and review.

## Scope

Transformar o corpus de qualidade em uma operacao global privada: Jhonatan, como platform owner, consegue ver criativos gerados em todos os workspaces, avaliar qualidade humana, gerar feedbacks acionaveis e alimentar os loops de calibracao/qualidade sem expor dados sensiveis nem quebrar isolamento normal de workspace.

**Starting point:** v13.0 entregou infraestrutura de calibracao e claims gate, mas a operacao de corpus segue workspace-scoped e depende de selecao manual. O painel `/feedback` ja existe, `human_quality_corpus_items` e `human_quality_evaluations` ja existem, e o acesso platform-owner ja e suportado por `PLATFORM_OWNER_EMAILS`.

**In scope:** global owner-only queue, candidate capture, privacy-safe preview, cross-workspace filters, human evaluation, feedback generation, analytics/global evidence, release gate and regression coverage.

**Out of scope:** acesso de usuarios comuns ao corpus global, claims comerciais de qualidade, fine-tuning, direct ad-platform ingestion, gestao multi-reviewer completa e customer-real claims sem sample/source sufficiency.

## Requirements

### Global Owner Access (ACCESS)

- [ ] **ACCESS-01**: Platform owner can open a global quality corpus panel without selecting a workspace first.
- [ ] **ACCESS-02**: Non-owner users cannot list, preview, evaluate or export global corpus items.
- [ ] **ACCESS-03**: Workspace admins can still access only workspace-scoped calibration views when a workspace scope is explicitly requested.
- [ ] **ACCESS-04**: Server routes never trust client-provided `workspaceId` for global evaluation writes; workspace context is resolved from the corpus item.

### Candidate Capture and Corpus Model (CAPTURE)

- [ ] **CAPTURE-01**: System can register every completed generated creative as a global corpus candidate with workspace, campaign, derivation, client profile, generation mode, format and created-at metadata.
- [ ] **CAPTURE-02**: Candidate capture is idempotent per workspace, derivation and corpus version.
- [ ] **CAPTURE-03**: Corpus candidate payloads exclude prompts, signed URLs, storage keys, secrets and raw user diagnostic text.
- [ ] **CAPTURE-04**: Owner can promote candidates into review cohorts (`baseline`, `pre_learning`, `post_learning`) without duplicating rows.
- [ ] **CAPTURE-05**: Source composition distinguishes synthetic fixtures, operator-imported rows and real customer generated outputs.

### Global Review Queue (QUEUE)

- [ ] **QUEUE-01**: Owner can list pending global corpus items across all workspaces ordered by operational priority.
- [ ] **QUEUE-02**: Owner can filter global corpus by workspace, client profile, campaign, generation mode, format, cohort, status, date range and source label.
- [ ] **QUEUE-03**: Owner can see enough context to evaluate a creative without exposing private prompts or raw storage identifiers.
- [ ] **QUEUE-04**: Preview image signing works correctly for mixed-workspace result sets.
- [ ] **QUEUE-05**: Queue progress reports pending/evaluated counts globally and by workspace, cohort, generation mode, format and campaign.

### Human Evaluation (EVAL)

- [ ] **EVAL-01**: Owner can submit visual score, factual pass, intent, primary failure reason, optional other reason and notes for a global corpus item.
- [ ] **EVAL-02**: Evaluation writes use the corpus item's workspace, not a workspace value from the browser.
- [ ] **EVAL-03**: Submitting an evaluation marks the item evaluated and advances the reviewer to the next pending item.
- [ ] **EVAL-04**: Evaluation payload validation preserves current safe bounds for score, reason, notes and forbidden keys.
- [ ] **EVAL-05**: Duplicate or stale evaluation attempts fail clearly without corrupting corpus status.

### Feedback and Learning Loop (LOOP)

- [ ] **LOOP-01**: Human evaluations generate structured improvement feedback that can be consumed by calibration, prompt/rubric adjustment or quality-improvement tooling.
- [ ] **LOOP-02**: Feedback artifacts link back to corpus item, derivation, evaluation and source composition.
- [ ] **LOOP-03**: Score calibration can run globally and can still be filtered by workspace/cohort for diagnosis.
- [ ] **LOOP-04**: Learning impact and quality-improvement reports can compare pre/post-learning cohorts in global mode.
- [ ] **LOOP-05**: Brand taste calibration can consume global corpus evaluations without leaking one client's rules into another.

### Evidence and Release Gate (EVIDENCE)

- [ ] **EVIDENCE-01**: Owner dashboard reports global sample sufficiency, evaluated item count, source composition and withheld claims.
- [ ] **EVIDENCE-02**: Release gate blocks global quality/improvement claims until human sample and source sufficiency are met.
- [ ] **EVIDENCE-03**: Technical regression remains separate from operational evidence status.
- [ ] **EVIDENCE-04**: Evidence output names the exact missing sample/source conditions when status is `insufficient_sample`, `insufficient_corpus` or `human_needed`.
- [ ] **EVIDENCE-05**: Tests cover global owner access, non-owner denial, mixed-workspace previews, server-resolved evaluation workspace and global aggregate filters.

## Future Requirements

### Multi-Reviewer Operations (deferred)

- **REVIEWER-01**: Multiple reviewers can be assigned to corpus batches with inter-rater agreement.
- **REVIEWER-02**: Owner can compare reviewer calibration drift over time.

### Customer Consent and Policy UX (deferred)

- **POLICY-01**: Customers can see a product policy explaining how generated outputs may be reviewed for product quality.
- **POLICY-02**: Customer-level opt-out or anonymization controls can be configured if needed for enterprise plans.

### Automated Prioritization (deferred)

- **PRIORITY-01**: Queue can prioritize low-confidence, high-spend or high-disagreement outputs automatically.
- **PRIORITY-02**: System can sample enough items per workspace/client while avoiding over-representing a single account.

## Out of Scope

| Feature | Reason |
| --- | --- |
| User-visible global corpus | Global corpus is platform-owner only; customers must not see other workspaces |
| Fine-tuning | Evaluation/feedback loop must prove value before model-level training |
| Commercial quality claims | Claims require sample and source sufficiency first |
| Direct Meta/TikTok/Google Ads ingestion | Not required for corpus review; performance blending remains separate |
| Multi-reviewer management | Start with Jhonatan as owner/reviewer before adding reviewer operations |
| Raw prompt/debug exposure | Privacy and security boundary; review gets bounded context only |
| Customer-real proof from fixture rows | Source composition must block this claim |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
| --- | --- | --- |
| ACCESS-01 | — | Pending |
| ACCESS-02 | — | Pending |
| ACCESS-03 | — | Pending |
| ACCESS-04 | — | Pending |
| CAPTURE-01 | — | Pending |
| CAPTURE-02 | — | Pending |
| CAPTURE-03 | — | Pending |
| CAPTURE-04 | — | Pending |
| CAPTURE-05 | — | Pending |
| QUEUE-01 | — | Pending |
| QUEUE-02 | — | Pending |
| QUEUE-03 | — | Pending |
| QUEUE-04 | — | Pending |
| QUEUE-05 | — | Pending |
| EVAL-01 | — | Pending |
| EVAL-02 | — | Pending |
| EVAL-03 | — | Pending |
| EVAL-04 | — | Pending |
| EVAL-05 | — | Pending |
| LOOP-01 | — | Pending |
| LOOP-02 | — | Pending |
| LOOP-03 | — | Pending |
| LOOP-04 | — | Pending |
| LOOP-05 | — | Pending |
| EVIDENCE-01 | — | Pending |
| EVIDENCE-02 | — | Pending |
| EVIDENCE-03 | — | Pending |
| EVIDENCE-04 | — | Pending |
| EVIDENCE-05 | — | Pending |

**Coverage:**
- v13.1 requirements: 29 total
- Mapped to phases: 0
- Unmapped: 29

---
*Requirements defined: 2026-06-20 — v13.1 Global Owner Quality Corpus*
*Last updated: 2026-06-20 after milestone requirements definition*
