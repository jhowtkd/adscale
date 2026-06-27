# 0011 — Threads entra como canal novo (substitui YouTube no Q3)

**Data:** 2026-06-27
**Status:** ✅ Aceita
**Decisor:** Jhonatan Soares (founder)

> **Escopo:** Threads (Meta) vira canal oficial do ADScale no Q3, reaproveitando copy do LinkedIn/IG. Sem criação original. YouTube segue congelado (ADR 0009). Bilíngue suspenso (ADR 0010), então Threads opera em PT-BR only.

---

## Contexto

ADR 0009 congelou YouTube inteiro no Q3. O plano `marketing/social-media/plano-redes-sociais.md` previa YouTube como 3º canal, então a saída do YouTube deixou um "buraco" na estratégia:

- Sem canal de descoberta "lateral" — YouTube search trazia gente que não estava no IG/LI.
- Cadência perdeu 1 canal de texto curto — Reddit, X/Twitter e Threads são canais que aceitam texto rápido sem edição pesada.

Threads apareceu como substituto natural:

- **Meta nativo** — Threads é da Meta, mesma auth do IG. Conta ADScale (@adscale.lab) já pode ser ativada sem fricção.
- **Texto curto conversacional** — encaixa no formato "recap + link" que Jhonatan já produziria no LinkedIn.
- **Distribuição cross-platform** — Threads tem federação com ActivityPub (Mastodon, WordPress) e apareceu em listas de "novos canais com tração B2B" no ciclo 2026-W26 do stalker (case-studied, jyedezylva).
- **Custo operacional baixo** — Threads é texto + imagem opcional, sem edição pesada, sem thumbnail, sem SEO.

Decisão do Jhonatan (2026-06-27, registrada via anotação `[]` em `plano-redes-sociais.md:89`): "nao vamos usar youtube por enquanto. trocar para threads".

## Decisão

**Threads vira canal oficial do ADScale no Q3, no lugar do YouTube.**

### Formato do canal

| Item | Especificação |
|------|---------------|
| Handle | `@adscale.lab` (mesmo do IG) |
| Idioma | PT-BR only (consistente com ADR 0010) |
| Cadência Q3 | 3–4 posts/semana (reaproveitamento) |
| Formato | Texto curto conversacional (200–500 chars) + 1 imagem opcional |
| Tom | Mesmo do LinkedIn/IG (founder técnico, anti-corporativo, humor deadpan) |
| CTA | Recap do post longo (LI ou IG carrossel) + link/hashtag |
| Métrica primária | Impressões + replies qualificados |

### Como Threads reaproveita (e não duplica)

Threads **não tem criação original** no Q3. Cada post é derivado de uma peça já existente:

| Origem | Como vira Threads |
|--------|-------------------|
| LI post longo | Trecho de 2–3 frases + "leia completo no LinkedIn → link" |
| IG carrossel | Gancho da tese (slide 1 ou 2) + "carrossel completo no IG → link" |
| Reel IG | Print do frame-chave + "reel completo no IG → link" |
| Bastidor | Texto curto independente (mas copy reaproveita vocabulário de Pilar C) |

**Regra:** tempo de produção de Threads ≈ 0. É copy curta colada com link, feito em 5 min no momento da publicação do LI/IG correspondente.

### Cadência semanal Q3 com Threads

| Dia | IG | LI | Threads |
|-----|----|----|---------|
| Seg | Reel (provocação/opinião) | — | Recap do Reel |
| Ter | — | Post longo | — |
| Qua | Carrossel educativo | — | Gancho do carrossel |
| Qui | Stories bastidor | Micro-post | — |
| Sex | Reel (caso/bastidor) | Post longo | Recap do LI |
| Sáb/Dom | — | — | — |

**Total:** 3 IG + 3 LI + 3 Threads = 9 publicações/semana (mas só 6 peças com criação original — Threads é reaproveitamento).

## Consequências

**Mais fácil:**
- Sem edição pesada — Threads é texto + link, sem thumbnail, sem SEO, sem capítulo, sem transcript.
- Mesmo Meta do IG — auth compartilhada, conta @adscale.lab pode ser ativada direto.
- Distribuição lateral — feed do Threads + federação ActivityPub alcança gente fora do IG/LI.
- "Buraco" do YouTube fechado sem aumentar tempo de criação.

**Mais difícil:**
- **Sem retorno evergreen.** YouTube seria canal acumulativo (vídeos continuam sendo descobertos meses depois). Threads é feed cronológico reverso — post de 5 dias atrás já está enterrado. Tudo é "agora".
- **Métricas mais limitadas.** Threads não tem analytics públicos granulares como IG/LI — impressões agregadas, sem breakdown de alcance/engajamento por hora.
- **Sem thumbnail.** Visual é limitado — imagem opcional, mas sem o "cartaz" que Reel/carrossel/Short têm.
- **Sem monetização.** Threads ainda não tem programa de monetização claro (Meta está testando, mas incerto pro Q3).

**Destrava:**
- `marketing/social-media/canais/_shared.md` ganha bloco "Threads" com mesmas regras de tom/vocabulário dos outros canais.
- Cadência semanal v2 (semanal-v2.md) absorve Threads no checklist diário — adicionar 5 min de recap.
- Banco de Teses pode ganhar teses "thread-worthy" (ideia curta, viralizável, sem necessidade de carrossel longo).
- Métricas: incluir Threads no Metricool ou painel manual semanal.

## Alternativas consideradas

- **Manter YouTube só com Short reaproveitado do Reel:** rejeitado. ADR 0009 já cortou. Threads é a substituta natural sem overhead de edição.
- **Reddit como canal "lateral":** rejeitado. Reddit exige moderação de subreddit, downvote cultura agressiva, e construção de karma antes de postar. Threads é mais simples pra founder solo.
- **X/Twitter:** rejeitado. Cultura do X em 2026 ainda é hostil a SaaS B2B novo, e threads longas foram enterradas pelo algoritmo. Threads tem momentum melhor no nicho.
- **Substack / Newsletter:** rejeitado. É conteúdo longo, não curto. Já tem Tier 3 (newsletters) pra consumo, não criação.
- **Criar Threads do zero com criação original:** rejeitado. Aumenta carga sem ganho claro. Reaproveitamento cobre o "buraco" do YouTube com custo zero.

## Upgrade path

Evoluir Threads quando:

1. **Cadência IG + LI fluindo** (Mês 2+, sem atrito com 6 peças/sem + Threads).
2. **Métricas Threads confirmadas** — alcance médio >500 impressões/post, ou replies qualificados >5/semana.

Possíveis upgrades (sem ordem, decidir com base em sinal):

- **Permitir Threads com criação original** (não só reaproveitamento) — pra teses que nascem curtas.
- **Ativar federação ActivityPub** — publicar também no Mastodon de comunidades B2B marketing BR.
- **Testar formato imagem única** (estilo "card visual") como variação do texto-only.

## Relação com ADRs existentes

- **ADR 0002 (cadência semanal)** — permanece ✅. Threads não existia na decisão original, mas é aditivo (não conflita).
- **ADR 0005 (fontes de pauta)** — permanece ✅. Threads não é fonte de pauta, é canal de distribuição.
- **ADR 0008 (tom founder-pessoal)** — Threads herda o tom (80% profissional, 20% pessoal, 0% íntimo).
- **ADR 0009 (YouTube congelado Q3)** — ✅ Convive. Threads é a substituta "lateral" do YouTube.
- **ADR 0010 (Brasil-only)** — ✅ Convive. Threads é PT-BR only.
- **ADR 0012 (a criar se Creator > operator for reformulado)** — sem dependência.

---

*Decidido em 2026-06-27 · Registrado 2026-06-27 · Owner: Jhonatan Soares*