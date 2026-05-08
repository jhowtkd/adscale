# Design: Fase 15 — Wave 2 — Restyling com `images.edit` (Duas Imagens)

**Data:** 2026-05-07
**Tema:** ADScale Restyling Derivation Job
**Status:** Aprovado

---

## Contexto

A Fase 15 do milestone v3.0 adiciona o quick tool de **Restilização** à home do ADScale. A Wave 1 (UI + API) já está implementada:

- Modal `RestylingModal.tsx` coleta nome, cliente, oferta, CTA, observações, intensidade de estilo, imagem base e imagem de referência de estilo
- `POST /api/quick-tools/restyling` cria campanha com `generationMode: "restyling"`, faz upload das duas imagens para R2, cria dois assets (`role: "base"` e `role: "style_reference"`), cria derivação e dispara evento Inngest

O que falta é a **Wave 2**: o job de derivação (`derivation.ts`) deve usar `openai.images.edit` com as duas imagens como entrada, conforme especificado em REST-06, em vez do atual `images.generate` com prompt unificado.

---

## Objetivo

Alterar o job Inngest de derivação para que, no modo `restyling`, use a API `images.edit` da OpenAI passando a imagem base e a imagem de referência de estilo simultaneamente, eliminando a necessidade de análise de conteúdo/estilo via vision e prompt unificado.

---

## Estado Atual

No arquivo `app/src/server/jobs/derivation.ts`, o branch de restyling (linhas 345–408) faz:

1. Busca os dois assets (`base` e `style_reference`)
2. Faz download dos dois buffers
3. Chama `analyzeImageContent()` e `analyzeImageStyle()` para gerar briefs textuais
4. Constrói prompt unificado com `buildRestylingPrompt()`
5. Chama `openai.images.generate({ prompt: unifiedPrompt })`

Isso funciona, mas:
- É indireto: converte imagens para texto (briefs) e depois pede para o modelo gerar a partir do texto
- Não aproveita a capacidade nativa da OpenAI de receber múltiplas imagens em `images.edit`
- Introduz complexidade desnecessária (`analyzeImageContent`, `analyzeImageStyle`, `buildRestylingPrompt`)

---

## Design

### Mudança Principal

Substituir o bloco de restyling no job para usar `images.edit` com array de imagens:

```typescript
if (effectiveGenerationMode === "restyling") {
  const assets = await getAssetsByCampaign(campaignId, workspaceId);
  const baseAsset = assets.find((a) => a.role === "base") ?? assets[0];
  const styleAsset = assets.find((a) => a.role === "style_reference") ?? assets[1];

  if (!baseAsset || !styleAsset) {
    throw new Error("Restyling requires both base and style_reference assets");
  }

  const baseBuffer = await downloadBuffer(baseAsset.key);
  const styleBuffer = await downloadBuffer(styleAsset.key);

  const baseFile = await toFile(baseBuffer, "base-image", { type: baseAsset.type });
  const styleFile = await toFile(styleBuffer, "style-reference", { type: styleAsset.type });

  const response = await withTimeout(
    openai.images.edit({
      model: env.OPENAI_IMAGE_MODEL,
      image: [baseFile, styleFile],  // Array de duas imagens
      prompt,
      n: 1,
      size: openaiSize,
    }),
    IMAGE_GENERATION_TIMEOUT_MS,
    "OpenAI image edit (restyling)"
  );

  const first = response.data?.[0];
  if (!first) {
    throw new Error("No image data returned from OpenAI");
  }
  result = first;
}
```

### Prompt

O prompt deve ser construído com `buildDerivationPrompt()` que já possui a lógica de restyling (incluída na Wave 1/plano 15-01). O prompt contém:

- `MODE: restyling`
- `BASE IMAGE CONTENT SOURCE`: preservar sujeito, produto, oferta, CTA, conteúdo factual
- `STYLE REFERENCE DESIGN LANGUAGE`: emprestar layout, estilo visual, tipografia, cores, linguagem de design
- Regras de não copiar conteúdo factual da referência de estilo

### Remoções

As seguintes funções e imports podem ser removidos do job (se não forem usados em outro lugar):
- `analyzeImageContent`
- `analyzeImageStyle`
- `buildRestylingPrompt`

**Nota:** Verificar se essas funções são usadas em outros arquivos antes de remover. Se forem usadas apenas no job, podem ser removidas. Se tiverem outros usos, manter.

### Normalização

A saída continua sendo normalizada com `sharp` para as dimensões corretas do formato (`1:1`, `4:5`, `9:16`), conforme já implementado.

---

## Trade-offs Considerados

| Abordagem | Prós | Contras |
|-----------|------|---------|
| **images.edit com array** (recomendada) | Usa API nativa para edição com referência visual; mais fiel ao propósito; simplifica código | Depende do SDK aceitar array de imagens (documentado) |
| **Manter images.generate com prompt** | Já implementado e funcionando | Indireto; perde informação visual na conversão texto → imagem |

---

## Critérios de Sucesso

1. Job de restyling chama `images.edit` com array de duas imagens
2. O prompt usado é o de `buildDerivationPrompt` com modo `restyling`
3. `analyzeImageContent`, `analyzeImageStyle`, `buildRestylingPrompt` são removidos se não usados em outro lugar
4. Build passa sem erros TypeScript
5. Testes existentes continuam passando
6. Fluxo end-to-end de restyling funciona: home → modal → API → Inngest → geração → galeria

---

## Arquivos Modificados

- `app/src/server/jobs/derivation.ts` — alterar branch de restyling para usar `images.edit` com array
- Possível remoção de funções de análise de imagem se não forem usadas em outro lugar

---

## Próximo Passo

Invocar a skill `writing-plans` para criar o plano de implementação detalhado.
