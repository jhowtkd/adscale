# Sunburst — motor, política congelada e evidências Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preparar o motor existente para Sunburst com qualidade explícita, continuidade de trabalhos e consumo auditável, mantendo a ativação em 0%.

**Architecture:** Uma pequena política validada acompanha o snapshot até o provedor. Um observador compartilhado registra cada chamada antes de decodificar ou armazenar a imagem; os resultados reutilizam os metadados e JSON existentes.

**Tech Stack:** TypeScript, Zod, OpenAI SDK 6.34.0, Vitest, Sharp, Inngest e persistência JSONB existentes.

**Spec:** [Estudo e priorização ICE](/Users/jhonatan/Repos/ADScale_2/docs/plans/2026-09-08-gpt-image-2-5-ice.md). Ler ambos antes de executar.

## Global Constraints

“sempre priorizar qualidade”.
“Flare fica fora da migração inicial.”
“Manter `maxRetries: 0`”.
“`usage` ausente é desconhecido, nunca zero.”
“Manter inicialmente quatro referências”.
“Não incluir `input_fidelity: high` indiscriminadamente”.
“Não gerar três candidatos escondidos, reduzir automaticamente modelo/qualidade por lentidão ou duplicar chamadas por timeout.”
Manter os 50 créditos por saída e os flags de recuperação/Brand Cortex atuais.
Não alterar análise/briefing, decomposição Seedream/Atlas, APIs públicas ou interface nesta migração.
Implementação local, benchmark pago e publicação são entregas distintas. Este documento não autoriza gasto ou deploy.

---

Base inspecionada: `ac38a30e`, em 08/09/2026. Caminhos abaixo são relativos a `/Users/jhonatan/Repos/ADScale_2`; comandos partem dessa raiz, exceto quando indicado. Preservar todo WIP alheio. Antes da execução, usar worktree conforme a skill de execução. Os snippets são alterações propostas, ainda não compiladas no produto.

## Ordem e cobertura

Este é o plano 1 de 3: P0, I1 e infraestrutura de I2/I5. Em seguida executar o [plano visual](2026-09-08-sunburst-visual-quality.md) e o [plano de camadas](2026-09-08-sunburst-layer-regeneration.md). A liberação depende da validação visual, não apenas deste código.

## Mapa de arquivos

| Arquivo | Responsabilidade da alteração |
|---|---|
| `app/src/server/ai/image-render-policy.ts` e `.test.ts` (novos) | Validar modelo/qualidade, escolher coorte estável e resolver snapshots antigos. |
| `app/src/server/ai/image-call-observation.ts` e `.test.ts` (novos) | Registrar chamada, retorno e falha; conservar usage bruto sem interpretar campos não documentados. |
| `app/src/server/validation/env.ts` | Qualidade e percentual de ativação, com defaults inativos. |
| `app/src/server/creative-work/contracts.ts` | Campo opcional no snapshot interno. |
| `app/src/server/application/prepare-creative-work.ts`, `prepare-carousel-work.ts` e testes respectivos | Congelar decisão junto da preparação existente. |
| `app/src/server/generation/canonical/types.ts`, `pipeline/execute.ts` e testes existentes | Transportar configuração antes da conversão de intenção. |
| `app/src/server/ai/providers/image-provider.ts`, `openai-image-provider.ts`, teste existente | Contrato interno e parâmetros efetivamente enviados. |
| `app/src/server/ai/image-generation.ts` e testes existentes | Propagar configuração e evidência sem forçar medium em rotas novas. |
| `app/src/server/jobs/creative-work.ts`, `creative-work-carousel.ts` e testes existentes | Ler configuração congelada e conservar evidências de todas as tentativas. |
| `render.yaml` | Declarar percentual 0 nos dois serviços; ativação somente após gate visual. |

Não criar tabelas, outro provedor ou outro sistema de jobs. O acréscimo ao JSON persistido é um contrato interno aditivo; antes de executar, a aprovação deste plano deve abranger esse campo. Não atualizar registros antigos em massa.

### Task 1: Política pequena, validada e estável

**Files:** criar `app/src/server/ai/image-render-policy.ts` e `app/src/server/ai/image-render-policy.test.ts`.

**Interfaces:**
- Consumes: `workspaceId: string`, `percentage: number`, qualidade explícita.
- Produces: `ImageRenderPolicy`, `imageRenderPolicySchema`, `LEGACY_IMAGE_POLICY`, `resolveImageRenderPolicy(value: unknown): ImageRenderPolicy`, `selectImageRenderPolicy(workspaceId: string, percentage: number, quality: ImageRenderPolicy["quality"]): ImageRenderPolicy`.

- [ ] **Step 1: Criar o teste que falta.**

```ts
import { describe, expect, it } from "vitest";
import { LEGACY_IMAGE_POLICY, resolveImageRenderPolicy, selectImageRenderPolicy } from "./image-render-policy";

describe("image render policy", () => {
  it("keeps legacy snapshots and rejects corrupt present policies", () => {
    expect(resolveImageRenderPolicy(undefined)).toEqual(LEGACY_IMAGE_POLICY);
    expect(() => resolveImageRenderPolicy({ version: 2 })).toThrow();
    expect(() => resolveImageRenderPolicy(null)).toThrow();
    expect(() => resolveImageRenderPolicy({ ...LEGACY_IMAGE_POLICY, quality: "max" })).toThrow();
  });
  it("selects stable monotonic workspace cohorts without reducing quality", () => {
    for (let i = 0; i < 200; i++) {
      const id = `workspace-${i}`;
      expect(selectImageRenderPolicy(id, 0, "max")).toEqual(LEGACY_IMAGE_POLICY);
      expect(selectImageRenderPolicy(id, 100, "max").quality).toBe("max");
      const atTen = selectImageRenderPolicy(id, 10, "max");
      expect(selectImageRenderPolicy(id, 10, "max")).toEqual(atTen);
      if (atTen.model !== LEGACY_IMAGE_POLICY.model) {
        expect(selectImageRenderPolicy(id, 50, "max")).toEqual(atTen);
      }
    }
    expect(() => selectImageRenderPolicy("ws", 101, "high")).toThrow();
  });
});
```

- [ ] **Step 2: Confirmar falha por módulo ausente.**

Run in `app`: `npm test -- src/server/ai/image-render-policy.test.ts`.

- [ ] **Step 3: Criar implementação completa.**

```ts
import { z } from "zod";

export const imageRenderPolicySchema = z.object({
  version: z.literal(1),
  model: z.enum(["gpt-image-2", "gpt-image-2-2026-04-21", "gpt-image-2.5-sunburst-2026-09-08"]),
  quality: z.enum(["medium", "high", "xhigh", "max"]),
}).strict().refine(
  value => value.model === "gpt-image-2.5-sunburst-2026-09-08" || ["medium", "high"].includes(value.quality),
  "Image 2 does not support xhigh/max",
);
export type ImageRenderPolicy = z.infer<typeof imageRenderPolicySchema>;
export const LEGACY_IMAGE_POLICY: ImageRenderPolicy = {
  version: 1, model: "gpt-image-2-2026-04-21", quality: "medium",
};
export function resolveImageRenderPolicy(value: unknown): ImageRenderPolicy {
  return imageRenderPolicySchema.parse(value === undefined ? LEGACY_IMAGE_POLICY : value);
}
export function selectImageRenderPolicy(
  workspaceId: string, percentage: number, quality: ImageRenderPolicy["quality"],
): ImageRenderPolicy {
  z.number().int().min(0).max(100).parse(percentage);
  let hash = 2166136261;
  for (const character of `sunburst-v1:${workspaceId}`) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  const bucket = (hash >>> 0) % 100;
  return imageRenderPolicySchema.parse(bucket < percentage
    ? { version: 1, model: "gpt-image-2.5-sunburst-2026-09-08", quality }
    : LEGACY_IMAGE_POLICY);
}
```

`medium` existe para o controle experimental; o candidato de liberação será escolhido entre high/xhigh/max. O seletor não consulta relógio, tentativas ou estado mutável. Uma política presente e inválida falha antes da API.

- [ ] **Step 4: Repetir o comando; esperar todos os testes PASS.**
- [ ] **Step 5: Commit isolado.**

```bash
git add app/src/server/ai/image-render-policy.ts app/src/server/ai/image-render-policy.test.ts
git commit -m "feat: define frozen image render policy"
```

### Task 2: Evidência por chamada antes de decodificação/upload

**Files:** criar `app/src/server/ai/image-call-observation.ts` e `.test.ts`.

**Interfaces:**
- Consumes: `ImageRenderPolicy` da Task 1; `logger.info` existente; callback de uma única requisição.
- Produces: `ImageCallObservation` e `observeImageCall<T extends ImageResponseMetadata>(policy, context, call): Promise<{ response: T; observation: ImageCallObservation }>`.

- [ ] **Step 1: Escrever teste de retorno sem imagem e falha ambígua.**

```ts
import { expect, it, vi } from "vitest";
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn() } }));
import { logger } from "@/lib/logger";
import { observeImageCall } from "./image-call-observation";
import { LEGACY_IMAGE_POLICY } from "./image-render-policy";

it("records usage even when response has no usable image", async () => {
  const usage = { input_tokens: 20, output_tokens: 10, cached_extra: { image: 2 } };
  const call = vi.fn().mockResolvedValue({ data: [], usage, _request_id: "req-1" });
  const result = await observeImageCall(LEGACY_IMAGE_POLICY, { key: "output-1", operation: "generate", size: "1088x1088" }, call);
  expect(result.observation.usage).toEqual(usage);
  expect(result.observation.requestId).toBe("req-1");
  expect(call).toHaveBeenCalledOnce();
  expect(logger.info).toHaveBeenCalledWith(expect.objectContaining({ event: "image_api_call", status: "response", usage }));
});
it("records uncertain billing and never retries a rejected call", async () => {
  const error = new Error("timeout");
  const call = vi.fn().mockRejectedValue(error);
  await expect(observeImageCall(LEGACY_IMAGE_POLICY, { key: "output-2", operation: "edit", size: "1088x1360" }, call)).rejects.toBe(error);
  expect(call).toHaveBeenCalledOnce();
  expect(logger.info).toHaveBeenCalledWith(expect.objectContaining({ event: "image_api_call", status: "error", usage: null, billing: "unknown" }));
});
```

- [ ] **Step 2: Run in app:** `npm test -- src/server/ai/image-call-observation.test.ts`. Esperar módulo ausente.
- [ ] **Step 3: Criar o observador, sem copiar prompts ou buffers para logs.**

```ts
import { randomUUID } from "node:crypto";
import { logger } from "@/lib/logger";
import type { ImageRenderPolicy } from "./image-render-policy";

type ImageResponseMetadata = {
  usage?: unknown; size?: unknown; quality?: unknown; _request_id?: string | null;
};
export type ImageCallObservation = {
  callId: string; key: string; operation: "generate" | "edit";
  requested: ImageRenderPolicy; requestedSize: string;
  returnedSize: string | null; returnedQuality: string | null;
  requestId: string | null; durationMs: number; usage: unknown | null;
};
export async function observeImageCall<T extends ImageResponseMetadata>(
  policy: ImageRenderPolicy,
  context: { key: string; operation: "generate" | "edit"; size: string },
  call: () => Promise<T>,
): Promise<{ response: T; observation: ImageCallObservation }> {
  const callId = randomUUID();
  const start = Date.now();
  const base = { callId, key: context.key, operation: context.operation, requested: policy, requestedSize: context.size };
  logger.info({ event: "image_api_call", ...base, status: "started" });
  try {
    const response = await call();
    const observation: ImageCallObservation = {
      ...base,
      requestId: response._request_id ?? null,
      returnedSize: typeof response.size === "string" ? response.size : null,
      returnedQuality: typeof response.quality === "string" ? response.quality : null,
      durationMs: Date.now() - start,
      usage: response.usage ?? null,
    };
    logger.info({ event: "image_api_call", ...observation, status: "response" });
    return { response, observation };
  } catch (error) {
    logger.info({ event: "image_api_call", ...base, status: "error", durationMs: Date.now() - start, usage: null, billing: "unknown" });
    throw error;
  }
}
```

Usar evento estruturado em um único argumento do logger, como no código acima, para preservar o objeto usage completo. Confirmar `LOG_LEVEL` permitindo info e retenção de logs antes do ensaio. Não chamar `requested.model` de modelo confirmado pela OpenAI: é a configuração enviada. `returnedSize` é o metadado da resposta, não medição do arquivo. A dimensão efetiva do PNG será conferida com Sharp no protocolo visual. Conservar `usage` integral evita perder novos campos de cache omitidos pelo SDK antigo.

- [ ] **Step 4: Reexecutar o teste; esperar PASS.**
- [ ] **Step 5: Commit.**

```bash
git add app/src/server/ai/image-call-observation.ts app/src/server/ai/image-call-observation.test.ts
git commit -m "feat: observe every image API call before artifact processing"
```

### Task 3: Encaminhar a política até a única chamada do provedor

**Files:** modificar `image-provider.ts`, `openai-image-provider.ts` e teste, `image-generation.ts`, `generation/canonical/types.ts`, `generation/pipeline/execute.ts` e testes existentes. Todos sob `app/src/server/` conforme mapa.

**Interfaces:**
- Consumes: `ImageRenderPolicy`, `observeImageCall`.
- Produces: campo opcional `renderPolicy?: ImageRenderPolicy` em `GenerationRequest`, `GenerateAndStoreImageInput`, `ProviderGenerateInput`; `observation?: ImageCallObservation` em `ImageCandidate.providerMeta` e `GenerationCandidateMeta`.
- Mantém: `generate(input): Promise<ImageCandidate>`, `executeCanonicalGeneration(request, options): Promise<GenerationResult>`.

- [ ] **Step 1: Acrescentar teste ao describe do provedor, usando mocks existentes.**

```ts
it.each(["high", "xhigh", "max"] as const)("sends explicit Sunburst %s with one call", async quality => {
  mockGenerate.mockResolvedValue({ data: [{ b64_json: Buffer.from("png").toString("base64") }], usage: { output_tokens: 12 } });
  const result = await new OpenAIImageProvider().generate({
    prompt: "hero", dimensions: { width: 1080, height: 1350 }, referenceImages: [],
    generationMode: "art_variation", outputPrefix: "test/sunburst",
    renderPolicy: { version: 1, model: "gpt-image-2.5-sunburst-2026-09-08", quality },
  });
  expect(mockGenerate).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ model: "gpt-image-2.5-sunburst-2026-09-08", quality }), TRANSPORT);
  expect(mockGenerate.mock.calls[0]?.[0]).not.toHaveProperty("input_fidelity");
  expect(result.providerMeta.observation?.usage).toEqual({ output_tokens: 12 });
});
```

- [ ] **Step 2: Run in app:** `npm test -- src/server/ai/providers/openai-image-provider.test.ts`. Esperar falha: ainda envia modelo do env.
- [ ] **Step 3: Estender tipos e encaminhar configuração.** Importar tipos dos módulos das Tasks 1–2. Qualidade antiga opcional continua para callers fora do Estúdio; não mudar a semântica desses callers nesta tarefa.

```ts
// Em GenerationRequest, GenerateAndStoreImageInput e ProviderGenerateInput:
renderPolicy?: ImageRenderPolicy;
// Em ImageCandidate.providerMeta e GenerationCandidateMeta:
observation?: ImageCallObservation;
// Na chamada generateAndStoreImage feita por executeCanonicalGeneration:
renderPolicy: request.renderPolicy,
// No objeto roundInput de generateAndStoreImage:
renderPolicy: input.renderPolicy,
// No ProviderGenerateInput criado por generateUploadRoutesRound:
renderPolicy: base.renderPolicy,
// Na projeção candidateMeta:
observation: c.providerMeta.observation,
```

A função `generateAndStoreImage(input)` mantém o argumento `input`; acrescentar `renderPolicy: input.renderPolicy` ao objeto `roundInput`. No tipo do segundo argumento de `generateUploadRoutesRound`, acrescentar `renderPolicy?: ImageRenderPolicy`. Não criar variável global para essa decisão. Manter o `quality: medium` legado para torneios antigos: no provedor, `renderPolicy.quality` tem precedência sobre `input.quality`. Assim só a política explicitamente congelada evita a redução.

- [ ] **Step 4: Alterar o provedor.** No início de `generate`, resolver a política; usar `policy.model` também em `resolveOpenAISize`, cujo segundo parâmetro passa a ser `model: string`.

```ts
const policy = input.renderPolicy !== undefined
  ? resolveImageRenderPolicy(input.renderPolicy)
  : resolveImageRenderPolicy({ version: 1, model: env.OPENAI_IMAGE_MODEL, quality: input.quality ?? "medium" });
const openaiSize = toOpenAISdkImageSize(resolveOpenAISize(input, policy.model));
let observation: ImageCallObservation;
```

Dentro de `resolveOpenAISize`, substituir o acesso ao env por `model.startsWith("gpt-image-2")`. Para a branch edit, substituir apenas a chamada/retorno pelo bloco abaixo; manter criação de files e decodificação existente. O cast é exclusivamente a adaptação de enum do SDK instalado, depois de validação runtime.

```ts
const observed = await observeImageCall(policy, { key: input.outputPrefix, operation: "edit", size: openaiSize }, () =>
  openai.images.edit({
    model: policy.model, image: files, prompt: input.prompt, n: 1,
    size: openaiSize,
    quality: policy.quality as OpenAI.Images.ImageEditParams["quality"],
  }, REQUEST_OPTIONS),
);
const response = observed.response;
observation = observed.observation;
```

Para generate:

```ts
const observed = await observeImageCall(policy, { key: input.outputPrefix, operation: "generate", size: openaiSize }, () =>
  openai.images.generate({
    model: policy.model, prompt: input.prompt, n: 1, size: openaiSize,
    quality: policy.quality as OpenAI.Images.ImageGenerateParams["quality"],
  }, REQUEST_OPTIONS),
);
const response = observed.response;
observation = observed.observation;
```

No retorno `providerMeta`, substituir `model: env.OPENAI_IMAGE_MODEL` por `model: policy.model` e acrescentar `observation`. O provedor E2E controlado pode omitir observation; manter sua identidade `e2e-controlled-image`. Um env antigo diferente dos IDs aceitos exige decisão explícita antes de execução: não ampliar modelos permitidos automaticamente.

- [ ] **Step 5: Reexecutar teste do provedor e typecheck.**

Run in app: `npm test -- src/server/ai/providers/openai-image-provider.test.ts` e `npm run typecheck`. Esperar PASS. Na suíte `executeCanonicalGeneration parity` de `app/src/server/generation/pipeline/execute.test.ts`, adicionar o caso completo:

```ts
it("preserves render settings before provider mode conversion", async () => {
  const renderPolicy = { version: 1 as const, model: "gpt-image-2.5-sunburst-2026-09-08" as const, quality: "max" as const };
  const request = baseRequest({
    surface: "quick_tool",
    destination: { kind: "creative_work_output", id: "output-1", storagePrefix: "creative-work/output-1" },
    intent: { mode: "creative_revision", objective: "change headline" },
    executionPolicy: "direct", renderPolicy,
  });
  await executeCanonicalGeneration(request);
  expect(mockGenerate).toHaveBeenCalledWith(expect.objectContaining({ renderPolicy, generationMode: "art_variation" }));
});
```

Executar `npm test -- src/server/generation/pipeline/execute.test.ts` dentro de app.

Conferir generate e edit; o mock do transporte deve mostrar um único chamado em cada caso. Não executar scripts de benchmark neste passo.

- [ ] **Step 6: Commit dos arquivos desta tarefa, por nomes explícitos.**

```bash
git add app/src/server/ai/providers/image-provider.ts app/src/server/ai/providers/openai-image-provider.ts app/src/server/ai/providers/openai-image-provider.test.ts app/src/server/ai/image-generation.ts app/src/server/generation/canonical/types.ts app/src/server/generation/pipeline/execute.ts
```

Executar `git add app/src/server/generation/pipeline/execute.test.ts`, inspecionando `git diff --name-only`; não usar `git add -A`. Commit: `git commit -m "feat: carry frozen image settings through canonical generation"`.

### Task 4: Congelar em preparação; reutilizar em retry, revisão e carrossel

**Files:** `contracts.ts`, `prepare-creative-work.ts`, `prepare-carousel-work.ts`, `jobs/creative-work.ts`, `jobs/creative-work-carousel.ts`, env, Render e testes correspondentes.

**Interfaces:**
- Consumes: `selectImageRenderPolicy(workspaceId, percentage, quality)` e `resolveImageRenderPolicy(value)`.
- Produces: `CreativeWorkInputSnapshot.renderPolicy?: ImageRenderPolicy`. Campo não exposto como escolha livre ao cliente.

- [ ] **Step 1: Adicionar ao teste existente de prepare.** Acrescentar ao mock de env `OPENAI_IMAGE_SUNBURST_PERCENT: 100` e `OPENAI_IMAGE_SUNBURST_QUALITY: "max"`.

```ts
it("freezes the candidate image policy in the preparation transaction", async () => {
  getWork.mockResolvedValue({ work, outputs: [], sources: [readyVariationSource] } as never);
  await prepareCreativeWork({ workspaceId: "ws-1", workItemId: "work-1" });
  expect(updateDraft).toHaveBeenCalledWith("ws-1", "work-1", now,
    expect.objectContaining({ inputSnapshot: expect.objectContaining({
      renderPolicy: { version: 1, model: "gpt-image-2.5-sunburst-2026-09-08", quality: "max" },
    }) }), transactionExecutor);
});
```

- [ ] **Step 2: Run in app:** `npm test -- src/server/application/prepare-creative-work.test.ts`. Esperar falta do campo.
- [ ] **Step 3: Adicionar configuração e contrato.**

```ts
// Dentro do schema de env existente:
OPENAI_IMAGE_SUNBURST_PERCENT: z.coerce.number().int().min(0).max(100).default(0),
OPENAI_IMAGE_SUNBURST_QUALITY: z.enum(["medium", "high", "xhigh", "max"]).default("max"),
// Dentro de CreativeWorkInputSnapshot:
renderPolicy?: ImageRenderPolicy;
```

`max` é candidato inicial inativo, não conclusão de qualidade. Não trocar `OPENAI_IMAGE_MODEL` enquanto existirem callers sem snapshot. No `render.yaml`, acrescentar aos dois serviços:

```yaml
      - key: OPENAI_IMAGE_SUNBURST_PERCENT
        value: "0"
      - key: OPENAI_IMAGE_SUNBURST_QUALITY
        value: max
```

- [ ] **Step 4: Preparação simples.** Antes de criar `snapshotBase`, usar decisão existente se já há snapshot; não reclassificar um trabalho antigo ao prepará-lo novamente.

```ts
const renderPolicy = aggregate.work.inputSnapshot
  ? resolveImageRenderPolicy(aggregate.work.inputSnapshot.renderPolicy)
  : selectImageRenderPolicy(input.workspaceId, env.OPENAI_IMAGE_SUNBURST_PERCENT, env.OPENAI_IMAGE_SUNBURST_QUALITY);
// Em snapshotBase:
renderPolicy,
```

Substituir `withoutPolicyVersion` de `prepare-creative-work.ts` por este corpo. O helper já é usado nos dois lados das comparações, inclusive em `withoutBriefing`:

```ts
function withoutPolicyVersion(snapshot: CreativeWorkInputSnapshot | null) {
  const rest = { ...snapshot, renderPolicy: resolveImageRenderPolicy(snapshot?.renderPolicy) };
  delete rest.generationPolicyVersion;
  return rest;
}
```

Isso mantém cache de preparação antigo equivalente sem ignorar diferenças reais de configuração.

- [ ] **Step 5: Preparação de carrossel.** Dentro da função existente, aplicar a mesma escolha ao `work` carregado; incluir `renderPolicy` no snapshot e no objeto que calcula `preparedRevision`. Na comparação, o hash é derivado do conteúdo e não deve sozinho criar um deck novo num replay. Substituir `withoutPolicyVersion` em `prepare-carousel-work.ts` pelo corpo abaixo; assim os conteúdos normalizados são comparados e o ramo existente retorna o `preparedRevision` anterior quando forem iguais:

```ts
function withoutPolicyVersion(snapshot: CreativeWorkInputSnapshot | null) {
  const rest = { ...snapshot, renderPolicy: resolveImageRenderPolicy(snapshot?.renderPolicy) };
  delete rest.generationPolicyVersion;
  return {
    ...rest,
    carousel: rest.carousel ? { ...rest.carousel, preparedRevision: undefined } : undefined,
  };
}
```

```ts
const renderPolicy = work.inputSnapshot
  ? resolveImageRenderPolicy(work.inputSnapshot.renderPolicy)
  : selectImageRenderPolicy(input.workspaceId, env.OPENAI_IMAGE_SUNBURST_PERCENT, env.OPENAI_IMAGE_SUNBURST_QUALITY);
// Acrescentar ao snapshot e à entrada do hash de nova preparação:
renderPolicy,
```

- [ ] **Step 6: Jobs.** Nos dois objetos `GenerationRequest`, adicionar:

```ts
renderPolicy: resolveImageRenderPolicy(work.inputSnapshot?.renderPolicy),
```

A correção já faz spread da requisição original e deve conservar renderPolicy. Retry/revisão não recalculam coorte nem consultam env. A revisão de trabalho antigo permanece baseline; a comparação Sunburst sobre esse original é um experimento separado.

- [ ] **Step 7: Verificar os quatro comportamentos nos testes mockados existentes:** preparação nova persiste Sunburst; snapshot antigo envia baseline; env alterado após prepare não muda request; revisão/correção conserva configuração e orçamento de chamadas. Usar a asserção real abaixo nos requests capturados pelos mocks do executor:

```ts
expect(generateAndStoreImageMock.mock.calls[0]?.[0].renderPolicy).toEqual({ version: 1, model: "gpt-image-2.5-sunburst-2026-09-08", quality: "max" });
```

`generateAndStoreImageMock` é o mock existente em `jobs/creative-work.test.ts`. No job de carrossel usar `executor.executeCanonicalGeneration.mock.calls[0]?.[0].renderPolicy`. Manter casos de orçamento direto (segunda chamada exclusiva retry OU correção) e o orçamento legado existentes. Run in app:

```bash
npm test -- src/server/application/prepare-creative-work.test.ts src/server/application/prepare-carousel-work.test.ts src/server/jobs/creative-work.test.ts src/server/jobs/creative-work-carousel.test.ts
npm run typecheck
```

- [ ] **Step 8: Inspecionar diff, adicionar somente arquivos desta tarefa e seus testes pelos nomes completos, commit:** `feat: freeze image policy for prepared creative works`.

### Task 5: Conservar observações no resultado e na evidência já persistida

**Files:** `app/src/server/jobs/creative-work.ts`, `app/src/server/jobs/creative-work-carousel.ts`, testes existentes.

**Interfaces:**
- Consumes: `GenerationResult.candidates[].observation?: ImageCallObservation`.
- Produces: `generationEvidence.observations: ImageCallObservation[]`; qualidade do slide contém `generationEvidence` aditivo.

- [ ] **Step 1: No teste existente de duas tentativas do job, dar às candidates observações distintas e exigir dois callIds no resultado persistido.** Modelo de asserção para o objeto de evidência capturado pelo mock de persistência:

```ts
expect(completedQuality()).toMatchObject({ generation: { observations: [expect.objectContaining({ callId: "call-original" }), expect.objectContaining({ callId: "call-correction" })] } });
```

Usar o teste existente `keeps excluded request IDs from the failed base after a passing correction`. Acrescentar ao primeiro candidato:

```ts
observation: {
  callId: "call-original", key: "output-1", operation: "generate", requested: { version: 1, model: "gpt-image-2-2026-04-21", quality: "medium" },
  requestedSize: "1088x1088", returnedSize: "1088x1088", returnedQuality: "medium", requestId: "req-base", durationMs: 8000, usage: null,
},
```

Ao candidato da correção:

```ts
observation: {
  callId: "call-correction", key: "output-1", operation: "generate", requested: { version: 1, model: "gpt-image-2-2026-04-21", quality: "medium" },
  requestedSize: "1088x1088", returnedSize: "1088x1088", returnedQuality: "medium", requestId: "req-correction", durationMs: 9000, usage: null,
},
```

Não exportar funções privadas só para testes; usar o mock do repositório já chamado pelo job. Run in app: `npm test -- src/server/jobs/creative-work.test.ts`; esperar ausência de `observations`.

- [ ] **Step 2: Acrescentar ao retorno de `generationEvidence`:**

```ts
observations: (result.candidates ?? []).flatMap(candidate => candidate.observation ? [candidate.observation] : []),
```

Em `mergeGenerationEvidence`, manter a união existente de excludedCalls e acrescentar:

```ts
observations: [...new Map(
  [...(previous.observations ?? []), ...(next.observations ?? [])].map(item => [item.callId, item]),
).values()],
```

Não deduplicar por requestId ausente. Na evidência persistida anterior, se houver leitura de JSON histórico para merge, normalizar arrays ausentes para `[]`. Para carrossel, no `completeCarouselSlide`, ampliar a qualidade existente sem apagar avaliação:

```ts
quality: {
  ...assessment.quality,
  generationEvidence: {
    version: 1,
    observations: (generated.candidates ?? []).flatMap(candidate => candidate.observation ? [candidate.observation] : []),
    providerCalls: generated.providerCalls ?? null,
    providerRetries: generated.providerRetries ?? null,
    excludedCalls: generated.excludedCalls ?? [],
  },
} as unknown as Record<string, unknown>,
```

- [ ] **Step 3: Reexecutar testes dos dois jobs e typecheck.** A falha de upload antes de persistência será reconstruída pelos eventos `image_api_call`; não declarar que JSON final sozinho cobre falhas. Na validação operacional, comprovar retenção/exportação desses logs. Falha de processo entre started e response permanece cobrança desconhecida; reconciliar por requestId quando disponível, nunca repetir cegamente.
- [ ] **Step 4: Commit explícito dos dois jobs e testes alterados:** `feat: retain image call evidence across creative recovery`.

### Revisão do plano

Cobertura revisada contra a spec: P0/I1 implementados neste plano; I2–I5 têm decisão visual no plano 2; I6 no plano 3; I7–I9 condicionais. Foram conferidos nomes dos helpers, argumentos do executor e os caminhos de testes. O alias `gpt-image-2` é permitido apenas para ler operações antigas de camadas; novas políticas usam snapshots datados. O módulo de política usa hash determinístico não criptográfico para não introduzir dependência Node em contratos compartilhados.

### Task 6: Fechar a preparação técnica sem ativar o modelo

**Files:** somente documentação/evidência local da execução, se necessária.

**Interfaces:**
- Consumes: diff revisado, resultados dos testes das Tasks 1–5.
- Produces: evidência técnica para o plano visual; nenhum claim de ganho de qualidade.

- [ ] Executar `git diff --check` e o typecheck uma vez após as últimas alterações.
- [ ] Executar `graphify update .` após modificar código; inspecionar arquivos gerados, sem adicionar WIP alheio.
- [ ] Confirmar no diff que Render continua com percentual 0, flags atuais e modelo legado para callers não migrados; apenas trabalhos com política explícita usarão Sunburst.
- [ ] Confirmar que testes usaram transporte mockado; guardar comandos e resultados reais em `docs/evidence/2026-09-08-sunburst-technical-validation.md`.
- [ ] Handoff para o plano visual. Publicação exige decisão concreta após evidência visual e orçamento aprovado. O rollout é interno, 10%, 50%, 100% de workspaces elegíveis; a mesma função hash e snapshots garantem continuidade. Rollback para 0 afeta trabalhos novos. Para interromper trabalhos Sunburst já congelados, usar controles existentes de execução; não reescrever silenciosamente sua política.

## Limites deliberados e cobertura

P0: Tasks 1–2 e 4–6. I1: Tasks 3–4. I2: parâmetros disponíveis, escolha no plano visual. I5: propagação para todo deck nas Tasks 4–5. I6: plano de camadas. I7–I9 permanecem condicionais conforme a spec, sem código especulativo.

O logger não substitui faturamento. Conta habilitada, latência do max, retenção dos logs, qualidade final e comportamento em produção continuam sem prova até as etapas operacionais. APIs públicas e esquema SQL não mudam; os campos JSON internos novos precisam passar pelas validações existentes e manter leitura de registros antigos.
