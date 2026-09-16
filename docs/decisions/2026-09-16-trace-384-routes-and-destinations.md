# Rotas internas propostas + destinos — Diagnóstico de Peça única

**Data:** 2026-09-16
**Ticket:** [jhowtkd/adscale#384](https://github.com/jhowtkd/adscale/issues/384) · **ADR:** [0017](../adr/0017-diagnostico-peca-unica-contrato-rastreabilidade.md)
**Manifesto:** [`allowed-primary-destinations.json`](./allowed-primary-destinations.json) (inalterado neste ticket)

## Rotas propostas (classificação, sem implementação)

Três endpoints somente-leitura aninhados ao ramo `feedback` existente + aba no console `/feedback` existente (abas hoje: metrics, quality, feedback, inspirations):

| Proposta | Arquivo futuro | Método |
|----------|----------------|--------|
| Lista/busca de Trabalhos (busca exata, filtros, cursor) | `app/src/app/api/feedback/diagnostics/works/route.ts` | GET |
| Detalhe do Trabalho (estado canônico, eventos, disponibilidade, links privados) | `app/src/app/api/feedback/diagnostics/works/[workItemId]/route.ts` | GET |
| Detalhe de chamada (somente projeção permitida) | `app/src/app/api/feedback/diagnostics/works/[workItemId]/calls/[callId]/route.ts` | GET |
| Aba Diagnóstico no console existente | `app/src/app/(dashboard)/feedback/page.tsx` (edição; **sem** `page.tsx` novo, sem botão na navegação principal) | — |

**Classificação:** módulo interno de apoio, somente-leitura, para Dono da plataforma. Não cria Trabalho nem Peça, não gera, não cobra, não aprova, não repete — **não é destino primário**. O freeze de destinos primários **permanece** e o gate **não é relaxado**.

**Como o gate passa quando a implementação chegar** (precedentes: ditado, served-ads): `check-primary-destinations.mjs` lê snapshots de `origin/main`, então 1) um PR de exceção mergeia só o manifesto (`supporting_module` + snapshots já contendo as rotas futuras) e 2) o PR de implementação cria os arquivos. Este ticket não cria rotas nem toca o manifesto — nada para o gate acusar.

Guardas congelados para a implementação: `requirePlatformOwner` obrigatório (401/403; guard de UI só navega), associação Trabalho→workspace→Peça validada no servidor, `Cache-Control: private, no-store`, sem segredos em mensagens de erro, leitura de conteúdo auditada (leitura negada se a auditoria falhar).

## Destinos, projetos e ambientes (presença apenas — nenhum valor copiado)

| Destino | Projeto/ambiente | Variáveis servidor (presença em `render.yaml` @92bc0ed2) |
|---------|------------------|----------------------------------------------------------|
| Logger / stdout JSON | web `adscale-app` + worker `adscale-image-worker` (oregon, produção) | `LOG_LEVEL`: ausente em ambos (default `info` no código) |
| Sentry | DSN via `SENTRY_DSN` | worker: declarada (`sync: false`); web: **não declarada** (init web lê `process.env.SENTRY_DSN`) |
| Inngest | app ids `adscale` (web) + `adscale-image-worker` (worker); ambos só com `SentryMiddleware` | `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`: declaradas nos dois serviços (`sync: false`) |
| Langfuse | nenhum projeto | `LANGFUSE_*`: ausente em todo o repo — chaves só no servidor quando o PR 3 chegar |
| Índice diagnóstico (PostgreSQL) | banco `adscale-postgres` (tabelas futuras `diagnostic_events`, `diagnostic_access_audit`) | `DATABASE_URL`: `fromDatabase` nos dois serviços |
| OpenAI (provedor instrumentado) | modelos `gpt-5.6` (texto) / `gpt-image-2-2026-04-21` (imagem) | `OPENAI_API_KEY`: declarada nos dois serviços (`sync: false`); modelos como valores planos |
| Flags de observabilidade | — | `OBSERVABILITY_*`: ausentes — defaults congelados desligados em `contract.ts` |
| Staging | **nenhum serviço/ambiente** | `STAG*`/`staging`: zero ocorrências em `render.yaml` e no schema de env |

`PLATFORM_OWNER_EMAILS` está declarada nos dois serviços (valor plano no YAML); a autorização global de Dono da plataforma é o guard obrigatório das rotas acima.
