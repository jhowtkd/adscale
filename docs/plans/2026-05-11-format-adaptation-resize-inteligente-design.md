# Design: format_adaptation — Resize Inteligente

## Contexto

A feature "variar tamanho" (`format_adaptation`) atualmente usa `openai.images.generate()`, que não recebe a imagem original como input visual. O modelo reconstrói a peça do zero a partir de uma descrição textual (visual token brief). Isso causa resultados que "mudam completamente o input" — o modelo inventa novas fotos, rearranja elementos de forma irreconhecível e perde fidelidade à peça original.

## Objetivo

Fazer com que `format_adaptation` literalmente rearranje os elementos da imagem original para caber em outro formato, **sem recriar nada do zero**.

## Abordagem Escolhida

**Opção 1: `images.edit()` com imagem original — "Rearranjo guiado"**

Usar `openai.images.edit()` passando a imagem original como referência visual, com um prompt ultra-específico pedindo rearranjo dos elementos para o novo formato.

## Arquitetura

### Pipeline de geração

```
Imagem original (formato fonte)
  → downloadBuffer()
  → toFile() para multipart/form-data
  → openai.images.edit({
      model: env.OPENAI_IMAGE_MODEL,
      image: referenceFile,
      prompt: rearranjoPrompt,
      n: 1,
      size: openaiSize
    })
  → Resultado gerado
  → sharp.resize(dimensions, { fit: "cover", position: "attention" })
  → Upload para R2
```

### Prompt de rearranjo

O prompt de `format_adaptation` deve ser reescrito para:
- Posicionar o modelo como um **editor** de uma peça existente, não um criador do zero
- Instruir explicitamente: " Preserve exatamente estes elementos: foto, textos, logo, cores, card de oferta, CTA"
- Pedir reorganização espacial para o formato alvo
- Proibir criação de novos elementos, novas fotos, novos textos

Exemplo de instrução central:
> "Você está editando uma peça publicitária existente para um novo formato. Preserve todos os elementos visuais originais (fotos, textos, logo, cores, formas gráficas) e apenas os reposicione para caber no formato [X]. Não crie novos elementos. Não altere a foto. Não reescreva os textos."

### Fallback

Se `images.edit()` falhar (ex: API recusa editar por formato muito diferente), o sistema cai em fallback para o comportamento antigo (`images.generate()` com visual token brief). Isso garante resiliência.

## Mudanças nos Arquivos

| Arquivo | Mudança |
|---------|---------|
| `app/src/server/jobs/derivation.ts` | `format_adaptation` usa `images.edit()` com imagem original; fallback para `images.generate()` |
| `app/src/server/ai/prompt-builder.ts` | Prompt de `format_adaptation` reescrito com foco em "rearranjo preservador" |

## Critérios de Sucesso

| Teste | Critério |
|-------|----------|
| 4:5 → 1:1 | Foto original visível, mesmo texto, mesmo logo, mesma paleta |
| 4:5 → 9:16 | Elementos rearranjados verticalmente, nada inventado do zero |
| Regeneração | Resultado anterior como base, comportamento idêntico |
| Fallback | Se edit falhar, generate com token brief funciona normalmente |

## Trade-offs Aceitos

- `images.edit()` pode fazer crop/padding em vez de rearranjo perfeito em alguns casos
- Formato de saída da OpenAI é limitado a 1024x1024, 1024x1536, 1536x1024; `sharp` faz o resize final
- Ainda depende do modelo obedecer instruções — prompt precisa ser bem calibrado

## Próximo Passo

Implementar as mudanças nos arquivos `derivation.ts` e `prompt-builder.ts`.
