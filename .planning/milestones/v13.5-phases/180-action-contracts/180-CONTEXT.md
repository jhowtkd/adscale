# Phase 180: Action Contracts - Context

**Gathered:** 2026-06-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Fase 180 define a **gramática de execução** do assistente: classificação de intent, contratos com inputs obrigatórios/opcionais, roles, risco, impacto de créditos e política de confirmação.

Entrega o **registry de contratos** tipado, classificador de intent, validação em `propose_action`, e 2 contratos exemplo (`quick_restyle`, `start_complete_campaign`). Implementação end-to-end das quick actions fica na **Fase 182**; UI na **181**.

**Requisitos:** ACT-01, ACT-02, EXEC-01
</domain>

<decisions>
## Implementation Decisions

### Classificação de intent (ACT-01)

- Taxonomia **binária:** `quick_action` | `complete_campaign`.
- **Server-side primeiro:** heurísticas/keywords no servidor; fallback para o modelo quando heurística não resolver.
- Classificar **quando o usuário pedir algo que pareça uma ação** — não na primeira mensagem genérica de boas-vindas, mas **antes** de coletar inputs específicos do contrato.
- Intent **ambíguo** → uma pergunta curta de clarificação (ex.: "ação pontual ou campanha completa?") antes de seguir.
- Classificação deve orientar qual família de contrato aplicar; não substitui escolha do `actionType` concreto dentro da família.

### Registry de contratos (ACT-02)

- **Registry central** tipado em `app/src/server/assistant/action-contracts/registry.ts` (ou caminho equivalente).
- Cada contrato declara: `actionType`, inputs obrigatórios, opcionais, `allowedRoles`, `riskLabel`, `creditImpact`, `confirmationPolicy`, e metadados para copy de risco.
- **Fase 180:** gramática completa + **2 contratos exemplo:**
  - `quick_restyle` — prova do caminho quick (inputs mínimos; briefing completo não exigido)
  - `start_complete_campaign` — prova do caminho campanha (briefing mínimo mais forte)
- Demais contratos ACT-04 (format adapt, regenerate, review, save-reference, package) → **Fase 182**, mas o registry já deve suportar extensão sem refactor.

### Validação e confirmação (EXEC-01, ACT-02)

- **`propose_action` valida contra o registry** antes de criar action card: schema Zod por contrato, role gate, inputs obrigatórios presentes.
- Ações que **escrevem dados, gastam créditos, criam jobs, persistem memória ou exportam/empacotam** exigem action card confirmado — política já travada em v13.5; contrato expõe `confirmationPolicy: "required"`.
- Inputs opcionais ausentes **não bloqueiam** propose — contrato gera **copy de risco honesta** (template por campo opcional no contrato, não LLM inventando risco nesta fase).
- Revalidação leve no **confirm** da action (inputs ainda válidos, estado `pending`) — sem segundo formulário.

### Integração com Fases 178–179

- Usar `createAssistantAction` existente após validação do contrato.
- Tool policy (179) continua deny-by-default; `propose_action` ganha camada de contrato.
- Intent classifier pode ser módulo chamado pelo orchestrator antes de invocar tools de coleta/propose.

### Claude's Discretion

- Heurísticas exatas do classificador server-side e lista de keywords.
- Formato de `creditImpact` (número fixo vs. estimativa via billing existente).
- Estrutura interna de tipos (`ActionContract`, `IntentClassificationResult`).
- Se classificador roda como função pura ou tool interna não exposta ao provider.
</decisions>

<specifics>
## Specific Ideas

- `propose_action` hoje aceita `actionType` livre — Fase 180 restringe a tipos registrados.
- `quick_restyle` exemplo: base image + style reference obrigatórios; briefing de campanha **não** obrigatório (prepara ACT-03 na 182).
- `start_complete_campaign` exemplo: client, product/offer, audience, objective, CTA, platform/format, constraints, base creative — alinhado a ACT-05 mas só como contrato/registro nesta fase; happy path completo na 183.
- Copy de risco para opcional ausente: ex. "Sem referência de estilo, o resultado pode divergir mais da marca."
</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets

- `app/src/server/assistant/tools/stubs/propose-action.ts` — ponto de integração para validação de contrato
- `app/src/server/assistant/tools/policy.ts` — `evaluateToolCall`, `requiresConfirmation`
- `app/src/server/assistant/orchestrator.ts` — hook para intent classification antes de tool loop
- `app/src/server/repositories/assistant-action.ts` — lifecycle pending → confirmed

### Established Patterns

- Zod schemas por tool (179)
- Registry pattern em `tools/registry.ts` — espelhar para action contracts
- Vitest colocalizado

### Integration Points

- Orchestrator chama classifier → seleciona família de contrato → assistant coleta inputs mínimos → `propose_action` valida → card pendente
- Fase 182 registra contratos adicionais no mesmo registry
</code_context>

<deferred>
## Deferred Ideas

- Implementação executável de restyling, format adapt, etc. — Fase 182 (ACT-03, ACT-04)
- UI de action cards e chat — Fase 181
- Happy path ideia → pacote final — Fase 183 (ACT-05, EXEC-04)
- Classificação direta para cada `actionType` sem passo binário — fora do escopo ACT-01
- Risk copy gerada dinamicamente pelo LLM — usar templates nesta fase
</deferred>

---

*Phase: 180-action-contracts*
*Context gathered: 2026-06-25*
