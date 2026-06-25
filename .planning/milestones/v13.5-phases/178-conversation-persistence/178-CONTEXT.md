# Phase 178: Conversation Persistence - Context

**Gathered:** 2026-06-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Fase 178 persiste threads do assistente, mensagens e registros de ação com escopo por workspace, `clientProfileId` e campanha — incluindo suporte a status de jobs longos.

Esta fase é **somente backend/persistência**. Não constrói a superfície `/assistant` (Fase 181), contratos de ação (Fase 180) nem o adapter MiniMax (Fase 179). Ela entrega o modelo de dados e APIs/repositórios que as fases seguintes consomem.

**Requisito:** EXEC-02 — ações longas usam o pipeline Inngest existente e o status aparece na thread do assistente.
</domain>

<decisions>
## Implementation Decisions

### Hierarquia de threads (Cliente > Campanha > Thread)

- Threads podem existir em **nível de cliente** e em **nível de campanha** — ambos coexistem.
- Antes de existir campanha, o chat começa em uma **thread do cliente**; quando a campanha for criada, a thread deve ser **vinculada ou migrada** para o contexto da campanha (não bloquear o usuário até ter campanha).
- Cada campanha suporta **múltiplas threads nomeadas** (ex.: conversas separadas de restyling vs. revisão de batch).
- Ao abrir o assistente pelo **drawer da campanha** (CHAT-04), retomar automaticamente a **thread padrão** daquela campanha.
- Toda thread deve respeitar isolamento por `workspaceId` + `clientProfileId` (herdado da Fase 177).

### Modelo de mensagens e action cards

- Histórico é um **stream cronológico único** com entradas tipadas: `user`, `assistant`, `tool`, `action_card`.
- **Action card é um tipo de mensagem** no stream — confirmação/cancelamento aparecem inline no histórico.
- **Tool calls:** persistir apenas **nome da tool + resumo sanitizado** — sem args crus, payloads internos ou reasoning do provider.
- **Nunca persistir** reasoning/thinking do provider (decisão v13.5 — reforçada aqui).
- Mensagens do assistente são **persistidas somente após o streaming completar** (uma linha final por resposta).
- Cards pendentes são **imutáveis** até confirmar ou cancelar.

### Ciclo de vida de ações

- Estados completos no registro de ação: `pending` → `confirmed` → `running` → `completed` | `failed` | `canceled`.
- Falha ou cancelamento **atualiza o action-card in-place** com status e erro seguro para o usuário (sem vazar detalhes internos).
- Registro de ação armazena **`jobId`(s)** vinculados; jobs Inngest **atualizam o estado da ação** (EXEC-02). UI de status em tempo real fica para fases posteriores; esta fase garante persistência e mutação de estado.

### Claude's Discretion

- Semântica exata de "thread padrão" por campanha (ex.: mais recente ativa vs. flag `isDefault`) — desde que o drawer sempre retome a mesma thread de forma determinística.
- Estratégia de migração/vínculo thread-do-cliente → campanha (update de FK vs. nova thread com referência à anterior).
- Schema exato (tabelas, JSONB vs. colunas) desde que respeite as decisões acima.
- APIs REST vs. server actions — seguir padrões existentes do app.
</decisions>

<specifics>
## Specific Ideas

- Modelo de objeto v13.5: **Cliente > Campanha > Thread** — sem entidade projeto/pasta neste milestone.
- Thread de cliente cobre o fluxo de "ideia solta" antes do draft de campanha existir.
- Múltiplas threads nomeadas permitem separar contextos dentro da mesma campanha sem misturar históricos.
- Action cards confirmados devem ser auditáveis no histórico — alinhado a EXEC-01 (confirmação explícita vem na Fase 180, mas a persistência já deve suportar o tipo).
</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets

- **Inngest jobs** (`app/src/server/jobs/derivation.ts`, `brand-memory.ts`, etc.): padrão existente para jobs longos com estados `queued` → `processing` → `completed`/`failed`.
- **Inngest realtime channels** (`app/src/server/jobs/channels.ts`): `derivationChannel` publica status — referência para como jobs reportam progresso (Fase 178 persiste estado; streaming realtime pode ser consumido depois).
- **Schema Drizzle** (`app/src/server/db/schema.ts`): padrão de tabelas com `workspaceId`, FKs em cascata, índices por workspace.
- **Fase 177**: `clientProfileId` obrigatório em paths de marca; threads devem seguir o mesmo isolamento.

### Established Patterns

- Migrations incrementais em `app/drizzle/` — não alterar migrations históricas.
- Repositórios em `app/src/server/repositories/` e `app/src/server/db/repositories/`.
- Testes colocalizados (`*.test.ts`) perto do código alterado.
- Jobs atualizam entidades de domínio no banco; clientes podem assinar realtime separadamente.

### Integration Points

- `campaigns` e `client_profiles` — FKs de escopo para threads.
- Pipeline de derivação e demais jobs Inngest — `jobId` no action record para correlacionar status.
- Fases 179–181 consumirão repositórios/APIs desta fase para orquestração, UI e contratos.

### Greenfield

- **Não existe** código de assistant/thread/conversation no app hoje — esta fase é fundação nova.
</code_context>

<deferred>
## Deferred Ideas

- **UI `/assistant`** e árvore cliente/campanha/thread — Fase 181.
- **Contratos de ação** (classificação de intent, inputs obrigatórios, política de confirmação) — Fase 180.
- **Adapter MiniMax e tool policy** — Fase 179.
- **Mensagens de progresso leves no stream** para transições de job (além de mutar o action record) — pode entrar em fase posterior se a UI precisar; Fase 178 foca em `jobId` + estado persistido.
- **Retenção/arquivamento/deleção de threads** — não discutido; usar defaults sensatos (soft delete opcional, sem política de retenção agressiva neste milestone).
- **Edição de inputs em cards pendentes** — explicitamente **não** neste milestone; card imutável até confirmar/cancelar.
</deferred>

---

*Phase: 178-conversation-persistence*
*Context gathered: 2026-06-25*
