# Automação de Conteúdo — Kanban + Rotinas Instaladas

> Como rodar a produção de conteúdo com 1 pessoa e ~5h30/semana,
> usando Trello (ou Notion) + automações nativas + ferramentas instaladas.
>
> **Por que este doc existe:** Jhonatan quer produzir Reels e carrossel
> "do mais simples possível". A resposta não é cortar volume, é cortar
> fricção — template, automação e rotina fixa.

---

## 1. Stack final (tudo free ou já disponível)

| Função | Ferramenta | Custo | Por que |
|--------|-----------|-------|---------|
| **Kanban** | Trello (free) — app desktop instalado | R$ 0 | Automações nativas (Butler) suficientes. App desktop permite trabalhar offline. |
| **Banco de ideias** | Notion (free) ou Google Sheets | R$ 0 | Infinito, editável de qualquer lugar, exportável. |
| **Briefing de post** | Template do Trello (campos custom) | R$ 0 | Força o Jhonatan a pensar antes de criar. |
| **Edição de vídeo** | CapCut desktop (instalado) | R$ 0 | Atalhos, templates, export rápido. |
| **Edição de carrossel** | Canva (Pro trial 30 dias, depois free) | R$ 0–R$ 30/mês | Templates prontos, resize automático. |
| **Agendamento IG/FB** | Meta Business Suite (nativo) | R$ 0 | Sem limite, integração com IG e FB. |
| **Agendamento LinkedIn** | Manual (postar direto) | R$ 0 | LinkedIn pune tools 3rd-party no alcance orgânico. |
| **Thumbnail YouTube** | Canva | R$ 0 | Templates prontos, fonte bold. |
| **Métricas unificadas** | Metricool (free) | R$ 0 | IG + LinkedIn + YouTube em 1 dashboard. |
| **Tracking no site** | PostHog (já no produto) | R$ 0 | Já configurado, só ativar. |

**Custo total: R$ 0–R$ 30/mês.** O CapCut e o Trello são **apps instalados** (como o usuário pediu).

---

## 2. Estrutura do Kanban (5 colunas)

```
┌──────────┐    ┌──────────┐    ┌────────────────┐    ┌──────────┐    ┌──────────────┐
│ 📥 IDEIA │ -> │ 📝 BRIEF │ -> │ 🎨 EM PRODUÇÃO │ -> │ 👀 REVISÃO│ -> │ ✅ PRONTO    │
│          │    │          │    │                │    │          │    │              │
│ Tópico   │    │ Tema,    │    │ Gravação,      │    │ Aprovação│    │ Agendado em  │
│ bruto    │    │ pilar,   │    │ edição, legenda│    │ final    │    │ Meta / YouTube│
│          │    │ CTA      │    │                │    │          │    │              │
└──────────┘    └──────────┘    └────────────────┘    └──────────┘    └──────────────┘
```

**Regras de fluxo:**

- **IDEIA → BRIEF:** quando virar prioridade da semana (revisão domingo).
- **BRIEF → EM PRODUÇÃO:** quando Jhonatan sentar pra produzir (seg/qua/sex de manhã).
- **EM PRODUÇÃO → REVISÃO:** quando terminar edição, antes de agendar.
- **REVISÃO → PRONTO:** quando aprovar (não perfectionismo — 5 min de revisão e segue).
- **Card parado em qualquer coluna há 14 dias:** deletado automaticamente (regra Butler).

**Regra de ouro:** nenhum card fica mais que 7 dias em "EM PRODUÇÃO". Se ficou, quebrar em 2 posts.

---

## 3. Template de card (obrigatório)

Quando um card entra em "BRIEF", já vem com estes campos preenchidos (template do Trello):

```markdown
## 🎯 Tema
[Frase resumida do tema em 1 linha]

## 🏷️ Pilar
[ ] Bastidor   [ ] Educação   [ ] Opinião   [ ] Caso   [ ] Comunidade

## 📐 Formato
[ ] Reel 30s   [ ] Reel 60s   [ ] Carrossel 5-7 slides   [ ] Short YT   [ ] Micro-post LI

## 🎙️ Gancho (primeiros 2 segundos / primeira linha)
[Frase exata que vai abrir o post]

## 💡 Conteúdo principal (3 bullets)
- 
- 
- 

## 🪝 CTA
[ ] Salvar   [ ] Comentar "X"   [ ] Link na bio   [ ] Mandar DM   [ ] Save + Share

## 📅 Data alvo
[dd/mm]

## 🔗 Reaproveita em
[ ] LinkedIn (post)   [ ] LinkedIn (carrossel PDF)   [ ] YouTube Short
```

**Por que campos obrigatórios?** Força o Jhonatan a decidir ANTES de produzir. Evita o "vou fazendo e vejo no que dá" (que vira 3h de edição sem direção).

---

## 4. As 4 automações nativas (Trello Butler)

### 4.1 Auto-criação de checklist na entrada em "EM PRODUÇÃO"

**Trigger:** card movido para coluna "EM PRODUÇÃO".
**Ação:** adicionar checklist:

```
[ ] Gravar tela / voz (10 min)
[ ] Importar pro CapCut (2 min)
[ ] Editar (20 min)
[ ] Adicionar legenda / texto na tela (10 min)
[ ] Exportar (2 min)
[ ] Renomear arquivo com padrão [data]_[canal]_[formato].mp4
```

**Por que:** checklist visível = zero chance de pular etapa. Reduz a "eu esqueci de gravar legenda" de toda semana.

### 4.2 Auto-template na criação em "IDEIA"

**Trigger:** card criado na coluna "IDEIA".
**Ação:** adicionar o template de card descrito na seção 3 acima, com 5 prompts de ideia pré-preenchidos.

**Por que:** card vazio = ideia perdida. Card com template = ideia que tem chance de virar post.

### 4.3 Notificação de aprovação na entrada em "REVISÃO"

**Trigger:** card movido para coluna "REVISÃO".
**Ação:** enviar notificação push + e-mail com link direto pro card.

**Por que:** Jhonatan pode estar longe do Trello. Notificação puxa ele de volta no momento certo.

### 4.4 Limpeza semanal (regra anti-entropia)

**Trigger:** todo domingo 23h.
**Ação:**

- Listar todos os cards em "IDEIA" com mais de 30 dias → mover pra arquivo.
- Listar todos os cards em "EM PRODUÇÃO" há mais de 14 dias → deletar (sem dó).
- Listar todos os cards em "PRONTO" há mais de 7 dias sem postar → alerta (provavelmente foi esquecido).

**Por que:** Kanban com 200 cards = Kanban que ninguém olha. Manter enxuto.

---

## 5. Rotina semanal (instalada na agenda do Jhonatan)

> Recorte para 1 pessoa. Total: 7h/semana, dividido em blocos curtos.

### Domingo (30 min) — planejamento
- 19h00–19h30: sentar na frente do Trello.
- Aprovar 5 cards que estão em "IDEIA" → mover pra "BRIEF".
- Descartar 3 cards ruins (mover pra arquivo).
- Criar 5 cards novos (puxar do banco de ideias do Notion).
- Verificar posts da semana seguinte estão todos em "PRONTO".

### Segunda (90 min) — carrossel
- 09h00–09h15: pegar 1 card de "BRIEF" → mover pra "EM PRODUÇÃO".
- 09h15–10h15: abrir Canva, escolher template de carrossel, editar slides.
- 10h15–10h30: exportar PNG, escrever legenda, agendar no Meta Business Suite.
- Mover card pra "PRONTO".

### Terça (60 min) — LinkedIn
- 09h00–09h15: pegar 1 card de "BRIEF" (post longo).
- 09h15–09h45: escrever post no Google Docs (rascunho).
- 09h45–10h00: revisar tom (conferir `brand/tom-de-voz.md`).
- 10h00–10h15: postar no LinkedIn + colocar link do post nos comentários.
- Mover card pra "PRONTO".

### Quarta (60 min) — Reel 30s
- 09h00–09h15: pegar 1 card → mover pra "EM PRODUÇÃO".
- 09h15–09h30: gravar tela/voz (Celular + Loom ou OBS).
- 09h30–09h50: editar no CapCut (cortes, legenda, texto).
- 09h50–10h00: exportar + agendar no Meta Business Suite.

### Quinta (20 min) — micro-post LinkedIn
- 12h30–12h50: 1 micro-post rápido (200–400 chars) puxado de ideia do banco.

### Sexta (90 min) — Reel 60s
- 09h00–09h15: pegar 1 card → mover pra "EM PRODUÇÃO".
- 09h15–09h35: gravar (pode ser demo, caso, bastidor).
- 09h35–10h15: editar CapCut + legenda + agendar.

### Sábado (10 min) — story opcional
- 1–2 stories de bastidor, enquete ou repost.

### Diário (15 min) — gestão
- 12h30–12h45: responder comentários, DMs, mover 1–2 cards de "REVISÃO" pra "PRONTO".

---

## 6. Os 2 templates mestres (repetição inteligente)

> A regra é: **2 templates, infinitas variações**. Não criar do zero toda semana.

### Template A — Carrossel educativo (Instagram, 5–7 slides)

**Estrutura visual (Canva):**
```
Slide 1: Título com gancho (problema ou número)
Slide 2: Ponto 1
Slide 3: Ponto 2
Slide 4: Ponto 3
Slide 5: Ponto 4
Slide 6: Ponto 5 (opcional)
Slide 7: Resumo (1 frase)
Slide 8: CTA (link na bio / save / comentário)
```

**Exemplos de título slide 1 (rotacionar):**
- "5 coisas que travam a produção de criativos da sua agência"
- "3 erros que todo designer de ads comete no briefing"
- "Por que seus criativos não convertem (e como testar 10x mais)"
- "Como organizar 50 criativos no Canva sem enlouquecer"
- "A matemática do criativo: por que testar 10 é melhor que testar 2"

**Tempo:** 60–90 min no Canva (com template).
**Reaproveita:** vira post LinkedIn (carrossel PDF) + Short YouTube.

### Template B — Reel "tela + voz" (Instagram, 30s ou 60s)

**Estrutura narrativa:**
```
0–2s: gancho (texto na tela, corte seco, ou frase polêmica)
2–8s: contexto (1 frase)
8–25s: conteúdo (gravação de tela, demo, ou bastidor)
25–30s: conclusão + CTA
```

**Variações de gancho (rotacionar):**
- "[Número] que você não sabia sobre [tema]"
- "Por que [coisa popular] está errada"
- "Aqui está o que aprendi [tempo] fazendo [atividade]"
- "3 segundos pra entender [conceito]"
- "[Pergunta provocativa]?"

**Tempo:** 30–60 min (gravar 10 min + editar 30 min).
**Reaproveita:** Short YouTube (mesma edição, legenda EN) + micro-post LinkedIn (print + frase).

---

## 7. Banco de ideias (Notion)

Lista infinita. Jhonatan adiciona ideia a qualquer momento, sem filtro. O filtro acontece no domingo.

### 7.1 Estrutura no Notion

```
| Tópico | Pilar | Ângulo | Fonte/inspiração | Status |
|--------|-------|--------|--------------------|--------|
| IA substitui designers? | Opinião | Mito vs Realidade | Pergunta no LinkedIn | Bruto |
| ... | ... | ... | ... | ... |
```

**Status possíveis:** `Bruto` → `Refinado` → `No Trello` → `Publicado` → `Reaproveitado`.

### 7.2 Os 20 prompts-base (pra gerar ideias em 5 min)

Quando o Jhonatan estiver sem ideia, abrir o Notion, fechar os olhos, escolher 1 prompt, escrever a resposta. Pronto, 1 ideia nova.

1. "O erro mais comum que agências cometem em [briefing/variação/formato] é…"
2. "Aqui está o que [X meses/anos] me ensinou sobre produção criativa…"
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

## 8. Regras de qualidade (mínimas, sem obsessão)

- **Tamanho mínimo de fonte em carrossel:** 28pt na arte final.
- **Duração mínima de Reel:** 15s. **Máxima:** 60s (exceção: demo 90s).
- **Gancho em 2 segundos:** se não prendeu nesses 2s, regravar.
- **1 CTA por post:** nunca 2 botões. Confunde.
- **Hashtags IG:** 8–10 máx. Misturar 2–3 grandes + 3–4 médias + 2–3 nichadas.
- **Hashtags LinkedIn:** ≤ 3 ou nenhuma.
- **Legenda:** primeiro caractere já é o gancho. LinkedIn: 3 linhas visíveis antes do "ver mais".

---

## 9. O que NÃO fazer (anti-padrões comuns em 1-founder-SaaS)

- ❌ Tentar ser perfeito. >80% de qualidade publicado > 100% não publicado.
- ❌ "Investir 3 dias num Reel". Capricho ≠ qualidade. Reels com 90% de qualidade e publicado > 100% no rascunho.
- ❌ Misturar 5 canais no Mês 1. IG + LinkedIn cobrem 90% do ICP.
- ❌ Reels sem fala/voz (só texto na tela) — performa pior em 2026.
- ❌ Imagem estática solta — alcance morreu em 2026.
- ❌ Conteúdo "motivacional de coach" — vai contra `brand/tom-de-voz.md`.
- ❌ Responder comentário com "obrigado!" seco. Sempre adicionar valor (1 frase útil, concordar com argumento, fazer pergunta).
- ❌ Ficar olhando métricas todo dia. **Métricas 1× por semana**, domingo.

---

## 10. Setup inicial (1 tarde)

| Passo | Tempo |
|-------|-------|
| Criar board Trello com 5 colunas | 10 min |
| Configurar 4 automações Butler (descritas seção 4) | 30 min |
| Criar template de card (seção 3) | 15 min |
| Criar 2 templates Canva (carrossel + Reel frame) | 45 min |
| Instalar CapCut desktop + configurar atalhos | 15 min |
| Criar banco de ideias no Notion com 20 prompts-base | 30 min |
| Criar 10 cards iniciais em "IDEIA" (puxar dos prompts) | 30 min |
| Configurar Meta Business Suite + agendar 3 posts | 20 min |
| **Total** | **~3h15** |

**Quando:** uma tarde de sábado. Pronto pra rodar na segunda.

---

*Mantido em `marketing/2026-Q3/` · PT-BR · Última atualização: 2026-06-23*
