# Reliability Operational Baseline — 2026-09-12

Task 1 (OPS-00) do plano "Confiabilidade do Trabalho".
Toda tarefa seguinte deste plano cita o SHA de execução abaixo no seu relatório.

> Sem segredos neste arquivo: sem `DATABASE_URL`, credenciais, dumps ou URLs assinadas.

## 1. SHA de execução (Step 1)

- SHA: `b2ee6511a6739e92bb074874078fe0acd88b608f`
- Verificação: `git fetch origin` + `git rev-parse origin/main` em 12/09/2026 retornou
  exatamente o SHA acima — **sem divergência** da base verificada do plano.
- `git log --oneline --decorate -8 origin/main`:

```text
b2ee6511 (origin/main, origin/HEAD) docs(funnel): ler o funil uma vez e manter o freeze (#336)
7db57fc9 fix(studio): parar de se contradizer em público (#335)
f40364f9 fix(studio): polish Impeccable no Estúdio vazio (#334)
b1899685 docs: instalar Impeccable e gravar PRODUCT.md (#333)
816c832c fix(studio): stop clipping protocol pills and the request card (#332)
bea4d2bc feat: carrossel editorial com pesquisa, ganchos e pausa na capa (#331)
e994970e feat: run Sunburst visual smoke on the product image provider (#330)
5cef38e7 docs: freeze Sunburst visual corpus and unpaid budget (#329)
```

- Worktree isolado: `/Users/jhonatan/Repos/ADScale_2-reliability`,
  branch `reliability/confiabilidade-do-trabalho`, `git status` limpo na criação.
  O checkout original (`feat/f03-commercial-offer-catalog`, com trabalho não
  commitado) não foi alterado.

Pequenos desvios de número de linha em relação às Descobertas do plano (conteúdo
confirmado, linhas deslocadas): `startCommand` do worker está em
`render.yaml:124` (plano citava `:120`); o bloco `databases`/`plan: free` está em
`render.yaml:195-200` (plano citava `:191`); `MINIMAX_*` está em
`render.yaml:65-68` (plano citava `:61-64`). Como o SHA coincide, as Descobertas
permanecem válidas; apenas as âncoras de linha foram atualizadas neste relatório.

## 2. Features em voo (Step 2)

Comandos executados:

```bash
git branch -r --no-merged origin/main
gh pr list --state open --json number,title,headRefName,mergeable,updatedAt
```

- `gh pr list --state open` retornou `[]` — **zero PRs abertos** nesta rodada
  (gh autenticado e funcional; saída real, não falha de auth).
- `git branch -r --no-merged origin/main` retornou 41 branches remotas sem merge,
  mas nenhuma possui PR aberto, logo nenhuma entra na classificação (a)/(b)/(c),
  que é por PR:

```text
origin/codex/brand-cortex-typography-hierarchy
origin/codex/issue-197-briefing-safety
origin/codex/studio-caixa-unificada
origin/cursor/adscale-improvements-research-8452
origin/cursor/adscale-improvements-research-8d1a
origin/cursor/api-design-review-eb00
origin/cursor/application-test-gaps-1350
origin/cursor/bc-c6afca3d-6b73-4f32-9760-c626db812396-7a86
origin/cursor/beta-analytics-event-2c7a
origin/cursor/beta-analytics-event-46dc
origin/cursor/carousel-editorial-f786
origin/cursor/cloud-agent-1788336548028-gr4u8
origin/cursor/critical-path-optimization-0afe
origin/cursor/documentation-risk-reduction-50a6
origin/cursor/documentation-risk-reduction-8712
origin/cursor/duplicated-business-logic-785b
origin/cursor/frontend-ux-accessibility-2925
origin/cursor/frontend-ux-accessibility-56c5
origin/cursor/hardcoded-string-internationalization-0a8b
origin/cursor/hardcoded-string-internationalization-84b3
origin/cursor/interface-copy-improvement-5f19
origin/cursor/interface-copy-improvement-f4b3
origin/cursor/security-hardening-improvement-048b
origin/cursor/studio-talkbox-clip-f786
origin/cursor/sunburst-destinations-exception-db42
origin/cursor/sunburst-engine-db42
origin/cursor/sunburst-i5-anchor-db42
origin/cursor/sunburst-visual-corpus-db42
origin/cursor/sunburst-visual-smoke-db42
origin/cursor/technical-debt-cleanup-3707
origin/cursor/test-data-factory-bbad
origin/cursor/test-data-factory-c664
origin/feat/178-reference-selection
origin/feat/f01-visual-recipes
origin/feat/f02-external-piece-review
origin/feat/f03-commercial-offer-catalog
origin/feat/ice-m01-m10
origin/feat/m01-ci-deploy-checks
origin/feat/studio-entry-interview
origin/fix/f01-typecheck
origin/fix/ice-composer-lint
```

Classificação:

- (a) aceito e indispensável à base: **nenhum** (sem PRs abertos).
- (b) independente e adiável: **nenhum** (sem PRs abertos).
- (c) conflitante com a decisão canônica: **nenhum** (sem PRs abertos).

Observação: `origin/feat/f03-commercial-offer-catalog` **existe** no remoto nesta
rodada (ao contrário da rodada da spec, em que não apareceu). Conforme o plano,
isso por si só não significa integração nem descarte — e sem PR aberto não há o
que integrar. Nada a incorporar à base antes das Tasks seguintes.

## 3. Provedor, plano e backup (Step 3) — PENDENTE DO PROPRIETÁRIO

Declarado em `render.yaml:195-200`:

```yaml
databases:
  - name: adscale-postgres
    databaseName: adscale_db
    user: adscale
    plan: free
    postgresMajorVersion: "16"
    ipAllowList: []
```

O blueprint declara `plan: free` + Postgres 16. Isso **não** prova o plano vivo.

PENDENTE DO PROPRIETÁRIO (painel Render): provedor efetivo, plano efetivo do
banco vivo, versão do Postgres, limite de conexões do plano, data de expiração
aplicável e política de backup. Se o banco vivo for Render Free, valem os
alertas do plano (expiração documentada em 30 dias, carência de 14 dias, sem
backups gerenciados) — preservar os dados e decidir o plano **antes** de
qualquer expansão ou migração arriscada.

## 4. Prova de restore (Step 4) — PENDENTE DO PROPRIETÁRIO

Nenhum exercício de restore foi executado nesta tarefa (fora do escopo do
agente: exige acesso ao painel/banco de produção).

PENDENTE DO PROPRIETÁRIO: restaurar em destino isolado (webhooks, e-mails e
workers de produção desligados) e registrar momento do backup, duração do
restore e verificações de integridade (contagem de linhas por tabela principal,
último `created_at` de `creative_work_items` e `usage_events`). Não alterar o
banco de produção durante o exercício.

## 5. Amostra R2 (Step 5) — PENDENTE DO PROPRIETÁRIO

PENDENTE DO PROPRIETÁRIO: tomar uma amostra de `creative_work_outputs.output_key`
não nulos, conferir existência no bucket e registrar tamanho da amostra e
quantos faltaram. Nunca registrar URL assinada.

## 6. Orçamento de conexões (Step 6)

Fatos verificados no código (SHA de execução):

- `app/src/server/db/index.ts:7-15`: um único `Pool({ max: 10,
  connectionTimeoutMillis: 10000, ... })` por processo que importa o módulo.
  Web e worker importam o mesmo módulo → **até 10 conexões por processo**.
- `render.yaml` não declara `numInstances` em nenhum serviço
  (`grep -n numInstances render.yaml` sem resultado) → vale o padrão de
  **1 réplica por serviço** até prova em contrário no painel.
- Migração (`app/scripts/migrate-with-retry.mjs:139`) abre seu próprio
  `pg.Pool` com `max` padrão do driver (10). Ela roda **dentro** do contêiner
  web, **antes** do app (`render.yaml:22`:
  `startCommand: npm run db:migrate && ... npm run start:prod`, via
  `app/package.json:28` → `node scripts/migrate-with-retry.mjs`), de forma
  sequencial, e fecha o pool ao fim (`pool.end()` em `finally`, linha 172).
  Logo migração e app nunca somem seus pools no mesmo contêiner — mas durante o
  deploy a migração do contêiner novo coexiste com as instâncias antigas ainda
  saudáveis (deploy com sobreposição do Render).

Conta (pior caso transiente de deploy, 1 réplica/serviço):

| Parcela | Conexões |
|---|---|
| Web antiga (ainda saudável) | até 10 |
| Web nova — fase migração, depois fase app (sequenciais) | até 10 |
| Worker antigo (ainda saudável) | até 10 |
| Worker novo | até 10 |
| Scripts avulsos / reserva administrativa | a definir |
| **Subtotal transiente sem reserva** | **até 40** |
| Estado estável (1 web + 1 worker) | até 20 |

PENDENTE DO PROPRIETÁRIO: limite de conexões do plano vivo (Step 3) e,
consequentemente, a **folga final** (limite − 40 transiente / − 20 estável).
Sem o limite do plano não há como afirmar folga ou déficit.

## 7. Proteção efetiva da branch main (Step 7)

Comando executado:

```bash
gh api repos/jhowtkd/adscale/branches/main --jq '{protected: .protected, protection: .protection}'
```

Saída real:

```json
{"protected":false,"protection":{"enabled":false,"required_status_checks":{"checks":[],"contexts":[],"enforcement_level":"off"}}}
```

Registro:

- `main` **não está protegida**: push direto permitido, nenhum check exigido,
  force-push não bloqueado, sem restrição de bypass (não há o que contornar).
- O CI (`.github/workflows/ci.yml`) tem um único job, `test` (linha 15), que
  encadeia lint → typecheck → convergence gates → migrações → testes → build →
  Playwright. Um job só pode ser required check — mas hoje **não é**: nada o
  exige no merge.
- Limitação documentada sem equivalência manual: não há bloqueio técnico de
  merge/deploy fora do `autoDeployTrigger: checksPass` do Render (que observa
  checks de commit, não proteção de branch). Decisão sobre habilitar proteção
  cabe ao proprietário; repositório permanece privado.

## 8. Ordem migração → deploy (Step 8)

Fatos verificados no SHA de execução:

- Web (`adscale-app`, `render.yaml:22`) migra antes de subir:
  `npm run db:migrate && NODE_OPTIONS=... npm run start:prod`.
- Worker (`adscale-image-worker`, `render.yaml:124`) **não** migra:
  `node --conditions=react-server --import=tsx src/server/jobs/image-worker.ts`.
- `db:migrate` executa `app/scripts/migrate-with-retry.mjs`: até 5 tentativas
  com backoff exponencial + jitter, só retentando erros transitórios
  (`ECONNREFUSED|ETIMEDOUT|ENOTFOUND|connection terminated|too many clients`);
  qualquer outro erro falha o boot do contêiner web.

Regra registrada para as Tasks 10-14: migrações aditivas precisam estar
aplicadas **antes** de subir código web/worker que dependa delas, e nenhum
worker pode depender de a web "eventualmente" migrar — o worker parte do
pressuposto de que o schema já está no nível esperado.

## 9. Comandos executados (evidência)

Todos somente leitura, mais a criação do worktree e o commit do relatório:

```bash
git fetch origin
git rev-parse origin/main                      # b2ee6511a6739e92bb074874078fe0acd88b608f
git log --oneline --decorate -8 origin/main
git worktree add -b reliability/confiabilidade-do-trabalho \
  /Users/jhonatan/Repos/ADScale_2-reliability b2ee6511a6739e92bb074874078fe0acd88b608f
git branch -r --no-merged origin/main          # 41 branches, 0 PRs abertos
gh pr list --state open --json number,title,headRefName,mergeable,updatedAt  # []
gh api repos/jhowtkd/adscale/branches/main --jq '{protected: .protected, protection: .protection}'
grep -n numInstances render.yaml               # sem resultado
grep -n "db:migrate" app/package.json          # db:migrate -> migrate-with-retry.mjs
git add docs/operations/2026-09-12-reliability-baseline.md
git commit -m "docs: record reliability operational baseline"
```

Lidos na íntegra (somente leitura): `render.yaml`, `app/src/server/db/index.ts`,
`app/scripts/migrate-with-retry.mjs`, `.github/workflows/ci.yml`.
