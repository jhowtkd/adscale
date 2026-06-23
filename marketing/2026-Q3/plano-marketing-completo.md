# Plano de Marketing Unificado — ADScale (Q3 2026)

> Documento operacional. Tudo que o Jhonatan precisa rodar em **90 dias**
> pra lançar o ADScale com base quente, com 1 pessoa mandando no conteúdo.
>
> Reaproveita o que já existe em `marketing/` (tom de voz, mensagens-chave,
> plano de lançamento, estratégia por canal) e preenche os 3 gaps
> operacionais: **automações de produção**, **ads de lançamento** e
> **sequência de e-mails**.

---

## 0. TL;DR — o que rodar, em que ritmo, com que ferramentas

| Frente | Ferramenta principal | Custo | Esforço semanal | Objetivo 90 dias |
|--------|----------------------|-------|------------------|------------------|
| **Redes sociais (orgânico)** | Canva + CapCut + Trello (Kanban) + Meta Business Suite | R$ 0 | 8h | 2k seguidores IG + 500 conexões ICP no LinkedIn + 500 waitlist |
| **Ads de lançamento** | Meta Ads + Google Ads | R$ 2.000/mês | 2h | CPL ≤ R$ 8, 250 leads qualificados |
| **E-mail marketing** | Resend (já tem no stack) + Loops ou Resend Audiences | R$ 0–50/mês | 1h | 35% abertura média, 8% clique, 4 trials/semana vindos de e-mail |

**Princípio-mestre:** conteúdo orgânico constrói a base e valida a mensagem; ads entram só depois que a copy tá convertendo; e-mails seguram e recuperam quem já tocou o produto.

---

## 1. Redes sociais — operação pra 1 pessoa

### 1.1 Formatos e frequência (recorte operacional)

| Dia | Canal | Formato | Pilar | Tempo |
|-----|-------|---------|-------|-------|
| **Seg** | Instagram | **Carrossel educativo** (5–7 slides) | Educação | 90 min |
| **Ter** | LinkedIn | **Post longo** (1.200–1.500 chars, EN) | Opinião / Bastidor | 60 min |
| **Qua** | Instagram | **Reels 30s** (tela gravada ou fala rápida) | Opinião / Bastidor | 60 min |
| **Qui** | LinkedIn | **Micro-post** (200–400 chars) | Comunidade | 20 min |
| **Sex** | Instagram | **Reels 60s** (demo, caso, bastidor) | Caso / Bastidor | 90 min |
| **Sáb** | Instagram | 1–2 stories (opcional) | Comunidade | 10 min |
| **Dom** | — | descanso | — | 0 min |

**Total:** ~5h30 de execução + 2h30 de gestão (comentários, DMs, Kanban) = **8h/semana**.

### 1.2 Por que SÓ carrossel e Reels (e não imagem estática, texto, lives)

- **Reels** = alcance orgânico gratuito (Instagram prioriza vídeo vertical).
- **Carrossel** = mais saves (sinal forte de qualidade pro algoritmo) e melhor pra conteúdo educativo.
- **Imagem estática** = quase zero alcance em 2026. Só vale como caso de excepção (manifesto, dado forte).
- **Lives** = muito esforço, retorno incerto. Cortar.
- **Texto longo no IG** = alcance pior que Reels. LinkedIn já cobre isso.

### 1.3 Os 2 templates que sustentam a operação

Em vez de criar do zero toda semana, **2 templates mestres** que se repetem com variações:

#### Template A — Carrossel "lista + lição" (Instagram)
```
Slide 1: Título com gancho (problema ou número)
  "5 coisas que travam a produção de criativos da sua agência"
Slide 2: Item 1 + visual limpo
Slide 3: Item 2
Slide 4: Item 3
Slide 5: Item 4
Slide 6: Item 5
Slide 7: Resumo (1 frase)
Slide 8: CTA (link na bio / save / comentário)
```
- **Tempo de produção:** 60–90 min (no Canva, com template)
- **Reaproveita:** virar post LinkedIn (carrossel PDF) e Short YouTube

#### Template B — Reel "tela + voz" (Instagram)
```
0–2s: gancho visual (texto na tela, corte seco, rosto)
2–8s: contexto (1 frase)
8–30s: conteúdo (gravação de tela do ADScale em uso)
30–45s: virada ou conclusão
45–50s: CTA (link na bio, save, comenta "X")
```
- **Tempo de produção:** 30–60 min (CapCut)
- **Reaproveita:** Short YouTube, micro-post LinkedIn

### 1.4 Métricas mínimas (sem obsessão)

| KPI | Meta Mês 1 | Meta Mês 3 |
|-----|-----------|-----------|
| Seguidores IG | 500 | 2.000 |
| Reach médio/Reel | 1.500 | 8.000 |
| Saves/carrossel | 20 | 80 |
| Conexões LinkedIn (ICP) | 100 | 500 |
| Impressões LinkedIn/post | 1.500 | 8.000 |
| DMs inbound/semana | 3 | 15 |
| Posts com >5k views ou impressões (Mês) | 1 | 5 |

A regra: **se Reach/Reel não bate 1.500 no Mês 1, mudar gancho, não aumentar volume**.

---

## 2. Automação da produção — Kanban + rotinas instaladas

> A ideia: **2h por semana** olhando o Kanban, e o sistema cospe posts prontos pra revisar.
> Detalhe completo em [`automacao-conteudo-kanban.md`](./automacao-conteudo-kanban.md).

### 2.1 Stack recomendada (tudo free ou já no toolkit)

| Função | Ferramenta | Custo |
|--------|-----------|-------|
| **Kanban** | Trello (free) ou Notion (free) | R$ 0 |
| **Banco de ideias** | Notion (mesmo lugar do Kanban) | R$ 0 |
| **Agendamento IG/FB** | Meta Business Suite | R$ 0 |
| **Agendamento LinkedIn** | Manual (LinkedIn pune automação 3rd-party) | R$ 0 |
| **Edição de vídeo** | CapCut desktop (instalado) | R$ 0 |
| **Criação de carrossel** | Canva Pro (trial) ou Figma (free) | R$ 0–R$ 30/mês |
| **Copy/caption** | Google Docs (rascunho) + IA (revisão) | R$ 0 |
| **Métricas** | Metricool (free) ou PostHog (já no produto) | R$ 0 |

**Por que Trello/Notion e não Linear/Jira/ClickUp?** Pra 1 pessoa, é over-engineering. Trello free aguenta 90 dias de cards, tem app desktop (instalado) e tem automações nativas (Butler) suficientes.

### 2.2 Estrutura do Kanban (5 colunas)

```
[📥 Ideia]  →  [📝 Brief]  →  [🎨 Em produção]  →  [👀 Revisão]  →  [✅ Pronto/Agendado]
```

### 2.3 As 4 automações nativas (Trello Butler, sem código)

Toda semana o sistema executa:

1. **Card criado em "Ideia"** → cria automaticamente um template com brief (tema, pilar, CTA, copy sugestão).
2. **Card movido pra "Em produção"** → cria checklist com 5 tarefas (gravar tela, gravar voz, editar, legenda, thumbnail).
3. **Card movido pra "Revisão"** → notifica o Jhonatan com botão de aprovação.
4. **Card em "Pronto"** há 7 dias sem postar → alerta pra não ficar parado.

### 2.4 Rotina semanal (instalada na agenda)

| Dia | Horário | Atividade | Tempo |
|-----|---------|-----------|-------|
| **Dom** | 19h | 30 min olhando Trello: aprovar 5 cards, descartar 3, criar 5 novos | 30 min |
| **Seg** | 09h–10h30 | Produzir 1 carrossel | 90 min |
| **Qua** | 09h–10h | Produzir 1 Reels 30s | 60 min |
| **Sex** | 09h–10h30 | Produzir 1 Reels 60s | 90 min |
| **Sex** | 17h | Agendar posts da semana seguinte no Meta Business Suite | 15 min |
| **Diário** | 12h30 | 15 min respondendo comentários + DMs | 15 min |

**Total: ~5h30 produção + 1h30 gestão = 7h/semana. Cabe numa agenda de founder.**

### 2.5 Banco de ideias — 20 prompts pra nunca travar

No Notion, manter uma lista infinita. Quando o card do Trello tá vazio, o Jhonatan puxa 1 prompt e gera 3 posts em 10 minutos.

1. "O erro mais comum que agências cometem em [briefing/variação/formato] é…"
2. "Aqui está o que [X] me ensinou sobre produção criativa…"
3. "A matemática do criativo: por que testar 10 é melhor que testar 2…"
4. "Por que a maioria dos criativos de [segmento] não converte…"
5. "Bastidor: como o ADScale gera [X] em [Y] minutos…"
6. "3 perguntas que todo cliente deveria fazer pro designer antes de aprovar…"
7. "5 coisas que travam a produção de criativos na sua agência…"
8. "O que aprendi lançando [feature] essa semana…"
9. "Por que [concorrente X] faz Y mas eu prefiro Z…"
10. "Como eu organizo 50 criativos no Canva sem enlouquecer…"
11. "A diferença entre [X] e [Y] em produção de criativos…"
12. "Mito: IA mata o designer. Realidade:…"
13. "Antes e depois: [descreve caso real ou fictício]…"
14. "Por que [decisão técnica] do ADScale foi a mais difícil…"
15. "3 Reels que eu faria se tivesse 10 min a mais por dia…"
16. "O post que eu queria ter lido quando comecei a produzir criativos…"
17. "Por que carrossel educativo é o melhor formato pra [X]…"
18. "Como usar [feature do ADScale] em 30 segundos…"
19. "Feedback real de cliente (verbatim)…"
20. "O que ninguém te conta sobre escalar produção criativa…"

---

## 3. Anúncios — campanha inicial de lançamento

> Detalhe operacional e copy pronta em [`ads-lancamento.md`](./ads-lancamento.md).
> Resumo executivo aqui.

### 3.1 Por que ads já no lançamento (e não só na Fase 3)

O plano de lançamento original deixava ads pra depois de 200 signups. **Mudar essa ordem** porque:

- A base orgânica sozinha vai demorar pra atingir volume.
- Ads com **copy validada organicamente** (a que já tá performando nos posts) entram com CPL baixo.
- O funil precisa de tráfego pago pra treinar o algoritmo de lookalike desde cedo.

### 3.2 Estrutura de campanha (3 frentes paralelas)

| Campanha | Canal | Objetivo | Budget mês 1 | Budget mês 2–3 |
|----------|-------|----------|--------------|----------------|
| **A — Waitlist Scale** | Meta Ads (FB + IG) | Capturar leads pra waitlist | R$ 800 | R$ 1.500 |
| **B — Search Capture** | Google Ads (Search) | Capturar demanda existente (keywords) | R$ 500 | R$ 800 |
| **C — LinkedIn ICP** | LinkedIn Ads | Decisor B2B (dono de agência) | R$ 700 | R$ 1.200 |
| **Total** | | | **R$ 2.000** | **R$ 3.500** |

### 3.3 Métricas de corte (kill switch)

| KPI | Meta mínima | Ação se não bater |
|-----|-------------|--------------------|
| **CPL (custo por lead)** | ≤ R$ 8 (Meta), ≤ R$ 12 (Google), ≤ R$ 25 (LinkedIn) | Pausar anúncio, iterar copy |
| **CTR** | ≥ 1% (Meta), ≥ 3% (Google) | Trocar gancho, não orçamento |
| **Taxa de conversão waitlist → trial** | ≥ 15% | Rever página de waitlist |
| **ROAS** (trial → pago, mês 3) | ≥ 2x | Rever oferta de pricing |

### 3.4 Estrutura de anúncios (3 criativos por campanha)

**Para cada frente**, 3 criativos testando ângulos diferentes:

- **Ângulo 1 — Dor:** "Sua agência está travada no gargalo da produção de criativos?"
- **Ângulo 2 — Resultado:** "Como gerar 30 variações de criativo em 20 minutos."
- **Ângulo 3 — Curiosidade/Prova:** "Como uma agência produziu 200 criativos em 1 semana (sem contratar ninguém)."

**Reaproveitamento:** os Reels e carrosséis orgânicos que performam bem viram anúncios. Não criar criativo separado pra ads. Isso é o que economiza o esforço de 1 pessoa.

---

## 4. E-mail marketing — sequência completa

> Copy completa de todos os e-mails em [`sequencia-emails.md`](./sequencia-emails.md).
> Resumo das sequências aqui.

### 4.1 Stack de e-mail

**Recomendado:** **Resend** (já está no stack do ADScale) + **Loops** ou **Resend Audiences**.

- **Resend** já tem domínio configurável, tracking de abertura, e integração com React Email.
- **Loops** (R$ 0 até 1k contatos) é mais amigável pra automações visuais.
- **Resend Audiences** é suficiente se orçamento for zero e a base for < 500 contatos.

### 4.2 As 6 sequências de e-mail

| # | Sequência | Trigger | E-mails | Objetivo |
|---|-----------|---------|---------|----------|
| **1** | **Boas-vindas waitlist** | Signup na waitlist | 3 (D+0, D+3, D+7) | Manter lead quente, entregar valor, mostrar bastidor |
| **2** | **Anúncio de lançamento** | T-7, T-3, T-1, T0 | 4 | Converter waitlist em trial no dia 0 |
| **3** | **Onboarding trial** | Signup no produto | 5 (D+0, D+1, D+3, D+7, D+12) | Levar trial até 1ª derivação aprovada (ativação) |
| **4** | **Recuperação de trial** | Trial inativo 3+ dias | 3 (D+3, D+7, D+11) | Trazer de volta antes de expirar |
| **5** | **Conversão trial → pago** | D-3, D-1, D0 (fim do trial) | 3 | Converter em assinatura paga |
| **6** | **Reativação de antigos trials** | Trial expirou sem pagar, 30+ dias | 2 | Reabordagem com nova feature/social proof |

### 4.3 KPIs de e-mail

| Métrica | Meta |
|---------|------|
| **Taxa de abertura** | ≥ 35% (welcome), ≥ 25% (nurture) |
| **Taxa de clique (CTOR)** | ≥ 8% (welcome), ≥ 4% (nurture) |
| **Taxa de conversão welcome → trial** | ≥ 15% |
| **Trial → pago** | ≥ 20% |
| **Reativação** | ≥ 5% |

### 4.4 Princípios de copy (consistente com `brand/tom-de-voz.md`)

- **Assunto ≤ 50 caracteres**, sem caps, sem emoji de exclamação.
- **1 CTA por e-mail** (botão principal + 1 link secundário opcional).
- **Pessoa escreve pra pessoa.** Sem "Prezado cliente", sem "não perca esta oportunidade".
- **Linha de assunto que diz o que tem dentro.** Sem clickbait.
- **Rodapé com descadastro** (LGPD/CAN-SPAM compliance, sem exceção).

---

## 5. Calendário executivo de 90 dias

> Detalhe dia-a-dia em [`calendario/90-dias.md`](./calendario/90-dias.md).
> Visão macro aqui.

### 5.1 Fases alinhadas ao `launch/timeline.md`

| Fase | Semanas | Foco principal | Métrica dominante |
|------|---------|----------------|--------------------|
| **Fase 1 — Aquecimento** | -8 a -5 | Conteúdo orgânico + Kanban rodando | Seguidores, impressões, ideias geradas |
| **Fase 2 — Espera ativa** | -4 a -2 | Waitlist crescendo, ads A/B testando | Signups waitlist, CPL |
| **Fase 3 — Lançamento** | -1 a +2 | T0 + sequência de e-mails + ads no talo | Trial → pago |
| **Fase 4 — Tração** | +3 a +4 | Otimização de tudo, cases | MRR, churn, ROAS |

### 5.2 Esforço semanal por fase

| Fase | Redes | Ads | E-mail | **Total** |
|------|-------|-----|--------|-----------|
| Fase 1 (sem -8 a -5) | 8h | — | 1h | **9h** |
| Fase 2 (sem -4 a -2) | 8h | 2h | 2h | **12h** |
| Fase 3 (sem -1 a +2) | 10h | 3h | 3h | **16h** |
| Fase 4 (sem +3 a +4) | 6h | 2h | 2h | **10h** |

**Total: ~170 horas em 90 dias.** Equivale a ~12 horas/semana nas 14 semanas. Cabe numa agenda de founder com folga.

---

## 6. Riscos e mitigações (específicos deste plano)

| Risco | Mitigação |
|-------|-----------|
| Founder cansa e para | Frequência foi cortada ao mínimo viável (8h/sem redes). Kanban automatiza o que dá. Domingo é sagrado. |
| Conteúdo fica raso/repetitivo | 20 prompts rotativos + 5 pilares cobrem 90% do que o ICP quer ver. Banco de ideias é infinito. |
| Ads queima dinheiro com copy ruim | Só escala anúncio orgânico que já performou. Kill switch de CPL. R$ 500/mês de teste antes de escalar. |
| E-mail vai pro spam | Domínio próprio + SPF/DKIM/DMARC (Resend configura). Conteúdo relevante, sem imagem pesada, sem link encurtado. |
| Kanban vira bagunça | 1 revisão semanal de 30 min pra limpar. Regra: card parado há 14 dias é deletado. |
| Lançamento atrasa | Plano tem 8 semanas de buffer. Só entra em Fase 3 quando waitlist ≥ 800 e produto tem 3 beta testers ativos. |

---

## 7. O que NÃO está neste plano (e por quê)

- **TikTok separado do IG:** IG Reels e TikTok têm o mesmo conteúdo. Não duplicar.
- **Newsletter própria:** cedo demais. A waitlist + 6 sequências cobrem o fluxo. Newsletter mensal entra no Mês 4.
- **YouTube longo no Mês 1:** esforço alto, retorno lento. Começa com 1 short/semana (corte de Reel). Vídeo longo só a partir do Mês 2.
- **Pinterest, X, Threads:** canais com baixa concentração do ICP (gestor de tráfego, dono de agência). Não perder tempo.
- **Comunidade/Slack próprio:** premature. Escalar quando MRR ≥ R$ 5k.

---

## 8. Decisões que precisam ser tomadas antes de começar

1. **Trello ou Notion** como Kanban? (Recomendo Trello — automações Butler são mais simples.)
2. **Loops ou só Resend Audiences** pra e-mail? (Loops se ≥ 500 contatos esperados no Mês 1; senão, Resend puro.)
3. **Domínio de e-mail próprio** configurado no Resend? (Essencial. Sem isso, vai pro spam.)
4. **Orçamento de ads aprovado** (R$ 2.000/mês × 3 meses = R$ 6.000)? Sem isso, pularFrente 3.
5. **Pixel do Meta e tag do Google** já instalados no site? (Sem isso, ads não otimizam.)

---

*Mantido em `marketing/2026-Q3/` · PT-BR · Última atualização: 2026-06-23*
