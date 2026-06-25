# Phase 182: Quick Actions - Context

**Gathered:** 2026-06-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Fase 182 entrega **execução pós-confirmação** das quick actions via contratos registrados: restyle, adaptação de formato, regeneração, review, save-reference e package. Prova que caminhos quick não exigem briefing completo de campanha.

**Requisitos:** ACT-03, ACT-04

**Não inclui:** happy path campanha completa (183), review visual embutido no painel (183/EXEC-03).
</domain>

<decisions>
## Implementation Decisions

### Contratos ACT-04 (defaults recomendados)

- `quick_restyle` — já existe (Phase 180); adicionar executor
- `quick_format_adapt` — `sourceDerivationId` + `targetFormat` obrigatórios
- `quick_regenerate` — `derivationId` obrigatório; `feedback` opcional
- `quick_review` — `derivationId` + `decision` obrigatórios; `directionReason` opcional
- `quick_save_reference` — `derivationId` + `label` obrigatórios; `kind`/`notes` opcionais
- `quick_package` — `sourceDerivationId` + `formats[]` obrigatórios

Todos com `confirmationPolicy: "required"` e `intentFamily: "quick_action"`.

### Execução pós-confirm

- Confirm route: `revalidateOnConfirm` → `confirmAssistantAction` → `executeConfirmedAssistantAction`
- Ações assíncronas (restyle, format, regenerate, package): `confirmed` → `running` + `assistantActionId` no evento Inngest; job sync existente completa/falha
- Ações síncronas (review, save-reference): `confirmed` → `running` → `completed` na mesma requisição
- Reutilizar pipelines existentes (`restyle` route logic, derivation job, regenerate/review/save-reference/delivery-package APIs) via módulo server-side — sem duplicar HTTP

### Resolução de campanha

- `baseCreativeId` / derivações resolvem `campaignId` via asset ou derivation row
- Thread `clientProfileId` deve alinhar com campanha; escopo validado no executor
- Briefing completo (product, audience, plan hooks) **não** é exigido para quick paths

### Claude's Discretion

- Nomes exatos dos `actionType` strings (prefixo `quick_`)
- Idempotency keys de crédito por actionId
- Estrutura de sub-handlers no módulo `action-execution/`
</decisions>

<code_context>
## Existing Code Insights

- `app/src/server/assistant/action-contracts/` — registry, validate, 2 contratos exemplo
- `app/src/app/api/campaigns/[id]/restyle/route.ts` — restyling pipeline
- `app/src/app/api/derivations/[id]/{regenerate,review,save-reference,delivery-package}/route.ts`
- `app/src/server/jobs/derivation.ts` — `assistantActionId` + `syncAssistantActionFromJob`
- `app/src/server/repositories/assistant-job-sync.ts` — status mapping
</code_context>

---

*Phase: 182-quick-actions*
*Context gathered: 2026-06-25*
