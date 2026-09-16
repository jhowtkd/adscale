# SDKs de observabilidade resolvidos do lockfile

**Data:** 2026-09-16
**Ticket:** [jhowtkd/adscale#384](https://github.com/jhowtkd/adscale/issues/384) · **ADR:** [0017](../adr/0017-diagnostico-peca-unica-contrato-rastreabilidade.md)
**Lockfile:** `app/package-lock.json` (lockfileVersion 3) na base `92bc0ed2` · **Sem novas dependências neste ticket**

## Versões resolvidas

| Pacote | Range (`package.json`) | Resolvido (lockfile) | Natureza |
|--------|------------------------|----------------------|----------|
| `@sentry/nextjs` | `^10.53.1` | **10.53.1** | dependência direta |
| `inngest` | `^4.4.0` | **4.4.0** | dependência direta |
| `openai` | `^6.34.0` | **6.34.0** | dependência direta (provedor instrumentado) |
| `@opentelemetry/api` | — (transitivo) | **1.9.0** topo · **1.9.1** aninhado sob `@sentry/{nextjs,node,vercel-edge}` | transitivo via Sentry/Inngest |
| `langfuse` (+ `@langfuse/*`) | ausente | **ausente** | ainda não instalado |
| `inngest-cli` | dev | — | somente dev local |

Árvore (`npm ls`, 2026-09-16, mesma base):

```text
adscale-app@0.1.0
├── @sentry/nextjs@10.53.1
│   ├── @opentelemetry/api@1.9.1 (aninhado)
│   └── @sentry/node@10.53.1 (+ instrumentações OTel, @opentelemetry/api@1.9.1)
├── inngest@4.4.0 (sem subdependências próprias listadas; OTel é opt-in)
├── openai@6.34.0
└── @opentelemetry/api@1.9.0 (topo, transitivo)
```

Pacotes `@opentelemetry/sdk-*` existem transitivamente no lockfile (via Sentry), mas **nenhum código da aplicação os importa**.

## Sem providers globais concorrentes (evidência)

1. Nenhum registro de provider OTel no código: `grep` por `NodeSDK`, `BasicTracerProvider`, `NodeTracerProvider`, `registerInstrumentations`, `ProxyTracerProvider` em `app/src` retorna vazio.
2. Nenhum middleware OTel no Inngest: os dois clientes — `inngest` (`app/src/server/jobs/client.ts`, app id `adscale`) e `imageWorkerInngest` (`worker-client.ts`, app id `adscale-image-worker`) — registram **somente** `SentryMiddleware` (preserva distinção run/step). Nenhuma env `OTEL_*` ou `INNGEST_*TRAC*` em `app/src`, `app/scripts` ou `render.yaml`. Extended Traces do Inngest v4 não está ativado.
3. Sentry mantém seu tracing: `app/src/instrumentation.ts` (`Sentry.init`, `tracesSampleRate` 0.1 em produção / 1.0 fora, `beforeSend` com scrub, `sendDefaultPii: false`) e `app/src/server/jobs/image-worker.ts` (init do worker por import dinâmico). Sem `sentry.*.config.js` separado.
4. Langfuse ausente do `package.json` e do lockfile: quando o PR de observabilidade de IA o adicionar, ele **deve** inicializar com provider isolado sem registro global (decisão do spec #382); vínculo entre ferramentas por IDs de negócio, nunca `traceId` igual.

## Consequência para os próximos PRs

- PR 2 (contexto/índice): usa Sentry + logger existentes; nada a instalar.
- PR 3 (observabilidade de IA): adiciona `langfuse` (revalidar major na hora) + provider isolado; proibido registrar globalmente ou unificar os dois clientes Inngest.
