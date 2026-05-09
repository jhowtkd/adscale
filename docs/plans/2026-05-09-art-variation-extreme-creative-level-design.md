# Design: Intensidade de Variações no Modo "Variar Arte"

## Contexto

O modo `art_variation` gera novas versões artísticas de uma peça de campanha mantendo o mesmo formato/proporções. Hoje ele usa o campo `creativeLevel` com três níveis: `conservative`, `balanced`, `bold`.

O problema reportado é que mesmo no nível `bold`, as variações geradas ainda são percebidas como muito conservadoras — a peça original e a variação ficam visualmente muito próximas.

## Diagnóstico

Análise do `src/server/ai/prompt-builder.ts` revelou que:

- O `creativeLevel` (`conservative`/`balanced`/`bold`) é injetado como template de prompt no modo `art_variation`
- O `bold` atual preserva restrições excessivas: "preserve core brand assets", "do not invent a new brand", "Preserve recognizable visual tokens and brand system"
- O `styleIntensity` (`soft`/`medium`/`strong`) existe no schema mas **só é usado no modo `restyling`**, não no `art_variation`

A solução não envolve trazer `styleIntensity` para o `art_variation` (isso adicionaria complexidade de UI sem benefício claro), mas sim:
1. Reescrever os prompts existentes para serem mais assertivos
2. Adicionar um quarto nível `extreme` para variações de alta intensidade

## Design

### 1. Prompts de Creative Level

| Nível | Comportamento |
|---|---|
| **conservative** | Preserva estrutura visual da referência. Muda apenas: layout/disposição, texto, posição do CTA e ajustes menores de espaçamento. Mesmo universo visual. |
| **balanced** | Recompõe layout, hierarquia visual, formas de apoio, ritmo e espaçamento. Resultado deve parecer um irmão da peça original — perceptivelmente diferente, mas reconhecível. |
| **bold** | Muda background por completo, reorganiza hierarquia visual, permite novo tratamento de luz/sombra e reposiciona elementos principais. Mantém marca e oferta, mas a peça é **visivelmente diferente**. |
| **extreme** (novo) | Pode mudar cenário, trocar angulação do produto, alterar tratamento fotográfico, repensar espaço negativo e proporção dos elementos. A peça deve ser *claramente uma variação da mesma campanha*, mas quase irreconhecível lado a lado. |

### 2. Mudanças nos Arquivos

#### `src/server/ai/prompt-builder.ts`
- Reescrever constantes `conservative`, `balanced`, `bold`
- Adicionar constante `extreme`
- Atualizar `CREATIVITY_TEMPLATES` para incluir `extreme`

#### `src/components/workspace/BriefingStep.tsx`
- Adicionar `"extreme"` como quarta opção no RadioGroup de Creative Level

#### `src/app/api/campaigns/route.ts`
- Adicionar `"extreme"` ao `z.enum` do `creativeLevel`

#### `src/app/api/campaigns/[id]/route.ts`
- Adicionar `"extreme"` ao `z.enum` do `creativeLevel`

#### `src/lib/hooks/use-campaigns.ts`
- Atualizar tipos `creativeLevel` para incluir `"extreme"`

#### `src/server/repositories/campaign.ts`
- Atualizar tipo `creativeLevel` para incluir `"extreme"`

### 3. O que NÃO muda

- `styleIntensity` (soft/medium/strong) continua sendo usado **apenas** no modo `restyling`
- `format_adaptation` não usa `creativeLevel` (comportamento atual)
- Nenhum novo campo de UI é adicionado — apenas uma quarta opção no radio existente
- O schema do banco já usa `text` livre, não requer migração

## Trade-offs Considerados

| Alternativa | Por que foi descartada |
|---|---|
| Trazer `styleIntensity` para o `art_variation` | Adicionaria um segundo "knob" de intensidade sem necessidade. O `creativeLevel` já serve esse propósito. |
| Substituir `creativeLevel` por `styleIntensity` no `art_variation` | Quebraria campanhas existentes e confundiria usuários que já aprenderam o modelo atual. |
| Aumentar agressividade do `bold` sem adicionar `extreme` | Correria o risco de usuários que gostavam do `bold` atual perderem seu nível de conforto. Adicionar `extreme` preserva a escolha. |
