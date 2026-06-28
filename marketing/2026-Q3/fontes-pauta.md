# Fontes de Pauta — Tier 1 (60%) / Tier 2 (30%) / Tier 3 (10%)

> **De onde vem a pauta, com pesos fixos.**
> Versão 2 (2026-06-25) — baseada no ADR `0005-fontes-pauta.md`.

---

## 1. Visão geral


| Tier         | Peso         | Fontes                                                                             | Cadência                                      |
| ------------ | ------------ | ---------------------------------------------------------------------------------- | --------------------------------------------- |
| **Tier 1**   | **60%**      | Perguntas reais do ICP + Bastidor ADScale + Trends do nicho                        | Diário (consumo) + sessão-âncora (trends)     |
| **Tier 2**   | **30%**      | Concorrência + SEO                                                                 | Semanal (60 min DOM, dentro da sessão-âncora) |
| **Tier 3**   | **10%**      | Newsletters (Lenny's, Marketing Brew, The Verge AI, Benedict Evans, Casey Winters) | Diário (skim no consumo)                      |
| **Tier 3.5** | (sub-Tier 3) | **Top perfis que Jhonatan acompanha pra kibar**                                    | Diário (consumo) — 5–10 perfis                |


**Por que 60/30/10 (não 50/30/20 ou 70/20/10):**

- **60% Tier 1** garante que o feed fala **com** o ICP, não sobre o ICP.
- **30% Tier 2** mantém ADScale competitivo sem virar reativo.
- **10% Tier 3** é o "arroz" — textura, não prato principal.
- **Tier 3.5** (sub-Tier 3) não muda o peso — é operacionalização do "skim de perfis". Jhonatan já consome esses perfis, é só registrar pra alimentar teses.

---



## 2. Tier 1 — Perguntas + Bastidor + Trends (60%)



### Perguntas reais do ICP (DMs, comentários, e-mails)

**O que entra:** toda pergunta que Jhonatan recebe de dono de agência, designer, gestor de tráfego — em qualquer canal (IG DM, LI DM, e-mail do produto, comentário em post, pergunta em live).

> {{ pendência-resolvida-em-2026-06-27: Jhonatan anotou em `[]` que "atualmente não recebo nenhuma pergunta, como faremos?". Resposta abaixo — Tier 1 reformatado em 3 sub-tiers (1A/1B/1C) que funcionam mesmo sem perguntas inbound. }}

**Operacionalização:**

- Jhonatan **anota** a pergunta (mesmo que responda na hora) em `banco-teses/sources/from-tier1/perguntas-YYYY-WW.md`.
- Formato: `- [YYYY-MM-DD] [canal] pergunta verbatim`.
- Sessão-âncora de domingo **lê essas anotações** antes de escolher 7 peças. Pelo menos 1 peça/semana nasce de pergunta Tier 1A quando disponível.

**Por que esse tier é maioria absoluta:**

- ICP diz o que quer ouvir (sem Jhonatan adivinhar).
- Cada resposta pública vira conteúdo (1 pergunta = 1 post curto ou 1 Reels).
- Cria loop: Jhonatan responde → lead satisfeito vira promoter → mais perguntas → mais conteúdo.


### Sub-tiers do Tier 1 (pra funcionar sem perguntas inbound no pré-lançamento)

Tier 1 está dividido em 3 sub-tiers porque o ADScale está em **pré-lançamento** (sem base de usuários abertos). Perguntas reais (Tier 1A) ainda não chegam com volume. Os sub-tiers 1B e 1C funcionam desde o dia 1:

| Sub-tier | O que é | Peso | Fonte | Funciona sem inbound? |
|----------|---------|------|-------|------------------------|
| **1A — Perguntas reais** | Perguntas que Jhonatan recebe de ICP (DM, comentário, e-mail) | 20% | Direto do ICP | ❌ Só quando base começar |
| **1B — Dores observadas** | Jhonatan escuta/observa dor no nicho: comentários em perfis de concorrentes/referências, grupos de WhatsApp/Telegram, conversas com amigos do meio, perguntas em lives | 20% | Indireto (observação do ICP no habitat natural) | ✅ Funciona desde dia 1 |
| **1C — Bastidor ADScale** | Decisões técnicas, aprendizados, milestones, bugs, features | 20% | Próprio (Jhonatan como founder) | ✅ Funciona desde dia 1 (só depende de construir) |

**Como operacionalizar Tier 1B (Dores observadas):**

- Jhonatan gasta **10 min/dia** no Bloco 1 (Consumo) **escaneando** comentários em perfis Tier 3.5 (metricoolapp, ocaradosrankings, tenbolabs, etc) e em grupos onde tá presente.
- Quando vê uma pergunta/dor recorrente, **anota** em `banco-teses/sources/from-tier1/dores-observadas-YYYY-WW.md`.
- Formato: `- [YYYY-MM-DD] [perfil-fonte] pergunta/dor verbatim + Jhonatan_resposta_em_1_frase`.
- Sessão-âncora de domingo lê antes de escolher 7 peças. Pelo menos 1 peça/sem nasce de Tier 1B até Tier 1A começar a entregar.

**Trade-off do rebalanceamento:**
- Tier 1B pode "vazar" copy próximo do que concorrentes postam (não é cópia, mas ângulo). Aceitável: ângulo é do Jhonatan, não do concorrente.
- Tier 1C (Bastidor) é sustentável enquanto o ADScale tiver build em progresso. Se travar, peso migra temporariamente pra Tier 1B.



### Bastidor ADScale (o que está sendo construído)

**O que entra:** decisões técnicas, aprendizados de construir SaaS, milestones (positivos ou negativos), bugs resolvidos, features lançadas.

**Operacionalização:**

- Jhonatan mantém um log contínuo em `banco-teses/sources/from-tier1/bastidor-YYYY-WW.md`.
- Formato: `- [YYYY-MM-DD] decisão/aprendizado: descrição em 1 frase`.
- Pilar C (Lab Notes — Bastidor) é o **consumidor natural** desse tier.

**Por que esse tier vale 60% combinado:**

- Autenticidade: Jhonatan não finge, mostra.
- Cria narrativa ao longo do tempo: Mês 1 "escolhi modelo X" → Mês 3 "modelo X não funcionou, troquei pra Y" → Mês 6 "Y escalou". 
- Atrai ICP técnico (que quer ver como pensa, não só resultado).



### Trends do nicho (Twitter/X, LinkedIn, YouTube, Niche Slack/Discord)

**O que entra:** assuntos subindo no nicho de marketing/IA/criativos. Não trends macro (política, celebrities) — trends **do ICP**.

**Operacionalização:**

- 10 min/dia no Bloco 1 (Consumo) checa Twitter trending na aba "Following" + LinkedIn feed.
- 20 min no domingo (dentro da sessão-âncora, Bloco 2) checa YouTube search autocomplete.
- Anotar em `banco-teses/sources/from-tier1-trends/trends-YYYY-WW.md`.

**Por que trends são Tier 1 e não Tier 3:**

- Trends do nicho **são pergunta implícita do ICP** ("todo mundo tá falando de X, e o ADScale?"). 
- Trends macro (Lenny's sobre AI em geral) são Tier 3 — contexto, não pauta direta.

---



## 3. Tier 2 — Concorrência + SEO (30%)



### Concorrência (AdCreative.ai, Pencil, Madgicx, Canva, Adobe Firefly, Midjourney)

**O que entra:** post novo, mudança de preço, feature lançada, demo pública, mudança de posicionamento.

**Operacionalização:**

- 20 min toda semana (DOM, dentro do Bloco 2) checa os 6 perfis principais.
- Anotar em `banco-teses/sources/from-tier2/competitor-YYYY-WW.md`.
- Formato: `- [YYYY-MM-DD] [concorrente] ação: descrição. Implicação ADScale: ...`

**Por que 30% (não 50%):**

- Concorrência informa, mas não dita. ADScale tem tese própria (inteligência criativa em escala).
- 50% viraria "ADScale vs X" toda semana — cansa o ICP.
- Pilar A (Lab Notes — Tese) é o **consumidor natural** desse tier.



### SEO (palavras-chave que o ICP busca)

**O que entra:** volume de busca de termos como "como escalar criativos", "variação criativo IA", "briefing estruturado", "ADScale".

**Operacionalização:**

- 20 min toda semana (DOM, dentro do Bloco 2) YouTube Search Autocomplete + Google Trends.
- Anotar em `banco-teses/sources/from-tier2/seo-keywords-YYYY-WW.md`.
- Formato: `- [YYYY-MM-DD] keyword: "X" — volume Y, tendência Z. Uso potencial: ...`

**Por que SEO importa mesmo pra LinkedIn/IG (não só YouTube):**

- Hashtags IG são SEO.
- Títulos de post LinkedIn são SEO (decide se aparece em "suggested").
- Títulos de Reels são SEO.
- Pilar B (Lab Notes — Experimento) é o **consumidor natural** desse tier (educação prática).

---



## 4. Tier 3 — Newsletters (10%)



### Fontes

- **Lenny's Newsletter** — produto, growth.
- **Marketing Brew** — marketing digital.
- **The Verge AI** — IA macro (modelos, regulamentação).
- **Benedict Evans** — tech macro.
- **Casey Winters** — growth, marketplace.



### Como consumir

- 10 min/dia no Bloco 1 (Consumo) — **skim only**.
- Ler título + 1º parágrafo. Salvar só se virar tese.
- Salvar em `banco-teses/inbox/from-tier3-YYYY-MM-DD.md`.



### Por que só 10%

- **Newsletters são contexto, não pauta direta.** Jhonatan não posta "Li na Lenny's que X". Ele internaliza e cria a tese própria.
- Risco de virar **curador** em vez de **autor** se Tier 3 dominar.
- Tier 3 serve pra **manter vocabulário** ("termo novo do mercado = tese nova potencial"), não pra ditar pauta.

---



## 4.5. Tier 3.5 — Top perfis que Jhonatan acompanha pra kibar

**Lista ativa (definida por Jhonatan em 2026-06-27, ciclo W26):**


| #   | Perfil              | Plataforma | URL                                                                                        | Categoria            | Por que entrou                                                                                                                          |
| --- | ------------------- | ---------- | ------------------------------------------------------------------------------------------ | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | metricoolapp        | Instagram  | [https://www.instagram.com/metricoolapp/](https://www.instagram.com/metricoolapp/)         | category_reference   | SaaS de social media analytics. Padrão forte de **lead magnet via keyword comment** (SUMMER/STUDY/WELLBEING replicado em 4+ posts W26). |
| 2   | ocaradosrankings    | Instagram  | [https://www.instagram.com/ocaradosrankings/](https://www.instagram.com/ocaradosrankings/) | creative_reference   | Perfil BR de marketing/criativos (Edu Prange, 47k). DNA de **TESE-ÚNICA categórica** + **DATA-RICH ranking** com números hard.          |
| 3   | tenbolabs           | Instagram  | [https://www.instagram.com/tenbolabs/](https://www.instagram.com/tenbolabs/)               | category_reference   | SaaS/tech BR. Padrão **REFRAME categórico** ("Boring? No, masterclass") + teses com $Bn de mercado.                                     |
| 4   | jyedezylva          | Instagram  | [https://www.instagram.com/jyedezylva/](https://www.instagram.com/jyedezylva/)             | creator_reference    | Creator solo. Tom pessoal + **REFRAME** ("It's not about producing more").                                                              |
| 5   | case-studied        | Instagram  | [https://www.instagram.com/case.studied/](https://www.instagram.com/case.studied/)         | case_study_reference | IG de cases de marketing (versão resumida/visual do archive).                                                                           |
| 6   | casestudied-archive | Website    | [https://www.casestudied.com/archive](https://www.casestudied.com/archive)                 | case_study_reference | Archive público de cases — coleta via webfetch/Jina (NÃO é IG).                                                                         |
| 7   | hugorodriguess      | Instagram  | [https://www.instagram.com/hugorodriguess/](https://www.instagram.com/hugorodriguess/)     | bastidor_reference   | **BASTIDOR pessoal + autoridade setorial** (Cannes Lions,奖项, behind the scenes).                                                        |
| 8   | saasflash           | Instagram  | [https://www.instagram.com/saasflash/](https://www.instagram.com/saasflash/)               | category_reference   | "Launch videos for tech brands" (149k) — referência direta do nicho SaaS B2B.                                                           |


> {{ status: Lista travada em 2026-06-27 (ciclo W26). Editar/expandir exige nova rodada stalker. }}

**O que entra:** perfis (IG + 1 website) que Jhonatan **já acompanha** e considera referência. O objetivo não é copiar — é identificar padrões de pauta, ângulos, estrutura de copy que ressoam com público B2B de marketing.

**Operacionalização:**

- Coleta semanal via skill `stalker` (`~/.mavis/skills/stalker/`) — config em `stalker.config.json`.
- Outputs do ciclo ficam em `~/stalker/runs/2026-WW/{raw,parsed,audit,brand,deliverables}/` + `report.md` + `pautas.md`.
- Anotações de padrão observado entram em `banco-teses/inbox/from-tier3-5-perfis-YYYY-WW.md` (1 seed por ciclo).
- Sessão-âncora de domingo **lê essas anotações** junto com Tier 1 (perguntas reais) e Tier 2 (concorrência).
- Quando uma observação vira tese defensável, move pro `banco-teses/tese-00X-*.md`.

**Por que sub-Tier 3 e não Tier novo:**

- Não muda o peso 60/30/10.
- Jhonatan já consome esses perfis no hábito — só falta formalizar pra alimentar teses.
- Complementa Tier 3 (newsletters) com fonte "viva" (perfis postam ao longo da semana, não 1×/semana).

**Sugestões iniciais (Jhonatan vai revisar):**

- Perfis de fundadores SaaS B2B (referência de build in public).
- Perfis de head of marketing / growth de marcas conhecidas.
- Perfis de designers/agências com bom track de conteúdo.
- Perfis de autores de newsletters (mesmo que Jhonatan leia a newsletter inteira).
- Perfis críticos do nicho (defensores de teses opostas — bom pra pilar A).

---



## 5. Como os 3 tiers alimentam o Banco de Teses

```
Tier 1 (60%) ─┐
              ├──→  banco-teses/inbox/  ──→  [sessão-âncora DOM]  ──→  tese defensável
Tier 2 (30%) ─┤                              Bloco 3 (Banco)            claim + prova + implicação
              │
Tier 3 (10%) ─┘
```

**Regra:** item do inbox vira tese **somente se** Jhonatan consegue escrever claim + prova + implicação. Se não consegue, o item é drop ou volta pro inbox.

---



## 6. Quando rebalancear os pesos


| Sinal                                           | Ação                                                                                   |
| ----------------------------------------------- | -------------------------------------------------------------------------------------- |
| ICP para de fazer perguntas (Tier 1 secando)    | Aumentar peso de Tier 1 forçando **conteúdo que gera pergunta** (provocação, enquete). |
| Concorrente anuncia algo grande                 | Aumentar Tier 2 pontualmente (1 semana) sem mudar regra 60/30/10.                      |
| Newsletter viraliza tema novo (ex: "AI agents") | Criar 1 tese defensável no Banco, distribuir em Pilar A ou B conforme teor.            |
| Sessão-âncora DOM acaba sem 7 briefs prontos    | Voltar pra Tier 2 (60 min pesquisa) e esquecer Tier 1 (assumiu que tinha, não tinha).  |


---



## 7. Estrutura de pastas

```
marketing/2026-Q3/banco-teses/
├── inbox/
│   ├── from-tier1-perguntas-YYYY-WW.md
│   ├── from-tier1-bastidor-YYYY-WW.md
│   ├── from-tier1-trends-YYYY-WW.md
│   └── from-tier3-YYYY-MM-DD.md
├── sources/
│   ├── from-tier2/
│   │   ├── competitor-YYYY-WW.md
│   │   ├── seo-keywords-YYYY-WW.md
│   │   └── trends-YYYY-WW.md
│   └── (Tier 1 fica em inbox porque flui mais rápido)
├── tese-001-inteligencia-criativa-em-escala.md
├── tese-002-briefing-estruturado-5-campos.md
├── tese-003-batch-em-vez-de-projeto.md
└── ... (uma por arquivo)
```

---



## 8. Conexão com ADRs

- **ADR 0001** — define os 3 pilares. Cada tier alimenta pilares diferentes (T1 → todos, T2 → A e B, T3 → contextual).
- **ADR 0003** — define a sessão-âncora de domingo onde Tier 2 (60 min pesquisa) roda.
- **ADR 0004** — Stack de Qualidade. Bloco 1 = Tier 1 + Tier 3. Bloco 2 = Tier 2. Bloco 3 = Banco de Teses (saída dos 3 tiers).

---

*Mantido em* `marketing/2026-Q3/` *· PT-BR · Versão 2 · Última atualização: 2026-06-25 · Owner: Jhonatan Soares*