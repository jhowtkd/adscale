# CONTEXT — ADScale

> **Fonte canônica do "o que é o ADScale, em que acredita, e como opera."**
> Tudo passa pelo crivo da tese central **inteligência criativa em escala** (antes chamada "Curator > operator", reformulada em 2026-06-27).
> Última atualização: 2026-08-10.

---

## 1. Visão geral (uma frase)

ADScale é a infraestrutura da **inteligência criativa em escala** pra produção de criativos de performance. O humano deixa de ser **operator** (quem executa cada variação manualmente) e vira **quem decide**: define a intenção e o resultado desejado em um pedido, supervisiona a geração, aprova/descarta e itera. A IA infere o briefing operacional e os detalhes de produção a partir desse pedido, da marca e das referências; revisar esses dados é uma opção, não uma etapa obrigatória.

A IA **reposiciona** o humano. Não substitui. [isso ficou vago e pouco rescritivo. tá muito lúdico]

### Vocabulário operacional

- **Generation Settlement (liquidação de geração):** ciclo que garante cobrança, reserva do trabalho, dispatch, compensação quando o dispatch falha, reativação em retry e refund terminal. Não inclui definir preço, produzir a imagem ou avaliar sua qualidade.
- **Contexto autorizado:** pedido do operador, marca ativa e fontes explicitamente ligadas ao Creative Work; histórico amplo do workspace não entra por padrão.
- **Fonte factual:** origem que pode sustentar produto, oferta, benefício, preço ou outro claim da peça — pedido, fonte marcada como conteúdo ou identidade da marca.
- **Referência visual:** ativo aprovado usado para orientar linguagem visual, composição e repertório; não sustenta fatos de campanha.
- **Direção inferida:** hipótese operacional sobre objetivo, público, mensagem ou tom, criada a partir do contexto autorizado; não é fato confirmado.
- **Briefing inferido:** projeção versionada da intenção e da direção criativa, com cada campo marcado como sustentado, inferido ou desconhecido.
- **Prontidão do briefing:** estado que distingue direção pronta para geração normal (`ready`), teste visual sem claims factuais (`exploratory`) e ausência de direção segura ou conflito aberto (`blocked`).
- **Briefing inferido:** visão editável que combina a direção da peça com fatos sustentados pelo contexto autorizado. Cada campo permanece distinguível como sustentado, inferido ou desconhecido; desconhecidos não recebem valores genéricos.
- **Prontidão do briefing:** estado que distingue direção pronta para geração normal, direção apenas exploratória sem claims e ausência de direção segura para gerar. Oferta, benefício, preço e outros fatos desconhecidos nunca são preenchidos para alcançar prontidão.
- **Avaliação inconclusiva:** resultado pós-geração em que a integridade da peça não pôde ser confirmada nem refutada. A peça permanece disponível para decisão humana, mas não conta como aprovação automática.
- **Veredito objetivo:** avaliação automática de integridade expressa como aprovado, reprovado ou inconclusivo. Não deriva do score subjetivo.
- **Aprovação humana:** decisão explícita do operador de selecionar uma Peça. Pode confirmar um veredito inconclusivo ou ausente, mas nunca substituir uma reprovação objetiva.
- **Dono da plataforma:** operador autorizado a acessar dados e ferramentas globais do ADScale entre workspaces. Não equivale a owner ou admin de um workspace.

### Modelo de produto canônico

**Trabalho**:
Unidade criativa retomável que reúne intenção, briefing, fontes, estado e resultados sob uma marca.
_Evitar_: Campanha como sinônimo, job, projeto.

**Campanha**:
Agrupamento opcional de Trabalhos que compartilham uma iniciativa, objetivo ou período.
_Evitar_: Trabalho, pasta.

**Protocolo**:
Modo de criação aplicado a um Trabalho, como Variações, Peça única, Adaptar formatos ou Mudar estilo.
_Evitar_: ferramenta, fluxo, tipo de campanha.

**Rascunho**:
Estado editável e retomável de um Trabalho, sempre vinculado a um único Protocolo. Trocar de Protocolo preserva o Rascunho atual em vez de convertê-lo.
_Evitar_: sessão temporária, formulário descartável.

**Peça**:
Resultado visual produzido por um Trabalho, independentemente do Protocolo usado.
_Evitar_: output, asset gerado, derivação.

**Variação**:
Peça criada como alternativa relacionada a uma base, direção ou Peça anterior.
_Evitar_: versão, derivação.

**Estúdio**:
Superfície operacional para começar ou retomar um Trabalho.
_Evitar_: Início, Dashboard como nome visível.

**Visão geral**:
Superfície gerencial secundária para acompanhar indicadores, atividade e itens que exigem atenção.
_Evitar_: Dashboard como nome visível.

---

## 2. Tese central

> **Inteligência criativa em escala.**

Worldview-level, não feature-level — é o que diferencia ADScale de AdCreative.ai / Pencil / Madgicx (que vendem "IA gera"). A IA faz o operacional; o humano decide o estratégico; os dois viram hábito.

Detalhe completo: `[marketing/brand/conceituacao.md](marketing/brand/conceituacao.md)` (Pacote Conceitual v0, 2026-06-24).

---



## 3. ICP (público-alvo)

- **ICP raiz:** qualquer pessoa/time que produz criativos pra ads pagos (Meta, TikTok, Google) e sente gargalo de produção.
- **Sub-ICP rotativo:** designer freelancer / time interno / agência (5–30) / e-com ou SaaS.
- **Anti-ICP:** quem quer "IA que faz tudo", quem produz criativo artesanal de marca, quem prefere contratar +1 designer.
- **Escala = Volume + Velocidade + Variedade** (sem destaque a uma dimensão).

Detalhe: `[marketing/social-media/canais/_shared.md](marketing/social-media/canais/_shared.md)` §1.

---



## 4. Os 3 pilares Lab Notes (canônico a partir de 2026-06-25)


| Pilar | Nome                        | Peso    | O que defende                                                                                                                                | Esqueleto                                                                 |
| ----- | --------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| **A** | **Lab Notes — Tese**        | **40%** | Opinião fundamentada. Defende a tese da **inteligência criativa em escala**: IA reposiciona, não substitui. Mercado, hype, polêmica. {{ status: 2026-06-27 — claim reformulado de "Curator > operator" pra "inteligência criativa em escala" }} | Provocação → argumento → prova, ou Mito → realidade → como                |
| **B** | **Lab Notes — Experimento** | **40%** | Processo, números, throughput. Bastidor técnico. Como o ADScale funciona. Educação prática.                                                  | Premissa → gargalo → tese → demo → evidência, ou Passo a passo imperativo |
| **C** | **Lab Notes — Bastidor**    | **20%** | Pegada pessoal do Jhonatan. O que aprendeu construindo. Decisões técnicas. Build in public.                                                  | Essa semana → o que aprendi, ou Antes/depois + número                     |


**Vocabulário unificador:** paper, hipótese, grupo de controle, grupo experimental, anomalia, significância estatística, double-blind, lab notebook. Copy concreta (sem pseudo-ciência), mas PERSONA verbal de laboratório.

Detalhes: `[marketing/brand/mensagens-chave.md](marketing/brand/mensagens-chave.md)` v2 + ADR `[0001-pilares-3-lab-notes.md](docs/adr/0001-pilares-3-lab-notes.md)`.

---



## 5. Tom de voz (resumo)


| Adjetivo     | O que significa                                                 | O que **não** é                         |
| ------------ | --------------------------------------------------------------- | --------------------------------------- |
| **Expert**   | Domínio técnico do problema. Números, modelos, casos.           | Não é pedante, não é coach, não é guru. |
| **Fast**     | Respeita o tempo do leitor. Copy curta, sem enrolação.          | Não é raso, não é clickbait.            |
| **Creative** | A forma acompanha o conteúdo. Visual bem feito, copy com ritmo. | Não é "diferentão", não é performático. |


**Pesos da pegada pessoal (ADR 0008):** 80% founder-pessoal / 20% pessoal-profissional / 0% íntimo.

**Humor:** obrigatório, deadpan britânico (Monty Python / Black Books / Mitchell & Webb / Peep Show / Detectorists / Fawlty Towers / Rick & Morty / Silicon Valley / Sheldon / Hitchhiker's Guide). Metalinguagem permitida.

**Vedado:** "enfim, esse tipo de coisa", tom blasé, vocabulário sneaker/RAD (drop, hype, cool, streetwear, limited edition), "TL;DR" no fim.

Detalhes: `[marketing/brand/conceituacao.md](marketing/brand/conceituacao.md)` Parte 3 + ADR `[0008-tom-founder-pessoal.md](docs/adr/0008-tom-founder-pessoal.md)`.

---



## 6. Cadência semanal — Q3 (YouTube congelado + Brasil-only + Threads)

**Efetiva no Q3 (até set/2026):** 3 IG + 3 LI = **6 peças com criação original/semana** + Threads reaproveita (~3 posts/sem adicionais, ~5 min cada = ~15 min total/sem).


| Dia     | Pilar           | Canal                    | Formato                                | Tempo  |
| ------- | --------------- | ------------------------ | -------------------------------------- | ------ |
| **Seg** | A — Tese        | Instagram                | Carrossel híbrido 7 slides (1080×1350) | 60 min |
| **Ter** | A — Tese        | LinkedIn                 | Post longo PT-BR (1.200–1.500 chars)   | 45 min |
| **Qua** | B — Experimento | Instagram                | Reels Lab Notes (60–90s)               | 60 min |
| **Qui** | C — Bastidor    | LinkedIn                 | Post texto PT-BR (micro 200–400 ou long) | 45 min |
| **Sex** | B + C           | IG Reels curto + LI post | 2 peças                                | 60 min |
| Todos   | (reaproveitamento) | Threads                | Texto curto + link (recap do LI/IG)    | 5 min/dia útil |


**Total mensal:** ~24 posts IG+LI + ~12 posts Threads (reaproveitados) = ~36 publicações, ~24 com criação original.

**Cadência "framework" original (com YouTube no escopo):** 7 peças/sem com Short na sexta. Voltava a valer se ADR 0009 fosse desativado, mas **YouTube EN trilha sai também** (ADR 0010 — Brasil-only).

Detalhes: [`marketing/social-media/calendario/semanal-v2.md`](marketing/social-media/calendario/semanal-v2.md) + ADRs:
- [`0002-cadencia-semanal.md`](docs/adr/0002-cadencia-semanal.md) (framework original)
- [`0009-youtube-congelado-q3.md`](docs/adr/0009-youtube-congelado-q3.md) (Q3 corta YouTube inteiro)
- [`0010-brasil-only-suspende-bilingue.md`](docs/adr/0010-brasil-only-suspende-bilingue.md) (LinkedIn vira PT-BR, EN sai)
- [`0011-threads-como-canal-novo.md`](docs/adr/0011-threads-como-canal-novo.md) (Threads substitui YouTube)

---



## 7. Ritual semanal (âncora domingo)


| Quando              | O quê                                                                                                                          | Duração       |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------- |
| **DOM 19h–21h**     | Sessão-âncora: Banco de Teses + Fontes Tier 1 + `01-ideias.md` → 7 briefs no `02-briefs.md` (no Q3, **6 briefs** com ADR 0009) | **2h**        |
| **SEG 8h**          | Checkpoint Mavis (revisão automatizada de 3 briefs)                                                                            | 30 min        |
| **SEX 17h**         | Review semanal: métricas, retroalimentar Banco de Teses                                                                        | 30 min        |
| **Produção diária** | Executar peça do dia conforme `02-briefs.md`                                                                                   | 45–60 min/dia |


**Total semanal:** ~~3h gestão + ~4h produção = **~~7h/semana** (Q3 sem Short).

Detalhes: `[marketing/2026-Q3/ritual-semanal.md](marketing/2026-Q3/ritual-semanal.md)` + ADR `[0003-ritual-semanal-ancora-domingo.md](docs/adr/0003-ritual-semanal-ancora-domingo.md)`.

---



## 8. Stack de qualidade (4 blocos)


| #     | Bloco              | Frequência                    | Função                                               |
| ----- | ------------------ | ----------------------------- | ---------------------------------------------------- |
| **1** | **Consumo**        | Diário (30 min)               | Ler/assistir referências do ICP. Banco de inputs.    |
| **2** | **Pesquisa**       | Semanal (60 min DOM)          | Concorrentes + SEO + trends.                         |
| **3** | **Banco de Teses** | Contínuo                      | Toda ideia vira 1 tese (claim + prova + implicação). |
| **4** | **Revisão Mavis**  | Toda peça (antes de publicar) | Gatekeeper de tom, pilares, anti-padrões.            |


Stack de produção entra **depois**, quando a cadência travar.

Detalhes: `[marketing/2026-Q3/stack-qualidade.md](marketing/2026-Q3/stack-qualidade.md)` + ADR `[0004-stack-qualidade.md](docs/adr/0004-stack-qualidade.md)`.

---



## 9. Fontes de pauta (Tier 1/2/3)


| Tier         | Peso                 | Fontes                                                                                                                                                                         |
| ------------ | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Tier 1**   | **60%**              | Perguntas reais do ICP (DMs, comentários, e-mails) + Bastidor ADScale + Trends do nicho                                                                                        |
| **Tier 2**   | **30%**              | Concorrência (AdCreative.ai, Pencil, Madgicx, Canva, Adobe Firefly, Midjourney) + SEO (palavras-chave que o ICP busca)                                                         |
| **Tier 3**   | **10%**              | Newsletters (Lenny's, Marketing Brew, The Verge AI, Benedict Evans, Casey Winters) — leitura, não cópia                                                                        |
| **Tier 3.5** | 8 perfis (ciclo W26) | Top perfis que Jhonatan acompanha pra kibar — ver lista em `fontes-pauta.md` [§4.5](marketing/2026-Q3/fontes-pauta.md#45-tier-35--top-perfis-que-jhonatan-acompanha-pra-kibar) |


Detalhes: `[marketing/2026-Q3/fontes-pauta.md](marketing/2026-Q3/fontes-pauta.md)` + ADR `[0005-fontes-pauta.md](docs/adr/0005-fontes-pauta.md)`.

---



## 10. Estado atual (2026-06-27)


| Status         | Item                                                                                          |
| -------------- | --------------------------------------------------------------------------------------------- |
| ✅ Trava        | 3 pilares Lab Notes definidos                                                                 |
| ✅ Trava        | Cadência semanal framework aprovada (ADR 0002)                                                |
| ✅ Trava        | YouTube congelado Q3 (ADR 0009) — cadência efetiva vira 6 peças/sem                           |
| ✅ Trava        | Stack de qualidade definido                                                                   |
| ✅ Trava        | Fontes de pauta Tier 1/2/3 aprovadas + Tier 3.5 ativo (ciclo W26)                             |
| ✅ Trava        | Regra do Reel: tela liberada quando faz sentido narrativo (sem dogma)                         |
| ✅ Trava        | Brasil-only (ADR 0010) — LinkedIn vira PT-BR, EN sai                                          |
| ✅ Trava        | Threads entra como canal novo (ADR 0011) — substitui YouTube, reaproveita LI/IG               |
| ✅ Trava        | Tese central reformulada: "inteligência criativa em escala" (2026-06-27) — substituiu "Curator > operator" na conceituação, CONTEXT, canais, ADRs e teses |
| 🟡 Em revisão  | Copy de produto (i18n `app/messages/en.json` + testes) ainda diz "Curator" — quando execução descongelar, revisar pra refletir nova tese |
| 🟡 Em execução | Reescrita da documentação v2 (CONTEXT + ADRs + canais + calendário + ritual + stack + fontes) |
| 🟡 Em execução | Banco de Teses seed (10 teses) + Kanban alinhado                                              |
| ⏸ Congelado    | Produção de copy/execução (até documentação ser aprovada)                                     |
| ⏸ Sem data     | Primeira peça concreta (Jhonatan quer fechar tudo antes)                                      |


---



## 11. Links canônicos


| O quê                                    | Onde                                                                                                 |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Crença central + tom + identidade verbal | `[marketing/brand/conceituacao.md](marketing/brand/conceituacao.md)`                                 |
| 3 pilares Lab Notes (canônico)           | `[marketing/brand/mensagens-chave.md](marketing/brand/mensagens-chave.md)` v2                        |
| Decisões estratégicas (ADRs)             | `[docs/adr/](docs/adr/)`                                                                             |
| Plano de redes (estratégia)              | `[marketing/social-media/plano-redes-sociais.md](marketing/social-media/plano-redes-sociais.md)`     |
| Cadência semanal Q3                      | `[marketing/social-media/calendario/semanal-v2.md](marketing/social-media/calendario/semanal-v2.md)` |
| Boilerplate cross-canal                  | `[marketing/social-media/canais/_shared.md](marketing/social-media/canais/_shared.md)`               |
| Estratégia Instagram                     | `[marketing/social-media/canais/instagram.md](marketing/social-media/canais/instagram.md)` v2        |
| Estratégia LinkedIn                      | `[marketing/social-media/canais/linkedin.md](marketing/social-media/canais/linkedin.md)` v3          |
| Estratégia Threads                       | `[marketing/social-media/canais/threads.md](marketing/social-media/canais/threads.md)` v1            |
| Estratégia YouTube (congelado Q3)        | `[marketing/social-media/canais/youtube.md](marketing/social-media/canais/youtube.md)` v2 (referência histórica) |
| Plano Q3 unificado                       | `[marketing/2026-Q3/plano-marketing-completo.md](marketing/2026-Q3/plano-marketing-completo.md)` v2  |
| Kanban 4 colunas                         | `[marketing/2026-Q3/kanban/](marketing/2026-Q3/kanban/)`                                             |
| Ritual semanal                           | `[marketing/2026-Q3/ritual-semanal.md](marketing/2026-Q3/ritual-semanal.md)`                         |
| Stack de qualidade                       | `[marketing/2026-Q3/stack-qualidade.md](marketing/2026-Q3/stack-qualidade.md)`                       |
| Fontes de pauta                          | `[marketing/2026-Q3/fontes-pauta.md](marketing/2026-Q3/fontes-pauta.md)`                             |
| Banco de Teses (seed)                    | `[marketing/2026-Q3/banco-teses/](marketing/2026-Q3/banco-teses/)`                                   |
| Identidade visual (tokens)               | `[design.md](design.md)` + `[app/src/app/globals.css](app/src/app/globals.css)`                      |


---

*Mantenido em raiz · PT-BR (EN quando indicado) · Última atualização: 2026-07-18 · Owner: Jhonatan Soares*
