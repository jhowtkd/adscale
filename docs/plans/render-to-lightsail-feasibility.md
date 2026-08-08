# Substituir Render por AWS Lightsail

- Status: DECIDED — A (não migrar)
- Repository: `/Users/jhonatan/Repos/ADScale_2`
- Requested outcome: Decidir se dá para trocar o host de produção (Render) por AWS Lightsail, e sob quais condições.
- Decision date: 2026-08-05
- Decision rationale: 81% da fatura de 2026-07 foi de **PR previews automáticos**; este WIP altera `previews.generation` para `manual` em `render.yaml:13`. O próximo ciclo deve cair para ~$18 sem mover de host. Lightsail não resolve o problema (previews DIY no Lightsail são VMs extras) e troca PaaS→VPS com custo de ops alto para um app que já está saudável fora dos previews.

## OBJECTIVE

Responder com evidência do repo se Lightsail cobre o que o ADScale usa no Render hoje, listar o que se perde, o que sobra igual, e o caminho mínimo de migração se a decisão for “sim”.

**Resposta curta:** sim, dá — mas **não é drop-in**. Lightsail é VPS/semi-gerenciado; Render hoje é PaaS com Blueprint, worker, Postgres e PR previews. A app (Next + Inngest + R2 + Stripe) roda em qualquer Node 20 com Postgres; o custo real da troca é **ops e deploy**, não código de domínio.

## AUTHORITATIVE CONTEXT

- Repository instructions: `AGENTS.md`, `README.md`, `docs/DEPLOYMENT.md`, `docs/render-deployment.md`
- Current behavior:
  - Produção = **Render** via `render.yaml` (`docs/DEPLOYMENT.md`, `README.md`)
  - Serviços no Blueprint:
    1. **web** `adscale-app` — Next.js Node, plan `starter`, region `oregon`, health `/api/health`, auto-deploy em `main`; previews eram automáticos e passam a manuais neste WIP
    2. **worker** `adscale-image-worker` — process separado de imagem (`src/server/jobs/image-worker.ts`), plan `standard`, shutdown delay 300s
    3. **Postgres 16** managed `adscale-postgres` (plan free no Blueprint)
  - Marketing estático separado: `MARKETING_UPSTREAM_URL=https://adscale-marketing.onrender.com`
  - Domínio custom: `https://adscale.jhonatansoares.com`
  - Build: `npm ci --include=dev && npm run build && npm prune --omit=dev` em `rootDir: app`
  - Start web: `npm run db:migrate && NODE_OPTIONS=--max-old-space-size=384 npm run start:prod`
  - Comentário no Blueprint: runtime web ~512 MB; heap V8 capado para evitar OOM/502
  - Externos que **não** estão no Render: Cloudflare R2, Inngest Cloud, Stripe, Resend, OpenAI, Sentry
  - Docker local existe (`app/Dockerfile`, `app/docker-compose.yml`) e já é o padrão self-host
  - CI (GitHub Actions) **não** faz deploy — só Render no push em `main`
- Existing pattern to reuse: `app/Dockerfile` + `docker-compose` para empacotar web+postgres; `npm run start:prod` / image-worker commands do Blueprint
- Constraints and user decisions:
  - Pergunta é de viabilidade/migração de host, não mudança de produto
  - Storage continua R2 (S3-compatible); não precisa Lightsail Object Storage
  - Jobs longos de imagem dependem do **worker** dedicado + Inngest — não só do web

## SCOPE

### In scope

- Comparar Render atual × Lightsail (instance / containers / managed DB)
- Mapear cada peça do Blueprint para equivalente Lightsail ou externo
- Requisitos mínimos se a migração for aprovada
- Riscos, o que se perde, recomendação

### Out of scope

- Implementar a migração agora
- Trocar R2, Inngest, Stripe ou domínio de produto
- Migrar marketing site além de “precisa de um host estático”
- Otimizar custo AWS além do necessário para a decisão

## REQUIREMENTS

### R-001 — Inventário do que o Render entrega hoje

- Current evidence: `render.yaml`; `docs/DEPLOYMENT.md`
- Required behavior: Plano lista explicitamente web, worker, Postgres, marketing upstream, auto-deploy, PR previews, health check, envs/secrets, domínio.
- Likely surfaces: `render.yaml`, `docs/DEPLOYMENT.md`, `docs/render-deployment.md`
- Preserve: N/A (documento)
- Acceptance criteria:
  1. Cada serviço/recurso do Blueprint aparece na matriz de substituição.
  2. Externos (R2, Inngest, Stripe, etc.) marcados como “fora do host”.
- Verification:
  - Diff mental: `rg -n "type:|name:|fromDatabase|previews" render.yaml` vs seção matriz do plano

### R-002 — Viabilidade técnica no Lightsail

- Current evidence: app é Node 20 + Next standalone + Postgres 16 + worker Node separado; Docker local já existe
- Required behavior: Confirmar que Lightsail **pode** hospedar o mesmo runtime (instance com Docker ou Node nativo; managed Postgres ou Postgres na instance; segundo processo/container para worker).
- Likely surfaces: `app/Dockerfile`, `app/docker-compose.yml`, `render.yaml` start/build commands
- Preserve: contratos HTTP (`/api/health`, `/api/inngest`, webhooks Stripe), `DATABASE_URL`, URLs auth
- Acceptance criteria:
  1. Caminho mínimo: 1 instance (ou containers) + Postgres + processo worker + reverse proxy/TLS.
  2. Memória: web **não** fica em 512 MB se o worker rodar no mesmo box sem headroom — plan deve exigir sizing ≥ o que o Render já separa (web starter + worker standard).
  3. Inngest e Stripe continuam apontando para a URL pública HTTPS.
- Verification:
  - Smoke pós-migração (quando implementado): `GET /api/health` → 200; Inngest sync; um job de imagem; login Better Auth no domínio final

### R-003 — O que Lightsail **não** substitui 1:1

- Current evidence: `previews.generation: automatic` no web; Blueprint IaC; free Postgres managed no Render; marketing static separado
- Required behavior: Plano declara perdas e mitigações:
  - **PR preview environments** → não nativo; precisa CI + instance efêmera ou abandonar
  - **Git push auto-deploy Blueprint** → substituir por GitHub Actions + SSH/deploy hook ou Lightsail Containers CI
  - **Secrets `sync: false` / `generateValue`** → Secrets Manager, env file no host, ou GitHub Environments
  - **Marketing static** → Lightsail static/bucket+CDN, Cloudflare Pages, ou S3+CloudFront (já estão no ecossistema AWS/CF)
  - **Managed DB free** → Lightsail managed Postgres é pago; alternativa: Neon/Supabase/RDS e só compute no Lightsail
- Acceptance criteria:
  1. Cada perda tem “mitigar / aceitar / manter no Render”.
  2. Recomendação explícita: migrar tudo vs híbrido vs não migrar.
- Verification:
  - Revisão humana da seção RISKS AND DECISIONS

### R-004 — Caminho mínimo de migração (só se aprovado)

- Current evidence: Docker + `start:prod` + image-worker command; CI sem deploy
- Required behavior: Ordem de entrega enxuta, reusando Docker existente:
  1. Lightsail instance (ou container service) com Node 20 / Docker
  2. Postgres (Lightsail DB **ou** manter managed externo)
  3. Deploy web + worker (systemd/compose) com mesmas env vars do Blueprint
  4. TLS + domínio `adscale.jhonatansoares.com`
  5. Atualizar Inngest serve URL, Stripe webhook, Better Auth URLs
  6. Cutover DNS; desligar Render depois de smoke
  7. Substituir `render.yaml` docs por runbook Lightsail; CI deploy opcional
- Likely surfaces: `render.yaml`, `docs/DEPLOYMENT.md`, `docs/render-deployment.md`, `.github/workflows/ci.yml`, `app/Dockerfile`, `app/docker-compose.yml`
- Preserve: schema DB, R2 keys, billing, auth cookies no domínio final
- Acceptance criteria:
  1. Zero mudança de domínio de negócio obrigatória.
  2. Worker de imagem e web não competem por 512 MB no mesmo processo.
  3. Rollback = DNS de volta ao Render até o cutover ser estável.
- Verification:
  - Checklist cutover no runbook (quando implementado); `npm run preflight:stripe` com URL nova

### R-005 — Decisão de produto/ops (gate humano)

- Current evidence: produção já está em Render com Blueprint e previews
- Required behavior: Antes de qualquer implementação, o humano escolhe uma das opções:
  - **A — Não migrar:** manter Render (menor atrito ops)
  - **B — Híbrido:** compute no Lightsail, DB managed externo (Neon/etc.), marketing onde estiver barato
  - **C — Migrar full Lightsail:** aceitar perder PR previews nativos e assumir deploy DIY
- Acceptance criteria:
  1. Plano não inicia implementação sem A/B/C.
  2. Se A: nenhuma migração de host ou código de domínio; apenas o controle de previews no Blueprint e este documento.
- Verification:
  - Resposta do usuário neste thread ou commit do plano com decisão anotada

## DELIVERY ORDER

1. **R-005** — escolher A / B / C (bloqueia o resto se for A).
2. **R-001–R-003** — já cobertos por este plano; revalidar só se o Blueprint mudar.
3. Se B ou C: **R-004** em fatias — DB → instance/web → worker → DNS/webhooks → docs/CI → desligar Render.
4. Não mexer em app domain code salvo URLs/env e, se necessário, bind `0.0.0.0:$PORT`.

## RISKS AND DECISIONS

| Peça atual (Render) | Lightsail | Notas |
|---------------------|-----------|--------|
| Web Next `adscale-app` | Instance ou Containers | Reusar Dockerfile; precisa reverse proxy (nginx/Caddy) + TLS |
| Worker `adscale-image-worker` | 2º container/processo ou 2ª instance | **Não** juntar no mesmo 512 MB; Render já separa por OOM |
| Postgres managed | Lightsail Database ou externo | Free plan Render some; backup/restore é seu |
| Auto-deploy `main` | DIY (Actions + SSH/API) | Custo de manutenção real |
| PR previews | Perdido ou DIY caro | Maior perda de DX |
| Marketing static | Outro host estático | Independente do app |
| R2 / Inngest / Stripe / Resend / OpenAI | Iguais | Só atualizar URLs de callback |
| Memória / OOM | Sizing explícito | Blueprint já documenta pressão de heap no web |

### Fatura Render 2026-July (evidência do user)

Fonte: `download-2026-July.csv` — total **~$96.93**.

| Fatia | $ | % |
|-------|---|---|
| **PR previews** (`adscale-app PR #N`) | **$78.78** | **81%** |
| Prod web starter+standard | $7.98 | 8% |
| Postgres basic-256mb + disk | $5.17 | 5% |
| Build minutes (217 min, floor $5) | $5.00 | 5% |

- 54 preview services cobrados; **~8372 h** de compute em PR.
- Vários PRs ficaram ~mês inteiro (ex.: PR #53 **510 h / $4.80**, #54–#61 na mesma faixa).
- Sem previews a conta seria **~$18**.

**Causa raiz da fatura de julho:** `previews.generation: automatic` no Blueprint daquele ciclo + previews cobrados por muitas horas — não o custo de produção nem a falta de Lightsail.

**Fix lazy (antes de qualquer migração):**

1. Desligar PR previews automáticos (`previews.generation: manual` ou remover o bloco) **ou**
2. No dashboard Render: expirar/suspender previews idle; apagar services de PR antigos; política “preview só com label”.
3. Opcional: build minutes — 217 min já bate o mínimo $5; ok.

Lightsail **não** resolve isso: ou você não tem preview (mesmo efeito de desligar no Render) ou você paga VMs extras. Produção no Render já está barata (~$18/mês nesse mês).

**Recomendação (lazy senior):**

- **Agora:** matar/limitar PR previews no Render → conta ~$18. **Não migrar.**
- Lightsail só se depois disso ainda doer (improvável com esse breakdown).
- OOM 512 MB: upgrade pontual de plan, separado da conta de preview.

### Decisão A — ações imediatas (2026-08-05)

Este WIP muda o Blueprint para `render.yaml:13` `previews.generation: manual`; o estado live foi corrigido separadamente pela API da Render.

1. **Render Dashboard → Services:** listar todos os services `adscale-app PR #N` (54 na fatura de julho). Suspender/deletar em lote — Render cobra enquanto o service existir, mesmo sem tráfego.
2. **Confirmar expiração:** Settings do Blueprint → Preview environment policies → TTL curto (ex.: 24h idle) + label-gate (`/deploy-preview`) para gerar só sob demanda. Documentar no `docs/render-deployment.md`.
3. **Próxima fatura (2026-08):** baseline esperado ~$18 (prod web + worker standard + Postgres + build minutes floor). Conferir CSV do Render no início de setembro.
4. **OOM web (512 MB) se voltar a doer:** upgrade pontual `starter → standard` no service `adscale-app` (~$7→$25/mês). Não confundir com custo de previews.

#### Execução real (2026-08-05, via Render API + CLI)

- **PR previews ativos no workspace:** **0**. Os 54 da fatura de julho já tinham sido auto-suspensos pela Render quando os PRs fecharam (comprovado: `curl /v1/services` retorna apenas `adscale-marketing`, `adscale-app` e `content-machine-api` suspensa). Nenhum service `adscale-app PR #N` precisou ser deletado — o lixo já não estava lá.
- **Lacuna real:** o `render.yaml:13` já tem `previews.generation: manual`, mas o live service `adscale-app` na Render ainda estava com `previews.generation: automatic` e `pullRequestPreviewsEnabled: yes` (Blueprint out-of-sync com o estado aplicado). **PATCH feito agora:** `PUT` em `/v1/services/srv-d8goos77f7vs73f1k5eg` com `serviceDetails.previews.generation=manual` e `serviceDetails.pullRequestPreviewsEnabled=no`. Confirmado: live service agora reporta `manual` + `no` (updatedAt `2026-08-05T13:58:20Z`).
- **Próximos PRs não vão mais criar preview services automaticamente.** Se quiser preview pontual, gera manual pelo dashboard (botão "Preview" no PR) — mas por padrão, nada.
- **Pendência secundária encontrada durante o pente-fino:** o `render.yaml:100` define um worker `adscale-image-worker` (plan `standard`), mas **esse service não existe** no workspace da Render (confirmado na listagem de services). Possibilidades: (a) nunca foi deployado pelo Blueprint, (b) foi deletado manualmente. Hoje a app roda com `IMAGE_JOB_TARGET=web` no web service, então os jobs de imagem estão sendo processados dentro do web. Decidir separadamente se vale ressuscitar o worker (recomendo não, a menos que OOM volte a ser problema) — não entra no escopo deste plano.

### Quando reabrir a discussão Lightsail

- Conta Render > $50/mês por **3 meses consecutivos** com previews já sob controle e prod dimensionado corretamente. **E** você aceita perder PR previews nativos / assumir deploy DIY.
- Caso contrário: rev 1 do plano já cobre o suficiente.

## VALIDATION MATRIX

| Requirement | Acceptance evidence | Verification |
|---|---|---|
| R-001 | Matriz de serviços acima | Conferir `render.yaml` |
| R-002 | Caminho Node/Docker + Postgres + worker | Smoke `/api/health` + job imagem (pós-migração) |
| R-003 | Perdas listadas com mitigação | Review humano |
| R-004 | Ordem cutover + rollback DNS | Runbook + checklist |
| R-005 | Escolha A/B/C | Resposta do usuário |

## APPENDIX — Resposta direta

**Conseguimos substituir Render por Lightsail?**

**Sim, tecnicamente.** A stack do ADScale não depende de APIs proprietárias do Render além de deploy/DB/previews.

**Vale a pena agora?**

**Só se** (1) custo/limites do Render doerem de verdade **e** (2) você aceita operar deploy, TLS, backups e perder PR previews nativos. Caso contrário, fique no Render ou faça upgrade pontual de plano/RAM.
