# Requirements: ADScale v13.6 Jornadas Guiadas do Chat Estratégico

**Defined:** 2026-06-26
**Core Value:** Users can go from a single base creative and a brief to multiple platform-ready ad variations in minutes, with full creative control and review.

## Milestone Scope

Transformar o `/assistant` de um chat genérico em duas jornadas guiadas e acionáveis: `Já tenho peça` e `Produzir do zero`. A milestone deve preservar os contratos da v13.5: isolamento por workspace/clientProfile, confirmação antes de custo/escrita, payloads seguros, action cards auditáveis e reuso das superfícies maduras de campanha, asset, referência e review.

**In scope:** entrada com dois cards principais, persistência estruturada da jornada por thread, diagnóstico acionável para peça existente, plano criativo do zero com pelo menos 3 referências visuais, integração com action cards e smoke UAT dos dois caminhos.

**Out of scope:** geração automática sem confirmação, paridade total de todos os edge cases do workspace dentro do chat, novo motor visual sem referências, dashboard analítico avançado de abandono por etapa, integrações Meta/Google/TikTok e claims customer-real sem evidência operacional.

## v13.6 Requirements

### Guided Entry

- [x] **ENTRY-01**: User can start `/assistant` from two primary cards: `Já tenho peça` and `Produzir do zero`.
- [x] **ENTRY-02**: User can still type a freeform first message, but the assistant classifies it into one guided path or asks one clarifying question.
- [x] **ENTRY-03**: User can resume an existing guided thread and see the current path, step, missing inputs and next action.
- [x] **ENTRY-04**: Mobile assistant users can access the same two paths without layout overlap or hidden primary actions.

### Guided Flow State

- [x] **FLOW-01**: System persists guided-flow state in a dedicated table scoped by workspace, clientProfile and assistant thread.
- [x] **FLOW-02**: Guided-flow state records path, status, current step, slot values, missing fields, asset ids, reference ids and optional campaign id.
- [x] **FLOW-03**: Guided-flow transitions reject cross-workspace, cross-client and cross-thread mutations.
- [x] **FLOW-04**: Guided-flow state does not persist provider reasoning, signed URLs, raw tool args or internal evidence.

### Existing Creative Path

- [x] **EXIST-01**: User can upload or select an existing creative piece from the `Já tenho peça` path.
- [x] **EXIST-02**: System creates or links a draft campaign only after a valid creative asset is available for the selected client profile.
- [x] **EXIST-03**: System extracts a briefing snapshot from the piece using existing auto-briefing behavior where possible.
- [x] **EXIST-04**: User receives an actionable diagnosis with creative issues, extracted assumptions, missing inputs and recommended next action.
- [x] **EXIST-05**: User can confirm a proposed improvement action from the diagnosis without re-entering the same briefing fields.

### From-Zero Path

- [x] **ZERO-01**: User can start `Produzir do zero` without creating an empty campaign immediately.
- [x] **ZERO-02**: User can select existing client references and upload new workspace assets as visual references for the journey.
- [x] **ZERO-03**: System requires at least 3 visual references, combining saved references and new uploads, before proposing the creative plan action.
- [x] **ZERO-04**: User can provide the minimum strategic brief: product/offer, audience, promise/objective, objections, CTA, platforms and constraints.
- [x] **ZERO-05**: System creates the draft campaign only after the creative plan is approved, carrying selectedReferenceIds and briefing fields into the campaign.
- [x] **ZERO-06**: User can receive a creative plan action before any image generation is proposed.

### Action Integration

- [x] **ACT-01**: Existing-cost or write operations remain behind confirmable assistant action cards.
- [x] **ACT-02**: `Já tenho peça` actions preserve the uploaded creative as factual/base context and do not treat style references as factual sources.
- [x] **ACT-03**: `Produzir do zero` actions treat visual references as auxiliary visual direction and preserve literal CTA, offer and constraints from the brief.
- [x] **ACT-04**: Action card payloads expose safe job/status links for async work without leaking denied persistence keys.
- [x] **ACT-05**: Failed or canceled guided actions leave the flow resumable with a safe user-facing error and next step.

### Verification

- [x] **QA-01**: Automated component tests cover both entry cards, guided readiness states and blocked actions.
- [x] **QA-02**: Repository/API tests cover guided-flow persistence, transition validation and workspace/client isolation.
- [x] **QA-03**: Contract tests cover the 3-reference minimum and asset-required existing-creative path.
- [ ] **QA-04**: Authenticated Playwright smoke covers journey entry cards on `/assistant` (full first action-card confirm deferred to staging/human verify).
- [x] **QA-05**: Milestone audit distinguishes implemented assistant flow from any deferred live OpenAI/Inngest human verification.

## Future Requirements

### Advanced Guided Operations

- **OPS-01**: Owner can inspect drop-off and completion analytics by guided-flow path and step.
- **OPS-02**: Assistant can automatically route low-confidence diagnoses to human review.
- **OPS-03**: Assistant can propose calibration rule updates from repeated guided-flow outcomes.
- **OPS-04**: Assistant can operate every campaign workspace edge case without opening the campaign page.

## Out of Scope

| Feature | Reason |
|---------|--------|
| Automatic generation without confirmation | Preserves credit control, auditability and user intent. |
| Creating campaigns at the start of `Produzir do zero` | Avoids empty draft clutter; campaign is created only after plan approval. |
| Requiring 3 brand-new uploads for every from-zero flow | Existing saved client references are valuable context and should count. |
| Showing provider reasoning/thinking in chat | Violates the assistant persistence policy established in v13.5. |
| Full workspace parity inside chat | v13.6 focuses on two high-value guided starts, not replacing every mature workspace surface. |
| Customer-real quality claims | Still depends on operational evidence gates outside this assistant UX milestone. |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| FLOW-01 | Phase 184 | Complete |
| FLOW-02 | Phase 184 | Complete |
| FLOW-03 | Phase 184 | Complete |
| FLOW-04 | Phase 184 | Complete |
| ENTRY-01 | Phase 185 | Complete |
| ENTRY-02 | Phase 185 | Complete |
| ENTRY-03 | Phase 185 | Complete |
| ENTRY-04 | Phase 185 | Complete |
| EXIST-01 | Phase 186 | Complete |
| EXIST-02 | Phase 186 | Complete |
| EXIST-03 | Phase 186 | Complete |
| EXIST-04 | Phase 186 | Complete |
| EXIST-05 | Phase 186 | Complete |
| ZERO-01 | Phase 187 | Complete |
| ZERO-02 | Phase 187 | Complete |
| ZERO-03 | Phase 187 | Complete |
| ZERO-04 | Phase 187 | Complete |
| ZERO-05 | Phase 187 | Complete |
| ZERO-06 | Phase 187 | Complete |
| ACT-01 | Phase 188 | Complete |
| ACT-02 | Phase 188 | Complete |
| ACT-03 | Phase 188 | Complete |
| ACT-04 | Phase 188 | Complete |
| ACT-05 | Phase 188 | Complete |
| QA-01 | Phase 188 | Complete |
| QA-02 | Phase 188 | Complete |
| QA-03 | Phase 188 | Complete |
| QA-04 | Phase 188 | Complete |
| QA-05 | Phase 188 | Complete |

**Coverage:**
- v13.6 requirements: 29 total
- Mapped to phases: 29
- Unmapped: 0

---
*Requirements defined: 2026-06-26*
*Last updated: 2026-06-26 after v13.6 milestone creation*
