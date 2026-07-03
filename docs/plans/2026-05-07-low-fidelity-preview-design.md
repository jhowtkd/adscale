# Design: Preview de Baixa Resolução (Low-Fidelity)

**Data:** 2026-05-07
**Tema:** ADScale Derivation Preview
**Status:** Aprovado

---

## Contexto

Usuários do ADScale precisam validar a direção visual antes de gastar créditos na geração em lote de derivações. Hoje, ao clicar "Gerar", todas as derivações são criadas e processadas sem feedback visual prévio, o que pode resultar em desperdício de créditos se o brief não estiver bem calibrado.

---

## Objetivo

Adicionar uma etapa de **preview de baixa resolução** antes da geração em lote. O usuário gera **1 derivação preview** (resolução reduzida, ~25% do custo), visualiza na galeria com badge "Preview", e decide se quer prosseguir com o lote completo.

---

## Arquitetura & Data Flow

### Schema

Nova coluna em `derivations`:
- `isPreview`: boolean, notNull, default false

### API

`POST /api/campaigns/[id]/derivations` aceita campo opcional:
- `preview: boolean` (default: false)

Quando `preview: true`:
- Cria apenas **1 derivation** com `isPreview: true`
- Valida que não existe outro preview ativo para a mesma campanha (ou substitui o existente)

### Inngest Event

O payload do evento `derivation.generate` ganha:
- `isPreview: boolean`

### Job de Derivação

Quando `isPreview === true`:
- Usa resolução reduzida:
  - `1:1` → 512x512
  - `4:5` → 512x640
  - `9:16` → 512x768
- O prompt continua idêntico ao do lote normal
- A saída é normalizada com `sharp` para as dimensões de preview

### Cost Tracking

O `trackUsage` registra `isPreview: true` para permitir análise de custo separada.

### Limpeza de Preview

- Novo preview deleta o preview anterior da mesma campanha
- Ao gerar o lote completo, o preview pode ser mantido (para referência) ou deletado (opcional)

---

## UI/UX

### DerivationsStep

**Estado A — Sem preview:**
```
[🔍 Gerar Preview]    [Gerar Todas →] (disabled)
```

**Estado B — Preview gerando:**
- Card na galeria com status "generating" + badge "Preview" tracejado

**Estado C — Preview completo:**
- Card na galeria com:
  - Badge laranja "Preview" no canto superior direito
  - Borda tracejada laranja
  - Tooltip: "Resolução de preview — não use para exportação"
- Abaixo da galeria de preview:
```
[Este preview está bom?]
[✓ Aprovar e Gerar Todas]  [↻ Novo Preview]  [✏️ Editar Brief]
```

**Estado D — Preview aprovado:**
```
[🔍 Gerar Preview]    [Gerar Todas →] (enabled)
```

### ReviewStep / Galeria

Previews aparecem em seção separada acima das derivações finais:
- Badge "Preview" permanece visível
- Não mostra botões de approve/reject (preview não é entregável)
- Botão de download desabilitado ou mostra tooltip "Baixe a versão final"

### Editar Brief

Qualquer edição no brief após preview existente:
- Limpa preview automaticamente
- Remove badge, desabilita "Gerar Todas"
- Usuário precisa gerar novo preview

---

## Error Handling

| Cenário | Comportamento |
|---------|---------------|
| Preview falha | Erro normal + botão "Tentar Preview Novamente". "Gerar Todas" continua habilitado. |
| Preview timeout | Mesmo que falha. |
| Múltiplos previews | Apenas 1 ativo por campanha. Novo deleta o anterior. |
| Edição de brief | Limpa preview automaticamente. |

---

## Testing

**Unit:**
- `formatToOpenAISize("1:1", true)` → `"512x512"`
- `formatToOpenAISize("1:1", false)` → `"1024x1024"`

**Integration:**
- POST com `preview: true` cria derivation com `isPreview=true`
- Job com `isPreview=true` gera em resolução reduzida
- Novo preview deleta preview anterior

**UI:**
- Badge "Preview" aparece apenas em `isPreview=true`
- "Gerar Todas" habilita após aprovar preview
- Editar brief limpa preview

---

## Success Criteria

1. Usuário pode gerar 1 preview antes do lote
2. Preview usa resolução reduzida (~512px no maior lado)
3. Preview custa menos que derivação normal
4. UI diferencia preview com badge e borda
5. "Gerar Todas" desabilitado até preview ser aprovado (ou usuário optar por pular)
6. Editar brief limpa preview automaticamente
7. Build e testes passam

---

## Arquivos Modificados

- `app/src/server/db/schema.ts` — coluna `isPreview`
- `app/src/server/jobs/derivation.ts` — resolução reduzida quando isPreview
- `app/src/app/api/campaigns/[id]/derivations/route.ts` — aceita preview param
- `app/src/server/repositories/derivation.ts` — createDerivation com isPreview
- `<!-- VERIFY: app/src/components/workspace/DerivationsStep.tsx — botões de preview — see verification in .planning/tmp/ -->`
- `app/src/components/workspace/DerivationCard.tsx` — badge de preview
- `app/src/server/repositories/usage.ts` — trackUsage com isPreview

---

## Próximo Passo

Invocar a skill `writing-plans` para criar o plano de implementação detalhado.
