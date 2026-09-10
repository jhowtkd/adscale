# Estúdio — Créditos e QA: evidência do Agente D (2026-09-10)

Agente / branch / worktree: D / `codex/estudio-creditos-qa` / `.worktrees/estudio-creditos-qa`
BASE_COMUM: `3063ff4a` (`codex/estudio-integracao` no momento da criação deste worktree)

Escopo deste documento: tarefas 4–6 do plano de confiabilidade e créditos,
fatia da tarefa 4 do plano de qualidade (quality na evidência do provider
controlado + protocolo humano) e preparação da tarefa 7 do plano de
experiência. E2E real aguarda o SHA integrado do coordenador.

## 1. Primeiro marco: créditos (Tasks 4–5) — ENTREGUE para merge

### Task 4 — histórico com mesmo recorte, datas e acesso explícito

- `getCreditTransactionsForWorkspace` e `getCreditTransactionSummary`
  passaram a compartilhar o helper privado `transactionWhere`
  (`CreditTransactionFilters = { from?; to?; campaignId? }`); sem duplicação
  de filtros.
- `getCreditTransactionSummary(workspaceId, filters?)` aceita o mesmo recorte
  e retorna também `distinctCampaignCount` (COUNT DISTINCT campaignId).
- `GET /api/billing/history`: listagem e resumo recebem os mesmos filtros;
  média = `round(totalSpent / distinctCampaignCount)` no mesmo recorte
  (opções de campanha continuam all-time); saldo = `creditBalance` da
  autoridade canônica `getWorkspaceBillingAccess` (não soma de grants da
  rota); datas validadas (instantes finitos, from ≤ to, campaignId UUID →
  400 `invalidInput`); date-only compatível (from = início UTC, to = fim UTC
  do dia; 31/02 e vizinhos normalizados dão 400); clientes novos usam ISO
  completo com offset.
- `GET /api/billing/status`: `billing.access.unlimited: boolean` calculado
  por `workspaceHasUnlimitedBillingAccess` — nunca por label/999999/role.
  Resposta antiga sem o campo não autoriza acesso ilimitado (cliente trata
  ausente como `false`).
- Cliente: `allTime` envia `{}` (sem corte 2020); este mês começa dia 1
  local; últimos 3 meses = mês atual−2 (antes: mês−3, ou seja, 4 meses);
  `to` = hoje 23:59:59.999 local; ISO completo, sem split. `SelectValue`
  renderiza `t(dateRange)` / nome da campanha ou "—". Vazio, loading e
  falha separados. Ilimitado exibe rótulo + explicação
  ("uso registrado sem débito"); tabela esclarece que lista movimentações
  de créditos, não todos os eventos de uso. Select global intocado.
- Uso ilimitado continua `usage_events` amount 0; nenhum débito/refund
  financeiro fictício; nenhum backfill; schema intocado.

### Task 5 — débito e histórico na mesma transação

- `createCreditTransaction(data, tx?)`: segundo parâmetro opcional
  `DbOrTx`, mesmo padrão de `repositories/usage` e `repositories/billing`.
- `recordUsage`: ledger movido para dentro do callback transacional, depois
  de `trackUsage`, só com `userId` e sem `unlimitedBillingBypass`. Falha de
  ledger rejeita e reverte (sem catch-e-engole). Replay não insere linha.
- `refundCredits`: ledger de restauração dentro da mesma transação
  (grant + usage/key + linha positiva); bypass ilimitado gera evento
  amount 0 sem débito e **sem refund financeiro** (o teste antigo que
  esperava refund positivo em bypass foi atualizado para a regra sem
  movimentação). 23505 só vira `duplicate` quando o usage esperado existe
  para workspace+chave (consulta fora da tx abortada); divergência real
  relança. Sem ciclo transacional novo nem espera externa dentro de tx.

### Comandos e resultados (Task 4–5 + qualidade-provider)

Em `app/` (2026-09-10, worktree D):

```bash
npm test -- src/server/billing/credits.test.ts \
  src/app/api/billing/history/route.test.ts \
  src/app/api/billing/status/route.test.ts \
  src/lib/hooks/use-billing.test.tsx \
  src/components/settings/CreditHistoryTab.test.tsx \
  src/components/settings/BillingTab.test.tsx \
  src/components/layout/AppSidebar.test.tsx \
  src/server/ai/providers/e2e-controlled-provider.test.ts
# 8 arquivos, 90 testes, 90 passed

npm run typecheck  # limpo
```

Vizinhança verificada sem regressão:

```bash
npm test -- src/server/generation/settlement-adapters.test.ts \
  src/server/billing/ src/app/api/billing/
# 18 arquivos, 225 testes, 225 passed

npm test -- src/server/application/generate-creative-work.test.ts \
  src/server/application/retry-creative-work-output.test.ts \
  src/server/application/revise-creative-work-output.test.ts \
  src/server/repositories/usage.test.ts \
  src/components/settings/ src/components/layout/AppSidebar.test.tsx \
  src/lib/hooks/use-billing.test.tsx
# 11 arquivos, 100 testes, 100 passed
```

Ciclo vermelho→verde observado: 5 falhas em history, 2 em status,
4 em credits (ledger/tx/bypass/23505), 1 em provider-quality, falhas de
Ilimitado em CreditHistoryTab/BillingTab/Sidebar — todas verdes após a
correção mínima. Durante o vermelho, um mock com fila `once` vazou entre
testes de refund (a transação faz 3 lookups: pré-check + 2 checks
in-tx); resolvido com fila hermética por teste, sem mudar produção.

## 2. Qualidade — fatia D da tarefa 4 (provider + protocolo)

- `recordProviderCall` grava `quality: input.quality ?? null`; geração
  controlada inalterada. Teste isolado por `E2E_PROVIDER_EVIDENCE_PATH`
  (`mkdtempSync`, cleanup em `finally`).
- Protocolo da comparação humana: ver
  `docs/evidence/2026-09-10-peca-unica-qualidade.md`. Status `not_run` —
  nenhuma geração real executada, nenhum PNG determinístico declarado
  como prova de qualidade.

## 3. Segundo marco: QA após base combinada (Tasks 6–7) — BLOQUEADO

- Fixtures/casos E2E e extensão `quality` da evidência: preparados (este
  doc + protocolo acima).
- **E2E real não executado**: aguarda SHA integrado do coordenador e
  incorporação desse commit nesta branch. Não rodado contra branch
  parcial; nenhuma geração de produção usada como fallback.
- Matriz a executar pós-integração (serial-flows):
  peça→plano→fila→pronta→nota→revisão→variação→adaptação→reload no mesmo
  work; pai intacto; replay e duas abas; sem cobrança ao abrir camadas;
  carrossel salva e mostra erro; restyle não confunde análise com falta;
  seleção manual 1→1; formato auto 4:5; ledger/saldo/datas/ilimitado/
  rollback; snapshot antigo conserva comportamento; provider integrado
  (quality high, 1 chamada inicial, nenhuma autocorreção, retry técnico
  confirmado no máximo 2). Screenshots nos 3 viewports (390×844,
  1045×586, 1440×900). Casos financeiros em `create-post.spec.ts` com
  `withDb`, constraint temporária por UUID de fixture e rollback real.
- Rollback real de banco será provado na tarefa 6; unitários provam
  propagação/tx compartilhado.

## 4. Pedido concreto para outro dono (C, via coordenador)

Chaves novas de tradução (bloco exato PT/EN para incorporar em
`app/messages/pt-BR.json` e `app/messages/en.json`; C é dono dos JSONs —
D não os editou):

```json
// creditHistory
"unlimited": "Ilimitado" / "Unlimited",
"unlimitedHint": "Seu acesso é ilimitado. O uso é registrado sem débito de créditos."
  / "Your access is unlimited. Usage is recorded without debiting credits.",
"movementsNote": "Esta tabela lista movimentações de créditos, não todos os eventos de uso."
  / "This table lists credit movements, not every usage event.",
// billing.account.financial
"unlimited": "Ilimitado" / "Unlimited",
// navigation
"unlimited": "Ilimitado" / "Unlimited"
```

Até a incorporação, QA visual integrado das superfícies financeiras não
está concluído (componentes referenciam as chaves; teste usa overlay de
fixture sobre o catálogo real). Sem as chaves, `t()` renderiza o caminho
da chave — comportamento interim conhecido, não defeito.

## 5. Arquivos alterados (somente ownership D)

- `app/src/server/repositories/credit-transactions.ts`
- `app/src/server/billing/credits.ts` (+ `credits.test.ts`)
- `app/src/app/api/billing/history/route.ts` (+ teste)
- `app/src/app/api/billing/status/route.ts` (+ teste)
- `app/src/lib/hooks/use-billing.ts` (+ teste)
- `app/src/components/settings/CreditHistoryTab.tsx` (+ teste novo)
- `app/src/components/settings/BillingTab.tsx` (+ teste)
- `app/src/components/layout/AppSidebar.tsx` (+ teste, só saldo/ilimitado)
- `app/src/server/ai/providers/e2e-controlled-provider.ts` (+ teste)
- `docs/evidence/2026-09-10-estudio-creditos-qa.md` (este)
- `docs/evidence/2026-09-10-peca-unica-qualidade.md` (protocolo, not_run)

Não editados: motor/revisão/hooks criativos/caixa, schema/migrações,
messages JSON, E2E specs (pós-integração).

## 6. Limitações e produção

- Produção/chamadas pagas: não executadas. Comparação humana de 6
  gerações aguarda autorização concreta de orçamento/calls.
- E2E: bloqueado por integração (ver §3). "Comando verde" parcial acima
  refere-se a unitários/rota/hook/componentes — 90 testes efetivos,
  0 skips, 0 bloqueios nesse recorte.
