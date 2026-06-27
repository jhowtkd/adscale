# Stack de Qualidade — Essencial (4 blocos)

> **Em vez de stack de produção, foco em qualidade do conteúdo antes da produção.**
> Versão 2 (2026-06-26) — baseada no ADR [`0004-stack-qualidade.md`](../../docs/adr/0004-stack-qualidade.md).
> **Q3 (até set/2026):** sem YouTube no escopo (ADR 0009) → Bloco 2 e Bloco 3 não alimentam canal YouTube.

---

## 1. Por que qualidade, não produção

A intuição é simples: **sem qualidade de conteúdo, a melhor stack de produção só acelera a produção de lixo.**

Cada bloco deste stack é **acumulativo**: Consumo de segunda alimenta Banco de Teses na quarta, que alimenta brief no domingo, que alimenta peça na segunda seguinte. Fundação de conteúdo tem payback maior (cada tese no Banco dura meses) do que ferramenta de produção (cada template vira commodity em semanas).

Stack de produção entra **depois**, se a cadência travar. Não antes.

---

## 2. Os 4 blocos

### Bloco 1 — Consumo (diário, 30 min)

**Função:** alimentar inputs brutos pro Banco de Teses. Ler/assistir o que o ICP e o nicho estão dizendo.

**O que fazer (30 min, fragmentado no dia):**
- 10 min de manhã (café): LinkedIn feed + Twitter/X trending.
- 10 min no almoço: 1 newsletter (Lenny's, Marketing Brew, The Verge AI, Benedict Evans, Casey Winters — escolher 2 pra ler com calma).
- 10 min no fim do dia: salvar 1–2 posts de referência no IG (perfis de design, marketing, IA).

**Não fazer:** scroll infinito. Tempo fechado (timer 30 min).

**Output:** itens salvos em `banco-teses/inbox/` (markdown cru, sem filtro). Sessão-âncora de domingo transforma em teses.

---

### Bloco 2 — Pesquisa (semanal, 60 min, dentro da sessão-âncora DOM)

**Função:** trazer Tier 2 (concorrência + SEO) com critério.

**O que fazer (60 min no domingo, primeira hora da sessão-âncora):**
- 20 min — checar AdCreative.ai, Pencil, Madgicx, Canva Magic Studio, Adobe Firefly: postaram algo novo? Mudaram preço? Lançaram feature? Anotar em `banco-teses/sources/from-tier2/competitor-YYYY-WW.md`.
- 20 min — YouTube Search Autocomplete: digitar "como escalar criativos", "variação criativo", "briefing IA" e ver o que aparece. Anotar palavras-chave em `banco-teses/sources/from-tier2/seo-keywords-YYYY-WW.md`.
- 20 min — Google Trends Brasil + EUA: ver se "ADScale", "AdCreative", "creative ops" estão subindo. Anotar em `banco-teses/sources/from-tier2/trends-YYYY-WW.md`.

**Output:** 3 arquivos por semana em `from-tier2/`, com dados estruturados (concorrente X fez Y, palavra-chave Z tem volume W).

---

### Bloco 3 — Banco de Teses (contínuo, 10–15 min/inscrição)

**Função:** persistir ideias como **teses defensáveis**, não como frases soltas.

**O que é uma "tese":**

```markdown
### Tese #00X — [título em 1 frase]

**Pilar:** A — Tese / B — Experimento / C — Bastidor
**Tier de origem:** 1 / 2 / 3
**Data:** YYYY-MM-DD

**Claim:** [1 frase — o que defendemos]
**Prova:** [número / caso / comparação — o que sustenta]
**Implicação:** [1 frase — o que o ICP faz com isso]

**Status:** draft / ready / used YYYY-MM-DD
```

**Regra:** toda ideia que vira peça precisa virar tese antes. Se não consegue escrever claim + prova + implicação em 10 min, a ideia não está madura — volta pro `01-ideias.md`.

**Onde ficam as teses:**
- `marketing/2026-Q3/banco-teses/tese-00X-titulo-curto.md` (uma por arquivo, queryable via `grep`).

**Output:** Banco cresce ~3–5 teses por semana. Sessão-âncora de domingo usa 7 (uma por dia útil).

---

### Bloco 4 — Revisão automatizada Mavis (antes de publicar, 5–10 min/peça)

**Função:** gatekeeper que evita regressão de tom, fuga de pilares, e copy genérica.

**O que Mavis checa (checklist):**

| # | Check | Bloqueia? |
|---|-------|-----------|
| 1 | Tom founder-cientista (não coach, não guru, não corporativo) | Sim |
| 2 | Peso dos pilares A/B/C (Pilar C ≤ 20% no mês) | Não (alerta) |
| 3 | Vocabulário canônico presente (Curator, briefing, batch, throughput) | Alerta |
| 4 | Vocabulário proibido ausente (revolucionário, disruptivo, IA mágica, sinônimo de "drop/hype/cool/streetwear") | Sim |
| 5 | Pseudo-ciência ausente ("lab notebook" / "paper 0X" / "anomalia" em copy visível) | Sim |
| 6 | Regra 80/20/0 do ADR 0008 (zero íntimo) | Sim |
| 7 | Estrutura do pilar respeitada (Tese/Experimento/Bastidor) | Alerta |
| 8 | 1 CTA por peça (não 2+) | Sim |
| 9 | Hashtags dentro do limite (IG ≤10, LI ≤3) | Alerta |
| 10 | Tamanho de fonte (carrossel ≥28pt no export) | Manual |

**Onde roda:** segunda 8h (3 briefs Seg/Ter/Qua) + quinta 8h (2 briefs Qui/Sex). Mavis recebe o brief + esqueleto do pilar + contexto da ADRs, retorna checklist em 5 min.

**Output:** brief aprovado (vai pra produção) ou bloqueado (Jhonatan ajusta copy e resubmete).

---

## 3. Onde cada bloco opera no ritual

```
SEG 8h ─────→ [Bloco 4] revisão Mavis 3 briefs
                 ↓
SEG a SEX ────→ [Bloco 1] consumo 30 min/dia (paralelo à produção)
                 ↓
SEX 17h ─────→ review + alimentar Bloco 3 (tier 1 da semana)
                 ↓
DOM 19-21h ──→ [Bloco 2] pesquisa 60 min (concorrentes + SEO)
                 ↓
               [Bloco 3] priorizar teses + escrever 7 briefs
```

Bloco 1 (consumo) é o único que roda **fora** da sessão-âncora — é diário, paralelo à produção.

---

## 4. Ferramentas mínimas viáveis

| Bloco | Ferramenta |
|-------|------------|
| 1 — Consumo | Navegador + leitor RSS (Feedly ou similar) |
| 2 — Pesquisa | Navegador + planilha simples (ou `banco-teses/sources/from-tier2/*.md`) |
| 3 — Banco de Teses | Arquivos `.md` no repo (versionado com git) |
| 4 — Revisão Mavis | Sessão Mavis com CONTEXT.md + ADRs carregados |

**Não usar:** Notion, Trello, Airtable, ClickUp pra Banco de Teses ou Kanban. Repo + git + grep vencem em simplicidade e versionamento.

---

## 5. Métricas do stack (qualidade, não vaidade)

| Métrica | Meta mês 1 | Meta mês 3 |
|---------|------------|------------|
| Teses no Banco | 12 | 50 |
| Briefs revisados pelo Mavis | 16 | 60 |
| Taxa de bloqueio do Mavis | ≤30% | ≤15% (Jhonatan aprende o tom) |
| Tempo médio de revisão Mavis | ≤10 min | ≤5 min |

**Por que essas métricas importam mais que "posts publicados":**
- Banco de Teses cheio = pautas não-secantes.
- Mavis bloqueando menos = Jhonatan internalizou o tom.
- Cada bloco saudável → produção diária fica execução, não decisão.

---

## 6. Quando expandir pra stack de produção

**Sinais de que a cadência travou:**
- Banco de Teses saturado (não por falta de ideias, mas por saturação de execução).
- Briefs repetindo (mesma tese 2 semanas seguidas).
- Produção diária levando 2h+ por peça (cansaço acumulado).
- Mavis bloqueando consistentemente por motivo de **execução** (não de copy).

**Aí sim entra:**
- Canva Pro (template de carrossel com design system travado).
- CapCut desktop (edição de Reels mais rápida).
- Meta Business Suite (agendamento IG/Facebook).
- BIGVU (teleprompter no iPhone, fluidez de fala).
- Figma ou Penpot (arte de carrossel quando Canva não der conta).

**Mas não antes.** Stack de produção é otimização de execução. Stack de qualidade é fundação de conteúdo. Fundação vem antes.

---

## 7. Anti-padrões (não fazer)

- ❌ Montar stack de produção no dia 1 ("preciso de Canva, CapCut, teleprompter, agendador..."). Adia o que importa.
- ❌ Usar Notion/Trello pro Banco de Teses. Vira mais um sistema pra manter.
- ❌ Pular o Bloco 4 (revisão Mavis) "porque confio no meu tom". Mavis é o que **garante** consistência ao longo de meses.
- ❌ Tratar Consumo (Bloco 1) como scroll infinito. Timer 30 min ou não roda.
- ❌ Banco de Teses virar lixeira de frases soltas. Toda entrada precisa de claim + prova + implicação.

---

## 8. Conexão com o ritual e a cadência

- **Ritual de domingo (ADR 0003):** Bloco 2 (pesquisa) + Bloco 3 (Banco de Teses) rodam na sessão-âncora.
- **Cadência semanal (ADR 0002 + 0009):** **6 peças/semana no Q3** (3 IG + 3 LI, sem Short) são a saída do Bloco 3 + checagem do Bloco 4.
- **Fontes de pauta (ADR 0005):** Bloco 1 (consumo) = Tier 1 + Tier 3. Bloco 2 (pesquisa) = Tier 2.

---

*Mantido em `marketing/2026-Q3/` · PT-BR · Versão 2 · Última atualização: 2026-06-25 · Owner: Jhonatan Soares*
