# Restyling images.edit Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Alterar o job Inngest de derivação para usar `openai.images.edit` com array de duas imagens no modo `restyling`, eliminando a lógica de análise de conteúdo/estilo e prompt unificado.

**Architecture:** O job já busca os dois assets e faz download dos buffers. A mudança é converter os buffers para `toFile()` e passar como array no campo `image` da chamada `images.edit`. O prompt continua sendo gerado por `buildDerivationPrompt` que já possui a lógica de restyling.

**Tech Stack:** Next.js, TypeScript, OpenAI SDK, Inngest

---

## Contexto

- Design aprovado em: `docs/plans/2026-05-07-restyling-images-edit-design.md`
- Arquivo principal: `app/src/server/jobs/derivation.ts`
- O job já tem o branch de restyling (linhas 345-408) que usa `images.generate`
- O prompt builder já tem o modo restyling (implementado no plano 15-01)

---

### Task 1: Verificar uso de funções de análise de imagem

**Arquivos:**
- Ler: `app/src/server/jobs/derivation.ts` (linhas 1-21 para imports)
- Ler: `app/src/server/ai/image-analysis.ts` (se existir)
- Buscar: `analyzeImageContent`, `analyzeImageStyle`, `buildRestylingPrompt` no codebase

**Step 1: Verificar se as funções são usadas em outros arquivos**

```bash
grep -r "analyzeImageContent" /Users/jhonatan/Repos/ADScale_2/app/src --include="*.ts" --include="*.tsx"
grep -r "analyzeImageStyle" /Users/jhonatan/Repos/ADScale_2/app/src --include="*.ts" --include="*.tsx"
grep -r "buildDerivationPrompt" /Users/jhonatan/Repos/ADScale_2/app/src --include="*.ts" --include="*.tsx"
```

**Expected:** Se todas as ocorrências forem apenas em `derivation.ts`, podem ser removidas.

---

### Task 2: Modificar o branch de restyling no job

**Arquivos:**
- Modificar: `app/src/server/jobs/derivation.ts` (linhas 345-408)

**Step 1: Ler o bloco atual de restyling**

Ler `app/src/server/jobs/derivation.ts` a partir da linha 340 até 410 para entender o bloco atual.

**Step 2: Substituir o bloco de restyling**

Localizar (aproximadamente linhas 345-408):

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

        let unifiedPrompt: string;

        try {
          const [contentBrief, styleBrief] = await Promise.all([
            analyzeImageContent(baseBuffer, baseAsset.type),
            analyzeImageStyle(styleBuffer, styleAsset.type),
          ]);

          unifiedPrompt = buildRestylingPrompt(
            contentBrief,
            styleBrief,
            campaign,
            ctaText ?? derivation.ctaText ?? undefined,
            locale,
            campaign.styleIntensity ?? "medium"
          );
        } catch (analysisErr) {
          console.error(
            `[restyling] vision analysis failed, falling back to legacy prompt.`,
            analysisErr
          );
          unifiedPrompt = buildDerivationPrompt({
            campaign,
            plan,
            asset: baseAsset,
            feedback: derivation.feedback,
            locale,
            generationMode: "restyling",
            variantIndex,
            ctaText,
            targetFormat,
            creativeLevel: campaign.creativeLevel ?? "balanced",
          });
        }

        const response = await withTimeout(
          openai.images.generate({
            model: env.OPENAI_IMAGE_MODEL,
            prompt: unifiedPrompt,
            n: 1,
            size: openaiSize,
          }),
          IMAGE_GENERATION_TIMEOUT_MS,
          "OpenAI image generation (restyling)"
        );

        const first = response.data?.[0];
        if (!first) {
          throw new Error("No image data returned from OpenAI");
        }
        console.log(`[generate-and-store-output] restyling generate success`);
        result = first;
      }
```

Substituir por:

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
            image: [baseFile, styleFile],
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
        console.log(`[generate-and-store-output] restyling edit success`);
        result = first;
      }
```

**Step 3: Verificar se o prompt já está correto**

O `prompt` usado no `images.edit` acima é o mesmo `prompt` declarado anteriormente no escopo (linha 326):

```typescript
const prompt = buildDerivationPrompt({
  campaign,
  plan,
  asset,
  feedback: derivation.feedback,
  locale,
  generationMode: effectiveGenerationMode,
  variantIndex: variantIndex ?? derivation.variantIndex ?? 0,
  ctaText: ctaText ?? derivation.ctaText ?? undefined,
  targetFormat,
  visualTokenBrief,
  creativeLevel: campaign.creativeLevel ?? "balanced",
});
```

Isso já passa `generationMode: effectiveGenerationMode` que será `"restyling"`, então o `buildDerivationPrompt` já vai emitir o bloco correto de `MODE: restyling`.

---

### Task 3: Remover imports e funções não utilizadas (se aplicável)

**Arquivos:**
- Modificar: `app/src/server/jobs/derivation.ts` (linhas 1-21)

**Step 1: Verificar imports**

Se `analyzeImageContent`, `analyzeImageStyle`, `buildRestylingPrompt` não forem usados em nenhum outro lugar no arquivo (após a mudança do Task 2), removê-los do import.

Localizar:
```typescript
import { analyzeImageContent, analyzeImageStyle } from "@/server/ai/image-analysis";
import { buildRestylingPrompt } from "@/server/ai/prompt-builder";
```

Remover essas linhas se não houver outros usos.

**Step 2: Verificar se o arquivo `image-analysis.ts` ainda é necessário**

```bash
grep -r "from \"@/server/ai/image-analysis\"" /Users/jhonatan/Repos/ADScale_2/app/src --include="*.ts" --include="*.tsx"
```

Se nenhum outro arquivo importar de `image-analysis.ts`, o arquivo pode ser removido ou mantido (a critério do time).

---

### Task 4: Build e testes

**Step 1: Build**

```bash
cd /Users/jhonatan/Repos/ADScale_2/app
npm run build
```

**Expected:** Build passa sem erros TypeScript.

**Step 2: Testes**

```bash
cd /Users/jhonatan/Repos/ADScale_2/app
npm run test
```

**Expected:** Todos os testes existentes continuam passando.

**Step 3: Lint**

```bash
cd /Users/jhonatan/Repos/ADScale_2/app
npm run lint
```

**Expected:** Sem erros de lint.

---

### Task 5: Commit

```bash
git add -A
git commit -m "feat: use images.edit with two images for restyling mode

- Replace images.generate with images.edit for restyling
- Pass base and style_reference images as array
- Remove vision analysis fallback (analyzeImageContent, analyzeImageStyle)
- Use buildDerivationPrompt directly with restyling mode
- REST-06 complete"
```

---

## Notas

- O SDK da OpenAI aceita `image: [file1, file2]` conforme documentação.
- O prompt para restyling já foi implementado no plano 15-01 em `buildDerivationPrompt`.
- A normalização com `sharp` continua funcionando da mesma forma para todos os modos.
- Não é necessário alterar a API route nem a UI (Wave 1 já completa).

---

## Checklist de Sucesso

- [ ] `images.edit` chamado com array de duas imagens no modo restyling
- [ ] Build passa
- [ ] Testes passam
- [ ] Lint passa
- [ ] Imports não utilizados removidos
- [ ] Commit criado
