# Phase 162: Per-Brand Voice Configuration - Context

**Gathered:** 2026-06-23
**Status:** Ready for planning

<domain>
## Phase Boundary

Persistir e resolver **voz editorial da marca** por `clientProfileId` em vez de hardcode Cenbrap + match de string em nome de campanha. Entregar schema, seed Cenbrap, resolver na geração e superfície owner read-only. Não inclui editor livre de constituição, corpus learning, nem aplicação de regras brand-taste no prompt (fases posteriores).

</domain>

<decisions>
## Implementation Decisions

### Persistência
- Usar tabela dedicada `client_profile_olhar_config` (1:1 com `client_profiles`), não JSONB solto em `client_profiles`.
- Campos espelham `ClientVoice`: principles, positiveSignals, negativeSignals, authorityAndClaims, inviteRhythm, correctButSoulless + metadata (voiceId, displayName, reviewStatus, source).
- `workspace_id` FK para isolamento; cascade com `client_profiles`.

### Resolução na geração
- Resolver voz **somente por `clientProfileId`** passado do campaign/derivation — remover dependência de `matchTerms` na geração.
- Marca **sem config** → nenhum overlay de voz; geração segue com Olhar ADScale global + brief (não bloquear).
- `generation-direction.ts` deixa de chamar `resolveClientVoice({ name, client, product })` para injeção; usa lookup por profile.

### Migração Cenbrap
- Seed automático a partir de `CENBRAP_VOICE` hardcoded para o `clientProfileId` Cenbrap existente no workspace.
- Testes de paridade: prompt section gerada pelo DB deve equivaler à hardcoded pré-migração.
- Após seed + wiring, `REGISTERED_VOICES` / string matching removidos ou deprecated sem uso em generation path.

### Superfície owner (read-only)
- Owner inspeciona voz ativa em `/admin/quality/brands/[clientProfileId]` (ou equivalente no admin quality shell).
- API owner-only GET; sem POST/PATCH de edição livre nesta fase (VOICE-05 view-only).
- Exibir reviewStatus, source (`seeded`), e seções da voz de forma legível.

### Campanhas sem clientProfileId
- Warn-only no fluxo existente (`missing_client_profile`); não introduzir novo hard-block nesta fase.

### Claude's Discretion
- Nome exato da migration (`0053_*`), estrutura do repository module, formato do seed script.
- Detalhes do componente UI (tabs vs página dedicada) desde que read-only e owner-gated.
- Estratégia exata para localizar `clientProfileId` Cenbrap no seed (query por nome vs id fixo em fixture).

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `ClientVoice` interface + `CENBRAP_VOICE` em `app/src/server/ai/voices/cenbrap.ts` — fonte do seed.
- `buildClientVoicePromptSection()` em `client-voice.ts` — reutilizar para montar prompt a partir de config DB.
- `buildGenerationDirectionSection()` em `generation-direction.ts` — ponto de injeção da voz.
- `requirePlatformOwner` + padrão `/api/admin/quality/*` — auth para API de inspeção.
- `client_profiles` table já existe com `workspaceId`.

### Established Patterns
- Drizzle migrations numeradas (`0051`, `0052` recentes).
- Brand isolation via `(workspaceId, clientProfileId)` em calibration_rules/signals.
- Vitest unit tests em `app/src/server/ai/voices/client-voice.test.ts` — estender para resolver por profile.

### Integration Points
- `derivationJob` / `generation-direction` — consumidor primário da voz.
- `isClientVoiceInjectionAllowed` + `voice-review-gate` — revisar para key por profile/voiceId, não só `cenbrap` hardcoded.
- Admin quality shell — nova rota brands detail.

</code_context>

<specifics>
## Specific Ideas

- Usuário confirmou entendimento: voz = overlay editorial da marca no prompt (não áudio/TTS).
- Olhar global permanece; voz é camada opcional por `clientProfileId`.
- Defaults aceitos sem discussão granular de schema/UI.

</specifics>

<deferred>
## Deferred Ideas

- Editor livre de constituição Olhar por marca — milestone futuro.
- Wire brand-taste `calibration_rules` no prompt — Phase 164.
- Corpus evaluations → propostas — Phase 163.
- Bloquear geração quando falta `clientProfileId` — decisão de produto adiada.

</deferred>

---

*Phase: 162-per-brand-voice-configuration*
*Context gathered: 2026-06-23*
