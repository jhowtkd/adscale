# Phase 181: Assistant Surface - Research

**Researched:** 2026-06-25
**Domain:** Next.js 16 dashboard UI — chat-first assistant surface, SSE streaming, multi-column layout
**Confidence:** HIGH

## Summary

Phase 181 is a **greenfield frontend surface** on top of a mature backend stack (phases 178–180). All assistant APIs, SSE event contracts, thread/default-thread semantics, action cards, and confirm/cancel flows already exist server-side. No `/assistant` route, chat components, React Query hooks, or TopBar mode toggle exist yet.

The implementation should follow established ADScale patterns: `next-intl` strings, TanStack Query hooks in `app/src/lib/hooks/`, UI primitives from `app/src/components/ui/` (especially `sheet.tsx` for the campaign drawer), CSS tokens (`--surface-base`, `--accent-green`, `layer-shell-floating`), and `apiFetch` with cookie auth. The Codex-style three-column layout is a **new `AssistantShell`** sibling to `AppShell`, not a refactor of existing dashboard pages.

**Primary recommendation:** Build a shared `AssistantChatCore` (messages + SSE + action cards) consumed by both `/assistant` full layout and the campaign `Sheet` drawer; wire navigation tree from existing `useClientProfiles` + `useCampaigns` + new `useAssistantThreads` hooks; drive mode via TopBar segmented toggle + route (`/assistant` vs panel routes).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Mode toggle (Panel ↔ Chat) | Browser / Client | — | TopBar is client component; route push is the source of truth [VERIFIED: `TopBar.tsx`] |
| Thread tree (client → campaign → thread) | Browser / Client | API / Backend | Compose from `/api/client-profiles`, `/api/campaigns`, `/api/assistant/threads`; no tree API exists [VERIFIED: API routes] |
| Chat history + streaming | Browser / Client | API / Backend | `POST …/chat` returns SSE; client parses stream [VERIFIED: `chat/route.ts`, `sse.ts`] |
| Action card confirm/cancel | API / Backend | Browser / Client | Server validates contracts on confirm; UI triggers POST only [VERIFIED: `confirm/route.ts`, `validate.ts`] |
| Context panel (contract readiness, jobs) | Browser / Client | API / Backend | Derive display from thread messages + `getActionContract`; job status from `action_card` payload polling [VERIFIED: `assistant-message.ts`, `assistant-job-sync.ts`] |
| Default campaign thread (drawer) | API / Backend | Browser / Client | `getOrCreateDefaultCampaignThread` in repository; exposed via `POST /api/assistant/threads` [VERIFIED: `assistant-thread.ts`, `threads/route.ts`] |
| Create client / campaign draft | API / Backend | Browser / Client | Existing `/api/client-profiles` POST and `/api/campaigns` POST [VERIFIED: hooks + routes] |
| Auth gate for `/assistant` | API / Backend | Frontend Server | `requireWorkspaceAccess` on all assistant APIs; dashboard layout inherits session [VERIFIED: API routes] |

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Modo Chat vs Painel de controle (CHAT-01)

- **Toggle global na TopBar:** alterna entre **Painel de controle** (shell atual: Dashboard, Campanhas, Settings) e **modo Chat** (superfície `/assistant`).
- Não adicionar item nav separado "Assistente" — o acesso primário ao assistente é via **modo Chat**.
- Modo Chat carrega layout dedicado; Painel mantém AppShell/rotas existentes.
- Rota canônica do modo Chat: `/assistant` (ou equivalente sob `(dashboard)`).

#### Layout desktop — estilo Codex (CHAT-02)

- **Três colunas:**
  1. **Sidebar esquerda (~240px):** árvore Cliente → Campanha → Thread (múltiplas threads nomeadas por campanha)
  2. **Centro (flex):** área de chat — histórico + input + streaming SSE
  3. **Direita (~320px, colapsável):** painel contextual
- Proporções inspiradas no Codex desktop: chat central dominante; sidebars fixas mas painel direito pode colapsar.

#### Painel contextual (direita)

- Nesta fase mostra: **prontidão do contrato de ação** (inputs obrigatórios/opcionais faltando), **ações sugeridas**, e **status de jobs** longos vinculados à thread.
- Não implementar review visual completo de criativos aqui — EXEC-03 fica na 183.
- Dados vêm das APIs/repositórios 178–180 + contratos 180; sem duplicar lógica de negócio no cliente.

#### Estados vazios e criação (CHAT-02, CHAT-03)

- Sem thread selecionada: **estado guiado** — CTA para escolher cliente na árvore ou criar thread; chat input desabilitado ou com prompt para selecionar contexto primeiro.
- Usuário pode **criar client profile**, **criar campaign draft**, e **iniciar thread** a partir do fluxo do assistente (árvore + ações inline/modal — planner decide padrão do app).
- Thread padrão da campanha usada quando retomando contexto de campanha.

#### Drawer na campanha (CHAT-04)

- Na workspace de campanha (`/campaigns/[id]` ou equivalente), **drawer** abre modo Chat compacto.
- Drawer **retoma a thread padrão** da campanha (decisão Fase 178).
- Drawer é variante do chat (mesmos componentes de mensagem/SSE/action card), não segunda implementação.

#### Action cards e SSE no chat

- Consumir eventos SSE existentes: `text_delta`, `tool_summary`, `action_card`, `done`, `error`.
- Action cards **inline no histórico** com confirm/cancel ligados às APIs 178 (`confirm`/`cancel`).
- Exibir metadata do contrato 180: risk copy, credit impact, confirmation policy.
- Streaming de texto do assistente; sem exibir reasoning/thinking (AI-05).

#### Mobile (CHAT-01 — defaults, não discutido em detalhe)

- **Toggle Painel ↔ Chat** permanece na TopBar (compacto).
- **Bottom tabs no modo Chat:** Árvore | Chat | Contexto (default recomendado).
- Manter usabilidade; parity funcional com desktop, não pixel-parity.

### Claude's Discretion

- Implementação exata do toggle (segmented control vs icon toggle) e persistência de modo (session vs localStorage).
- Collapse behavior do painel direito.
- Modal vs inline para criar cliente/campanha.
- Larguras exatas em px/rem e breakpoints.
- i18n keys em `messages/pt.json` / `en.json`.

### Deferred Ideas (OUT OF SCOPE)

- Execução de quick actions após confirm — Fase 182
- Review completo com componentes do workspace — Fase 183 (EXEC-03)
- Happy path ideia → pacote — Fase 183
- Persistir modo Chat/Painel em localStorage — opcional pós-MVP
- Realtime job progress via Inngest channels — pode usar polling/status no painel contextual nesta fase
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CHAT-01 | User can access `/assistant` as a primary authenticated app section | New `(dashboard)/assistant` route under existing auth; TopBar toggle; dedicated `AssistantShell` [VERIFIED: dashboard layout + API auth] |
| CHAT-02 | User can navigate conversations by client, campaign, and thread | Tree from `useClientProfiles` + `useCampaigns` (client-side filter by `clientProfileId`) + `GET /api/assistant/threads?clientProfileId=&campaignId=`; URL state `?threadId=` [VERIFIED: threads API] |
| CHAT-03 | User can create a client and a campaign draft from the chat flow | Reuse `useCreateClientProfile`, `useCreateCampaign`; then `POST /api/assistant/threads` [VERIFIED: existing hooks + threads POST] |
| CHAT-04 | User can continue the same campaign thread from a drawer inside the campaign workspace | `Sheet` on `campaigns/[id]/page.tsx`; `POST threads` with `isDefault:true`; shared `AssistantChatCore` [VERIFIED: Sheet pattern, `getOrCreateDefaultCampaignThread`] |
</phase_requirements>

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js | 16.2.6 (app `package.json`) | App router, RSC boundary | Project standard [VERIFIED: `app/package.json`] |
| React | 19.x | UI | Bundled with Next 16 [VERIFIED: `package.json`] |
| @tanstack/react-query | ^5.100.1 (registry: 5.101.1) | Thread/message fetching, mutations | All data hooks use this pattern [VERIFIED: `use-notifications.ts`, `use-client-profiles.ts`] |
| next-intl | ^4.9.1 (registry: 4.13.0) | i18n for assistant strings | Project standard [VERIFIED: `TopBar.tsx`, `messages/*.json`] |
| framer-motion | ^12.38.0 (registry: 12.42.0) | Drawer/panel transitions | Used in TopBar notifications [VERIFIED: `TopBar.tsx`] |
| @base-ui/react Dialog | ^1.4.1 | Sheet/drawer primitive | `sheet.tsx` already wraps it [VERIFIED: `sheet.tsx`] |
| zod | (existing) | Client form validation only | Server validates at API boundary [VERIFIED: API routes] |
| lucide-react | ^1.11.0 | Icons | Project standard [VERIFIED: `AppShell.tsx`] |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| zustand | (existing) | UI toasts, page title | Optional assistant UI slice; prefer URL for thread selection [VERIFIED: `store.ts`] |
| @microsoft/fetch-event-source | 2.0.1 (registry) | POST + SSE with abort/retry | **Recommended** for chat streaming (EventSource is GET-only) [VERIFIED: npm registry; no SSE lib in project] |
| vitest + @testing-library/react | (existing) | Hook/component tests | Match `use-client-profiles.test.tsx` [VERIFIED: `vitest.config.ts`] |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `@microsoft/fetch-event-source` | Hand-rolled `fetch` + `ReadableStream` reader | Hand-roll is ~40 lines and mirrors `chat/route.test.ts` collector; library handles abort/retries — prefer thin util first, add lib only if retry logic needed |
| Dedicated tree API | Client-side composition | No backend change; acceptable until workspace has hundreds of clients [VERIFIED: no list-all-threads endpoint] |
| New nav item "Assistente" | TopBar toggle only | **Rejected** — locked in CONTEXT |

**Installation (if fetch-event-source chosen):**

```bash
cd app && npm install @microsoft/fetch-event-source
```

**Version verification:** `@tanstack/react-query@5.101.1`, `next-intl@4.13.0`, `framer-motion@12.42.0`, `@microsoft/fetch-event-source@2.0.1` via `npm view` on 2026-06-25.

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ TopBar: [Painel de controle | Chat] toggle  →  router.push(/assistant|/)   │
└─────────────────────────────────────────────────────────────────────────────┘
         │ panel routes                              │ /assistant
         ▼                                             ▼
┌─────────────────┐                    ┌──────────────────────────────────────┐
│ AppShell        │                    │ AssistantShell (3-col desktop)       │
│ Dashboard/      │                    │ ┌────────┬──────────────┬──────────┐ │
│ Campaigns/      │                    │ │ Tree   │ ChatCore     │ Context  │ │
│ Settings        │                    │ │ sidebar│ (SSE+msgs)   │ panel    │ │
└─────────────────┘                    │ └────────┴──────────────┴──────────┘ │
         │                             └──────────────────────────────────────┘
         │ campaigns/[id]                         ▲
         ▼                                        │ reuse ChatCore
┌─────────────────┐                    ┌──────────┴──────────┐
│ Campaign        │── open drawer ────►│ Sheet (compact chat) │
│ workspace       │   default thread   │ + same SSE/cards     │
└─────────────────┘                    └─────────────────────┘

Data flow (send message):
  User input → useAssistantChat.send()
    → POST /api/assistant/threads/{id}/chat (SSE)
    → parse text_delta | tool_summary | action_card | done | error
    → optimistic user msg + streaming assistant bubble
    → on action_card: render inline card → confirm/cancel POST
    → invalidate thread query → context panel reads latest action_card status
```

### Recommended Project Structure

```
app/src/
├── app/(dashboard)/
│   ├── assistant/
│   │   ├── layout.tsx          # AssistantShell (no AppShell children wrapper)
│   │   └── page.tsx            # Reads ?threadId=; empty state when missing
│   └── campaigns/[id]/page.tsx # + CampaignAssistantDrawer trigger
├── components/
│   ├── assistant/
│   │   ├── AssistantShell.tsx
│   │   ├── AssistantTreeSidebar.tsx
│   │   ├── AssistantChatCore.tsx      # shared full + drawer
│   │   ├── AssistantMessageList.tsx
│   │   ├── AssistantChatInput.tsx
│   │   ├── AssistantActionCard.tsx
│   │   ├── AssistantContextPanel.tsx
│   │   ├── AssistantEmptyState.tsx
│   │   ├── CampaignAssistantDrawer.tsx
│   │   └── AssistantMobileTabs.tsx    # Tree | Chat | Context
│   └── layout/
│       └── TopBar.tsx                 # + mode toggle
├── lib/
│   ├── assistant/
│   │   ├── parse-sse.ts               # SSE line parser (mirror server encode)
│   │   └── contract-display.ts        # client-side readiness from display payload
│   └── hooks/
│       ├── use-assistant-threads.ts
│       ├── use-assistant-thread.ts
│       ├── use-assistant-chat.ts
│       └── use-assistant-actions.ts   # confirm/cancel mutations
```

### Pattern 1: Route-derived app mode (CHAT-01)

**What:** TopBar toggle sets route; active mode = `pathname.startsWith('/assistant')`.
**When to use:** Always — avoids localStorage (deferred) and keeps deep links shareable.
**Example:**

```typescript
// TopBar — mode derived from pathname [VERIFIED: existing usePathname pattern in TopBar.tsx]
const isChatMode = pathname.startsWith("/assistant");

function switchToChat() {
  const returnTo = pathname + searchParams.toString();
  router.push(`/assistant${threadId ? `?threadId=${threadId}` : ""}`);
}
function switchToPanel() {
  router.push(lastPanelPath ?? "/");
}
```

**RESOLVED (discretion):** Use **segmented control** (two labels: "Painel" / "Chat") placed left of LanguageSwitcher; compact icon+label on mobile. Persist last panel path in `sessionStorage` key `adscale:panel-return` only — not full mode persistence.

### Pattern 2: Shared chat core for full page + drawer (CHAT-04)

**What:** Single `AssistantChatCore` accepts `threadId`, `variant: 'full' | 'drawer'`, `onClose?`.
**When to use:** Any surface that streams assistant messages.
**Example:**

```tsx
// Campaign drawer [VERIFIED: DerivationReviewSheet.tsx Sheet pattern]
<Sheet open={open} onOpenChange={setOpen}>
  <SheetContent side="right" size="xl" className="p-0">
    <AssistantChatCore
      threadId={defaultThread.id}
      variant="drawer"
      onClose={() => setOpen(false)}
    />
  </SheetContent>
</Sheet>
```

**RESOLVED (discretion):** Drawer uses `Sheet` `size="xl"` (800px sm); full page uses flex center column.

### Pattern 3: SSE consumer for POST chat

**What:** Parse `event: …\ndata: …\n\n` frames matching `encodeAssistantSseEvent`.
**When to use:** Every `sendMessage` call.
**Example:**

```typescript
// Mirror server format [VERIFIED: app/src/server/assistant/stream/sse.ts]
// Client collector pattern [VERIFIED: chat/route.test.ts collectSseBody]
for await (const frame of readAssistantSseStream(response)) {
  if (frame.event === "text_delta") appendText(frame.data.text);
  if (frame.event === "action_card") upsertActionCard(frame.data);
  if (frame.event === "done") finalize(frame.data.assistantMessageId);
  if (frame.event === "error") setError(frame.data.message);
}
```

### Pattern 4: Thread tree data loading (CHAT-02)

**What:** Progressive tree — no monolithic API.
**When to use:** Left sidebar population.

| Level | Source | Query |
|-------|--------|-------|
| Clients | `useClientProfiles()` | `GET /api/client-profiles` |
| Campaigns per client | `useCampaigns({ limit: 100 })` | Filter `campaign.clientProfileId === clientId` client-side [VERIFIED: campaigns lack server filter — `buildCampaignListConditions` has no clientProfileId] |
| Threads per campaign | `useAssistantThreads(clientId, campaignId)` | `GET /api/assistant/threads?clientProfileId=&campaignId=` |
| Client-level threads | `useAssistantThreads(clientId, null)` | `campaignId` omitted in API = use `null` query for non-campaign threads [VERIFIED: `listAssistantThreads` `campaignId === null` branch] |

**RESOLVED:** Deep link via `/assistant?threadId={uuid}`; selecting tree node updates `router.replace` with same param.

### Pattern 5: Action card rendering (contract 180 metadata)

**What:** Render from `message.payload.display` on `action_card` messages; confirm/cancel via API.
**Display fields from server** [VERIFIED: `validate.ts`]: `label`, `actionType`, `riskLabel`, `creditImpact`, `riskCopyLines`, `confirmationPolicy`.
**Status transitions** [VERIFIED: `assistant-types.ts`]: `pending` → confirm → `confirmed`/`running` → `completed`/`failed`.

```typescript
// Confirm [VERIFIED: confirm/route.ts]
await apiFetch(`/api/assistant/actions/${actionRecordId}/confirm`, { method: "POST" });
// Cancel [VERIFIED: cancel/route.ts]
await apiFetch(`/api/assistant/actions/${actionRecordId}/cancel`, { method: "POST" });
```

Context panel derives **missing required fields** by comparing `action.inputSnapshot` to `getActionContract(actionType)` — expose read-only contract metadata via a small shared module importing server contracts is **not** possible client-side; instead show `display.riskCopyLines` + poll thread for updated `action_card` status. Optional: add `GET /api/assistant/actions/[id]` later — **not required** for 181 if message payload is sufficient.

### Pattern 6: Default campaign thread on drawer open (CHAT-04)

```typescript
// [VERIFIED: threads/route.ts POST with isDefault + campaignId]
const res = await apiFetch("/api/assistant/threads", {
  method: "POST",
  body: JSON.stringify({ clientProfileId, campaignId, isDefault: true }),
});
const { thread } = await res.json(); // getOrCreateDefaultCampaignThread
```

### Anti-Patterns to Avoid

- **Duplicate chat implementation in drawer:** Violates CHAT-04; use `AssistantChatCore`.
- **EventSource for chat:** Cannot POST body; chat endpoint is POST [VERIFIED: `chat/route.ts`].
- **Rendering reasoning/thinking:** Denied by AI-05 and `PERSISTENCE_DENYLIST` [VERIFIED: `assistant-types.ts`].
- **New "Assistente" nav link:** Locked out in CONTEXT.
- **Business logic in context panel:** Contract validation stays server-side; client displays only.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Right drawer overlay | Custom portal/focus trap | `Sheet` from `@/components/ui/sheet` | Focus trap, animation, mobile full-screen [VERIFIED: `sheet.tsx`] |
| Thread/message CRUD | Local-only state | Existing REST APIs | Persistence + workspace scoping already enforced |
| Action confirm validation | Client-side contract checks | `POST …/confirm` (server `revalidateOnConfirm`) | Role gates, schema, transitions [VERIFIED: `validate.ts`] |
| Auth redirect on 401 | Per-hook logic | `apiFetch` | Centralized [VERIFIED: `api-client.ts`] |
| SSE wire format | Ad-hoc JSON chunks | Match `encodeAssistantSseEvent` / test collector | Server contract is fixed [VERIFIED: `sse.ts`, `chat/route.test.ts`] |
| Campaign draft creation | Custom endpoint | `useCreateCampaign` / `POST /api/campaigns` | Same as `/campaigns/new` bootstrap [VERIFIED: `campaigns/new/page.tsx`] |

**Key insight:** Backend assistant domain is complete; hand-rolling server semantics on the client creates drift from phases 178–180.

## Common Pitfalls

### Pitfall 1: AppShell double-wrapping assistant layout

**What goes wrong:** Footer + mobile bottom nav from panel shell appear in chat mode.
**Why it happens:** `(dashboard)/layout.tsx` always renders `AppShell`.
**How to avoid:** `assistant/layout.tsx` renders `AssistantShell` only; either nested layout bypasses AppShell children pattern or dashboard layout conditionally skips AppShell for `/assistant` prefix.
**Warning signs:** Two `<main>` landmarks; bottom nav visible in chat.

### Pitfall 2: SSE stream not aborted on unmount

**What goes wrong:** Ghost streaming updates after navigation or drawer close.
**Why it happens:** Missing `AbortController` on fetch.
**How to avoid:** Pass `signal` to fetch; abort in `useEffect` cleanup.
**Warning signs:** Text appends after leaving `/assistant`.

### Pitfall 3: Tree shows wrong threads for client root

**What goes wrong:** Campaign threads mixed with client-only threads.
**Why it happens:** `listAssistantThreads` without `campaignId` returns all threads for profile.
**How to avoid:** Explicit `campaignId=null` for client-level; `campaignId=uuid` for campaign nodes.
**Warning signs:** Duplicate thread names under client and campaign.

### Pitfall 4: Chat enabled without thread context

**What goes wrong:** 404 or orphan messages.
**Why it happens:** Bypassing empty-state guard.
**How to avoid:** Disable input until `threadId` selected; show guided empty state per CONTEXT.
**Warning signs:** POST chat before thread creation.

### Pitfall 5: Action card UI ignores terminal states

**What goes wrong:** Confirm button visible on `completed`/`failed` cards.
**Why it happens:** Not reading `payload.status` on re-fetch.
**How to avoid:** Poll `GET /api/assistant/threads/[id]` while any card is `pending`/`running`; use `STALE_TIME.DYNAMIC` / `REALTIME`.
**Warning signs:** Stale pending buttons after job completes.

### Pitfall 6: Missing clientProfileId on campaign draft

**What goes wrong:** Thread creation fails validation alignment.
**Why it happens:** `createCampaign` without `clientProfileId` when tree client is selected.
**How to avoid:** Always pass `clientProfileId` from tree context when creating campaign from assistant flow.
**Warning signs:** `AssistantThreadValidationError` on thread POST.

## Code Examples

### Fetch thread with messages

```typescript
// [VERIFIED: threads/[threadId]/route.ts GET]
const res = await apiFetch(`/api/assistant/threads/${threadId}`);
const { thread, messages } = await res.json();
```

### List threads for tree node

```typescript
// [VERIFIED: threads/route.ts GET]
const params = new URLSearchParams({ clientProfileId });
if (campaignId !== undefined) {
  params.set("campaignId", campaignId ?? "null"); // planner: use proper null handling
}
const res = await apiFetch(`/api/assistant/threads?${params}`);
```

### Create client from assistant flow (CHAT-03)

```typescript
// [VERIFIED: use-client-profiles.ts]
const createProfile = useCreateClientProfile();
await createProfile.mutateAsync({ name: "New Client" });
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Single client per workspace | Multi `clientProfile` | Phase 177 | Tree root = profiles [VERIFIED: REQUIREMENTS CLIENT-01] |
| No assistant UI | API-only assistant | Phases 178–180 | Phase 181 is pure UI |
| Workspace campaign page only | Chat drawer continues thread | Phase 181 CHAT-04 | Reuse `getOrCreateDefaultCampaignThread` |

**Deprecated/outdated:**
- Dedicated nav item for assistant — replaced by mode toggle (CONTEXT).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| — | *(none — all critical claims verified against codebase or npm registry)* | — | — |

## Open Questions

1. **Should campaigns API gain `clientProfileId` filter for the tree?**
   - What we know: `getCampaignsPage` does not filter by `clientProfileId` [VERIFIED: `buildCampaignListConditions`].
   - **RESOLVED:** For v13.5, filter campaigns client-side from `useCampaigns({ limit: 100 })`. Add server filter only if perf issue — out of scope unless profiling shows pain.

2. **Segmented toggle vs icon toggle?**
   - **RESOLVED:** Segmented control with text labels (i18n `assistant.mode.panel` / `assistant.mode.chat`); matches Codex switcher referenced in CONTEXT.

3. **Modal vs inline create client/campaign?**
   - **RESOLVED:** Modal dialogs (existing `ConfirmDialog` / dialog patterns) triggered from tree header actions — keeps sidebar width stable; matches settings/workspace create flows.

4. **Right panel collapse persistence?**
   - **RESOLVED:** `useState` default open on desktop; `sessionStorage` key `adscale:assistant-context-open` optional; no localStorage (aligned with deferred persistence).

5. **SSE library vs hand-rolled parser?**
   - **RESOLVED:** Start with `lib/assistant/parse-sse.ts` (~50 lines) copied from test collector pattern; add `@microsoft/fetch-event-source` only if retry/Last-Event-ID needed.

6. **Lab HTML prototypes for assistant?**
   - **RESOLVED:** No assistant/chat experiments in `docs/Experimentos frontend/lab/` [VERIFIED: grep — no matches]. Use Codex reference + existing `AppShell`/`Sheet` tokens only.

## Environment Availability

Step 2.6: Phase is primarily frontend against existing APIs; no new external services required for implementation.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Build/test | ✓ | v25.9.0 | — |
| npm / app deps | Dev | ✓ | — | — |
| Vitest | Unit tests | ✓ | (project config) | — |
| Playwright | E2E (optional) | ✓ | 1.60.0 | Defer E2E to verify phase |
| PostgreSQL | API integration tests | ✓ (TEST_DATABASE_URL) | — | Mock `apiFetch` in UI tests |
| MiniMax M3 | Live chat streaming | ✓ in prod env | — | Unit tests mock `runAssistantTurn` [VERIFIED: `chat/route.test.ts`] |

**Missing dependencies with no fallback:** None for UI implementation.

**Missing dependencies with fallback:** Live model — manual QA only; automated tests mock orchestrator.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest (config: `app/config/vitest.config.ts`) |
| Environment | jsdom + `@testing-library/react` |
| Config file | `app/config/vitest.config.ts` |
| Quick run command | `cd app && npm test -- src/lib/hooks/use-assistant-threads.test.tsx -x` |
| Full suite command | `cd app && npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CHAT-01 | TopBar toggle routes to `/assistant`; assistant layout renders without panel bottom nav | unit | `cd app && npm test -- src/components/layout/TopBar.test.tsx -x` | ✅ (extend) |
| CHAT-01 | `/assistant` page accessible in dashboard group | unit | `cd app && npm test -- src/components/assistant/AssistantShell.test.tsx -x` | ❌ Wave 0 |
| CHAT-02 | Tree loads profiles, filters campaigns, fetches threads | unit | `cd app && npm test -- src/lib/hooks/use-assistant-threads.test.tsx -x` | ❌ Wave 0 |
| CHAT-02 | Selecting thread updates URL/searchParams | unit | `cd app && npm test -- src/components/assistant/AssistantTreeSidebar.test.tsx -x` | ❌ Wave 0 |
| CHAT-03 | Create client + campaign + thread mutation chain | unit | `cd app && npm test -- src/lib/hooks/use-assistant-threads.test.tsx -x` | ❌ Wave 0 |
| CHAT-04 | Drawer opens Sheet and loads default thread | unit | `cd app && npm test -- src/components/assistant/CampaignAssistantDrawer.test.tsx -x` | ❌ Wave 0 |
| CHAT-04 | Drawer reuses chat core (no duplicate SSE hook) | unit | `cd app && npm test -- src/components/assistant/AssistantChatCore.test.tsx -x` | ❌ Wave 0 |
| SSE | Parser handles all `ASSISTANT_SSE_EVENTS` | unit | `cd app && npm test -- src/lib/assistant/parse-sse.test.ts -x` | ❌ Wave 0 |
| Action cards | Confirm/cancel call correct APIs | unit | `cd app && npm test -- src/lib/hooks/use-assistant-actions.test.tsx -x` | ❌ Wave 0 |
| AI-05 | Parser/UI ignores reasoning fields | unit | `cd app && npm test -- src/lib/assistant/parse-sse.test.ts -x` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `cd app && npm test -- <affected-test-file> -x`
- **Per wave merge:** `cd app && npm test`
- **Phase gate:** Full vitest green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `app/src/lib/assistant/parse-sse.ts` + `parse-sse.test.ts` — SSE frame parser
- [ ] `app/src/lib/hooks/use-assistant-threads.ts` + test — thread list/detail/create
- [ ] `app/src/lib/hooks/use-assistant-chat.ts` + test — streaming send (mock fetch stream)
- [ ] `app/src/lib/hooks/use-assistant-actions.ts` + test — confirm/cancel mutations
- [ ] `app/src/components/assistant/AssistantShell.test.tsx` — layout smoke
- [ ] `app/src/components/assistant/AssistantChatCore.test.tsx` — shared core
- [ ] `app/src/components/assistant/CampaignAssistantDrawer.test.tsx` — CHAT-04
- [ ] Extend `TopBar.test.tsx` — mode toggle navigation
- [ ] `messages/en.json` + `messages/pt-BR.json` — `assistant.*` namespace keys

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V2 Authentication | yes | `requireWorkspaceAccess` on all `/api/assistant/*` [VERIFIED] |
| V3 Session Management | yes | Cookie session via `apiFetch` credentials [VERIFIED] |
| V4 Access Control | yes | `requireRole` on chat POST; contract `allowedRoles` on confirm [VERIFIED] |
| V5 Input Validation | yes | zod on API bodies; disable client submit when thread missing |
| V6 Cryptography | no | No new crypto in UI phase |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| XSS via assistant markdown | Tampering/Spoofing | Render assistant text as plain text or sanitized subset; never `dangerouslySetInnerHTML` with raw model output |
| IDOR on threads | Elevation | Server scopes by `workspaceId` on every query [VERIFIED: repositories] |
| CSRF on confirm | Spoofing | SameSite cookies + authenticated POST (existing pattern) |
| Leaking reasoning/thinking | Information disclosure | UI must not render; denylist enforced server-side [VERIFIED: `PERSISTENCE_DENYLIST`] |

## Sources

### Primary (HIGH confidence)

- Codebase: `app/src/app/api/assistant/**`, `app/src/server/assistant/**`, `app/src/server/repositories/assistant-*.ts`
- Codebase: `app/src/components/layout/AppShell.tsx`, `TopBar.tsx`, `ui/sheet.tsx`
- Codebase: `app/src/lib/hooks/use-client-profiles.ts`, `use-campaigns.ts`
- npm registry: `@tanstack/react-query@5.101.1`, `next-intl@4.13.0`, `@microsoft/fetch-event-source@2.0.1`

### Secondary (MEDIUM confidence)

- `.planning/milestones/v13.5-phases/181-assistant-surface/181-CONTEXT.md` — locked decisions
- `.planning/REQUIREMENTS.md` — CHAT-01–04

### Tertiary (LOW confidence)

- None used for critical claims

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — verified package.json + npm registry + existing hook patterns
- Architecture: HIGH — APIs and repositories inspected; greenfield UI only
- Pitfalls: HIGH — derived from actual API constraints (POST SSE, thread scoping, AppShell nesting)

**Research date:** 2026-06-25
**Valid until:** 2025-07-25 (stable stack; assistant APIs recently added)
