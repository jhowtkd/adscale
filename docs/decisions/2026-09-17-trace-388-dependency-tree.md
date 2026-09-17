# Árvore de dependências da observabilidade de IA

**Data:** 2026-09-17
**Ticket:** [jhowtkd/adscale#388](https://github.com/jhowtkd/adscale/issues/388) · **Spec:** [jhowtkd/adscale#382](https://github.com/jhowtkd/adscale/issues/382)
**Base:** `373d8bc2` · **Lockfile:** `app/package-lock.json` (lockfileVersion 3)

Segue o registro de SDKs do ticket 1 ([2026-09-16-trace-384-sdk-versions.md](./2026-09-16-trace-384-sdk-versions.md)), que previa a adição do SDK Langfuse neste PR com provider isolado.

## Escolha do pacote

`@langfuse/otel` (e não o cliente REST `langfuse`): o critério de aceite exige
"Langfuse/OTel on a private tracer provider" — o `LangfuseSpanProcessor` recebe
spans de um `NodeTracerProvider` próprio, criado por este ticket e nunca
registrado globalmente. O Sentry mantém seu tracing no provider dele; a
correlação entre ferramentas é por IDs de negócio, nunca por `traceId` igual.

## Versões resolvidas

| Pacote | Range (`package.json`) | Resolvido (lockfile) | Natureza |
|--------|------------------------|----------------------|----------|
| `@langfuse/otel` | `5.11.1` (pin exato) | **5.11.1** | dependência direta (nova, única) |
| `@langfuse/core` | — (via `@langfuse/otel`) | **5.11.1** | transitivo |
| `@opentelemetry/api` | — (transitivo) | **1.9.0** topo | transitivo pré-existente, dedupado |
| `@opentelemetry/core` | — (transitivo) | **2.7.1** | transitivo pré-existente, dedupado |
| `@opentelemetry/sdk-trace-base` | — (transitivo) | **2.7.1** | transitivo pré-existente, dedupado |
| `@opentelemetry/sdk-trace-node` | — (transitivo) | **2.7.1** | transitivo pré-existente, dedupado |
| `@opentelemetry/resources` | — (transitivo) | **2.7.1** | transitivo pré-existente, dedupado |
| `@opentelemetry/exporter-trace-otlp-http` | — (transitivo) | **0.218.0** | transitivo pré-existente, dedupado |

Verificação pré-instalação (ruling do brief: peças OTel só se ausentes): todas
as peças OTel já estavam presentes no topo de `node_modules` em versões
compatíveis com os peers de `@langfuse/otel@5.11.1` (`api ^1.9.0`,
`core ^2.0.1`, `sdk-trace-base ^2.0.1`, `exporter-trace-otlp-http >=0.202.0
<1.0.0`). Nenhuma peça OTel foi adicionada como dependência direta.

## Delta do lockfile

Somente dois nós novos (`@langfuse/otel`, `@langfuse/core`, ambos MIT);
todos os peers OTel dedupados para as versões pré-existentes — zero pacotes
OTel novos, zero duplicatas (`npm ls` limpo). Nenhuma outra dependência nova.

```text
adscale-app@0.1.0
└─┬ @langfuse/otel@5.11.1
  ├─┬ @langfuse/core@5.11.1
  │ └── @opentelemetry/api@1.9.0 deduped
  ├── @opentelemetry/api@1.9.0
  ├── @opentelemetry/core@2.7.1 deduped
  ├── @opentelemetry/exporter-trace-otlp-http@0.218.0 deduped
  └── @opentelemetry/sdk-trace-base@2.7.1 deduped
```

## Isolamento (evidência)

1. O provider de IA é construído com seus processadores via `new
   NodeTracerProvider({ spanProcessors: [...] })` e nunca registrado
   globalmente — teste `never registers the AI provider globally` compara a
   identidade de `trace.getTracerProvider()` antes/depois.
2. Spans partem como raízes próprias (`ROOT_CONTEXT`, sampler `AlwaysOn`) —
   teste `does not let an unsampled ambient context suppress pilot
   observation` prova imunidade a contexto Sentry não amostrado.
3. Nenhum SDK Node de observabilidade no bundle do navegador ou no Edge:
   módulo marcado `server-only`, `instrumentation.ts` importa dinamicamente
   somente no ramo `nodejs`, runtime Edge recusa inicializar, e o teste de
   cadeia de imports (`is imported only by the web and worker entrypoints`)
   trava os únicos dois importadores.
