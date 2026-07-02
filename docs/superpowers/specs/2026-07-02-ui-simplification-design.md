# Design: Simplificação da Interface do ADScale

> **Data:** 2026-07-02
> **Status:** Aprovado (brainstorming concluído)
> **Escopo:** UX, estratégia de navegação, front-end
> **Abordagem:** A — Destravar o happy path (com refatoração de código embutida)
> **Autor:** Jhonatan Soares (decisões), ZCode (mapeamento + design)

---

## Contexto e problema

O ADScale transforma **1 criativo base + briefing** em dezenas de variações prontas para Meta/Google/TikTok, com gate de qualidade e export. O valor central é "menos tempo por variação" (PRODUCT.md, Princípio 1: *happy path ≤10 interações*).

O mapeamento do app revelou cinco camadas de complexidade que contradizem esse princípio:

1. **Campaign Workspace monolítico** — `app/src/app/(dashboard)/campaigns/[id]/page.tsx` tem 1141 linhas, orquestra ~8 modais, e opera uma state machine de 5 estados (`piloto → acoes → derivando → estilizando → gerando`). O hook `use-campaign-workspace.ts` tem 754 linhas.
2. **Três portas para o mesmo job** — `/restyling`, `/quick-tools/restyling` (dois arquivos quase idênticos), e o botão "Estilizar" dentro da campanha competem pelo mesmo fluxo.
3. **Menu "Laboratório" fantasma** — a sidebar tem uma seção "Laboratório" (Curador IA, Restyling, Receita de estratégia) que sobrepõe itens principais. O "Curador IA" é uma segunda UI completa de criação (30 componentes em `src/components/assistant/`) paralela ao fluxo de campanha.
4. **Espelhos produção vs preview** — `(dashboard)/` e `(preview)/v6/` (13 mockups) coexistem, dobrando a superfície de manutenção.
5. **Operacional misturado com produto** — `/feedback`, `/admin/quality` e dezenas de APIs de calibração/score são ferramentas de operador que vivem no mesmo shell que o usuário final.

### Descoberta chave

O assistente "Curador IA" **já possui uma infraestrutura completa de ações rápidas** no backend, com 8 contratos registrados e handlers executáveis:

- `quick_restyle`, `quick_format_adapt`, `quick_regenerate`, `quick_review`, `quick_save_reference`
- `create_creative_plan`, `revise_creative_plan`, `revise_creative`

Cada contrato define `riskLabel` (low/medium/high), `creditImpact`, `confirmationPolicy`, `optionalFields` com `riskCopyWhenMissing`. O fluxo `POST /api/assistant/actions/[actionId]/confirm` valida tudo, emite telemetria, e executa via handler registrado.

**Isso significa que a complexidade da UI atual (8 modais, 5 estados) existe porque cada ação ganhou seu próprio formulário visual — mas o backend já é um orquestrador.** A simplificação é, em grande parte, tornar o chat a forma principal de interagir com ações que já existem.

---

## Decisões de produto (travadas)

1. **Abordagem A** — Destravar o happy path. Colapsar complexidade no fluxo principal com mínimo de disrupção. v6 fica para fase 2.
2. **Assistente e campanha coexistem com fronteira clara** — mas o assistente faz ações rápidas (alterações pontuais, restyle), não só criação do zero.
3. **Chat como painel de controle** — o assistente deixa de ser um drawer acessório e vira o painel direito permanente do workspace, orquestrando ações rápidas.
4. **Créditos saem da frente** — remover fricção preventiva de custo. O usuário gasta sem aviso; a conversão para plano acontece apenas no bloqueio real (HTTP 402).

---

## Design

### Seção 1 — Arquitetura de navegação

#### Navegação da sidebar (proposta)

```
ADScale
[Busca ⌘K]

PRINCIPAL
  Dashboard        /
  Campanhas        /campaigns
  Biblioteca       /library

CRIAR
  Curador IA       /assistant

[avatar ▼]  Configurações · Ajuda · Sair
```

**Remoções da sidebar:**
- Seção "Laboratório" inteira — some. "Curador IA" sobe como item principal sob "CRIAR".
- "Receita de estratégia" deixa de ser destino — vira um passo dentro da derivação na campanha.
- "Restyling" deixa de ser destino — vira ação (`quick_restyle`) dentro do chat da campanha.
- "Templates" sai da sidebar — passa a ser acessível via Dashboard (card secundário) e via fluxo de criação de campanha.

#### Fronteira assistente × campanha

A fronteira não é "criar vs operar" — é **uma só coisa com duas portas**:

| Aspecto | Curador IA (`/assistant`) | Campanha (`/campaigns/[id]`) |
|---|---|---|
| **Papel** | Criar do zero e operar via ações rápidas | Contexto onde as variações vivem |
| **Input** | Conversa, referências, briefing guiado | Base criativo + briefing |
| **Output** | Cria campanha + briefing, faz handoff; ou dispara ações rápidas | Gera, revisa, aprova, exporta |
| **UI** | Chat + painéis contextuais | Workspace (grid + chat lado a lado) |

A campanha vira o **contexto** que o usuário seleciona; o **chat** é onde a ação acontece. O `CampaignAssistantDrawer` atual (conversar dentro da campanha) deixa de ser um Sheet/Drawer e vira o **painel direito permanente** do workspace.

#### Navegação role-aware

Para `owner`/`admin`, a sidebar ganha uma seção extra claramente separada:

```
OPERACAO
  Feedback         (movido de /feedback para admin-guard)
  Quality
```

Para `member`/`tester`: apenas PRINCIPAL + CRIAR (5 destinos).

**Implementação:** um `RoleAwareSidebar` (ou guard no `DashboardShellSwitcher` existente) que filtra itens por role.

---

### Seção 2 — Layout do workspace de campanha

#### Colapsar 5 estados em 2 modos visuais

O `WorkspaceState` atual (`piloto | acoes | derivando | estilizando | gerando`) colapsa para:

- **`setup`** — quando ainda não há briefing completo (substitui `piloto`)
- **`trabalho`** — quando há briefing e o usuário está operando variações (absorve `acoes`, `derivando`, `estilizando`, `gerando`)

#### MODO 1 — Setup (upload + briefing conversacional)

Layout em 2 colunas:
- **Esquerda:** upload do criativo base (drag & drop / clique).
- **Direita:** chat (Curador IA) guiando o briefing conversacionalmente.

O `GuidedBriefingPanel` atual (form com objetivo/audiência/tom/plataformas/CTA) é substituído pela conversa. A infraestrutura já existe: `src/server/assistant/guided-conversation/definitions/from-zero.ts` e `existing-creative.ts`. Os campos estruturados aparecem como confirmação inline no chat, não como formulário.

Quando o briefing é confirmado (proposta `create_creative_plan` ou handoff), transiciona automaticamente para MODO 2.

#### MODO 2 — Trabalho (grid + chat lado a lado)

Layout em 2 colunas:
- **Esquerda:** grid de derivações + action bar enxuta.
- **Direita:** chat permanente (histórico de ações + propostas pendentes).

**Decisões de layout:**

1. **Chat é painel direito permanente, não drawer.**
   - `CampaignAssistantDrawer` (Sheet hoje) passa a ser uma coluna fixa (~380px desktop, colapsável).
   - Em mobile: aba inferior alternando Grid / Chat.

2. **Detalhe de derivação é lateral, não modal.**
   - `DerivationReviewSheet` (modal full-screen hoje) vira um painel que desliza da direita **dentro** da área de grid, sem cobrir o chat.

3. **Action bar inferior → 2 botões.**
   - Apenas **"Derivar em lote"** (abre `StrategyRecipePanel` — permanece modal) e **"Exportar"**.
   - "Estilizar" deixa de ser CTA visual — vira ação do chat (`quick_restyle`).

4. **Briefing resumo clicável** no topo do MODO 2 — abre edição inline, não modal.

5. **Estados intermediários viram mensagens no chat**, não telas separadas:
   - "derivando"/"estilizando" → mensagem com card de proposta (pendente → executando → concluído).
   - "gerando" → loading no grid + linha no chat ("Gerando 6 variações…").

#### Remoção de componentes do arquivo `campaigns/[id]/page.tsx`

| Componente atual | Destino |
|---|---|
| `EstilizarModal` | `ActionCard` (ação `quick_restyle` no chat) |
| `RegenerateFeedbackDialog` | `ActionCard` (ação `quick_regenerate`) |
| `PersonaSimulationSheet` | `ActionCard` no chat. **Requer novo contrato de ação** `quick_persona_simulate` (não existe hoje entre os 8 contratos registrados) registrado em `src/server/assistant/action-contracts/`, com handler que chama o endpoint `/api/creatives/[id]/persona-simulation` existente. |
| `DerivationReviewSheet` (modal) | Painel lateral dentro do grid + `ActionCard` para review/regenerate |
| `PlatformsDrawer` | Inline no briefing (setup) |
| Bloco condicional de `workspaceState` (linhas 884-999) | Colapsa numa única visualização de MODO 2 |

**Permanecem como modal:**
- `StrategyRecipePanel` ("Derivar em lote") — escolha de recipe + preview de créditos em lote precisa de UI dedicada.
- `DeliveryPackageModal` (export) — seleção multi-formato.
- `ConfirmDialog` (delete) — ação destrutiva isolada.

**Resultado esperado:** `campaigns/[id]/page.tsx` cai de 1141 linhas para ~300-400, orquestrando 2 modos + 2-3 modais.

---

### Seção 3 — Modais → propostas no chat (ActionCard)

#### Componente único: ActionCard

Todo `quick_*` action aparece no chat como um card com a mesma estrutura, derivada do `ActionContract` existente:

```
┌──────────────────────────────────────────────┐
│  ♻  Restyle rápido                           │
│                                              │
│  Referência: style-ref-v2.jpg                │
│  Intensidade: medium                         │
│  Base: base-criativo.png                     │
│                                              │
│  ⚠ Sem nota de direção, o resultado pode     │
│    divergir mais da marca.                   │  ← riskCopy (opcional)
│                                              │
│  [Cancelar]              [Confirmar]         │
└──────────────────────────────────────────────┘
```

Dados do contrato que alimentam o card:
- `label` → título do card.
- `optionalFields` + `buildRiskCopyLines()` → avisos quando campos opcionais faltam.
- `confirmationPolicy: "required"` → exige botão Confirmar.

#### Os 3 estados de uma proposta

```
PENDENTE     → card com [Confirmar] [Editar] [Cancelar]
EXECUTANDO   → spinner + descrição ("Gerando 3 variações…")
CONCLUÍDO    → ✓ "Restyle concluído" + thumbnail do resultado
ERRO         → ✗ mensagem de erro + CTA contextual (ver abaixo)
```

Estados hoje gerenciados por cada modal separadamente passam a ser responsabilidade do `ActionCard` (componente único).

#### Edição inline (o "Editar" do card)

Quando o usuário quer ajustar antes de confirmar (mudar intensidade, escolher outra referência), o card expande inline — não abre modal:

```
┌──────────────────────────────────────────────┐
│  ♻  Restyle rápido              [Cancelar]    │
│                                              │
│  Intensidade:  ( ) soft  (•) medium  ( ) strong │
│  Referência:   [style-ref-v2.jpg ▼]          │
│  Notas:        [deixa mais minimal_____ ]    │
│                                              │
│  [Confirmar]                                 │
└──────────────────────────────────────────────┘
```

Cada action type tem um pequeno schema de edição derivado do seu `inputSchema` (Zod) existente:
- `quick_restyle` → intensidade + referência + notas.
- `quick_format_adapt` → checkboxes de formatos.
- `quick_regenerate` → campo de motivo.

É o mesmo `inputSchema` que alimenta os modais hoje — só muda o render.

#### Tratamento do gate de crédito (estratégia "ir até o fundo do tanque")

**Princípio:** remover a fricção preventiva de custo; o usuário gasta sem aviso e a conversão para plano acontece apenas no bloqueio real.

**Créditos somem de:**
- Badges de "N créditos" em cards de ação.
- "— Ncr" nos botões de confirmar.
- `batchCreditEstimate` e `batchCreditBreakdown` no preview de derivação (o "Derivar em lote" deixa de mostrar custo antes de executar).
- `previewConversionPayload` e `ConversionCta` preventivo (aquele que bloqueia antes de gastar, prevendo que vai faltar).
- Tooltips de custo e estimativas em modais.

O `creditImpact` permanece no `ActionContract` para telemetria e billing internos, mas não aparece na UI da ação.

**Créditos ainda aparecem em (3 lugares):**

| Onde | Por quê |
|---|---|
| **Settings → Billing** | O usuário procura essa info quando quer. Mostra saldo, histórico, forecast. |
| **Gate 402 (quando acaba de fato)** | Não há como evitar — é o momento de converter. |
| **Dashboard (scoreboard discreto)** | Um número pequeno no canto ("23 créditos"), informativo, não preventivo. |

#### O momento de converter (gate 402 real)

Quando `executeConfirmedAssistantAction` retorna erro `credit_blocked` (HTTP 402), o `ActionCard` transiciona para o estado de erro com CTA contextual:

```
┌──────────────────────────────────────────────┐
│  ✗ Restyle rápido — sem créditos suficientes │
│                                              │
│  Você usou todos os seus créditos deste      │
│  ciclo. Para continuar escalando:            │
│                                              │
│  ┌──────────────────────────────────────┐    │
│  │  Growth — 120 créditos/mês           │    │
│  │  R$ 97/mês · 14 dias grátis          │    │
│  │  [Assinar agora →]                   │    │
│  └──────────────────────────────────────┘    │
│                                              │
│  ou [ver todos os planos]                    │
└──────────────────────────────────────────────┘
```

O `resolveConversionGateFromBilling` que já existe é reaproveitado — só muda onde renderiza (dentro do `ActionCard`, não num banner separado).

---

### Seção 4 — Rotas duplicadas, operacional e destinos redundantes

#### 4.1 As 3 portas de restyle → 1

| Rota | Destino |
|---|---|
| `/restyling` | **Deletada.** Redirect para `/campaigns` com toast ("Restyle agora acontece dentro da campanha"). |
| `/quick-tools/restyling` | **Deletada.** Mesmo redirect. |
| Diretório `quick-tools/` inteiro | **Deletado** (só existe para isto). |
| Botão "Estilizar" na campanha | **Removido** como CTA. Vira `quick_restyle` no chat. |
| `src/components/restyling/` (`RestylingUpload`, `RestylingForm`) | **Avaliar:** se a lógica útil (intensidade, upload de ref) for absorvida pelo `ActionCard` de `quick_restyle`, somem. Senão, viram helpers internos. |
| `POST /api/campaigns/[id]/restyle` | **Permanece** — é o handler que `quick_restyle` já chama internamente. |
| `POST /api/quick-tools/restyling` e `POST /api/restyling` | **Avaliar** — se `quick_restyle` cobre o uso, tornam-se dead code removível. |

#### 4.2 Operacional sai do shell do usuário

| Rota | Hoje | Depois |
|---|---|---|
| `/feedback` | Acessível no shell principal | **Guard admin.** Move para `/admin/feedback` (ou sob `RoleAwareSidebar` OPERAÇÃO). |
| `/admin/quality/brands/[id]` | Já é admin, mas divide o `DashboardLayout` | Permanece admin, mas em layout separado (sem sidebar de produto, sem onboarding tour, sem chat drawer). |

**Regra:** se não serve para um usuário final que paga assinatura, não vive no mesmo shell.

**Implementação:** `RoleAwareSidebar` (ou guard no `DashboardShellSwitcher`) que, para `member`/`tester`, mostra apenas Dashboard/Campanhas/Biblioteca/Curador IA. Para `owner`/`admin`, adiciona a seção "OPERACAO".

#### 4.3 Templates e Docs deixam de ser destino de navegação

- **`/templates`** — acessível via Dashboard (card secundário) e via fluxo de criação de campanha (opção "usar template"). Sai da sidebar.
- **`/docs`** — passa para o menu do avatar (dropdown: Configurações, Ajuda, Sair). Não é rota first-class na sidebar.

#### 4.4 Duplicação v6 — o que fazer agora

A `(preview)/v6/` (13 mockups) **não é tocada neste trabalho**, mas para evitar que a dívida cresça:

- **Congelar novos mockups** em `(preview)/v6/` enquanto a simplificação acontece (o destino final vai mudar com as Seções 1-3).
- Os mockups v6 existentes viram referência visual, não código a migrar.
- A fase 2 (após esta simplificação estabilizar) decide se a arquitetura visual v6 vira a base.

#### Resultado final da navegação

5 destinos para o usuário final (vs ~9 hoje):
- Dashboard, Campanhas, Biblioteca, Curador IA, (avatar menu → Settings/Help).

Para owner/admin, +2: Feedback, Quality.

---

## Fora de escopo (fase 2)

- Migração/promoção da `(preview)/v6/` a produção.
- Refatoração do `TopBar.tsx` (856 linhas) — embora o `RoleAwareSidebar` possa reduzir parte dele, o foco agora é o workspace e a navegação.
- Revisão de tokens de design / escala tipográfica (mencionados em `UI-REVIEW.md` mas não vinculados ao objetivo de simplificação de fluxo).
- Redesign do dashboard visual — o dashboard atual (`DashboardV6View`) já funciona; a mudança de navegação não exige redesenhá-lo.

---

## Sucesso

- **Happy path ≤10 interações** (upload → variações → export), conforme PRODUCT.md Princípio 1.
- **Arquivo `campaigns/[id]/page.tsx`** reduzido de 1141 para ~300-400 linhas.
- **1 componente `ActionCard`** substitui 4 modais (`EstilizarModal`, `RegenerateFeedbackDialog`, `PersonaSimulationSheet`, parte do `DerivationReviewSheet`).
- **Navegação de ~9 destinos para 5** para o usuário final.
- **3 portas de restyle reduzidas a 1** (ação no chat).
- **Fricção de crédito removida** do fluxo preventivo; conversão concentrada no 402 real.
