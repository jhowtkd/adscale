# Kanban de Conteúdo — ADScale (no repo, v2)

> Sem Trello. Sem Notion. Sem ferramenta externa. O Kanban vive aqui, em 4 arquivos `.md`, um por coluna. Mover o card de arquivo conforme avança (ou copiar o bullet de um arquivo pro outro).
>
> **Versão 2 (2026-06-26)** — alinhada com ADRs 0001–0009. **Q3 (até set/2026):** 6 peças/sem (3 IG + 3 LI, sem Short).
>
> **Por que aqui:** você disse "vamos gerir por aqui mesmo". 1 pessoa não precisa de ferramenta terceira — só precisa de 4 arquivos + Banco de Teses + ritual de domingo.

---

## 0. Estrutura

```
marketing/2026-Q3/kanban/
├── 01-ideias.md       # banco infinito, sem filtro (materno do Banco de Teses)
├── 02-briefs.md       # cards priorizados da semana (6 no Q3)
├── 03-prontos.md      # cards finalizados, prontos pra agendar
└── 04-publicados.md   # log de posts publicados + métricas
```

Estrutura complementar (fonte de pautas maduras):
```
marketing/2026-Q3/banco-teses/
├── inbox/                       # items brutos da semana
├── sources/from-tier2/          # concorrência + SEO
└── tese-00X-titulo-curto.md     # 1 tese defensável por arquivo
```

---

## 1. Como cada arquivo funciona

### `01-ideias.md` — Banco infinito (sem filtro)

Aqui entra TUDO que ainda não virou tese. Não julgue. Anote a ideia e siga. Quanto mais denso, melhor.

```markdown
# 💡 Banco de Ideias (pré-tese)

> Banco infinito. Adicione sem filtro. Filtre domingo à noite no Banco de Teses.
> Quando uma ideia vira tese (claim + prova + implicação), mover pra `banco-teses/tese-00X-*.md`.

## Tópicos brutos

<!-- Adicione bullets abaixo. Formato: "- [ ] 'título' — Pilar: [A-Tese / B-Experimento / C-Bastidor] — origem: [pergunta DM / trend / concorrente / newsletter / perfil]" -->

- [ ] "5 coisas que travam a produção de criativos da sua agência" — Pilar: B-Experimento — origem: pergunta ICP
- [ ] "Por que IA não mata o designer (e o que mata)" — Pilar: A-Tese — origem: trend do nicho
- [ ] "Bastidor: como geramos 24 variações em 11 min" — Pilar: B-Experimento — origem: bastidor ADScale
...
```

**Regra:** deletar daqui só se a ideia for manifestamente ruim (ex: ofensiva). Não deletar por preguiça.

### `02-briefs.md` — Cards priorizados da semana

Aqui mora o que vai virar post **essa semana**. **6 cards = 1 semana Q3** (sem Short).

```markdown
# 📝 Briefs da semana [DD/MM]

> Atualizar todo domingo à noite (sessão-âncora, Bloco C/D).
> 6 cards por semana (3 IG + 3 LI, sem Short no Q3).
> Apagar cards da semana passada que não foram produzidos.

## Semana [DD/MM] a [DD/MM]

### 🎯 Slot 1 — Carrossel IG (segunda)
- **Data:** YYYY-MM-DD
- **Tema:** [1 frase]
- **Pilar Lab Notes:** A — Tese
- **Formato:** Carrossel híbrido 7 slides (1080×1350)
- **Esqueleto:** Provocação → Argumento → Prova
- **Tese de origem:** `banco-teses/tese-00X-titulo.md`
- **Copy draft:**
  - Slide 1 (gancho): "..."
  - Slide 2 (provocação): "..."
  - Slide 3-5 (argumentos com prova): "..."
  - Slide 6 (síntese): "..."
  - Slide 7 (CTA): "..."
- **CTA final:** "..."
- **Origem da pauta:** Tier 1 (pergunta ICP)
- **Status:** brief

### 🎯 Slot 2 — Post LinkedIn (terça)
- **Data:** YYYY-MM-DD
- **Tema:** [1 frase]
- **Pilar Lab Notes:** A — Tese
- **Formato:** Post longo EN (1.200–1.500 chars)
- **Esqueleto:** Provocação → Argumento → Prova
- **Tese de origem:** ...
- **Copy draft (EN):**
  - Linha 1 (gancho): "..."
  - Linha 2-N (desenvolvimento): "..."
  - Última linha (CTA/pergunta): "..."
- **CTA final:** link nos comentários
- **Origem da pauta:** ...
- **Status:** brief

### 🎯 Slot 3 — Reels IG (quarta)
- **Data:** YYYY-MM-DD
- **Tema:** [1 frase]
- **Pilar Lab Notes:** B — Experimento
- **Formato:** Reels Lab Notes (60–90s)
- **Esqueleto:** Premissa → Gargalo → Tese → Demo → Evidência → CTA
- **Tese de origem:** ...
- **Roteiro (Lab Notes):**
  - 0–3s (gancho): "..."
  - 3–10s (premissa): "..."
  - 10–20s (gargalo): "..."
  - 20–50s (tese + demo): "..."
  - 50–70s (evidência): "..."
  - 70–90s (CTA): "..."
- **CTA final:** link na bio / save / comentário
- **Origem da pauta:** ...
- **Status:** brief

### 🎯 Slot 4 — Post LinkedIn (quinta)
- **Data:** YYYY-MM-DD
- **Tema:** [1 frase]
- **Pilar Lab Notes:** C — Bastidor
- **Formato:** Post texto EN (micro 200–400 ou long 1.200–1.500)
- **Esqueleto:** Essa semana → O que aprendi
- **Tese de origem:** ...
- **Copy draft (EN):** ...
- **CTA final:** ...
- **Origem da pauta:** ...
- **Status:** brief

### 🎯 Slot 5 — Reels curto IG (sexta)
- **Data:** YYYY-MM-DD
- **Tema:** [1 frase]
- **Pilar Lab Notes:** B — Experimento (corte do Reels Lab Notes de quarta) OU C — Bastidor (decisão pessoal rápida)
- **Formato:** Reels curto (30–60s)
- **Tese de origem:** ...
- **Roteiro:** [compacto]
- **CTA final:** ...
- **Origem da pauta:** ...
- **Status:** brief

### 🎯 Slot 6 — Post LinkedIn (sexta)
- **Data:** YYYY-MM-DD
- **Tema:** [1 frase]
- **Pilar Lab Notes:** C — Bastidor
- **Formato:** Post pessoal-profissional (micro 200–400 ou long 1.200–1.500)
- **Regra 80/20/0 (ADR 0008):** founder-pessoal ou pessoal-profissional, **zero íntimo**
- **Tese de origem:** ...
- **Copy draft (EN):** ...
- **CTA final:** ...
- **Origem da pauta:** ...
- **Status:** brief
```

**Regra:** card que não foi produzido até sexta 17h = deletado. Sem culpa. Próxima semana tem 6 novos.

### `03-prontos.md` — Finalizados, prontos pra agendar

Aqui entra o post **produzido** mas ainda não publicado.

```markdown
# ✅ Posts Prontos (aguardando agendamento)

> Posts com arquivo final exportado + legenda escrita.
> Quando agendar, mover pro `04-publicados.md`.

## Semana [DD/MM]

- [ ] **Slot 1 — Carrossel IG**
  - Arquivo: `[YYYY-MM-DD]_carrossel-1.png`
  - Legenda: "..."
  - Data agendada: YYYY-MM-DD HH:MM
  - Plataforma: Meta Business Suite
  - Checkpoint Mavis: ✅ aprovado / ⚠️ ajustar copy / ❌ bloqueado

- [ ] **Slot 2 — Post LinkedIn**
  - Status: redigido
  - Data agendada: ...
  - Plataforma: LinkedIn direto
  - Checkpoint Mavis: ...

- [ ] **Slot 3 — Reels IG**
  - Arquivo: `[YYYY-MM-DD]_reels-3.mp4`
  - Legenda: "..."
  - Data agendada: ...
  - Plataforma: Meta Business Suite
  - Checkpoint Mavis: ...

(... slots 4, 5, 6 ...)
```

**Regra:** mais que 7 dias aqui = alerta. Provavelmente foi esquecido.

### `04-publicados.md` — Log do que já foi publicado

Aqui mora o histórico. Pra consultar retrospecto e medir.

```markdown
# 📚 Histórico de Publicações

> Toda semana adiciona as linhas dos posts que foram ao ar.
> Preencher métricas no sábado de manhã (ou sexta 17h).

## Métricas por peça

| Data | Canal | Pilar | Formato | Tema | Link | Views/Reach | Saves | Comentários | DMs | Leads |
|------|-------|-------|---------|------|------|-------------|-------|-------------|-----|-------|
| YYYY-MM-DD | IG | A-Tese | Carrossel | ... | https://... | — | — | — | — | — |
| YYYY-MM-DD | LI | A-Tese | Post longo | ... | https://... | — | — | — | — | — |
| ... | ... | ... | ... | ... | ... | ... | ... | ... | ... | ... |

## Resumo semanal

### Semana [DD/MM] (DD/MM a DD/MM)
- Posts publicados: 6
- Total alcance (IG + LI): —
- Total saves: —
- Comentários qualificados: —
- DMs qualificadas: —
- Aprendizado: [1 frase]
```

**Métricas:** preencher na sexta à noite (sábado de manhã no máximo). Não virar refém de números diários.

---

## 2. Fluxo

```
   ┌─────────────┐
   │ 01-ideias   │ ← adiciona a qualquer momento
   └──────┬──────┘
          │ transforma em tese (claim + prova + implicação)
          ↓
   ┌──────────────┐
   │ banco-teses/ │ ← teses defensáveis (1 por arquivo .md)
   │  tese-00X-*  │
   └──────┬───────┘
          │ domingo 19h, sessão-âncora escolhe 6
          ↓
   ┌─────────────┐
   │ 02-briefs   │ ← prioriza + desenvolve (copy draft incluso)
   └──────┬──────┘
          │ produz (seg/ter/qua/qui/sex) — checkpoint Mavis SEG 8h
          ↓
   ┌─────────────┐
   │ 03-prontos  │ ← arquivo final + legenda
   └──────┬──────┘
          │ agenda + publica
          ↓
   ┌─────────────┐
   │ 04-publicados│ ← log + métricas (preencher sexta 17h)
   └─────────────┘
```

---

## 3. Rotina semanal (instalada)

| Dia | Horário | Atividade | Tempo |
|-----|---------|-----------|-------|
| **Dom** | 19h–21h | Sessão-âncora (Bloco A-D): input → Banco de Teses → distribuição → 6 briefs no `02-briefs.md` | **2h** |
| **Seg** | 8h | Checkpoint Mavis (3 briefs: Seg/Ter/Qua) | 30 min |
| **Seg** | 9h–11h | Produzir Slot 1 (carrossel IG) + submeter Mavis + agendar | 60 min |
| **Ter** | 9h–10h | Produzir Slot 2 (post LinkedIn) + submeter Mavis + agendar | 45 min |
| **Qua** | 9h–11h | Produzir Slot 3 (Reels Lab Notes IG) + submeter Mavis + agendar | 60 min |
| **Qui** | 9h–10h | Produzir Slot 4 (post LinkedIn) + submeter Mavis + agendar | 45 min |
| **Qui** | 8h (opcional) | Checkpoint Mavis Qui (2 briefs: Qui/Sex) — replicar SEG | 30 min |
| **Sex** | 9h–11h | Produzir Slots 5+6 (Reels curto IG + post LI) + submeter Mavis + agendar | 60 min |
| **Sex** | 17h | Preencher `04-publicados.md` + retroalimentar Banco de Teses + review | 30 min |
| **Diário** | 12h30 | Responder comentários, DMs | 10 min |
| **Sáb** | — | Descanso. Stories leves opcionais (1–3, sem CTA). | — |

**Total: ~7h/semana no Q3** (sem Short).

---

## 4. Como mover um card entre arquivos

**Opção A — Mover (cortar/colar):** se você quer manter o kanban enxuto, copie o conteúdo de um arquivo, delete do anterior, e cole no novo.

**Opção B — Marcar como feito (mais simples):** mantém o card no arquivo antigo e adiciona `[FEITO]` ou `[MOVIDO PARA 04]` no início. Mais bagunçado, mas zero risco de perder contexto.

**Recomendação:** Opção B nas primeiras 2 semanas pra pegar o jeito. Depois migra pra Opção A.

---

## 5. Regras de qualidade (mínimas)

| Regra | Detalhe |
|-------|---------|
| **Tamanho mínimo de fonte em carrossel** | 28pt na arte final. |
| **Duração de Reels** | 30–90s (Lab Notes completo 60–90s; corte de sexta 30–60s). |
| **Gancho em 2 segundos** | Se não prendeu nesses 2s, regravar. |
| **1 CTA por post** | Nunca 2 botões. |
| **Hashtags IG** | 8–10 máx. 2–3 grandes + 3–4 médias + 2–3 nichadas. |
| **Hashtags LinkedIn** | ≤ 3 ou nenhuma. |
| **Sem "TL;DR" no fim** | Se é longo demais, encurta. |
| **Pseudo-ciência vedada em copy visível** | "lab notebook", "paper 0X", "anomalia" não vão em gancho/CTA/título. |
| **Tela do Reel liberada quando faz sentido narrativo** | Demo, prova visual, bastidor técnico. Sem dogma. |
| **Link vai nos comentários do LinkedIn** | Nunca no corpo (LinkedIn reduz alcance). |
| **Responder TODOS os comentários no 1º dia** | Depois, só os relevantes. |

---

## 6. Banco de 20 prompts pra nunca travar

Quando o `01-ideias.md` tiver vazio (ou o Banco de Teses seco), abrir esta lista, escolher 1, escrever a resposta em 1 frase. Pronto, ideia nova. Mover pra `banco-teses/inbox/` e amadurecer.

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

| Passo | Tempo | Status Q3 |
|-------|-------|-----------|
| Criar os 4 arquivos `.md` do Kanban com template (este doc mostra) | 15 min | ✅ |
| Criar estrutura do Banco de Teses (`banco-teses/inbox/`, `sources/from-tier2/`) | 15 min | 🟡 fazer |
| Adicionar 10 ideias iniciais no `01-ideias.md` (puxar dos 20 prompts) | 30 min | 🟡 fazer |
| Povoar Banco de Teses com 5–10 teses seed (curadoria inicial) | 60 min | 🟡 fazer |
| Configurar 1 template de carrossel (7 slides, 1080×1350) | 45 min | 🟡 fazer |
| Configurar 1 frame de Reels (1080×1920, dark mode) | 30 min | 🟡 fazer |
| Conectar Meta Business Suite à conta IG (postar + agendar) | 20 min | 🟡 fazer |
| **Total** | **~3h30** | — |

**Quando:** uma tarde de sábado, antes da primeira sessão-âncora de domingo.

---

## 8. Métricas pra acompanhar (sem obsessão)

| KPI | Onde olhar | Frequência |
|-----|-----------|------------|
| **Alcance / saves / DMs IG** | Instagram Insights | Semanal (sexta 17h) |
| **Impressões / comentários LinkedIn** | LinkedIn dashboard nativo | Semanal |
| **Teses no Banco** | `ls marketing/2026-Q3/banco-teses/tese-*.md \| wc -l` | Semanal |
| **Briefs revisados pelo Mavis** | `grep -c "Checkpoint Mavis" kanban/04-publicados.md` | Semanal |
| **Leads na waitlist** | PostHog ou planilha | Semanal |
| **Abertura de e-mail** | Resend | Semanal (quando ativar) |
| **Trial → pago** | Stripe | Semanal (quando ativar) |

**Regra:** abrir painel 1× por semana, sexta 17h. Não ficar olhando todo dia.

---

## 9. Conexão com a documentação

| O quê | Onde |
|-------|------|
| **Crença central + tom + identidade verbal** | [`brand/conceituacao.md`](../brand/conceituacao.md) |
| **3 pilares Lab Notes** | [`brand/mensagens-chave.md`](../brand/mensagens-chave.md) v2 + ADR [0001](../../docs/adr/0001-pilares-3-lab-notes.md) |
| **Cadência semanal Q3 (6 peças/sem)** | [`social-media/calendario/semanal-v2.md`](../social-media/calendario/semanal-v2.md) + ADRs [0002](../../docs/adr/0002-cadencia-semanal.md) e [0009](../../docs/adr/0009-youtube-congelado-q3.md) |
| **Ritual semanal (sessão-âncora domingo)** | [`ritual-semanal.md`](../2026-Q3/ritual-semanal.md) + ADR [0003](../../docs/adr/0003-ritual-semanal-ancora-domingo.md) |
| **Stack de qualidade (4 blocos)** | [`stack-qualidade.md`](../2026-Q3/stack-qualidade.md) + ADR [0004](../../docs/adr/0004-stack-qualidade.md) |
| **Fontes de pauta (Tier 1/2/3 + 3.5)** | [`fontes-pauta.md`](../2026-Q3/fontes-pauta.md) + ADR [0005](../../docs/adr/0005-fontes-pauta.md) |
| **Carrossel híbrido (opinião/educação)** | [`social-media/canais/instagram.md`](../social-media/canais/instagram.md) + ADR [0007](../../docs/adr/0007-carrossel-hibrido.md) |
| **Tom 80/20/0** | [`brand/conceituacao.md`](../brand/conceituacao.md) Parte 3 + ADR [0008](../../docs/adr/0008-tom-founder-pessoal.md) |

---

*Mantido em `marketing/2026-Q3/` · PT-BR · Versão 2 · Última atualização: 2026-06-26 · Owner: Jhonatan Soares*
