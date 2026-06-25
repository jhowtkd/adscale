# Requirements: ADScale v13.5 Assistente Conversacional de Ações

**Defined:** 2026-06-25
**Milestone:** v13.5 Assistente Conversacional de Ações
**Core Value:** Users can go from a single base creative and a brief to multiple platform-ready ad variations in minutes, with full creative control and review.

## Scope

Transformar ADScale em uma experiência chat-first para ações rápidas e campanhas completas. O assistente deve identificar a intenção do usuário, aplicar um contrato mínimo por ação, e só pedir briefing completo quando a ação realmente exigir. A execução precisa preservar isolamento multi-cliente, controle de créditos, confirmação explícita para ações de escrita/custo, e reutilização das superfícies maduras do workspace.

**In scope:** multi-`clientProfile` por workspace, persistência conversacional, `/assistant`, drawer de campanha, action contracts, MiniMax M3 adapter, context builder allowlistado, tool policy deny-by-default, quick actions sem briefing completo, e happy path de ideia a pacote final.

**Out of scope:** integrações Meta/Google/TikTok, dashboard multi-marca profundo, automação avançada de fila de incerteza, paridade total de todos os edge cases do workspace dentro do chat, e qualquer claim de customer-real sem evidência operacional da v13.4.

## v13.5 Requirements

### Multi-Cliente

- [x] **CLIENT-01**: Workspace can contain multiple `clientProfile` records after removing the current workspace-level uniqueness constraint.
- [x] **CLIENT-02**: Brand kit, memory, references, voice configuration, corpus, and calibration rules are scoped by `clientProfileId`.
- [x] **CLIENT-03**: Existing campaigns continue to resolve their client profile correctly after the migration.

### Assistente

- [ ] **CHAT-01**: User can access `/assistant` as a primary authenticated app section.
- [x] **CHAT-02**: User can navigate conversations by client, campaign, and thread.
- [x] **CHAT-03**: User can create a client and a campaign draft from the chat flow.
- [x] **CHAT-04**: User can continue the same campaign thread from a drawer inside the campaign workspace.

### Action Contracts

- [x] **ACT-01**: System classifies user intent as a quick action or complete campaign flow before asking for inputs.
- [x] **ACT-02**: Each supported action declares required inputs, optional inputs, allowed roles, risk copy, credit impact, and confirmation policy.
- [ ] **ACT-03**: User can run quick restyling without completing a full campaign brief.
- [ ] **ACT-04**: Format adaptation, regeneration, review, save-reference, and package actions use their own minimum input contracts.
- [ ] **ACT-05**: Complete campaign flow requires a stronger minimum brief: client, product or offer, audience, objective, CTA, platform or initial format, critical constraints, and base creative.

### Modelo e Tools

- [x] **AI-01**: `AssistantModelClient` abstracts the model provider from assistant orchestration.
- [x] **AI-02**: MiniMax M3 is implemented as the first assistant model adapter with text streaming.
- [x] **AI-03**: Context sent to the provider is broad enough for project-aware assistance but allowlisted to exclude secrets, raw signed URLs, internal evidence payloads, and out-of-scope customer data.
- [x] **AI-04**: Tool calls are validated server-side with deny-by-default permissions, role gates, schema validation, scope checks, and confirmation requirements.
- [x] **AI-05**: Provider reasoning or thinking fields are not displayed to users and are not persisted as conversation history.

### Execução e UX

- [x] **EXEC-01**: Actions that write data, spend credits, create jobs, persist memory, or export/package outputs require a confirmed action card.
- [x] **EXEC-02**: Long-running actions use existing pipeline/Inngest job behavior and show status in the assistant thread.
- [ ] **EXEC-03**: Full review inside the assistant reuses existing workspace review components instead of duplicating review logic in chat bubbles.
- [ ] **EXEC-04**: User can complete the happy path from loose idea to final package: select/create client, create campaign draft, satisfy the relevant action contract, generate preview, approve direction, generate batch, review, and create delivery package.

## Future Requirements

### Distribution Integrations

- **INTEG-01**: User can publish or sync approved packages to Meta Ads.
- **INTEG-02**: User can publish or sync approved packages to Google Ads.
- **INTEG-03**: User can publish or sync approved packages to TikTok Ads.

### Advanced Assistant Operations

- **OPS-01**: Owner can compare action usage and drop-off across many clients from an assistant analytics panel.
- **OPS-02**: Assistant can route uncertain outputs into human review automatically when confidence or evidence is low.
- **OPS-03**: Assistant can propose calibration rule approvals or deprecations based on repeated review patterns.

### Advanced Workspace Parity

- **PARITY-01**: Assistant can operate every workspace edge case without opening the campaign page.
- **PARITY-02**: Assistant can create multi-campaign projects or folders above the campaign level.

## Out of Scope

| Feature | Reason |
| --- | --- |
| Full workspace feature parity inside chat | v13.5 should reuse mature workspace components and prove the chat-first operating loop before duplicating every edge case. |
| Distribution integrations | The milestone is about action orchestration, not external ad-channel publishing. |
| Sending raw workspace data to the provider | Multi-client and customer-facing use require allowlisted context, not unbounded provider payloads. |
| Persisting provider reasoning/thinking | Product auditability comes from messages, action cards, tool calls, confirmations, and results. |
| Customer-real claims unlock | Still depends on v13.4 live operational evidence and is not part of the assistant milestone. |
| A new project/folder entity above campaign | v13.5 uses `Cliente > Campanha > Thread`; project folders can be reconsidered after usage data. |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| CLIENT-01 | Phase 177 | Complete |
| CLIENT-02 | Phase 177 | Complete |
| CLIENT-03 | Phase 177 | Complete |
| CHAT-01 | Phase 181 | Pending |
| CHAT-02 | Phase 181 | Complete |
| CHAT-03 | Phase 181 | Complete |
| CHAT-04 | Phase 181 | Complete |
| ACT-01 | Phase 180 | Complete |
| ACT-02 | Phase 180 | Complete |
| ACT-03 | Phase 182 | Pending |
| ACT-04 | Phase 182 | Pending |
| ACT-05 | Phase 183 | Pending |
| AI-01 | Phase 179 | Complete |
| AI-02 | Phase 179 | Complete |
| AI-03 | Phase 179 | Complete |
| AI-04 | Phase 179 | Complete |
| AI-05 | Phase 179 | Complete |
| EXEC-01 | Phase 180 | Complete |
| EXEC-02 | Phase 178 | Complete |
| EXEC-03 | Phase 183 | Pending |
| EXEC-04 | Phase 183 | Pending |

**Coverage:**
- v13.5 requirements: 21 total
- Mapped to phases: 21
- Unmapped: 0

---
*Requirements defined: 2026-06-25*
*Last updated: 2026-06-25 after v13.5 milestone creation*
