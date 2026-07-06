# Image Harness Blind Gate — Relatório de Correção

**Data da revisão humana:** 2026-07-06  
**Evidence:** `.planning/validation/image-harness-blind-gate.json`  
**Imagens:** `.planning/validation/blind-gate-images/`  
**Review UI:** `.planning/validation/blind-gate-review.html`

---

## 1. Veredito e como interpretar

| Métrica | Valor | Limiar do gate |
|--------|-------|----------------|
| Preferência recalibrated | **11/12 (91,7%)** | ≥ 60% |
| Regressões objetivas | **2** (pair-09, pair-10) | 0 |
| **Resultado** | **FAIL** | PASS exige os dois |

**Leitura:** A recalibração ganhou em direção de arte quase sempre, mas **não está pronta para release** enquanto restyling inventar marca no output preferido. O único par onde baseline venceu foi **pair-07** (format_adaptation 1:1 bold) — recalibrated tinha CTA grande demais.

**Importante:** Regressão objetiva foi marcada no **output que você preferiu** (recalibrated), não no que perdeu. Isso é correto para o gate: preferência alta não compensa defeito factual.

---

## 2. Mapa rápido dos 12 pares

| Par | Modo | Formato | Fidelity | Preferido | Regressão | Nota-chave |
|-----|------|---------|----------|-----------|-----------|------------|
| 01 | art_variation | 1:1 | conservative | recalibrated | não | CTA botão gigante (mesmo no preferido) |
| 02 | art_variation | 4:5 | balanced | recalibrated | não | Indistinguível de pair-01 (conservative) |
| 03 | art_variation | 9:16 | bold | recalibrated | não | CTA grande; **baseline** = style ref paste |
| 04 | art_variation | 1:1 | extreme | recalibrated | não | Paleta deve persistir no extreme |
| 05 | format_adaptation | 9:16 | conservative | recalibrated | não | — |
| 06 | format_adaptation | 4:5 | balanced | recalibrated | não | Indistinguível de 05 |
| 07 | format_adaptation | 1:1 | bold | **baseline** | não | Fidelity flat 05–07; CTA grande no recalibrated |
| 08 | format_adaptation | 9:16 | extreme | recalibrated | não | Fidelity flat 05–08; CTA grande |
| 09 | restyling | 1:1 | conservative | recalibrated | **sim** | **Marca inventada** |
| 10 | restyling | 4:5 | balanced | recalibrated | **sim** | **Marca inventada**; baseline = style paste |
| 11 | restyling | 9:16 | bold | recalibrated | não | — |
| 12 | restyling | 1:1 | extreme | recalibrated | não | Baseline = style paste |

**Campanhas e assets usados**

| Slug | Marca permitida (registry) | Base asset | Style asset |
|------|---------------------------|------------|-------------|
| teste-3-nr1 | CENBRAP | `nr1-1x1-base.png` | — |
| teste-campanha-nr1 | Master NR1 | `master-nr1-base.png` | — |
| nova-campanha | Instituto Educação+ | `educacao-base.png` | `educacao-style-ref.png` |

---

## 3. Cinco temas — diagnóstico profundo

### Tema A — Marca inventada em restyling (P0 — bloqueia gate)

**Pares:** 09, 10  
**Sintoma:** Output recalibrated preferido exibe marca/nome que não existe no base nem no briefing.  
**Sua regra de produto:** “Quando não houver [marca], não deve inventar.”

**Hipótese técnica**

1. **Style reference vence o base** — modelo copia wordmark/layout da `educacao-style-ref.png` apesar das regras de factual-source.
2. **Registry tem marca, base pode não ter logo** — `nova-campanha` lista `Instituto Educação+`, mas se o PNG base não mostra logo, o modelo “completa” com marca da style ref ou inventada.
3. **QA pós-geração não pegou antes do humano** — gate só bloqueia se `briefMatch` / `styleFidelity` falharem com notas que batem nos patterns (`WRONG_BRAND_PATTERN`, `INVENTED_ENTITY_PATTERN`).

**Onde atuar no código**

| Camada | Arquivo | O que falta / reforçar |
|--------|---------|------------------------|
| Prompt geração | `per-mode-prompt-rules.ts` → `buildRestylingModeRulesSection` | BRAND LOCK (já adicionado localmente) |
| Prompt geração | `prompt-builder.ts` → `buildRestylingFactualSourceRuleSection` | proibir inventar brand (já adicionado) |
| Prompt geração | `factual-visual-separation.ts` | não colar layout da style ref (já adicionado) |
| QA | `creative-qa.ts` | instrução restyling `wrong_brand` / `invented_factual_entity` (já adicionado) |
| Gate | `creative-quality-gate.ts` | já mapeia patterns → hard failure |
| Retry | `derivation-auto-retry-policy.ts` | `wrong_brand` / `invented_factual_entity` já são retryable |
| **Gap** | `generation-direction.ts` → `buildVariationRangeLines` | restyling **ignora** `creativeLevel`; mensagem genérica |
| **Gap** | Contrato / UI | não há flag `logoRequired: false` ou `allowInventedBrand: false` explícita no `CreativeContract` de derivação |

**Correções recomendadas (ordem)**

1. **Pós-geração obrigatória:** rodar QA nos PNGs de pair-09/10 e inspecionar se `briefMatch` falhou; se passou, ajustar patterns em `creative-quality-taxonomy.ts` ou instruções QA.
2. **Prompt mais duro no restyling:** adicionar linha explícita com allowed brand list: “Única marca permitida: Instituto Educação+ — se ausente no base, **omitir** logo, não inventar.”
3. **Contrato:** `resolveCanonicalCreative` → tier mandatory remover `"logo if present"` ambíguo; usar `logo if visible in base`.
4. **Re-gerar só 09–10** e revalidar gate.

**Como validar**

```bash
cd app
npx tsx scripts/run-image-harness-blind-comparison.ts --pair pair-09
npx tsx scripts/run-image-harness-blind-comparison.ts --pair pair-10
# Inspecionar PNGs + rodar scoring manual se necessário
```

---

### Tema B — Style reference copiada como anúncio (P1)

**Pares:** 03 (baseline art_variation), 10 (baseline restyling), 12 (baseline restyling)  
**Sintoma:** Opção perdedora reproduz o **anúncio da referência de estilo**, não o anúncio-base.

**Diagnóstico**

- Em **pair-03** o modo é `art_variation` mas o **baseline** veio do corpus `format_adaptation` 9:16 (`27069645`) — possível confusão metodológica no harness, não só bug de modelo.
- Em **pair-10/12** baseline veio de `d7d9d323` (restyling corpus) — baseline histórico já contaminado por style ref.

**Causa raiz provável**

| Tipo | Descrição |
|------|-----------|
| Harness | `baselineSource` mistura validation-after, corpus de outro modo/formato |
| Produto | Restyling sem enforcement forte de “abstract style only” |
| QA | `styleFidelity` só em restyling com `styleAssetId`; art_variation não tem critério equivalente |

**Correções recomendadas**

1. **Harness:** para art_variation, baseline só de `validation-after` ou corpus com mesmo `generation_mode` + `format`.
2. **Produto:** instrução QA em art_variation quando há `clientReferences` style — opcional.
3. **Restyling:** reforço já feito em QA (`full ad layout` fail) — **confirmar com nova geração**.

**Arquivos**

- `app/scripts/run-image-harness-blind-comparison.ts` → `resolveBaselineBuffer` (priorizar match de modo)
- `app/scripts/blind-gate-pair-specs.ts` → revisar `baselineCorpusRefId` por par

---

### Tema C — Bandas de fidelity indistinguíveis (P1)

**Pares:** 02 vs 01, 06 vs 05, 07–08 vs 05–06  
**Sintoma:** conservative / balanced / bold / extreme **parecem iguais** na prática.

**Causa raiz no código (confirmada)**

```
prompt-builder.ts (linha ~464):
  CREATIVITY_TEMPLATES só são anexados se generationMode === "art_variation"

generation-direction.ts → buildVariationRangeLines():
  format_adaptation → retorno FIXO (ignora creativeLevel)
  restyling         → retorno FIXO (ignora creativeLevel)
  art_variation     → usa creativeLevel
```

**Consequência**

| Modo | O que o prompt recebe hoje para fidelity |
|------|------------------------------------------|
| art_variation | `REFERENCE FIDELITY: {level}` + bloco `CREATIVITY LEVEL: {level}` + Olhar `Creative level: {level}` |
| format_adaptation | só `REFERENCE FIDELITY: {level}` no canonical block — **sem template operacional** |
| restyling | idem — **sem template** |

Por isso pairs **05–08** (todos format_adaptation) não diferenciam bandas: o modelo só vê uma linha `REFERENCE FIDELITY: conservative|balanced|bold|extreme` sem regras operacionais distintas.

Pairs **01–02** (art_variation) têm templates, mas:
- Mesmo `baseAsset` (`nr1-1x1-base.png`), formatos diferentes (1:1 vs 4:5) — difícil comparar só fidelity.
- Modelo pode ignorar bloco longo no meio do prompt.

**Correções recomendadas**

1. **Extrair** `CREATIVITY_TEMPLATES` para módulo compartilhado e anexar em **format_adaptation** e **restyling** com adaptação de texto (“layout rebuild distance” vs “style transfer strength”).
2. **format_adaptation** por nível, exemplo:
   - conservative: rearranjo mínimo, máxima fidelidade ao layout source
   - balanced: reorganizar zonas, mesma identidade
   - bold: recompor hierarquia agressivamente no novo formato
   - extreme: novo ritmo espacial mantendo facts + palette family
3. **restyling** por nível:
   - conservative: transferência sutil de textura/tipo
   - extreme: transferência forte de mood/luz, facts locked
4. **Scoring:** `creative-score.ts` já pede `variationLevelFit` — verificar se prompt de score repete distinção por modo.
5. **Blind harness:** comparar fidelity **no mesmo formato** (ex.: três art_variation 1:1 com níveis diferentes) numa rodada B.

**Arquivos**

- `app/src/server/ai/prompt-builder.ts`
- `app/src/server/ai/olhar/generation-direction.ts`
- `app/src/server/ai/canonical-creative-contract.ts` (`FIDELITY_RANGE_MIN_SCORE`)

---

### Tema D — CTA botão gigante (P2 — advisory, mas afeta preferência)

**Pares:** 01, 03, 07 (recalibrated), 08  
**Sintoma:** CTA opcional OK, mas quando renderiza vira **pill/bar dominante**.

**Diagnóstico**

- Recalibração removeu hard rule de CTA literal → modelo exagera prominence.
- `VISUAL_HIERARCHY_CONTRACT` já lista `volumetric CTA pills` como anti-pattern genérico AI — fraco demais.
- CTA scale era **advisory** por design pós-recalibração; humano ainda penaliza no ranking.

**Correções recomendadas**

1. **Prompt (já iniciado):** `CTA SCALE (advisory)` no canonical block.
2. **Reforço Olhar:** em `generation-direction.ts` → `buildGestaltLines` ou anti-patterns: “invite weight: secondary to hook, not full-width bar unless source had one”.
3. **QA ranking:** `creativeRisk` note template para “CTA dominates canvas” — **não** hard fail.
4. **Opcional produto:** setting `ctaProminence: subtle | standard | bold` no campaign — futuro.

**Não fazer:** voltar CTA mandatory ou % de canvas como hard rule (contraria design aprovado).

---

### Tema E — Paleta no extreme (P2 — feature / policy)

**Par:** 04  
**Sintoma:** No extreme, composição pode mudar muito, mas **família cromática da referência** deve persistir.

**Diagnóstico**

- Template `extreme` dizia “Preserve only: brand identity (logo behavior, palette family)” mas era vago.
- Não existe `allowColorRestyling: boolean` no contrato — impossível opt-in explícito.

**Correções recomendadas**

1. **Prompt (já iniciado):** “palette family unless color restyling explicitly requested”.
2. **Contrato:** adicionar `colorRestyling?: "preserve" | "allow"` em `CanonicalCreativePolicy` (default `preserve`).
3. **UI futura:** toggle “Reestilizar cores” separado de nível extreme.
4. **Score:** sub-score ou nota em `variationLevelFit` para drift de paleta.

---

## 4. Análise par a par (para correção manual)

### pair-01 — art_variation / 1:1 / conservative

- **Preferido:** recalibrated (B)
- **Imagens:** `pair-01-baseline.png` vs `pair-01-recalibrated.png`
- **Baseline:** validation-after recente (`00c65d9c`)
- **Problema residual:** CTA oversized no preferido
- **Ação:** ajustar Tema D; não é regressão objetiva
- **Re-test:** opcional após prompt CTA

### pair-02 — art_variation / 4:5 / balanced

- **Preferido:** recalibrated
- **Baseline:** corpus `format_adaptation` 4:5 — **metodologia fraca** para comparar art_variation
- **Problema:** indistinguível de pair-01 (conservative)
- **Ação:** Tema C + melhorar baseline; considerar art_variation 4:5 validation-after como baseline

### pair-03 — art_variation / 9:16 / bold

- **Preferido:** recalibrated
- **Baseline:** corpus format_adaptation 9:16 — outro modo
- **Problemas:** CTA grande (preferido); baseline = style paste (Tema B)
- **Ação:** baseline harness + CTA prompt

### pair-04 — art_variation / 1:1 / extreme

- **Preferido:** recalibrated
- **Problema:** palette drift no extreme
- **Ação:** Tema E + confirmar visualmente se recalibrated respeitou CENBRAP/Master palette

### pair-05 — format_adaptation / 9:16 / conservative

- **Preferido:** recalibrated
- **Sem nota negativa** — referência positiva para format_adaptation

### pair-06 — format_adaptation / 4:5 / balanced

- **Indistinguível de 05** → Tema C prioritário (templates por nível em format_adaptation)

### pair-07 — format_adaptation / 1:1 / bold

- **Único preferido baseline** — recalibrated (A na UI) perdeu por CTA grande + falta de ganho de fidelity
- **Ação:** Tema C + D; investigar se bold deveria ser mais agressivo que balanced ou se 1:1 adaptation é inherentemente conservador

### pair-08 — format_adaptation / 9:16 / extreme

- **Preferido:** recalibrated com CTA grande
- **Fidelity flat** vs 05–07

### pair-09 — restyling / 1:1 / conservative ⚠️

- **Regressão objetiva:** marca inventada no recalibrated preferido
- **Assets:** educacao-base + educacao-style-ref
- **Ação imediata:** Tema A — regerar e garantir gate automático bloqueie

### pair-10 — restyling / 4:5 / balanced ⚠️

- **Regressão objetiva:** marca inventada no recalibrated (opção A)
- **Baseline:** style paste (opção B)
- **Ação:** Tema A + B; formato 4:5 força adaptação + restyling — maior risco de contaminação

### pair-11 — restyling / 9:16 / bold

- **Preferido:** recalibrated, sem regressão — usar como referência do que funciona

### pair-12 — restyling / 1:1 / extreme

- **Preferido:** recalibrated
- **Baseline:** style paste — problema histórico, não do recalibrated

---

## 5. Mudanças já feitas localmente (não commitadas)

Estas alterações endereçam parte dos temas mas **não substituem** re-geração e nova revisão humana:

| Arquivo | Mudança |
|---------|---------|
| `canonical-creative-contract.ts` | `CTA SCALE (advisory)` |
| `prompt-builder.ts` | `DISTANCE FROM OTHER BANDS`, palette family no extreme, restyling factual-source expandido |
| `per-mode-prompt-rules.ts` | `BRAND LOCK`, anti style-ref paste |
| `factual-visual-separation.ts` | anti full-layout paste |
| `creative-qa.ts` | restyling brand + styleFidelity layout |
| Testes | `blind gate follow-up` em prompt-builder + creative-qa |

**Ainda não implementado (gaps críticos):**

- `CREATIVITY_TEMPLATES` para `format_adaptation` e `restyling`
- `buildVariationRangeLines` sensível a `creativeLevel` em todos os modos
- Flag `colorRestyling` no contrato
- Baseline harness alinhado por modo/formato
- Verificação automática de que QA bloqueou pair-09/10 antes do humano

---

## 6. Roadmap de correção priorizado

### Fase 1 — Desbloquear gate (1–2 dias)

| # | Tarefa | Esforço | Validação |
|---|--------|---------|-----------|
| 1.1 | Confirmar QA falha em pair-09/10 PNGs atuais | S | log `hardFailures` |
| 1.2 | Prompt allowed-brand explícito no restyling | S | teste prompt-builder |
| 1.3 | Re-gerar pair-09, pair-10 | M | novo PNG |
| 1.4 | Revisão humana só desses 2 pares | S | atualizar JSON |
| 1.5 | `check-image-harness-blind-gate.ts` → PASS | S | exit 0 |

### Fase 2 — Fidelity bands (2–3 dias)

| # | Tarefa | Esforço | Validação |
|---|--------|---------|-----------|
| 2.1 | Templates por nível em format_adaptation | M | 4 prompts diff |
| 2.2 | Templates por nível em restyling (transfer strength) | M | 4 prompts diff |
| 2.3 | `buildVariationRangeLines` usa creativeLevel em todos modos | S | unit test |
| 2.4 | Rodada B blind: 4× art_variation 1:1 só mudando level | L | humano |

### Fase 3 — Polish (1–2 dias)

| # | Tarefa | Esforço |
|---|--------|---------|
| 3.1 | CTA scale no Olhar generation-direction | S |
| 3.2 | `colorRestyling` opt-in no policy | M |
| 3.3 | Baseline harness por modo/formato | S |

---

## 7. Protocolo de re-validação

1. Implementar fase 1 (mínimo).
2. Regenerar pares afetados:
   ```bash
   cd app
   npx tsx scripts/run-image-harness-blind-comparison.ts --skip-regen  # ou sem skip para regen
   ```
3. Abrir `blind-gate-review.html` — conferir paths `blind-gate-images/`.
4. Atualizar `image-harness-blind-gate.json`:
   - `preferred`, `objectiveRegression`, `reviewerNote` por par
   - `status: "completed"`
5. Rodar checker:
   ```bash
   npx tsx scripts/check-image-harness-blind-gate.ts ../.planning/validation/image-harness-blind-gate.json
   ```
6. Rodar suíte focada:
   ```bash
   npm test -- src/server/ai/prompt-builder.test.ts src/server/ai/creative-qa.test.ts tests/unit/ai/creative-quality-gate.test.ts
   ```

---

## 8. Perguntas para você decidir (produto)

1. **Marca ausente no base:** omitir logo sempre, ou permitir texto da marca do registry sem logo gráfico?
2. **Extreme + cores:** default `preserve palette family` está OK? Onde expor opt-in na UI?
3. **CTA grande:** aceitável como advisory forever, ou virar setting de campanha?
4. **Blind gate round B:** quer comparar 4 níveis no **mesmo** 1:1 para isolar fidelity, ou manter matriz 12 pares?

---

## 9. Referências de código

| Conceito | Arquivo principal |
|----------|-------------------|
| Policy / canonical block | `app/src/server/ai/canonical-creative-contract.ts` |
| Fidelity templates (só art_variation hoje) | `app/src/server/ai/prompt-builder.ts` |
| Olhar variation (format/restyling flat) | `app/src/server/ai/olhar/generation-direction.ts` |
| Restyling mode rules | `app/src/server/ai/per-mode-prompt-rules.ts` |
| QA prompt | `app/src/server/ai/creative-qa.ts` |
| Hard failures | `app/src/server/ai/creative-quality-gate.ts` |
| Retry objective only | `app/src/server/ai/derivation-auto-retry-policy.ts` |
| Blind harness | `app/scripts/run-image-harness-blind-comparison.ts` |
| Pair matrix | `app/scripts/blind-gate-pair-specs.ts` |
| Design aprovado | `docs/superpowers/specs/2026-07-05-image-generation-harness-recalibration-design.md` |

---

*Gerado para apoiar correção pós blind gate. Atualize este arquivo quando fechar Fase 1 ou completar round B.*
