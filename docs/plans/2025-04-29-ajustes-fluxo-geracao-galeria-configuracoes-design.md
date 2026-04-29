# Design: Ajustes de Fluxo de Geração, Galeria e Configurações

## Resumo

- "Variar formato" passa a exigir escolha de um único formato alvo (`1:1`, `4:5` ou `9:16`) e nunca gera os três automaticamente.
- "Variar arte" ganha controle de criatividade com 3 níveis: `conservative`, `balanced`, `bold`; esse valor entra diretamente no prompt.
- A revisão sai do passo separado e passa para a própria galeria, com aprovar/rejeitar nos cards.
- Os previews deixam de cortar a imagem e a peça referência volta a aparecer no comparativo.
- Configurações: aba "Time" vira "Equipe"; "Integrações" fica inativa com "Em breve".
- O wizard de campanha passa de 4 passos para 3 passos.

---

## 1. Schema / Banco de Dados

### Migration

```sql
ALTER TABLE "adscale_app"."campaigns"
ADD COLUMN "creative_level" text DEFAULT 'balanced' NOT NULL;
```

### Schema Drizzle (`app/src/server/db/schema.ts`)

```ts
export const campaigns = adscaleSchema.table("campaigns", {
  // ... colunas existentes ...
  creativeLevel: text("creative_level").notNull().default("balanced"),
  // ... restante ...
});
```

- `targetFormats` **permanece** `text("target_formats").array()` por compatibilidade.
- Nenhuma alteração no tipo `derivations.status` (continua `text` sem enum/check constraint).

---

## 2. API e Validação

### POST /api/campaigns

```ts
creativeLevel: z.enum(["conservative", "balanced", "bold"]).optional().default("balanced")
```

### PATCH /api/campaigns/[id]

```ts
creativeLevel: z.enum(["conservative", "balanced", "bold"]).optional()
```

> **Importante:** sem `.default("balanced")` no PATCH, para não resetar campanhas existentes.

### Validação condicional (ambos os endpoints)

```ts
z.object({
  generationMode: z.enum(["art_variation", "format_adaptation"]).optional(),
  targetFormats: z.array(z.enum(["1:1", "4:5", "9:16"])).max(1).optional(),
  creativeLevel: z.enum([...]).optional(), // sem default no PATCH
})
.refine(
  (data) => {
    const mode = data.generationMode ?? "art_variation";
    return mode !== "format_adaptation" || (data.targetFormats?.length === 1);
  },
  { message: "format_adaptation requires exactly 1 targetFormat", path: ["targetFormats"] }
)
```

### POST /api/campaigns/[id]/derivations

- Carregar `campaign.generationMode`, `campaign.targetFormats`, `campaign.creativeLevel`.
- `format_adaptation`: garantir `targetFormats.length === 1`, criar exatamente **1 job** com aquele formato.
- `art_variation`: repassar `creativeLevel` para o prompt-builder.

### PATCH /api/derivations/[id]/review

- Contrato atual preservado: `{ "status": "approved" | "rejected" }`.
- `DerivationsStep` chama este endpoint diretamente para aprovar/rejeitar.

---

## 3. Lógica de Geração (Jobs + Prompt Builder)

### Prompt Builder (`app/src/server/ai/prompt-builder.ts`)

Nova função auxiliar:

```ts
function buildCreativityPrompt(level: "conservative" | "balanced" | "bold"): string {
  const templates = {
    conservative: `CREATIVITY LEVEL: conservative.\nStay close to the reference creative...`,
    balanced: `CREATIVITY LEVEL: balanced.\nCreate a clearly new ad from the same campaign system...`,
    bold: `CREATIVITY LEVEL: bold.\nPush the creative further while staying on-brand...`,
  };
  return templates[level];
}
```

- `buildDerivationPrompt` recebe `creativeLevel` como parâmetro.
- Se `generationMode === "art_variation"`: insere o trecho após regras de modo e antes dos dados da campanha.
- Se `generationMode === "format_adaptation"`: **ignora** `creativeLevel`.
- Default efetivo: `balanced` quando ausente.

### Job de derivação (`app/src/server/jobs/derivation.ts`)

- Worker busca a campanha e repassa `campaign.creativeLevel ?? "balanced"` para o prompt.
- `format_adaptation`: cria exatamente **1 job**.
- `art_variation`: injeta o trecho de criatividade.

---

## 4. UI: Galeria (`DerivationsStep`)

### Props atualizadas

```ts
interface DerivationsStepProps {
  derivations: Derivation[];
  generationMode?: "art_variation" | "format_adaptation";
  onPreview: (id: string) => void;
  onDownload: (id: string) => void;
  onRegenerate: (id: string) => void;
  onGenerateMore: () => void;
  onApprove?: (id: string) => void;
  onReject?: (id: string) => void;
  approvingId?: string | null;
  rejectingId?: string | null;
  isGeneratingMore?: boolean;
}
```

### Comportamento dos cards

- `DerivationCard` mostra ações **Aprovar** / **Rejeitar** inline quando `status === "completed"`.
- Cards `approved` e `rejected` aparecem na galeria, mas sem ações ativas.
- Status badge reflete os 3 estados: `completed`, `approved`, `rejected`.
- `object-contain` em vez de `object-cover`.
- Proporção do card baseada em `derivation.format`:
  - `1:1` → `aspect-square`
  - `4:5` → `aspect-[4/5]`
  - `9:16` → `aspect-[9/16]`
  - ausente/default → `aspect-square`

### Remoções

- `onReviewAll` removido de `DerivationsStep` e da página da campanha.
- Botão/banner "Ir para Revisão" removido.
- Footer "Revisar Tudo" removido.

### Preview

- Continua via `onPreview`, controlado pela página pai / `ComparisonView`.

---

## 5. UI: Configurações (`SettingsPage`)

### Aba "Time" → "Equipe"

- Alterar chave de tradução em `app/messages/pt-BR.json`: `settings.teamTab` de `"Time"` para `"Equipe"`.

### Aba "Integrações" inativa

- Tab renderizada com `<button disabled>`.
- Classes: `opacity-50 cursor-not-allowed`.
- Badge "Em breve" usando `common.comingSoon`.
- Clique bloqueado (não navega para conteúdo da aba).

### Invalidação de cache após upload

- Em `useUploadAsset` (ou hook equivalente), após upload bem-sucedido:
  - Invalidar `["campaigns", campaignId]` (já existe).
  - **Adicionar:** invalidar `["campaign-assets", campaignId]` para que a referência apareça no preview/comparativo.

---

## 6. Remoção do `ReviewStep` do fluxo principal

### Página da campanha (`app/src/app/(dashboard)/campaigns/[id]/page.tsx`)

- Remover import de `ReviewStep`.
- Remover renderização condicional do step "review".
- Ajustar `StepKey`, `steps`, `WizardStep` e navegação de **4 passos para 3 passos**.
- Remover estado/transição de review.

### Arquivo `ReviewStep.tsx`

- **Mantido no disco**, apenas desvinculado do fluxo principal.

---

## 7. Testes

### Unitários

- `tests/unit/prompt-parser.test.ts` (ou `prompt-builder.test.ts`):
  - Validar os 3 níveis de criatividade no prompt de `art_variation`.
  - Confirmar que `format_adaptation` **não** inclui trecho de criatividade.
  - Confirmar default `balanced` quando `creativeLevel` ausente.

### Integração

- `tests/integration/derivation-job.test.ts`:
  - `targetFormats` com > 1 item → falha na validação.
  - `format_adaptation` cria exatamente 1 derivação no formato escolhido.
- `tests/integration/campaign-crud.test.ts`:
  - `PATCH` sem `creativeLevel` não reseta para `balanced`.

### Manual / Hook

- Upload de referência: confirmar que imagem aparece no preview/comparativo após invalidação de `campaign-assets`.
- Testar manualmente:
  - "Variar formato" + `4:5` gera só 1 card.
  - "Variar arte" + "Ousado" injeta o prompt correto.
  - Cards exibem a peça inteira.
  - Aprovar/rejeitar na galeria persiste após reload.
  - "Equipe" aparece e "Integrações" fica inativo com "Em breve".

### TypeScript e Lint

- `npx tsc --noEmit --pretty false`
- `npm run lint`

---

## Assumptions

- "Prompt injection" aqui significa trecho de prompt controlado pelo produto, não instrução livre do usuário.
- Criatividade afeta somente "Variar arte".
- "Variar formato" continua focado em reconstruir a arte com os mesmos tokens visuais e economizar tokens gerando um formato por vez.
- Campanhas antigas sem `creativeLevel` passam a se comportar como `balanced` via default do banco.
