# Creative Work Variações — Plano de Implementação (#124–#130)

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) ou `superpowers:executing-plans` para implementar este plano task-a-task. Os passos usam checkbox (`- [ ]`) para tracking.

**Goal:** Transformar o protocolo de Variações do `creative_work` em uma supervisão guiada: contrato expandido para direcionamentos persistentes, preview autenticado da arte, leitura visual em português, retomada correta, geração sem falso timeout, seleção de 1–5 direcionamentos, sugestões automáticas com IA e recuperação parcial sem cobrança duplicada.

**Architecture:** Manter o agregado canônico `creative_work_items` como fonte da verdade, expandindo `settings`/`brief`/contrato para pool de direcionamentos; persistir vínculo 1:1 entre direcionamento e output em `creative_work_outputs`; usar política de operação longa no cliente e reconciliação canônica no servidor para evitar falso timeout; manter retrocompatibilidade com o fluxo atual de 3 níveis.

**Tech Stack:** Next.js (App Router), TypeScript, Drizzle ORM, PostgreSQL, Inngest, TanStack Query, React Server Components/Client Components, Vitest, Playwright.

## Global Constraints

- O contrato expandido deve ser retrocompatível: rascunhos e outputs históricos sem os novos campos continuam funcionando.
- O fluxo atual de três resultados (`conservative`, `balanced`, `bold`) deve continuar verde e produzir os mesmos preços/planos quando o novo contrato está ausente.
- Leitura e escrita continuam limitadas ao workspace e ao mesmo `creative_work`.
- Nenhuma chamada ao provedor de geração de imagem é feita para construir a visualização da fonte (#125).
- A geração inicial não herda o timeout genérico de 15 segundos destinado a chamadas curtas (#127).
- Cada output selecionado representa exatamente 5 créditos (#128).
- Sugestões automáticas de IA não registram consumo de créditos (#129).
- Retry parcial não adiciona segundo débito líquido para o mesmo output (#130).

---

## Macro-dependências

```
#124 (contrato) ─┬─→ #128 (seleção 1-5) ─┬─→ #129 (sugestões IA)
                 │                        │
                 │                        └─→ #130 (recuperação parcial)
                 │
                 ├─→ #125 (miniatura/leitura visual)
                 ├─→ #126 (retomada)
                 └─→ #127 (timeout/reconciliação)
```

A fronteira inicial pode começar imediatamente: **#124, #125, #126, #127**.

---

## File Structure (não exaustivo)

| File | Responsibility |
|---|---|
| `app/src/server/ai/creative-contract.ts` | Tipos do contrato persistente (`CreativeContract`, `PromptProvenance`). |
| `app/src/server/ai/canonical-creative-contract.ts` | Política canônica e builders de prompt. |
| `app/src/server/creative-work/contracts.ts` | Tipos de domínio (`SocialPostBrief`, `CreativeWorkSettings`, status, etc.). |
| `app/src/server/db/schema.ts` | Schema Drizzle de `creative_work_items`, `creative_work_sources`, `creative_work_outputs`. |
| `app/src/server/repositories/creative-work.ts` | CRUD do agregado e outputs. |
| `app/src/server/application/generate-creative-work.ts` | Orquestra prepare → quote → settlement → dispatch. |
| `app/src/server/application/prepare-creative-work.ts` | Converte rascunho em brief/copy/snapshot. |
| `app/src/server/jobs/creative-work.ts` | Job Inngest de geração. |
| `app/src/app/api/creative-work/[id]/route.ts` | GET/PATCH do trabalho. |
| `app/src/app/api/creative-work/[id]/generate/route.ts` | POST de geração. |
| `app/src/app/api/creative-work/[id]/directions/route.ts` | **Novo** — persistir pool/seleção/instrução manual. |
| `app/src/app/api/creative-work/[id]/suggest/route.ts` | **Novo** — sugerir direcionamentos com IA (gratuito). |
| `app/src/components/creative-work/CreativeComposer.tsx` | Entrada e seleção de direcionamentos. |
| `app/src/components/creative-work/CreativeSourcePreviewCard.tsx` | Card da fonte com preview e leitura visual. |
| `app/src/components/creative-work/CreativeResultCard.tsx` | Card de resultado com rótulo do direcionamento. |
| `app/src/lib/hooks/use-creative-work.ts` | Hooks de dados e mutações. |
| `app/src/lib/hooks/use-creative-composer.ts` | Estado local do composer. |

---

## Task 1: #124 — Contrato para direcionamentos persistentes

**Goal:** Expandir `CreativeContract`/`CreativeWorkSettings` para suportar pool versionado de direcionamentos, seleção ativa, instrução manual global e vínculo congelado por output.

**Files:**
- Modify: `app/src/server/ai/creative-contract.ts`
- Modify: `app/src/server/creative-work/contracts.ts`
- Modify: `app/src/server/db/schema.ts`
- Modify: `app/src/server/repositories/creative-work.ts`
- Modify: `app/src/app/api/creative-work/[id]/route.ts`
- Create: `app/src/app/api/creative-work/[id]/directions/route.ts`
- Create: `app/src/app/api/creative-work/[id]/directions/route.test.ts`
- Modify: `app/src/server/application/generate-creative-work.ts`
- Modify: `app/src/server/application/prepare-creative-work.ts`
- Modify: `app/src/server/jobs/creative-work.ts`
- Modify: `app/src/server/repositories/creative-work.test.ts`
- Modify: `app/src/server/ai/canonical-creative-contract.test.ts` (ou criar)

**Interfaces:**
- Consumes: `CreativeWorkSettings` de `app/src/server/creative-work/contracts.ts`, `CreativeContract` de `app/src/server/ai/creative-contract.ts`.
- Produces:
  - `CreativeDirection` (id estável, label, instruction, order, safetyBand: `'safe' | 'experimental'`, provenance: `'default' | 'ai-suggestion' | 'manual'`)
  - `CreativeDirectionPool = { version: number; directions: CreativeDirection[]; selectedIds: string[]; manualInstruction: string | null }`
  - `CreativeWorkSettings` ganha campo opcional `directionPool?: CreativeDirectionPool`
  - `CreativeContract` ganha `directionPool?: CreativeDirectionPool`
  - `CreativeWorkOutput` ganha `directionId?: string | null`, `directionSnapshot?: { label: string; instruction: string; order: number } | null`
  - API `PATCH /api/creative-work/[id]/directions` com body `{ directionPool: CreativeDirectionPool }`

### Steps

- [ ] **Step 1.1: Definir tipos de direcionamento**
  - Adicionar em `app/src/server/creative-work/contracts.ts`:
    ```ts
    export type CreativeDirectionId = string;
    export type CreativeDirectionSafetyBand = "safe" | "experimental";
    export type CreativeDirectionProvenance = "default" | "ai-suggestion" | "manual";
    export interface CreativeDirection {
      id: CreativeDirectionId;
      label: string;
      instruction: string;
      order: number;
      safetyBand: CreativeDirectionSafetyBand;
      provenance: CreativeDirectionProvenance;
    }
    export interface CreativeDirectionPool {
      version: number;
      directions: CreativeDirection[];
      selectedIds: CreativeDirectionId[];
      manualInstruction: string | null;
    }
    ```
  - Adicionar `directionPool?: CreativeDirectionPool` em `CreativeWorkSettings`.

- [ ] **Step 1.2: Persistir pool no contrato canônico**
  - Adicionar `directionPool?: CreativeDirectionPool` em `CreativeContract` (`app/src/server/ai/creative-contract.ts`).
  - Atualizar `resolveContractPolicy`/`buildCanonicalContractPromptSection` para, quando `directionPool` presente, injetar a instrução do output correspondente no prompt.

- [ ] **Step 1.3: Adicionar colunas de output para vínculo congelado**
  - Em `app/src/server/db/schema.ts`, adicionar em `creative_work_outputs`:
    - `directionId: uuid("direction_id")` (nullable)
    - `directionSnapshot: jsonb("direction_snapshot").$type<{ label: string; instruction: string; order: number }>()` (nullable)
  - Gerar migração Drizzle (`pnpm drizzle-kit generate`).

- [ ] **Step 1.4: Implementar endpoint PATCH /directions**
  - Criar `app/src/app/api/creative-work/[id]/directions/route.ts`.
  - Validar: `directionPool.directions` sem ids duplicados; `selectedIds` ⊆ ids do pool; 0 < `selectedIds.length` ≤ 5; `manualInstruction` opcional string.
  - Atualizar `creative_work_items.settings` com o novo `directionPool` (apenas se status `draft`).
  - Garantir workspace scoping.

- [ ] **Step 1.5: Atualizar repositório para retornar pool**
  - `updateCreativeWorkDraft` já persiste `settings`; verificar se `directionPool` passa limpo.
  - `getCreativeWork` já retorna `settings`; nenhuma mudança necessária se tipos estiverem atualizados.

- [ ] **Step 1.6: Adaptar geração para usar pool quando presente**
  - Em `app/src/server/application/generate-creative-work.ts`, quando `directionPool` existe, criar um `CreativeWorkOutputPlan` por `selectedId` em vez dos 3 níveis.
  - Cada output deve ter `directionId` e `directionSnapshot` congelados.
  - Quando `directionPool` ausente, manter comportamento atual de 3 níveis.

- [ ] **Step 1.7: Adaptar job para ler directionSnapshot**
  - Em `app/src/server/jobs/creative-work.ts`, usar `directionSnapshot.instruction` (quando presente) como base do prompt, sem perder proteções de marca/fatos/referências/qualidade.

- [ ] **Step 1.8: Escrever testes de contrato e persistência**
  - Testar round-trip do pool via PATCH /directions.
  - Testar retrocompatibilidade: rascunho sem `directionPool` gera 3 níveis.
  - Testar validação: ids duplicados, seleção fora do pool, >5 selecionados.
  - Testar que outputs congelam `directionSnapshot`.

- [ ] **Step 1.9: Commit**
  ```bash
  git add app/src app/drizzle app/tests docs/superpowers/plans/...
  git commit -m "feat(creative-work): #124 expand contract for persistent directions"
  ```

---

## Task 2: #125 — Miniatura e leitura visual em português

**Goal:** Mostrar preview autenticado da fonte, organizar análise em português, separar texto literal e representar estilo visualmente sem gerar imagem.

**Files:**
- Modify: `app/src/server/application/analyze-creative-work-source.ts`
- Modify: `app/src/server/ai/image-analysis.ts` (tipos `ContentBrief`/`StyleBrief`)
- Modify: `app/src/components/creative-work/CreativeSourcePreviewCard.tsx`
- Modify: `app/src/components/creative-work/CreativeVariationBrief.tsx`
- Modify: `app/messages/pt-BR.json` e `app/messages/en.json`
- Modify: `app/src/lib/hooks/use-creative-work.ts` (DTO/projection)
- Create/Modify: testes de componente e análise

**Interfaces:**
- Consumes: `CreativeWorkSource` com `contentAnalysis`/`styleAnalysis`, `workspaceAssets` (preview autenticado).
- Produces:
  - `LocalizedContentBrief = { summaryPt: string; literalText?: string; entities?: string[] }`
  - `VisualStyleBrief = { palette?: { hex: string; labelPt: string }[]; typography?: { family?: string; weight?: string; stylePt: string }[]; moodChipsPt: string[]; compositionPt: string }`
  - Componente `CreativeSourcePreviewCard` recebe `previewUrl` autenticada, fallback de erro, estados de upload/análise.

### Steps

- [ ] **Step 2.1: Estruturar análise em português**
  - Atualizar tipos em `app/src/server/ai/image-analysis.ts` para incluir campos localizados (`summaryPt`, `literalText`, `moodChipsPt`, `compositionPt`, etc.).
  - Atualizar `analyzeCreativeWorkSource` para normalizar/preencher esses campos (pode usar tradução/mapeamento interno; não chamar gerador de imagem).

- [ ] **Step 2.2: Expor preview autenticado da fonte**
  - Na projeção do trabalho (GET `/api/creative-work/[id]`), retornar URL assinada/preview do `workspaceAssets` vinculado à fonte.
  - Implementar fallback explícito quando imagem falha ao carregar.

- [ ] **Step 2.3: Redesenhar card de fonte**
  - `CreativeSourcePreviewCard`: miniatura, estados (upload/analisando/pronto/falha/retry/remover), fallback de imagem.
  - `CreativeVariationBrief`: separar resumo localizado, texto literal (inalterado), estilo visual (paleta de cores como swatches, tipografia como espécime, clima como chips, composição como esquema simples).

- [ ] **Step 2.4: Adicionar copy em português**
  - Atualizar `app/messages/pt-BR.json` com labels de estados, fallback e campos de análise.
  - Manter `en.json` consistente.

- [ ] **Step 2.5: Testes**
  - Teste unitário: `analyzeCreativeWorkSource` retorna campos localizados.
  - Teste de componente: preview autenticado renderiza; fallback aparece em erro de imagem; análise localizada e texto literal são exibidos separadamente; não há chamada ao gerador de imagem.

- [ ] **Step 2.6: Commit**
  ```bash
  git commit -m "feat(creative-work): #125 authenticated thumbnail and pt-BR visual reading"
  ```

---

## Task 3: #126 — Retomada na página própria ou campanha

**Goal:** "Continuar de onde parei" leva ao destino correto: página própria autenticada se sem campanha, ou campanha associada se vinculada.

**Files:**
- Modify: `app/src/components/dashboard/DashboardHomeActions.tsx`
- Modify: `app/src/lib/hooks/use-creative-work.ts`
- Modify: `app/src/app/api/creative-work/route.ts` (listagem)
- Create: `app/src/app/(authenticated)/creative-work/[id]/page.tsx`
- Create: `app/src/app/(authenticated)/creative-work/[id]/layout.tsx` (se necessário)
- Modify: `app/src/components/creative-work/useCreativeComposer.ts`
- Modify: `app/src/app/api/creative-work/[id]/route.ts`
- Modify: testes de jornada

**Interfaces:**
- Consumes: `CreativeWorkItem` com `campaignId`, `draftKey`, `status`.
- Produces:
  - Rota `/creative-work/[id]` que renderiza `CreativeComposer` hidratado com o trabalho.
  - Lógica de redirecionamento em "Continuar de onde parei": se `campaignId` → `/campaigns/[campaignId]?creativeWork=[id]`; senão → `/creative-work/[id]`.
  - PATCH `/api/creative-work/[id]/campaign` já existe via `linkCreativeWorkCampaign`; garantir idempotência.

### Steps

- [ ] **Step 3.1: Criar página própria do creative work**
  - Criar `app/src/app/(authenticated)/creative-work/[id]/page.tsx`.
  - Verificar workspace/permissions; carregar trabalho via `getCreativeWork`.
  - Renderizar `CreativeComposer` com `workId` e `initialData`.

- [ ] **Step 3.2: Ajustar redirecionamento de retomada**
  - Em `DashboardHomeActions` (ou hook equivalente), alterar "Continuar de onde parei" para respeitar `campaignId`.
  - Garantir que âncoras locais da Home não capturem indevidamente.

- [ ] **Step 3.3: Garantir preservação no vínculo/desvinculo**
  - Verificar que `linkCreativeWorkCampaign` altera apenas `campaignId`.
  - Adicionar teste: vincular/desvincular mantém `id`, fontes, análise, outputs, histórico e billing.

- [ ] **Step 3.4: Testes de jornada**
  - Playwright/Vitest: trabalho sem campanha abre `/creative-work/[id]`; trabalho com campanha abre campanha; mesmo agregado antes/depois do vínculo.

- [ ] **Step 3.5: Commit**
  ```bash
  git commit -m "feat(creative-work): #126 resume on own page or campaign"
  ```

---

## Task 4: #127 — Geração sem falso timeout

**Goal:** Remover timeout genérico de 15s da geração, usar política de operação longa, reconciliar estado canônico após resposta incerta.

**Files:**
- Modify: `app/src/lib/hooks/use-creative-work.ts` (mutação de geração)
- Modify: `app/src/app/api/creative-work/[id]/generate/route.ts`
- Modify: `app/src/server/application/generate-creative-work.ts`
- Modify: `app/src/server/ai/image-generation.ts` (timeout/heartbeat)
- Modify: `app/src/server/jobs/creative-work.ts` (estados)
- Create/Modify: testes de regressão de timeout

**Interfaces:**
- Consumes: `Inngest`'s long-operation policy, `creative_work` status/outputs.
- Produces:
  - `generateCreativeWork` retorna `{ accepted: boolean; workId: string; outputs: ...[] }` rapidamente ou usa long-polling.
  - Cliente, após timeout/desconexão, chama GET `/api/creative-work/[id]` para reconciliar.
  - Estados distintos: `preparing`, `submitting`, `generating`, `reconciling`.

### Steps

- [ ] **Step 4.1: Identificar timeout de 15s**
  - Buscar por `signal timed out`, `AbortSignal.timeout`, `fetch` com timeout em chamadas de geração.

- [ ] **Step 4.2: Usar política de operação longa**
  - Aplicar política já estabelecida (Inngest long-op ou server-action com timeout estendido) na chamada de geração.
  - Garantir que o POST `/generate` possa retornar aceite rapidamente (202 Accepted) com outputs enfileirados.

- [ ] **Step 4.3: Reconciliação pós-timeout**
  - No cliente, após erro de timeout/desconexão, fazer polling de `GET /api/creative-work/[id]` antes de declarar falha.
  - Se servidor aceitou → entrar em acompanhamento de progresso.
  - Se não aceitou → mostrar erro acionável e permitir retry seguro.

- [ ] **Step 4.4: Guardas de submissão/idempotência**
  - Desabilitar CTA durante envio.
  - Usar `operationKey`/`generationCorrelationId` para impedir duplo envio.

- [ ] **Step 4.5: Estados acessíveis**
  - Adicionar estados `preparing`, `submitting`, `generating`, `reconciling` na UI com copy em português.

- [ ] **Step 4.6: Testes de regressão**
  - Simular resposta além de 15s e resposta incerta; provar recuperação sem segundo comando pago.

- [ ] **Step 4.7: Commit**
  ```bash
  git commit -m "feat(creative-work): #127 reconcile generation without false timeout"
  ```

---

## Task 5: #128 — Seleção de 1–5 direcionamentos

**Goal:** Permitir escolher 1–5 direcionamentos, preço 5 créditos/output, manter vínculo 1:1 e ordem persistida.

**Files:**
- Modify: `app/src/components/creative-work/CreativeComposer.tsx`
- Modify: `app/src/components/creative-work/useCreativeComposer.ts`
- Modify: `app/src/lib/hooks/use-creative-work.ts`
- Modify: `app/src/server/application/generate-creative-work.ts`
- Modify: `app/src/server/creative-work/contracts.ts` (se necessário)
- Modify: testes de jornada

**Interfaces:**
- Consumes: `CreativeDirectionPool` de #124.
- Produces:
  - UI de chips selecionáveis com 3 padrões pré-selecionados (`Conservadora`, `Equilibrada`, `Ousada`).
  - CTA mostra `{count} variações · {count * 5} créditos`.
  - Geração inicia sem modal adicional.

### Steps

- [ ] **Step 5.1: Criar componente de seleção de direcionamentos**
  - Chips com seleção 1–5; desabilitar seleção além de 5; zero inválido.
  - Seção "Direcionamentos manuais" recolhida por padrão.

- [ ] **Step 5.2: Atualizar cotação e geração**
  - `generateCreativeWork` recalcula custo = `selectedIds.length * 5`.
  - Servidor valida pool, seleção e rejeita payload adulterado.

- [ ] **Step 5.3: Manter ordem e vínculo**
  - Outputs criados na ordem do pool, cada um congelando seu `directionSnapshot`.
  - Resultados exibem rótulo da direção de origem.

- [ ] **Step 5.4: Testes**
  - Jornada determinística: 1 e 5 chips, preço, geração, vínculo 1:1, recarga e retomada sem gastar créditos reais.

- [ ] **Step 5.5: Commit**
  ```bash
  git commit -m "feat(creative-work): #128 select 1-5 directions"
  ```

---

## Task 6: #129 — Sugestões automáticas com IA

**Goal:** Após análise pronta, solicitar 5 sugestões contextualizadas gratuitas, com fallback e resposta tardia.

**Files:**
- Create: `app/src/server/application/suggest-creative-directions.ts`
- Create: `app/src/app/api/creative-work/[id]/suggest/route.ts`
- Create: `app/src/app/api/creative-work/[id]/suggest/route.test.ts`
- Modify: `app/src/components/creative-work/CreativeComposer.tsx`
- Modify: `app/src/lib/hooks/use-creative-work.ts`
- Modify: `app/src/server/ai/creative-contract.ts`/`canonical-creative-contract.ts`

**Interfaces:**
- Consumes: `CreativeWorkSource` analisado, `workspaceId`, `creativeWorkId`.
- Produces:
  - `POST /api/creative-work/[id]/suggest` retorna `{ directions: CreativeDirection[] }` (5 registros, ranking implícito por ordem).
  - Não registra créditos (`cost = 0`).
  - Hook dispara sugestão automaticamente quando análise fica `ready`.

### Steps

- [ ] **Step 6.1: Implementar comando de sugestões**
  - `suggestCreativeDirections(workspaceId, workItemId)`:
    - Lê fontes analisadas.
    - Chama LLM (não gerador de imagem) para produzir 5 direcionamentos contextualizados.
    - Gera ids estáveis (hash ou uuid determinístico).
    - Retorna array ordenado.

- [ ] **Step 6.2: Endpoint de sugestões**
  - `POST /api/creative-work/[id]/suggest` autenticado e scoped.
  - Não cobra créditos.

- [ ] **Step 6.3: Comportamento na UI**
  - Enquanto IA carrega, mantém 3 padrões selecionados.
  - Se IA retorna antes de interação → substitui pool, seleciona top 3.
  - Se usuário já interagiu → mostrar confirmação para aplicar ou manter.
  - "Sugerir novamente" preserva chips selecionados e substitui não selecionados até completar 5.

- [ ] **Step 6.4: Persistir pool para evitar reexecução**
  - Salvar `directionPool` no rascunho após receber sugestões.

- [ ] **Step 6.5: Testes**
  - Sucesso automático, loading, fallback, retry, resposta tardia, regeneração parcial, persistência, impacto zero em créditos.

- [ ] **Step 6.6: Commit**
  ```bash
  git commit -m "feat(creative-work): #129 AI-powered direction suggestions"
  ```

---

## Task 7: #130 — Recuperação parcial sem cobrança duplicada

**Goal:** Preservar outputs concluídos, permitir retry apenas do output falho, reutilizar direção congelada, manter um único débito líquido.

**Files:**
- Modify: `app/src/server/application/retry-creative-work-output.ts`
- Modify: `app/src/server/application/cancel-creative-work-output.ts`
- Modify: `app/src/server/repositories/creative-work.ts`
- Modify: `app/src/server/generation/canonical/policies.ts` (refund)
- Modify: `app/src/components/creative-work/CreativeResultCard.tsx`
- Modify: `app/src/lib/hooks/use-creative-work.ts`
- Modify: testes de retry/recuperação

**Interfaces:**
- Consumes: `CreativeWorkOutput` com `directionId`/`directionSnapshot` de #124.
- Produces:
  - Retry técnico reenvia apenas output falho, preservando `directionSnapshot`.
  - Nenhum segundo débito líquido para o mesmo output.
  - Estado parcial (`partial`) mantido até todos outputs terminarem.

### Steps

- [ ] **Step 7.1: Garantir estado parcial visível**
  - `CreativeResultCard` mostra outputs concluídos e falhos distintamente.
  - Ação de retry apenas em outputs `failed`.

- [ ] **Step 7.2: Retry técnico isolado**
  - `retryCreativeWorkOutput` reenvia apenas output afetado, usando `directionSnapshot`.
  - Não recria outputs concluídos.

- [ ] **Step 7.3: Idempotência de débito/refund**
  - Revisar `decideCreativeWorkRefund` e settlement adapters para garantir que retry não adiciona segundo débito.
  - Reativação idempotente mantém exatamente um débito líquido antes do requeue.

- [ ] **Step 7.4: Teto durável de chamadas**
  - `imageCallCount` já tem teto de 2; garantir que retry respeita e apresenta estado acionável ao atingir.

- [ ] **Step 7.5: Testes**
  - Jornada determinística: 4 sucessos + 1 falha, retry isolado, preservação do direcionamento, conferência do ledger sem créditos reais.

- [ ] **Step 7.6: Commit**
  ```bash
  git commit -m "feat(creative-work): #130 partial recovery without duplicate charge"
  ```

---

## Review e Integração Final

- [ ] **Review cross-axis:** para cada PR/commit, rodar skill `review` (Standards vs Spec) contra `main`.
- [ ] **Rodar testes completos:** `pnpm test:unit`, `pnpm test:integration`, `pnpm test:e2e` (selecionar suites de creative work).
- [ ] **Type check:** `pnpm typecheck`.
- [ ] **Lint:** `pnpm lint`.
- [ ] **Migrações:** `pnpm drizzle-kit migrate` em ambiente local para validar.
- [ ] **Atualizar issues do GitHub:** comentar progresso, marcar critérios de aceitação, mover labels (`in-progress` → `ready-for-review` → `done`).

---

## Self-Review Checklist

- [x] Spec coverage: cada acceptance criterion dos tickets #124–#130 está mapeado em uma task/step.
- [x] Placeholder scan: nenhum "TBD"/"TODO"/"implement later" no plano.
- [x] Type consistency: `CreativeDirectionPool`, `CreativeDirection`, `directionSnapshot` e `directionId` usam os mesmos nomes em todas as tasks.
