# format_adaptation Resize Inteligente — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Mudar o `format_adaptation` para usar `openai.images.edit()` com a imagem original como referência visual, em vez de `images.generate()` do zero.

**Architecture:** O job de derivação (`derivation.ts`) atualmente usa `images.generate()` para `format_adaptation`. Vamos mudar para `images.edit()` quando houver um asset original, passando a imagem como input. O prompt (`prompt-builder.ts`) será reescrito para instruir o modelo a preservar todos os elementos e apenas rearranjá-los. Fallback para `images.generate()` se edit falhar.

**Tech Stack:** TypeScript, Next.js, OpenAI API (DALL-E 3), sharp, Inngest

---

### Task 1: Reescrever o prompt de format_adaptation no prompt-builder

**Files:**
- Modify: `app/src/server/ai/prompt-builder.ts:191-207`

**Step 1: Ler o bloco atual de format_adaptation**

Confirme que está vendo as linhas 191-207 com o prompt atual de `format_adaptation`.

**Step 2: Substituir por prompt de "rearranjo preservador"**

Substituir o bloco `else if (generationMode === "format_adaptation")` para:
- Posicionar o modelo como editor, não criador
- Listar elementos a preservar (foto, textos, logo, cores, card, CTA)
- Instruir rearranjo para o formato alvo
- Proibir invenção de novos elementos

```typescript
} else if (generationMode === "format_adaptation") {
    parts.push(
      "MODE: format_adaptation — You are EDITING an existing ad to fit a DIFFERENT aspect ratio.",
      "You can see the original image. Your job is to PRESERVE every visual element exactly as it appears, and only REPOSITION them to fit the target format.",
      "PRESERVE EXACTLY: the original photo/subject, all text copy (headlines, subheads, bullets, CTA), the logo, brand colors, background color/texture, offer cards, discount badges, decorative shapes, icons, and graphic panels.",
      "DO NOT: create new photos, rewrite text, add new elements, remove elements, change colors, or invent new brand assets.",
      `Target format: ${targetFormat}. Rearrange the existing elements into a native composition for this format. Fill the canvas edge-to-edge. No blank bands, blurred padding, or letterboxing.`,
      "The result must be immediately recognizable as the same ad — same content, same visual identity, just fitting a different frame."
    );

    if (targetFormat === "9:16") {
      parts.push("For 9:16 (vertical story): stack elements vertically. Place headline and photo in the upper half, offer/CTA in the lower half. Extend background to fill top and bottom.");
    } else if (targetFormat === "4:5") {
      parts.push("For 4:5 (portrait feed): balance subject and copy vertically. Keep photo prominence, stack text below or beside. Rebuild offer/CTA area to feel native to portrait.");
    } else if (targetFormat === "1:1") {
      parts.push("For 1:1 (square): compress layout into a compact square. Keep all key elements visible and readable. Avoid cropping faces, text, or logos.");
    }
}
```

**Step 3: Remover a lógica de visual token brief do prompt**

Na seção onde `visualTokenBrief` é adicionado (linhas 287-293), envolver em uma condição para NÃO incluir no `format_adaptation`:

```typescript
if (!isArtVariation && visualTokenBrief?.trim() && generationMode !== "format_adaptation") {
```

Isso evita que o prompt textual "confunda" o modelo quando ele já vê a imagem.

**Step 4: Commit**

```bash
git add app/src/server/ai/prompt-builder.ts
git commit -m "refactor(prompt): rewrite format_adaptation prompt for edit-mode rearrange"
```

---

### Task 2: Mudar derivation.ts para usar images.edit() em format_adaptation

**Files:**
- Modify: `app/src/server/jobs/derivation.ts:335-434`

**Step 1: Ler a seção de geração atual**

As linhas 335-434 contêm a lógica que decide entre `restyling`, `art_variation` (edit), e `format_adaptation` (generate).

**Step 2: Extrair a lógica de edit para reutilização**

Atualmente o edit com imagem única está nas linhas 394-415:

```typescript
} else if (asset && referenceBuffer && effectiveGenerationMode !== "format_adaptation") {
```

Mudar para incluir `format_adaptation`:

```typescript
} else if (asset && referenceBuffer) {
```

Isso faz com que `format_adaptation` passe pelo caminho `images.edit()` junto com `art_variation`.

**Step 3: Adicionar fallback para generate() se edit falhar**

Envelopar o `images.edit()` em um try/catch. Se falhar, cair no `images.generate()` com o visualTokenBrief (comportamento antigo).

```typescript
let result: OpenAI.Images.Image;

const openaiSize = formatToOpenAISize(targetFormat, isPreview);

if (effectiveGenerationMode === "restyling") {
  // ... restyling logic unchanged ...
} else if (asset && referenceBuffer) {
  // Try edit mode first (works for art_variation and format_adaptation)
  const referenceImage = await toFile(referenceBuffer, "reference-image", {
    type: asset.type,
  });

  try {
    const response = await withTimeout(
      openai.images.edit({
        model: env.OPENAI_IMAGE_MODEL,
        image: referenceImage,
        prompt,
        n: 1,
        size: openaiSize,
      }),
      IMAGE_GENERATION_TIMEOUT_MS,
      "OpenAI image edit"
    );
    const first = response.data?.[0];
    if (!first) {
      throw new Error("No image data returned from OpenAI");
    }
    console.log(`[generate-and-store-output] edit success mode=${effectiveGenerationMode} url=${first.url ? "yes" : "no"} b64=${first.b64_json ? "yes" : "no"}`);
    result = first;
  } catch (editErr) {
    // Fallback to generate for format_adaptation if edit fails
    if (effectiveGenerationMode === "format_adaptation") {
      console.warn(`[generate-and-store-output] edit failed for format_adaptation, falling back to generate:`, editErr);
      const response = await withTimeout(
        openai.images.generate({
          model: env.OPENAI_IMAGE_MODEL,
          prompt,
          n: 1,
          size: openaiSize,
        }),
        IMAGE_GENERATION_TIMEOUT_MS,
        "OpenAI image generation (fallback)"
      );
      const first = response.data?.[0];
      if (!first) {
        throw new Error("No image data returned from OpenAI fallback");
      }
      console.log(`[generate-and-store-output] fallback generate success`);
      result = first;
    } else {
      throw editErr;
    }
  }
} else {
  // No asset — generate from scratch (should not happen for format_adaptation normally)
  const response = await withTimeout(
    openai.images.generate({
      model: env.OPENAI_IMAGE_MODEL,
      prompt,
      n: 1,
      size: openaiSize,
    }),
    IMAGE_GENERATION_TIMEOUT_MS,
    "OpenAI image generation"
  );
  const first = response.data?.[0];
  if (!first) {
    throw new Error("No image data returned from OpenAI");
  }
  console.log(`[generate-and-store-output] generate success (no asset)`);
  result = first;
}
```

**Step 4: Remover visual token brief extraction (opcional)**

Como agora o modelo vê a imagem diretamente, a extração de visual tokens (linhas 335-339) não é mais necessária para `format_adaptation`. Podemos simplificar:

```typescript
if (asset) {
  console.log(`[generate-and-store-output] downloading asset key=${asset.key}`);
  referenceBuffer = await downloadBuffer(asset.key); <!-- VERIFY: function 'downloadBuffer' — see verification in .planning/tmp/ -->
  console.log(`[generate-and-store-output] downloaded ${referenceBuffer.length} bytes`);
}
```

Remover o bloco `if (effectiveGenerationMode === "format_adaptation")` que chama `buildVisualTokenBrief`. <!-- VERIFY: function 'buildVisualTokenBrief' — see verification in .planning/tmp/ -->

**Step 5: Commit**

```bash
git add app/src/server/jobs/derivation.ts
git commit -m "feat(derivation): use images.edit() for format_adaptation with generate fallback"
```

---

### Task 3: Verificação e teste

**Files:**
- Nenhum arquivo novo

**Step 1: Rebuild da aplicação**

```bash
cd /Users/jhonatan/Repos/ADScale_2/app
docker-compose --profile dev down
docker-compose --profile dev up -d --build
```

**Step 2: Testar via UI**

1. Acessar http://localhost:3000
2. Entrar em uma campanha com uma derivação 4:5 existente
3. Clicar em "variar tamanho" para 1:1 ou 9:16
4. Verificar se o resultado mantém foto, textos, logo, cores da original

**Step 3: Verificar logs**

```bash
docker-compose --profile dev logs app --tail 50 -f
```

Esperado ver:
- `[generate-and-store-output] edit success mode=format_adaptation`
- Ou em caso de falha da API: `[generate-and-store-output] edit failed for format_adaptation, falling back to generate`

**Step 4: Commit (se necessário)**

Se houver ajustes menores, commitar separadamente.

---

## Notas de Implementação

- O parâmetro `size` em `images.edit()` aceita os mesmos valores de `images.generate()` (512x512, 1024x1024, 1024x1536, 1536x1024), então `formatToOpenAISize()` funciona para ambos.
- `sharp.resize()` com `position: "attention"` já está implementado para `format_adaptation` — isso ajuda a manter foco no conteúdo importante quando o formato muda.
- Se o teste mostrar que `images.edit()` ainda inventa muito, podemos iterar no prompt (adicionar mais restrições) ou evoluir para a Opção 2 (vision hiper-detalhada).
