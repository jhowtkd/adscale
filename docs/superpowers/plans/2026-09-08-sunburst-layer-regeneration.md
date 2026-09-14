# Sunburst — regeneração de camadas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aplicar Sunburst à regeneração de elementos com configuração congelada e evidência de consumo, preservando alpha, quota, lease e aceitação existentes.

**Architecture:** O provedor de camadas continua separado porque sua saída é um elemento transparente. Reutiliza a política e o observador do plano do motor; a operação reserva a configuração em seu JSON antes do dispatch.

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

## Dependências e mapa de arquivos

Depende das Tasks 1–2 do [plano do motor](2026-09-08-sunburst-engine.md). I6 pode ser validada separadamente, sem alterar geração de peças ou decomposição em camadas.

| Arquivo | Responsabilidade |
|---|---|
| `app/src/server/layer-editor/contracts.ts` | Aceitar campos opcionais de política e evidência em regenerações existentes. |
| `app/src/server/repositories/creative-work-layer-editor.ts` | Congelar política na reserva e conservar evidência ao completar, sem perder lease/CAS. |
| `app/src/server/application/request-creative-work-layer-regeneration.ts` e teste | Escolher política antes de reservar, reutilizar a reserva no replay. |
| `app/src/server/layer-editor/openai-provider.ts` e teste | Enviar modelo/qualidade explícitos, manter PNG transparente e observar retorno. |
| `app/src/server/jobs/creative-work-layer-regeneration.ts` e teste | Consumir a política reservada e persistir observação. |

### Task 1: Congelar configuração dentro da reserva existente

**Files:** contracts, repository, application e testes listados no mapa.

**Interfaces:**
- Consumes: `ImageRenderPolicy`, `imageRenderPolicySchema`, `selectImageRenderPolicy` do motor.
- Produces: `regeneration.renderPolicy?: ImageRenderPolicy`; `regeneration.observation?: unknown`; argumento opcional `renderPolicy?: ImageRenderPolicy` em `reserveLayerRegeneration`.
- Preserva: schemaVersion 1, operationId, fingerprint da instrução, lease, revision e quota.

- [ ] **Step 1: No teste do application que já verifica `reserveLayerRegeneration`, exigir a política escolhida com mock de percentual 100 e qualidade max.** Acrescentar estes campos ao `expect.objectContaining` já existente:

```ts
renderPolicy: {
  version: 1,
  model: "gpt-image-2.5-sunburst-2026-09-08",
  quality: "max",
},
```

Usar o caso existente `recovers an unreleased quota claim that crashed before reservation`, cujo mock se chama `reserve`, e adicionar:

```ts
expect(reserve).toHaveBeenCalledWith(expect.objectContaining({
  renderPolicy: { version: 1, model: "gpt-image-2.5-sunburst-2026-09-08", quality: "max" },
}), expect.anything());
```

No topo do teste, adicionar:

```ts
vi.mock("@/server/validation/env", () => ({ env: {
  OPENAI_IMAGE_SUNBURST_PERCENT: 100, OPENAI_IMAGE_SUNBURST_QUALITY: "max",
} }));
```

No caso `replays a claimed operation without reserving or dispatching a second event`, manter a expectativa de nenhuma nova reserva. Run in app: `npm test -- src/server/application/request-creative-work-layer-regeneration.test.ts`; esperar falta da política.

- [ ] **Step 2: Estender o schema estrito interno.** O módulo de política deve ser puro e compatível com importação por contratos, sem `node:crypto` ou logger; o hash de coorte não é uma função de segurança.

```ts
import { imageRenderPolicySchema } from "@/server/ai/image-render-policy";
// Dentro de regenerationSchema:
renderPolicy: imageRenderPolicySchema.optional(),
observation: z.unknown().optional(),
```

Não enviar esses campos no documento público do editor. O campo observation conserva metadados internos da API; nenhuma imagem ou prompt adicional. A optionalidade mantém leitura dos registros antigos. O plano exige aprovação dessa extensão interna de JSON; nenhuma migração SQL ou endpoint novo.

- [ ] **Step 3: No repository, ampliar o argumento da reserva com `renderPolicy?: ImageRenderPolicy` (type import).** Dentro do objeto `next.regeneration`, acrescentar:

```ts
...(input.renderPolicy ? { renderPolicy: input.renderPolicy } : {}),
```

Não alterar condição SQL, contador de revision, `withPersistedLease`, `operationId` ou `usageKey`.

- [ ] **Step 4: No application, importar env e seletor, e adicionar à chamada existente de `reserveLayerRegeneration`:**

```ts
renderPolicy: selectImageRenderPolicy(
  input.workspaceId,
  env.OPENAI_IMAGE_SUNBURST_PERCENT,
  env.OPENAI_IMAGE_SUNBURST_QUALITY,
),
```

A escolha ocorre somente para uma reserva nova; o replay retorna a operação existente, mesmo após mudança de env. Não incluir configuração mutável no fingerprint do pedido do usuário, pois isso quebraria idempotência. A nova reserva em percentual 0 fixa baseline datado. Operações antigas sem campo conservam o alias legado no provedor, conforme Task 2.

- [ ] **Step 5: Executar testes locais de contratos, application e repository já existentes, com DB mockado.**

```bash
# Dentro de app:
npm test -- src/server/layer-editor/contracts.test.ts src/server/application/request-creative-work-layer-regeneration.test.ts src/server/repositories/creative-work-layer-editor.test.ts
npm run typecheck
```

Se um teste de repository exigir banco externo, não executar com env de produção: usar somente seu setup local já existente; reportar a limitação. Exigir que o caso de estado antigo sem renderPolicy continue válido e que um objeto presente `{version: 2}` seja rejeitado pelo schema.

- [ ] **Step 6: Commit com allowlist dos três arquivos e testes efetivamente alterados:** `feat: freeze layer regeneration render settings on reservation`.

### Task 2: Parâmetros e evidência no provedor de camada

**Files:** `app/src/server/layer-editor/openai-provider.ts`, `.test.ts`.

**Interfaces:**
- Consumes: `ImageRenderPolicy`, `ImageCallObservation`, `observeImageCall`, `resolveImageRenderPolicy`.
- Produces: `LayerRegenerationInput` e retorno `{ buffer: Buffer; requestId: string | null; observation?: ImageCallObservation }`.
- Input completo: `{ instruction: string; selectedLayer: Buffer; composite: Buffer; bounds: {width:number;height:number}; renderPolicy?: ImageRenderPolicy; operationKey?: string }`.

- [ ] **Step 1: Acrescentar mock OpenAI ao teste existente e caso de parâmetros.** Manter os testes Sharp reais de alpha.

```ts
import { vi } from "vitest";
const edit = vi.hoisted(() => vi.fn());
vi.mock("@/server/validation/env", () => ({ env: { OPENAI_API_KEY: "sk-test" } }));
vi.mock("openai", () => ({
  default: class { images = { edit }; },
  toFile: vi.fn(async (buffer: Buffer, name: string) => ({ buffer, name })),
}));
import { OpenAILayerRegenerationProvider } from "./openai-provider";

it("sends Sunburst max as a single transparent edit", async () => {
  edit.mockReset();
  edit.mockResolvedValue({ data: [{ b64_json: Buffer.from("candidate").toString("base64") }], _request_id: "req-layer", usage: { output_tokens: 30 } });
  const result = await new OpenAILayerRegenerationProvider().regenerate({
    instruction: "Mude somente a cor do laço", selectedLayer: Buffer.from("layer"), composite: Buffer.from("context"),
    bounds: { width: 800, height: 800 }, operationKey: "work/output/operation",
    renderPolicy: { version: 1, model: "gpt-image-2.5-sunburst-2026-09-08", quality: "max" },
  });
  expect(edit).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
    model: "gpt-image-2.5-sunburst-2026-09-08", quality: "max", background: "transparent", output_format: "png", n: 1,
  }), { timeout: 180_000, maxRetries: 0 });
  expect(result.observation?.requestId).toBe("req-layer");
  expect(result.observation?.usage).toEqual({ output_tokens: 30 });
});
```

- [ ] **Step 2: Run in app:** `npm test -- src/server/layer-editor/openai-provider.test.ts`. Esperar modelo antigo no mock.
- [ ] **Step 3: Substituir a declaração inline do tipo do provedor pelo contrato completo:**

```ts
export type LayerRegenerationInput = {
  instruction: string;
  selectedLayer: Buffer;
  composite: Buffer;
  bounds: { width: number; height: number };
  renderPolicy?: ImageRenderPolicy;
  operationKey?: string;
};
export type LayerRegenerationProvider = {
  regenerate(input: LayerRegenerationInput): Promise<{
    buffer: Buffer; requestId: string | null; observation?: ImageCallObservation;
  }>;
};
```

Usar `LayerRegenerationInput` também no método da classe. Manter `LAYER_REGENERATION_MODEL = "gpt-image-2"` exclusivamente para reservas antigas. O schema compartilhado permite esse alias legado com medium/high, além dos dois snapshots datados. Ele não é escolhido em novas reservas.

- [ ] **Step 4: Envolver a chamada edit existente:**

```ts
const policy = resolveImageRenderPolicy(input.renderPolicy === undefined
  ? { version: 1, model: LAYER_REGENERATION_MODEL, quality: "medium" }
  : input.renderPolicy);
const size = toOpenAISdkImageSize(dimensionsToGptImage2Size(input.bounds));
const { response, observation } = await observeImageCall(
  policy, { key: input.operationKey ?? "legacy-layer-regeneration", operation: "edit", size },
  () => this.client.images.edit({
    model: policy.model, image: [selected, composite],
    prompt: `Revise somente o elemento isolado solicitado: ${input.instruction}. Retorne somente esse elemento em PNG transparente; sem fundo, moldura, texto extra ou composição completa.`,
    n: 1, size, quality: policy.quality as OpenAI.Images.ImageEditParams["quality"],
    background: "transparent", output_format: "png",
  }, { timeout: 180_000, maxRetries: 0 }),
);
```

Manter decodificação e validação atuais, e retornar:

```ts
return { buffer, requestId: response._request_id ?? null, observation };
```

Não chamar esse caminho uma decomposição em camadas: ele edita apenas o elemento selecionado. Não relaxar validação de PNG, conteúdo visível, alpha, 25 MB ou 40 milhões de pixels.

- [ ] **Step 5: Reexecutar o teste e `npm run typecheck`; esperar PASS.**
- [ ] **Step 6: Commit.**

```bash
git add app/src/server/layer-editor/openai-provider.ts app/src/server/layer-editor/openai-provider.test.ts
git commit -m "feat: use frozen Sunburst settings for transparent layer edits"
```

### Task 3: Worker preserva política, quota e conclusão idempotente

**Files:** `app/src/server/jobs/creative-work-layer-regeneration.ts`, `.test.ts`, `app/src/server/repositories/creative-work-layer-editor.ts`.

**Interfaces:**
- Consumes: `state.regeneration.renderPolicy`, resultado do provedor da Task 2.
- Produces: `completeLayerRegenerationCandidate({... observation?: ImageCallObservation })`; preserva o restante da assinatura existente.

- [ ] **Step 1: Acrescentar ao describe existente do worker, usando `state`, `stateFromOutput` e `input` já definidos:**

```ts
it("uses the reserved policy and does not regenerate on duplicate delivery", async () => {
  const renderPolicy = { version: 1 as const, model: "gpt-image-2.5-sunburst-2026-09-08" as const, quality: "max" as const };
  const frozen = { ...state, regeneration: { ...state.regeneration!, renderPolicy } };
  stateFromOutput.mockImplementation(row => row ? frozen : null);
  markProcessing.mockResolvedValueOnce({ id: input.outputId }).mockResolvedValueOnce(null);
  const provider = { regenerate: vi.fn().mockResolvedValue({ buffer: Buffer.from("candidate"), requestId: "req-1" }) };
  await runCreativeWorkLayerRegeneration(input, provider);
  await runCreativeWorkLayerRegeneration(input, provider);
  expect(provider.regenerate).toHaveBeenCalledOnce();
  expect(provider.regenerate).toHaveBeenCalledWith(expect.objectContaining({ renderPolicy }));
});
```

- [ ] **Step 2: Run in app:** `npm test -- src/server/jobs/creative-work-layer-regeneration.test.ts`. Esperar política ausente.
- [ ] **Step 3: Na chamada única `provider.regenerate` do worker, acrescentar:**

```ts
renderPolicy: regen.renderPolicy,
operationKey: `${input.workspaceId}/${input.outputId}/${input.operationId}`,
```

Substituir a anotação manual de `result` por:

```ts
let result: Awaited<ReturnType<LayerRegenerationProvider["regenerate"]>>;
```

Na chamada de conclusão dentro do loop de CAS, acrescentar `observation: result.observation`. Esse loop continua repetindo apenas persistência, jamais geração.

- [ ] **Step 4: No repository, adicionar `observation?: ImageCallObservation` aos argumentos de `regenerationState` e `completeLayerRegenerationCandidate`.** Na montagem de `regeneration` dentro de `regenerationState`, acrescentar:

```ts
...(input.observation ? { observation: input.observation } : {}),
```

`completeLayerRegenerationCandidate` já usa spread de input ao chamar `regenerationState`, portanto o campo segue sem uma nova função. O spread inicial de `state.regeneration` conserva evidência nas transições posteriores. Eventos do observador cobrem falhas anteriores à conclusão; o JSON só cobre o que foi persistido. Não apagar observação em falhas nem alterar decisão de refund.

- [ ] **Step 5: Executar suíte do worker e provider.** Exigir PASS nos casos existentes de timeout → submission_unknown, duplicidade, limite CAS, upload inválido e falha anterior ao provedor. Não autorizar retry automático com base em ausência de requestId.

```bash
# Dentro de app:
npm test -- src/server/jobs/creative-work-layer-regeneration.test.ts src/server/layer-editor/openai-provider.test.ts
npm run typecheck
```

- [ ] **Step 6: Commit explícito dos três arquivos e teste alterado:** `feat: preserve layer generation evidence through completion`.

### Task 4: Validar visualmente o recorte antes de ativar I6

**Files:** acrescentar seção I6 a `docs/evidence/2026-09-08-sunburst-visual-protocol.md`.

**Interfaces:**
- Consumes: lote pago especificamente aprovado e objetos PNG do provedor.
- Produces: aprovação/rejeição de elemento no preview e na composição completa, com callId e custo correspondente.

- [ ] Preparar seis casos com originais autorizados: cabelo, vidro, sombra, borda fina, embalagem e elemento gráfico. Manter selecionado/composição na mesma ordem, mesmas dimensões, mesmo pedido e política congelada.
- [ ] Comparar baseline e Sunburst no mesmo nível inicial; calibrar high/xhigh/max nas falhas e nos casos visualmente discriminantes. Contabilizar esse lote à parte: não incluí-lo implicitamente nas 141/150 chamadas do ensaio principal.
- [ ] Inspecionar PNG a 100%, sobre fundo claro e escuro e na composição. Rejeitar halo, recorte perdido, sombra errada, produto/identidade alterados ou composição inteira retornada no lugar do elemento. Alpha presente sozinho não aprova o recorte.
- [ ] Confirmar que aceitar candidato altera somente a camada selecionada, preserva desfazer/restaurar e não duplica quota. Rejeitar candidato mantém a camada anterior. Usar os fluxos existentes do editor.
- [ ] Registrar decisão e parâmetros; só ativar I6 após aprovação visual. Se a qualidade ótima de camadas divergir do default global, preparar ajuste estático por operação antes de ativar, sem usar qualidade sabidamente inferior.
- [ ] Ao concluir código, executar `git diff --check` e `graphify update .`; registrar checks locais separadamente do lote pago e deploy.

## Critério de conclusão

Reserva e replay conservam modelo/qualidade; provider envia PNG transparente em uma chamada; usage sobrevive à validação/upload via evento e à conclusão via JSON; os testes existentes de quota/lease/CAS continuam passando. A qualidade visual e a publicação só estão concluídas quando houver evidência própria e autorização correspondente.
