# Phase 179: Model Adapter and Tool Policy - Context

**Gathered:** 2026-06-25
**Status:** Ready for planning
**Source:** Milestone v13.5 locked decisions + Phase 178 persistence foundation

<domain>
## Phase Boundary

Fase 179 introduz orquestração provider-agnóstica do assistente com MiniMax M3 como primeiro adapter e um gate de política de tools no servidor.

Entrega: `AssistantModelClient`, adapter MiniMax M3 com streaming, context builder allowlistado, tool policy deny-by-default, e testes que provam que reasoning/thinking não é exibido nem persistido.

**Não inclui:** contratos de ação (Fase 180), UI `/assistant` (Fase 181), nem execução real de ações de negócio — apenas orquestração + policy + persistência via repositórios da Fase 178.

**Requisitos:** AI-01, AI-02, AI-03, AI-04, AI-05
</domain>

<decisions>
## Implementation Decisions

### Provider e interface (AI-01, AI-02)

- `AssistantModelClient` é a fronteira interna — orquestração do assistente não importa SDK do provider diretamente.
- **MiniMax M3** é o primeiro adapter com **streaming de texto** para o cliente HTTP (SSE ou equivalente no servidor).
- OpenAI existente (`app/src/server/ai/*`) permanece para pipelines criativos legados; o assistente conversacional usa caminho separado via `AssistantModelClient`.
- Credenciais MiniMax via env (`MINIMAX_API_KEY` ou equivalente) — nunca hardcoded.

### Context builder (AI-03)

- Contexto enviado ao provider é **amplo mas allowlistado** por categoria (cliente, campanha, thread, brand kit resumido, etc.).
- **Excluir sempre:** segredos, URLs assinadas brutas, payloads de evidência interna, dados de outros clientes no mesmo workspace.
- Context builder lê escopo de `workspaceId` + `clientProfileId` + `threadId` da Fase 178.
- Reasoning/thinking do provider **não entra** no payload persistido nem na resposta ao cliente.

### Tool policy (AI-04)

- **Deny-by-default:** nenhuma tool executa sem passar pelo gate server-side.
- Validações obrigatórias antes de execução ou criação de action card: schema Zod, role gate, scope check (`workspaceId`/`clientProfileId`), política de confirmação (stub até Fase 180 — policy retorna `requiresConfirmation` sem executar writes).
- Tools registradas em registry explícito — sem tools dinâmicas do provider sem mapeamento.
- Tool calls aprovados persistem via Fase 178 (`tool` message type com nome + resumo sanitizado apenas).

### Reasoning / thinking (AI-05)

- Campos `reasoning`, `thinking`, `chain_of_thought` ou equivalentes do provider são **descartados** no adapter antes de streaming/persistência.
- Testes devem provar: (1) não aparecem na resposta HTTP streamada ao cliente; (2) não são gravados em `assistant_messages`.

### Integração com persistência (Fase 178)

- Orquestrador usa repositórios `assistant-thread`, `assistant-message`, `assistant-action` — não duplica schema.
- Streaming: mensagem `assistant` persistida **após** stream completar (decisão Fase 178).
- Action cards criados via `createAssistantAction` — não via POST `/messages` com `action_card`.

### Claude's Discretion

- SDK MiniMax exato e formato de streaming (fetch vs SDK oficial).
- Estrutura de pastas: `app/src/server/assistant/` recomendado.
- Lista inicial de tools stub (ex.: `get_thread_context`, `propose_action`) — sem execução de writes nesta fase.
- Formato SSE vs chunked response para API route de chat.
</decisions>

<specifics>
## Specific Ideas

- Padrão existente: `getOpenAI()` singleton em `app/src/server/ai/utils.ts` — assistant adapter deve seguir padrão similar (lazy init, env-validated).
- Derivation job já integra `syncAssistantActionFromJob` — orquestrador pode emitir `assistantActionId` em eventos futuros (Fase 180+).
- Mem0/brand memory: context builder pode incluir resumo de brand memory já escopado por `clientProfileId` (Fase 177), sem enviar memórias cruas.
</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets

- `app/src/server/ai/utils.ts` — padrão singleton OpenAI
- `app/src/server/repositories/assistant-*.ts` — persistência Fase 178
- `app/src/server/validation/env.ts` — validação de env vars
- `app/src/app/api/assistant/*` — rotas REST da Fase 178

### Established Patterns

- Zod para validação em boundaries
- Vitest com mock de db/repos
- `requireWorkspaceAccess` em rotas API

### Integration Points

- Nova rota de chat/streaming do assistente (ex.: `POST /api/assistant/threads/[threadId]/chat`)
- Context builder alimenta `AssistantModelClient.stream()`
- Tool policy intercepta tool calls do adapter antes de side effects

### Greenfield

- Nenhum `AssistantModelClient` ou adapter MiniMax existe hoje
- App usa OpenAI extensivamente para geração criativa — assistente é caminho separado
</code_context>

<deferred>
## Deferred Ideas

- Classificação de intent e contratos de ação completos — Fase 180
- UI de chat e drawer — Fase 181
- Execução real de writes/créditos via tools — Fase 180+
- Suporte a providers adicionais além de MiniMax — pós-v13.5
- Exibir progresso de job em tempo real no stream — Fase 181+
</deferred>

---

*Phase: 179-model-adapter-and-tool-policy*
*Context gathered: 2026-06-25*
