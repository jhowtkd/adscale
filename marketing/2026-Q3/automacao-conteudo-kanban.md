# Kanban de Conteúdo — ADScale (no repo)

> Sem Trello. Sem Notion. Sem ferramenta externa. O Kanban vive aqui,
> em 4 arquivos `.md`, um por coluna. Mover o card de arquivo conforme
> avança (ou copiar o bullet de um arquivo pro outro).
>
> **Por que aqui:** você disse "vamos gerir por aqui mesmo".
> 1 pessoa não precisa de ferramenta terceira — só precisa de
> 4 arquivos e 1 rotina de domingo.

---

## 0. Estrutura

```
marketing/2026-Q3/kanban/
├── 01-ideias.md       (banco infinito, sem filtro)
├── 02-briefs.md       (cards priorizados da semana)
├── 03-prontos.md      (cards finalizados, prontos pra agendar)
└── 04-publicados.md   (log de posts publicados)
```

---

## 1. Como cada arquivo funciona

### `01-ideias.md` — Banco infinito (sem filtro)

Aqui entra TUDO. Não julgue. Anote a ideia e siga. Quanto mais denso, melhor.

```markdown
# 💡 Banco de Ideias

> Banco infinito. Adicione sem filtro. Filtre domingo à noite.

## Tópicos brutos

- [ ] "5 coisas que travam a produção de criativos da sua agência" — Pilar: Educação
- [ ] "Por que IA não mata o designer" — Pilar: Opinião
- [ ] "Bastidor: como geramos 24 variações em 11 min" — Pilar: Bastidor
- [ ] "3 perguntas que todo cliente deveria fazer pro designer antes de aprovar" — Pilar: Educação
- [ ] "A matemática do criativo: por que testar 10 é melhor que testar 2" — Pilar: Opinião
...
```

**Regra:** deletar daqui só se a ideia for manifestamente ruim (ex: ofensiva). Não deletar por preguiça.

### `02-briefs.md` — Cards priorizados da semana

Aqui mora o que vai virar post **essa semana**. 3 cards = 1 semana.

```markdown
# 📝 Briefs da semana

> Atualizar todo domingo à noite. 3 cards por semana (1 carrossel + 1 Reels + 1 LinkedIn).
> Apagar cards da semana passada que não foram produzidos.

## Semana [dd/mm] a [dd/mm]

### 🎯 Slot 1 — Carrossel IG (segunda)
- **Tema:** 5 coisas que travam a produção de criativos
- **Pilar:** Educação
- **Formato:** Carrossel 6 slides
- **Slide 1 (gancho):** "5 coisas que travam a produção de criativos da sua agência"
- **Slides 2–6 (1 ponto por slide):**
  1. Variação tratada como projeto individual
  2. Briefing vago que gera retrabalho
  3. Adaptação de formato feita à mão
  4. Decisão de aprovação por e-mail/Slack
  5. Zero teste A/B
- **CTA final:** "Link na bio pra esperar o ADScale"
- **Pessoa que produz:** Jhonatan
- **Prazo:** segunda 10h

### 🎯 Slot 2 — Reels IG (quarta)
- **Tema:** 24 variações em 11 min
- **Pilar:** Bastidor
- **Formato:** Reels 30s, tela + voz
- **Gancho:** "24 variações de criativo. 11 minutos. Sem designer."
- **Conteúdo:** gravar tela gerando derivações
- **CTA:** "Link na bio pra esperar o ADScale"

### 🎯 Slot 3 — Post LinkedIn (sexta)
- **Tema:** Most agencies are wrong about creative production
- **Pilar:** Opinião
- **Formato:** Post longo (1.200–1.500 chars, EN)
- **Gancho (1ª linha):** "Most agencies treat ad creative variation as a project. It isn't."
- **CTA:** link nos comentários (não no corpo)
```

**Regra:** card que não foi produzido até sexta = deletado. Sem culpa. Próxima semana tem 3 novos.

### `03-prontos.md` — Finalizados, prontos pra agendar

Aqui entra o post **produzido** mas ainda não publicado.

```markdown
# ✅ Posts prontos (aguardando agendamento)

> Posts com arquivo final exportado + legenda escrita.
> Quando agendar, mover pro `04-publicados.md`.

## Semana [dd/mm]

- [x] **Carrossel #1** — "5 coisas que travam..."
  - Arquivo: `2026-06-30_carrossel-1.png`
  - Legenda: "..."
  - Data agendada: 2026-06-30 09:00
  - Plataforma: Meta Business Suite

- [x] **Reels #1** — "24 variações em 11 min"
  - Arquivo: `2026-07-02_reels-1.mp4`
  - Legenda: "..."
  - Data agendada: 2026-07-02 09:00

- [x] **Post LinkedIn #1** — "Most agencies are wrong..."
  - Arquivo: copiado no Google Docs (postar manualmente)
  - Data agendada: 2026-07-04 09:00
```

**Regra:** mais que 7 dias aqui = alerta. Provavelmente foi esquecido.

### `04-publicados.md` — Log do que já foi publicado

Aqui mora o histórico. Pra consultar retrospecto e medir.

```markdown
# 📚 Histórico de publicações

> Toda semana adiciona as linhas dos posts que foram ao ar.
> Formato: tabela pra dar pra filtrar/exportar.

| Data | Canal | Formato | Tema | Link | Views | Saves | Leads |
|------|-------|---------|------|------|-------|-------|-------|
| 2026-06-30 | IG | Carrossel | 5 erros de produção | https://... | — | — | — |
| 2026-07-02 | IG | Reels 30s | 24 variações em 11 min | https://... | — | — | — |
| 2026-07-04 | LinkedIn | Post longo | Most agencies are wrong | https://... | — | — | — |
```

**Métricas:** preencher na sexta à noite (sábado de manhã no máximo). Não virar refém de números diários.

---

## 2. Fluxo

```
   ┌─────────────┐
   │ 01-ideias   │ ← adiciona a qualquer momento
   └──────┬──────┘
          │ domingo 19h, escolher 3
          ↓
   ┌─────────────┐
   │ 02-briefs   │ ← prioriza + desenvolve
   └──────┬──────┘
          │ produz (seg/qua/sex)
          ↓
   ┌─────────────┐
   │ 03-prontos  │ ← arquivo final + legenda
   └──────┬──────┘
          │ agenda + publica
          ↓
   ┌─────────────┐
   │ 04-publicados│ ← log + métricas
   └─────────────┘
```

---

## 3. Rotina semanal (instalada)

| Dia | Horário | Atividade | Tempo |
|-----|---------|-----------|-------|
| **Dom** | 19h | Olhar `01-ideias.md`, escolher 3, copiar pra `02-briefs.md` | 15 min |
| **Seg** | 09h | Pegar Slot 1 do `02-briefs.md`, produzir carrossel, mover pra `03-prontos.md` | 60 min |
| **Qua** | 09h | Pegar Slot 2 do `02-briefs.md`, produzir Reels, mover pra `03-prontos.md` | 45 min |
| **Sex** | 09h | Pegar Slot 3 do `02-briefs.md`, escrever post LinkedIn, mover pra `03-prontos.md` | 45 min |
| **Sex** | 17h | Agendar posts da semana no Meta Business Suite (e LinkedIn direto) | 10 min |
| **Diário** | 12h30 | Responder comentários, DMs | 10 min |
| **Sáb** | 09h | Preencher métricas da semana anterior em `04-publicados.md` | 10 min |

**Total: ~3h40/semana.**

---

## 4. Como mover um card entre arquivos

**Opção A — Mover (cortar/colar):** se você quer manter o kanban enxuto, copie o conteúdo de um arquivo, delete do anterior, e cole no novo.

**Opção B — Marcar como feito (mais simples):** mantém o card no arquivo antigo e adiciona `[FEITO]` ou `[MOVIDO PARA 04]` no início. Mais bagunçado, mas zero risco de perder contexto.

**Recomendação:** Opção B nas primeiras 2 semanas pra pegar o jeito. Depois migra pra Opção A.

---

## 5. Regras de qualidade (mínimas)

- **Tamanho mínimo de fonte em carrossel:** 28pt na arte final.
- **Duração de Reels:** 15–30s (cortar 60s por enquanto, esforço alto).
- **Gancho em 2 segundos:** se não prendeu nesses 2s, regravar.
- **1 CTA por post:** nunca 2 botões.
- **Hashtags IG:** 8–10 máx. Misturar 2–3 grandes + 3–4 médias + 2–3 nichadas.
- **Hashtags LinkedIn:** ≤ 3 ou nenhuma.
- **Sem "TL;DR" no fim do post:** se é longo demais, encurta.
- **Responder TODOS os comentários** no 1º dia. Depois, só os relevantes.

---

## 6. Banco de 20 prompts pra nunca travar

Quando o `01-ideias.md` tiver vazio, abrir esta lista, escolher 1, escrever a resposta em 1 frase. Pronto, ideia nova.

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

## 7. Setup inicial (1 tarde)

| Passo | Tempo |
|-------|-------|
| Criar os 4 arquivos .md com template (este doc mostra) | 15 min |
| Adicionar 10 ideias iniciais no `01-ideias.md` (puxar dos 20 prompts) | 30 min |
| Configurar 2 templates no Canva (carrossel + frame de Reels) | 45 min |
| Instalar CapCut desktop + configurar atalhos | 15 min |
| Conectar Meta Business Suite à conta IG (postar + agendar) | 20 min |
| **Total** | **~2h** |

**Quando:** uma tarde de sábado. Pronto pra rodar na segunda.

---

## 8. Métricas pra acompanhar (sem obsessão)

| KPI | Onde olhar | Frequência |
|-----|-----------|------------|
| **Alcance / saves / DMs** | Instagram Insights | Semanal (sábado de manhã) |
| **Impressões / comentários LinkedIn** | LinkedIn dashboard nativo | Semanal |
| **Leads na waitlist** | PostHog ou planilha | Semanal |
| **Abertura de e-mail** | Resend | Semanal |
| **Trial → pago** | Stripe | Semanal |

**Regra:** abrir painel 1× por semana, sábado de manhã, 10 min. Não ficar olhando todo dia.

---

*Mantido em `marketing/2026-Q3/` · PT-BR · Última atualização: 2026-06-23*
