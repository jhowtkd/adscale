# 0005 — Fontes de pauta Tier 1 (60%) / Tier 2 (30%) / Tier 3 (10%)

**Data:** 2026-06-25
**Status:** ✅ Aceita
**Decisor:** Jhonatan Soares (founder)

## Contexto

O `plano-redes-sociais.md` original listava fontes dispersas (concorrentes, SEO, trends, comunidade, perguntas) sem hierarquia. Resultado: pautas sem critério de priorização — Jhonatan pegava o que estava "na moda" sem checar se era o que o ICP precisava ouvir.

A regra dos 3 pilares Lab Notes (ADR 0001) precisa de uma **hierarquia de fontes** que force o feed a puxar mais do ICP direto e menos do "achismo do algoritmo".

## Decisão

Adotar **hierarquia balanceada** de fontes de pauta, com pesos fixos:

| Tier | Peso | Fontes | Por quê |
|------|------|--------|---------|
| **Tier 1** | **60%** | **Perguntas + Bastidor + Trends** | O ICP fala (DMs, comentários, e-mails) → pautas sob demanda. O ADScale fala (o que está sendo construído) → pautas autênticas. Trends do nicho → pautas freshness. |
| **Tier 2** | **30%** | **Concorrência + SEO** | Saber o que AdCreative.ai / Pencil / Madgicx fazem diferencia ADScale. SEO (palavras-chave que o ICP busca) garante que pautas têm demanda comprovada. |
| **Tier 3** | **10%** | **Newsletters** | Lenny's, Marketing Brew, The Verge AI, Benedict Evans, Casey Winters. **Leitura, não cópia.** Funciona como "arroz" — não alimenta sozinho mas dá textura. |

**Por que 60/30/10 (não 50/30/20 ou 70/20/10):**
- **60% Tier 1** garante que o feed fala com o ICP, não sobre o ICP. 50% seria arriscado (puxar demais da newsletter = virar curador, não autor).
- **30% Tier 2** mantém ADScale competitivo (saber o que concorre) sem virar reativo.
- **10% Tier 3** é o "arroz". Newsletters são úteis mas não são fonte primária.

**Operacionalização no ritual semanal (ADR 0003):**
- **Consumo diário (30 min)** = Tier 1 (perguntas reais que apareceram em DM/comentário) + Tier 3 (skim de newsletters).
- **Pesquisa semanal DOM (60 min)** = Tier 2 (concorrência + SEO) + validação Tier 1 (trends).
- **Sessão-âncora DOM 19–21h** = cruza os 3 tiers com Banco de Teses pra escolher 7 peças.

## Consequências

**Mais fácil:**
- Sessão-âncora de domingo fica **estruturada**: começa olhando Tier 1 (60% do input), valida com Tier 2 (30% do filtro), tempera com Tier 3 (10% de textura).
- Quando Jhonatan travar, pergunta: "qual foi a última pergunta real que recebi?" (Tier 1) — resolve em 80% dos casos.

**Mais difícil:**
- **Tier 1 exige escuta ativa.** Jhonatan precisa responder DMs/comentários não só por educação, mas pra **alimentar a próxima pauta**. Mitigação: prática de "terminou de responder? anota em `marketing/2026-Q3/banco-teses/sources/tier1-perguntas-YYYY-WW.md`".
- **Tier 2 (concorrência) tem custo de pesquisa.** Não dá pra "sentir" o que AdCreative.ai está fazendo — precisa checar 1×/semana. Mitigação: 60 min DOM já dedicados.
- **Tier 3 (newsletters) tem tentação de virar distração.** Risco: Jhonatan gasta 30 min de "consumo" lendo newsletter sem filtrar. Mitigação: regra "skim only" — ler título + 1º parágrafo, salvar só se virar tese.

**Destrava:**
- A regra 60/30/10 vira **filtro de qualidade**: se pauta não veio de Tier 1 ou 2, provavelmente é distração de Tier 3 inflada.
- Banco de Teses organizado por tier: `banco-teses/from-tier1/`, `from-tier2/`, `from-tier3/`. Domingo olha `from-tier1` primeiro.

## Alternativas consideradas

- **50/30/20:** rejeitado. Tier 1 precisa ser maioria absoluta pra forçar escuta ativa.
- **70/20/10:** rejeitado. Mata Tier 2 (concorrência), que é o que diferencia ADScale.
- **33/33/33 (sem hierarquia):** rejeitado. Sem hierarquia, Tier 3 (newsletters) domina silenciosamente — é o mais fácil de consumir.
- **Sem Tier 3 (só Tier 1 + 2):** rejeitado. Newsletters dão contexto de fora do nicho (AI macro, growth macro). 10% é o sweet spot.

---

*Decidido em sessão-âncora DOM 19–21h de 2026-06-22 · Registrado 2026-06-25.*
