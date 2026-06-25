# Phase 181: Assistant Surface - Context

**Gathered:** 2026-06-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Fase 181 entrega a **superfície conversacional primária**: modo Chat com layout estilo Codex desktop, toggle global Painel ↔ Chat, navegação por cliente/campanha/thread, criação de cliente/campanha draft, e drawer na workspace de campanha que retoma a thread padrão.

**Requisitos:** CHAT-01, CHAT-02, CHAT-03, CHAT-04

**Não inclui:** execução de quick actions end-to-end (182), review completo reutilizando workspace (183/EXEC-03), happy path até pacote final (183).
</domain>

<decisions>
## Implementation Decisions

### Modo Chat vs Painel de controle (CHAT-01)

- **Toggle global na TopBar:** alterna entre **Painel de controle** (shell atual: Dashboard, Campanhas, Settings) e **modo Chat** (superfície `/assistant`).
- Não adicionar item nav separado "Assistente" — o acesso primário ao assistente é via **modo Chat**.
- Modo Chat carrega layout dedicado; Painel mantém AppShell/rotas existentes.
- Rota canônica do modo Chat: `/assistant` (ou equivalente sob `(dashboard)`).

### Layout desktop — estilo Codex (CHAT-02)

- **Três colunas:**
  1. **Sidebar esquerda (~240px):** árvore Cliente → Campanha → Thread (múltiplas threads nomeadas por campanha)
  2. **Centro (flex):** área de chat — histórico + input + streaming SSE
  3. **Direita (~320px, colapsável):** painel contextual
- Proporções inspiradas no Codex desktop: chat central dominante; sidebars fixas mas painel direito pode colapsar.

### Painel contextual (direita)

- Nesta fase mostra: **prontidão do contrato de ação** (inputs obrigatórios/opcionais faltando), **ações sugeridas**, e **status de jobs** longos vinculados à thread.
- Não implementar review visual completo de criativos aqui — EXEC-03 fica na 183.
- Dados vêm das APIs/repositórios 178–180 + contratos 180; sem duplicar lógica de negócio no cliente.

### Estados vazios e criação (CHAT-02, CHAT-03)

- Sem thread selecionada: **estado guiado** — CTA para escolher cliente na árvore ou criar thread; chat input desabilitado ou com prompt para selecionar contexto primeiro.
- Usuário pode **criar client profile**, **criar campaign draft**, e **iniciar thread** a partir do fluxo do assistente (árvore + ações inline/modal — planner decide padrão do app).
- Thread padrão da campanha usada quando retomando contexto de campanha.

### Drawer na campanha (CHAT-04)

- Na workspace de campanha (`/campaigns/[id]` ou equivalente), **drawer** abre modo Chat compacto.
- Drawer **retoma a thread padrão** da campanha (decisão Fase 178).
- Drawer é variante do chat (mesmos componentes de mensagem/SSE/action card), não segunda implementação.

### Action cards e SSE no chat

- Consumir eventos SSE existentes: `text_delta`, `tool_summary`, `action_card`, `done`, `error`.
- Action cards **inline no histórico** com confirm/cancel ligados às APIs 178 (`confirm`/`cancel`).
- Exibir metadata do contrato 180: risk copy, credit impact, confirmation policy.
- Streaming de texto do assistente; sem exibir reasoning/thinking (AI-05).

### Mobile (CHAT-01 — defaults, não discutido em detalhe)

- **Toggle Painel ↔ Chat** permanece na TopBar (compacto).
- **Bottom tabs no modo Chat:** Árvore | Chat | Contexto (default recomendado).
- Manter usabilidade; parity funcional com desktop, não pixel-parity.

### Claude's Discretion

- Implementação exata do toggle (segmented control vs icon toggle) e persistência de modo (session vs localStorage).
- Collapse behavior do painel direito.
- Modal vs inline para criar cliente/campanha.
- Larguras exatas em px/rem e breakpoints.
- i18n keys em `messages/pt.json` / `en.json`.
</decisions>

<specifics>
## Specific Ideas

- Referência visual/comportamental: **Codex desktop** — sidebar + chat grande + painel auxiliar.
- Switcher "Painel de controle" ↔ "Chat mode" substitui nav item dedicado ao assistente.
- Reutilizar tokens CSS existentes (`--surface-base`, `--accent-green`, AppShell patterns).
- Hooks React Query para APIs `/api/assistant/threads/*` e chat SSE.
</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets

- `app/src/components/layout/AppShell.tsx` — shell Painel; modo Chat pode ser layout irmão ou branch condicional
- `app/src/components/layout/TopBar.tsx` — local do toggle global
- `app/src/server/assistant/stream/sse.ts` — contrato de eventos SSE
- `app/src/app/api/assistant/**` — threads, messages, chat, confirm/cancel
- `app/src/server/repositories/assistant-thread.ts` — default thread, client/campaign scoping

### Established Patterns

- `next-intl` para strings
- TanStack Query hooks em `app/src/lib/hooks/`
- Componentes UI em `app/src/components/ui/`
- Dashboard layout em `app/(dashboard)/`

### Integration Points

- TopBar toggle → router push `/assistant` ou rota Painel anterior
- Campaign detail page → drawer component com `campaignId` + fetch default thread
- Chat component → `POST /api/assistant/threads/[threadId]/chat` com EventSource/fetch stream

### Greenfield (UI)

- Nenhuma página `/assistant` ou componente de chat existe ainda
</code_context>

<deferred>
## Deferred Ideas

- Execução de quick actions após confirm — Fase 182
- Review completo com componentes do workspace — Fase 183 (EXEC-03)
- Happy path ideia → pacote — Fase 183
- Persistir modo Chat/Painel em localStorage — opcional pós-MVP
- Realtime job progress via Inngest channels — pode usar polling/status no painel contextual nesta fase
</deferred>

---

*Phase: 181-assistant-surface*
*Context gathered: 2026-06-25*
