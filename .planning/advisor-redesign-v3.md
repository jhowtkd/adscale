# Advisor Redesign — ADScale v0.3

> Substituir o checklist de auditoria pelo olhar de diretor de arte sênior. Manter score numérico, mas simplificar. Voz por cliente, começando com Cenbrap.

**Owner:** Jhonatan Soares (product/creative direction)
**Escopo:** readiness preflight + QA + scoring + quality gate + advisory UI
**Fora do escopo:** billing, multi-tenant, auth, export pipeline
**Prazo:** 6-7 semanas (1 fase por semana + 1 semana de cliente real)

---

## 1. Diagnóstico do advisor atual

A camada de advisor hoje é composta por 3 sistemas sobrepostos com prompts de mentalidade de auditor/QA genérico, e uma UI que mostra o que há de pior nesse modelo:

| Sistema | Arquivo | O que faz | Mentalidade |
|---|---|---|---|
| Preflight | `creative-readiness.ts` + `preflight-analysis.ts` | Roda no upload da peça base, dá score 0-100 em 7 dims (textLegibility, visualHierarchy, ctaProminence, brandConsistency, platformReadiness, technicalQuality, composition), define status `ready` / `needs_attention` / `blocked` | "Performance marketer" — checklist UX |
| QA (pós-geração) | `creative-qa.ts` | Roda no criativo derivado, gera checklist passed/warning/failed em 6 critérios (legibility, ctaOffer, informationPreservation, briefMatch, formatFit, creativeRisk), classifica como `ready` / `warning` / `review` / `failed` | "QA reviewer for paid social ads" — auditor |
| Score (pós-geração) | `creative-score.ts` | Roda junto com QA, dá score 0-100 em 7 dims (ctaClarity, textLegibility, briefMatch, visualQuality, formatFit, variationLevelFit, informationPreservation), produz `scoreIssues` e `regenerationSuggestion` | "Creative director" — mas o prompt é de scoring genérico |
| Quality gate | `creative-quality-gate.ts` | Consolida QA + score em 16 hard failure codes via regex (`WRONG_BRAND_PATTERN`, `CTA_DRIFT_NOTE_PATTERN`, `ILLEGIBILITY_PATTERN`, etc.) + polish suggestions. Veredito `invalid` / `improvable` / `acceptable` | Compliance officer — pattern matching |

**Problemas estruturais confirmados:**

1. **3 score breakdowns incompatíveis** (preflight: 7 dims, QA: 6 critérios, score: 7 dims) que não conversam entre si. A mesma peça recebe 3 sistemas de notas diferentes, em granularidades diferentes, e o usuário vê só um deles.
2. **Prompts genéricos** — nenhum fala Cenbrap, fala "performance marketer" / "paid social ads" / "expert creative director". É copywriting de blog de growth.
3. **Hard failure por regex** — `WRONG_BRAND_PATTERN = /brand mismatch|wrong brand|client mismatch|.../` é auditor de ticket, não advisor de visão.
4. **Score heurístico** (`scoreDerivationHeuristic`) — começa em 70, soma 5/10 por metadata presente. Gaming do score, não avaliação. Score 15 só aparece quando algo quebra, porque heurística não permite menos.
5. **Override é um clique** — `useReadinessOverride.mutateAsync` sem justificativa, dispara `cockpit_stage_completed`. Não é bloqueio, é checkbox de "aceito o risco".
6. **Briefing incompleto não bloqueia** — `creative-readiness.ts:164-168` apenas adiciona à lista de blockingIssues, mas o override de um clique passa por cima.
7. **Não há voz do cliente** — Cenbrap, MedAula, qualquer cliente recebem o mesmo tratamento.
8. **i18n poluído** — "Atenção — Review before export" é literal; "Pacote de aprovação", "Link de compartilhamento", "Aprovação do cliente" são 3 labels pra mesma feature.
9. **Sem normalização de caracteres** — NBSP, ponto final, hifens se perdem entre brief e modelo.

**Consequência:** Cenbrap Pediatria rodou com score 15 e foi aprovada porque a aprovação só bloqueia em "invalid" com hard failure, e nenhuma das hard failures regex disparou.

---

## 2. Princípios do redesign

Quatro princípios guiam todas as decisões. Se uma decisão fere qualquer um deles, volta pra prancheta.

### P1 — Olhar, não checklist
O advisor fala como diretor de arte sênior, não como auditor de compliance. Diagnóstico em prosa curta, vocabulário de design gráfico editorial (ponto focal, hierarquia, peso, respiro, malha, intenção), zero "violation" / "invalid" / "fraco" / "forte".

### P2 — Score simplificado, mas mantido como radar
Em vez de 6-7 dimensões fragmentadas, **4 eixos** que conversam entre si:
- **Foco** (o ponto focal sustenta a leitura?)
- **Hierarquia** (peso e escala decidem a ordem de leitura?)
- **Voz** (a peça fala a língua do cliente Cenbrap ou fala "ad genérico"?)
- **Prontidão** (BriefMatch, CTA exato, formato, plataformas — determinístico)

Cada eixo tem score 0-100. Score geral é média ponderada. O score numérico vira **radar visual** (4 eixos), não lista de 6 linhas com nota.

### P3 — Voz por cliente, com biblioteca editorial
Cada cliente tem um documento "olhar [cliente]" carregado no prompt. Cenbrap primeiro. Voz = princípios editoriais + vozes proibidas + padrões visuais + ritmos de CTA + anti-referências.

### P4 — Gate forte, override com razão
- Briefing incompleto **bloqueia** geração (não passa override).
- Hard failure por categoria (não por regex) **bloqueia** aprovação.
- Score < 40 **não pode ser `acceptable`** sem override com **razão digitada** (mín. 30 chars).
- Override vira log de auditoria, não clique mudo.

---

## 3. Fases

### Fase 0 — Fundação (semana 1)

**Entregáveis:**
- Documento `olhar-cenbrap.md` em `app/src/server/ai/voices/cenbrap.md` — princípios editoriais Cenbrap: o que é voz Cenbrap, o que é template genérico, anti-referências (MedAula é o benchmark, o que evitar), padrões de headline, ritmos de CTA, paletas, hierarquia típica, dialeto (pt-BR, quando usar imperativo, quando usar pergunta, etc).
- Token system `clientVoice` carregado no `creative-contract.ts`. Em v1: `cenbrap` hardcoded; em v2: campo no `brand_kit` do workspace.
- Decidir 4 eixos do score (Foco, Hierarquia, Voz, Prontidão) e pesos: 25/25/30/20 (Voz tem mais peso porque é a alma do brief).

**Critério de done:** o doc `olhar-cenbrap.md` é revisado por Jhonatan e aprovado como "isso é o meu olhar".

---

### Fase 1 — Advisor editorial (semanas 2-3)

**Entregáveis:**
- Reescrever `buildPreflightSystemPrompt` (preflight-analysis.ts) com mentalidade editorial:
  - 3 perguntas de designer (em vez de 7 dims): "o ponto focal sustenta?", "a hierarquia tem intenção?", "a peça tem voz Cenbrap?"
  - Mais 1 campo `editorialDiagnosis: string` — 2-3 frases em prosa, vocabulário de DA sênior, **pt-BR sempre**.
  - Score 0-100 em 4 eixos, não 7.
  - Manter `technical` metadata (não é LLM que decide).
- Reescrever `buildCreativeQaPrompt` (creative-qa.ts) com a mesma mentalidade. QA pós-geração vira "essa peça tem alma Cenbrap?".
- Reescrever `buildCreativeScorePrompt` (creative-score.ts) — idem. Score vira diagnóstico, não auditoria.
- Remover `scoreDerivationHeuristic` — score sem visão é cinismo. Se não tem análise LLM, status fica `pending`.
- Adicionar campo `editorialVerdict: "veicular" | "quase" | "refazer"` no resultado de preflight e QA. Esse é o "veredito" do designer; o score numérico é o radar.

**Critério de done:** rodar Cenbrap Pediatria com prompts novos, comparar antes/depois. Peça que antes foi score 15 + aprovada, agora deve receber `editorialVerdict: "refazer"` com diagnóstico claro do tipo "o headline está disputando com o selo, o ponto focal morreu".

**Não-óbvio:** o prompt novo precisa ser testado com 5+ imagens reais (não só com a Pediatria). Provavelmente vai ter prompt iteration. Reservar 2-3 dias pra isso.

---

### Fase 2 — Validador determinístico separado (semana 4)

**Entregáveis:**
- Novo módulo `app/src/server/ai/deterministic-validator.ts`:
  - BriefMatch: cliente do criativo == cliente da campanha (string match + fuzzy)
  - CTA exato: extrai CTA do criativo via Vision (ou heurística de string em metadata), compara com contract.ctaSemantics
  - Formato: ratio bate com `targetFormat`
  - Plataformas: dims dentro de range do formato alvo
  - Caracteres: NBSP, ponto final no CTA, aspas tipográficas, hifens
  - Briefing completo: campaignBrief com offer + product + platforms + audience
- Substituir o uso de regex patterns de `creative-quality-taxonomy.ts` por esse validador. Os 16 hard failure codes viram ~5 categorias semânticas (brand_drift, cta_drift, offer_drift, format_invalid, briefing_incomplete).
- Atualizar `creative-quality-gate.ts` para consumir o validador determinístico + advisory editorial.

**Critério de done:** Cenbrap Pediatria com marca errada (teste 5) deve ser bloqueado com mensagem clara tipo "esse criativo não é Cenbrap — peça base é outro cliente", e não com "BriefMatch violation" genérico.

---

### Fase 3 — Gate forte + override com razão (semana 5)

**Entregáveis:**
- Briefing incompleto **bloqueia** de verdade (não passa mais por override).
- `useReadinessOverride` vira `useReadinessOverrideWithReason` — modal exige mínimo 30 chars de justificativa, fica logado em `readiness_override_audit` com user, campaign, asset, reason, timestamp.
- Score < 40 vira `editorialVerdict: "refazer"` automaticamente, e o botão de aprovação fica disabled.
- Remover "Atenção — Review before export" como aviso duplo (atualmente aparece como "Atenção" e "Revisar — Review the creative before export"). Escolher um label e usar.
- "BLOQUEADO" coerente — se tem botão "Ignorar e continuar" é aviso, não bloqueio. Ou remove o botão, ou renomeia o status.

**Critério de done:** tentar aprovar uma peça com briefing incompleto é tecnicamente impossível sem override com razão digitada. Tentar aprovar peça com score 18 é impossível.

---

### Fase 4 — UI, i18n e polimento (semana 6)

**Entregáveis:**
- Componente `AdvisorRadar` — 4 eixos (Foco, Hierarquia, Voz, Prontidão) em gráfico radar (SVG), substitui a lista de 6 linhas.
- Componente `EditorialVerdict` — pill grande no topo: `veicular` (verde) / `quase` (âmbar) / `refazer` (rose), com 2-3 frases do designer.
- Renomear feature de aprovação do cliente — escolher "Pacote de aprovação" e usar em todos os lugares (i18n, navegação, modal, e-mail).
- i18n 100% pt-BR — varrer `messages/pt-BR.json` e tirar "Atenção — Review before export", "BriefMatch violation", "Brand presence missing", etc.
- Modal de override limpo: campo de texto obrigatório, link pra abrir o criativo no editor, confirmação visual.
- Desabilitar aprovação quando bloqueio forte, com tooltip explicando o porquê.

**Critério de done:** Cenbrap Pediatria rodada 3 (Cenbrap da Cenbrap em Dobro) com score 15 atual passa a aparecer como `editorialVerdict: "refazer"` com radar e prosa; usuário não consegue aprovar sem override + razão.

---

### Fase 5 — Cliente real + calibração (semana 7)

**Entregáveis:**
- Cenbrap Pediatria rodada completa com o novo advisor — gerar 10 criativos, ranquear por `editorialVerdict`, comparar com julgamento do Jhonatan.
- Calibrar pesos do radar: se 80% das peças com `veicular` realmente veiculam (julgamento do Jhonatan), pesos estão bons. Se não, ajustar.
- Documentar 5-10 padrões Cenbrap observados: "headline sempre é pergunta", "CTA sempre em caps com ponto", "selo MEC sempre canto superior direito", etc. Alimentar `olhar-cenbrap.md`.
- Decidir se o advisor já vaza pra MedAula como segundo cliente (provavelmente não, mas a estrutura tem que estar pronta).

**Critério de done:** 70%+ de concordância entre `editorialVerdict: "veicular"` e julgamento do Jhonatan. Pelo menos 1 caso documentado onde o advisor pega algo que o Jhonatan deixaria passar (e vice-versa).

---

## 4. O que NÃO está neste plano

Por escopo, estes itens ficam pra outro ciclo:

- **"999999" saldo placeholder** — bug de billing, não de advisor. Abrir issue separada.
- **Contaminação cross-campaign** — investigar cache de prompt ou template global. Pode ser fix de 1-2 dias; abrir issue separada.
- **Normalização de caracteres do CTA** — vai junto na Fase 2 (validador determinístico cuida de NBSP, ponto final, aspas).
- **Multi-tenant por voz** — v2. Por enquanto, voz Cenbrap hardcoded + estrutura pra plugar outras.
- **Advisor pra vídeo** — fora do escopo. ADScale é só estático.

---

## 5. Riscos

| Risco | Mitigação |
|---|---|
| Prompt editorial do LLM ainda produzir "violation" / "invalid" | Few-shot no prompt com 5 exemplos de prosa editorial boa. Calibração na Fase 1. |
| Score 4 eixos ter granularidade baixa pra detectar coisas finas (e.g. 60 vs 65) | Manter `scoreBreakdown` interno detalhado (7 dims) pra analytics, mas UI mostra 4 eixos. |
| Override com razão virar burocracia | Logar e medir: se > 30% dos overrides forem em uma mesma categoria, é sinal de que o advisor tá pegando falso positivo. |
| Cenbrap ser voz demais (regras que não generalizam pra MedAula) | Voz fica em arquivo separado, fácil de reescrever/swap. Fase 5 valida estrutura. |
| Tempo de geração aumentar (LLM fazendo mais análise) | LLM já é chamado; prompt maior não muda tempo. Resize da imagem já está em 2048px (fase 1 não muda isso). |

---

## 6. Próximo passo

A Fase 0 é pré-requisito de tudo. Escreve o `olhar-cenbrap.md` no formato abaixo e a Fase 1 começa.

```markdown
# Olhar Cenbrap

## Princípios editoriais
- [3-5 frases que definem o que é uma peça Cenbrap de verdade]

## O que é voz Cenbrap
- [exemplos positivos: "headline curto, imperativo, peso alto", "selo MEC como ponto de ancoragem", "CTA em caps com ponto"]

## O que NÃO é voz Cenbrap
- [exemplos negativos: "template genérico de growth", "foto stock sem alma", "CTA sem pontuação", "headline explicativo"]

## Anti-referências
- MedAula: o que NÃO copiar (perderia identidade)

## Dialeto
- pt-BR, sem anglicismos desnecessários, voz ativa, sem gerúndio
```

Estimativa Fase 0: 1 sessão de trabalho (3-4h) com revisão. Depois Fase 1 começa.
