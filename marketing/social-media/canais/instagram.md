# Instagram — Estratégia do Canal (v2)

> **Canal de topo de funil + descoberta + humanização.**
> Atualizado em 2026-06-25 com base nos ADRs 0001–0008.
> PT-BR exclusivamente.

---

## 1. Objetivo do canal

Levar alguém de **"quem é esse cara?"** até **"entrei na waitlist / salvei pra testar"** em até 7 dias de conteúdo visto.

**Funil prático:**
1. Reels Lab Notes gera **descoberta** (alcance alto, saves).
2. Carrossel gera **saves + autoridade** (interesse médio, conversão alta).
3. Stories geram **humanização** (conexão diária, DMs).

---

## 2. Público específico

- **Primário**: donos e diretores de agência de marketing no Brasil (25–45 anos).
- **Secundário**: designers de ads e gestores de tráfego (operacional).
- **Idioma**: PT-BR exclusivamente.
- **Onde estão**: Reels > feed > stories. Stories de contas que seguem.

**ICP raiz (de `conceituacao.md`):** qualquer pessoa/time que produz criativos pra ads pagos e sente gargalo de produção. Sub-ICP rotativo.

---

## 3. Formatos

| Formato | % | Quando usar | Pilar Lab Notes |
|---------|---|-------------|-----------------|
| **Reels Lab Notes (60–90s)** | ~40% | Quarta (Pilar B — Experimento). Tese em vídeo, premissa → gargalo → demo → evidência. | B (principal) + A (secundário) |
| **Reels curtos (30–60s)** | ~20% | Sexta (Pilar B ou C). Cortes do Lab Notes, decisão pessoal rápida. | B ou C |
| **Carrossel híbrido (7 slides, 1080×1350)** | ~30% | Segunda (Pilar A — Tese OU Pilar B — Educação). Híbrido opinião/educação por post. | A ou B |
| **Stories diários** | volume | Bastidor, enquete, repost, print. Não conta como "peça" da cadência. | C |

**Total:** 3 posts/semana + stories diários.

---

## 4. Cadência semanal no IG

| Dia | Pilar | Formato | Tempo |
|-----|-------|---------|-------|
| **Seg** | A ou B (híbrido) | Carrossel 7 slides | 60 min |
| **Qua** | B | Reels Lab Notes (60–90s) | 60 min |
| **Sex (parcial)** | B ou C | Reels curto | 30 min |

Fonte: ADR `0002-cadencia-semanal.md`. Estrutura do carrossel híbrido: ADR `0007-carrossel-hibrido.md`.

---

## 5. Estrutura típica de Reel Lab Notes (60–90s)

```
[0–3s]   Tela preta + "LAB NOTES #00X" + tema (gancho estático)
[3–10s]  Premissa (1 frase que descreve o problema)
[10–20s] Gargalo (nome do problema estrutural)
[20–50s] Tese + demo (mostra a tela, enumera, exemplifica)
[50–70s] Evidência (número grande, caso real)
[70–90s] CTA (link na bio, save, comentário)
```

**Regras:**
- Voz do Jhonatan (sempre).
- Sem tela do produto no corpo do Reel (highlights de texto em `#00e85e` são OK).
- Humor deadpan em camada fina (nunca como piada).
- 1 CTA por Reel (link na bio OU save OU comentário, não os 3).

**Origem:** modelo `marketing/2026-Q3/producao-reels-1.md` (roteiro Lab Notes #001 já escrito).

---

## 6. Estrutura típica de carrossel híbrido (7 slides)

**Opinião (Pilar A):**
1. Gancho polêmico (número ou afirmação)
2. Provocação (por que a maioria erra)
3. Argumento 1 (com prova)
4. Argumento 2 (com prova)
5. Argumento 3 (com prova)
6. Síntese + tese Curator > operator
7. CTA

**Educação (Pilar B):**
1. Gancho de problema (número ou pergunta)
2. Contexto (por que é problema)
3. Passo 1 (verbo imperativo)
4. Passo 2 (verbo imperativo)
5. Passo 3 (verbo imperativo)
6. Resultado esperado (número ou prova)
7. CTA

**Regras:**
- Design system único (tokens do `design.md`, Inter Extra Bold + Regular, accent `#00e85e`, ink `#0a0a0a`).
- Fonte mínima 28pt no export.
- CTA: link na bio / save / comentário — não os 3.
- **Copy discipline:** cada slide responde "o que muda segunda de manhã?". Se não responde, refaz.

**Origem:** 3 carrosséis Lab Notebook já feitos em 2026-06-24 (`~/.mavis/scratchpads/.../adscale-carrosseis-lab-2026-06-v2/`) servem de modelo.

---

## 7. Stories (operação diária)

- **Segunda a sexta**: 3–7 stories/dia
- **Tipos que funcionam**:
  - Bastidor: mesa, código, tela do produto, café, cidade.
  - Pergunta com enquete ("qual desses 3 criativos você aprova?").
  - Repost de cliente que marcou.
  - Print de dado/resultado sem spam.
  - Countdown pra lançamento (quando aplicável).
- **Sab/dom**: 1–3 stories opcionais.

**Não fazer:** stories repetitivos só com CTA. Stories de "bom dia" sem nada.

---

## 8. Hashtags (com moderação)

- **Máximo 8–10 hashtags.**
- Misturar 2–3 grandes + 3–4 médias + 2–3 nichadas.
- **Bons exemplos:** `#marketingdigital` `#agenciademarketing` `#trafegopago` `#designgrafico` `#publicidade` `#metaads` `#googleads` `#criativos` `#adscale`
- **Proibido:** `#viral` `#fyp` `#trending` (irrelevante, atrai público errado).

---

## 9. CTAs por objetivo

| Objetivo | CTA |
|----------|-----|
| **Autoridade** | "Salva esse post pra testar essa semana." |
| **Waitlist** | "Link na bio pra entrar na lista de espera." |
| **Engajamento** | "Marca aqui o designer que precisa ouvir isso." |
| **Tráfego** | "Comenta 'BRIEFING' que eu mando o template." |

**Regra:** 1 CTA por post. Mais que isso confunde.

---

## 10. Bio do perfil

```
Jhonatan Soares
Construindo ADScale — IA que escala criativos pra performance.
Curator > operator. Lab Notes toda semana.
BR + EUA 🇧🇷🇺🇸
↓ waitlist aberta
```

---

## 11. KPIs

| KPI | Meta mês 1 | Meta mês 3 |
|-----|------------|------------|
| Seguidores | 500 | 2.000 |
| Reach médio por Reel | 1.500 | 8.000 |
| Saves médios por post | 20 | 80 |
| Visitas ao perfil/semana | 100 | 500 |
| Cliques no link da bio/semana | 30 | 200 |
| Posts com > 5k views | 1 | 5/mês |

**Premissa:** Nível A conservador (ADR 0006) = 12 IG posts + stories diários no mês.

---

## 12. Anti-padrões (não fazer)

- Carrossel sem gancho nos 2 primeiros slides.
- Reels com texto na tela por mais de 6 segundos sem mudança.
- 2+ CTAs no mesmo post.
- Hashtags `#viral` `#fyp` `#trending`.
- Stories só com CTA ou "bom dia" sem conteúdo.
- Pseudo-ciência em copy ("lab notebook", "paper 0X" em CTA/gancho — vedado pelo feedback de copy).
- Vocabulário sneaker/RAD (drop, hype, cool, streetwear).

---

*Subpasta de `marketing/social-media/canais/` · PT-BR · Versão 2 · Última atualização: 2026-06-25 · Owner: Jhonatan Soares*
