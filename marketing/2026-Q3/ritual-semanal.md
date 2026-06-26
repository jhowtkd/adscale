# Ritual Semanal — Sessão-âncora no Domingo

> **O ritual que sustenta o sistema de conteúdo da ADScale.**
> Versão 2 (2026-06-25) — baseada no ADR `0003-ritual-semanal-ancora-domingo.md`.

---

## 1. Visão geral

| Quando | Duração | O quê | Output |
|--------|---------|-------|--------|
| **DOM 19h–21h** | **2h** | Sessão-âncora: gestão, priorização, briefs | `kanban/02-briefs.md` com 7 cards prontos |
| **SEG 8h** | 30 min | Checkpoint Mavis (revisão automatizada) | Briefs validados antes da produção |
| **SEX 17h** | 30 min | Review semanal + retroalimentação Banco de Teses | `04-publicados.md` atualizado + Banco incrementado |

**Total semanal:** ~3h gestão + ~5h produção = **~8h/semana**.

---

## 2. Domingo 19h–21h — Sessão-âncora (2h)

**Objetivo:** sair do domingo com 7 briefs prontos (1 por dia útil + 1 Short na sexta).

### Bloco A — Input (30 min)

| # | Atividade | Tempo | Fonte |
|---|-----------|-------|-------|
| 1 | Revisar perguntas reais do ICP acumuladas na semana (DMs, comentários, e-mails) | 10 min | `banco-teses/sources/from-tier1/` |
| 2 | Skim de trends do nicho (Twitter/X trending, YouTube search, LinkedIn feed) | 10 min | `banco-teses/sources/from-tier1-trends/` |
| 3 | Anotar 2-3 concorrentes observados (post novo de AdCreative.ai / Pencil / Madgicx) | 10 min | `banco-teses/sources/from-tier2/` |

**Não ler newsletters nesta fase** (Tier 3 = 10% do input, vem no consumo diário da semana).

### Bloco B — Banco de Teses (30 min)

| # | Atividade | Tempo |
|---|-----------|-------|
| 4 | Abrir `marketing/2026-Q3/banco-teses/` e revisar teses candidatas | 10 min |
| 5 | Para cada brief candidato: tem tese defensável? Se não, escrever 1 agora (claim + prova + implicação) | 15 min |
| 6 | Mover teses "prontas pra usar" pra fila da semana | 5 min |

**Regra:** se uma ideia não tem tese defensável, não vai pro brief. Volta pro `01-ideias.md`.

### Bloco C — Distribuição (30 min)

| # | Atividade | Tempo |
|---|-----------|-------|
| 7 | Escolher 7 peças (1 por dia útil + 1 Short na sexta) | 10 min |
| 8 | Atribuir pilar A/B/C conforme rotação da cadência (ADR 0002) | 5 min |
| 9 | Atribuir canal + formato conforme calendário (`semanal-v2.md`) | 5 min |
| 10 | Checar pesos: 3 IG + 3 LI + 1 Short | 10 min |

**Critério de escolha (quando 2 teses disputam a mesma vaga):**
- Tier 1 pergunta do ICP > Tier 2 concorrência > Tier 3 newsletter.
- Tese "fresca" (não usada nos últimos 30 dias) > tese reciclada.
- Pilar sub-representado no mês > pilar saturado.

### Bloco D — Briefs (30 min)

| # | Atividade | Tempo |
|---|-----------|-------|
| 11 | Para cada uma das 7 peças: escrever brief completo no `kanban/02-briefs.md` | 25 min (~3.5 min por brief) |
| 12 | Cada brief inclui: tema, pilar, formato, esqueleto do pilar, copy draft (1ª versão), CTA, hashtag/categoria | — |

**Estrutura do brief (mínimo viável):**

```markdown
### 🎯 Slot N — [Pilar] [Canal] [Formato]
- **Data:** YYYY-MM-DD
- **Tema:** [1 frase]
- **Pilar Lab Notes:** A / B / C
- **Formato:** [carrossel/Reels/post LI/Short YT]
- **Esqueleto:** [qual dos 4 do pilar — Tese/Experimento/Bastidor]
- **Copy draft:**
  - Slide 1 / gancho: ...
  - Slide 2 / premissa: ...
  - ...
  - CTA: ...
- **CTA final:** [link / save / comentário]
- **Origem da pauta:** [Tier 1 pergunta / Tier 2 concorrência / etc]
```

### Saída do domingo

- `kanban/02-briefs.md` com 7 cards prontos pra SEG–SEX.
- `banco-teses/` incrementado com 2–3 teses novas.
- Checkpoint Mavis agendado pra SEG 8h.

---

## 3. Segunda 8h — Checkpoint Mavis (30 min)

**Objetivo:** validar 3 briefs (Seg, Ter, Qua) antes de produzir.

| # | Atividade | Tempo |
|---|-----------|-------|
| 1 | Submeter 3 briefs (Seg, Ter, Qua) pra Mavis | 5 min |
| 2 | Aguardar revisão automática (~5 min) | 5 min |
| 3 | Ler relatório Mavis (tom, vocabulário canônico, peso pilares, anti-padrões) | 10 min |
| 4 | Ajustar copy se Mavis bloqueou | 10 min |

**Replicar checkpoint pra Qui 8h** (cobre Qui + Sex, antes da produção de Qui).

**Origem:** ADR `0004-stack-qualidade.md` bloco 4.

---

## 4. Sexta 17h — Review semanal (30 min)

**Objetivo:** fechar a semana, medir, retroalimentar.

| # | Atividade | Tempo |
|---|-----------|-------|
| 1 | Preencher `kanban/04-publicados.md` com peças da semana + métricas iniciais | 10 min |
| 2 | Anotar aprendizados: o que viralizou, o que não salvou, o que deu DM inbound | 10 min |
| 3 | Atualizar `banco-teses/sources/from-tier1/` com perguntas/DMs da semana | 5 min |
| 4 | Marcar teses "usadas" no Banco (pra não repetir por 30 dias) | 5 min |

**Não fazer:** obsessão com números diários. Métrica olhada 1×/semana.

---

## 5. Sábado

**Descanso.** Stories leves opcionais (1–3, sem CTA, sem cara de "marketing").

---

## 6. Disciplinas de proteção

| Risco | Mitigação |
|-------|-----------|
| Domingo 19h vira "hora de descansar" e sessão-âncora não roda | Marcar no calendário como compromisso inegociável. Se necessário, mover pra sábado à noite — mas registrar como exceção. |
| Sessão-âncora vira >2h30 (Jhonatan não consegue parar) | Timer de 2h. Se não terminou, congelar no brief em rascunho — terminar na segunda 8h ANTES do checkpoint. |
| SEG 8h não acontece (Jhonatan já em outro compromisso) | Mover pra SEG 12h (almoço) ou SEG 22h. Briefs já estão escritos — checkpoint é só revisão, não produção. |
| Banco de Teses seca (Jhonatan não anotou nada na semana) | Sessão-âncora de domingo começa com **pesquisa Tier 2 (60 min)** ao invés de Tier 1 (10 min). Banco se enche com teses defensáveis a partir de concorrentes + SEO. |
| Pilar C (Bastidor) some por 3 semanas | Forçar 1 post Pilar C no mês mínimo. Se Jhonatan não tiver tema, pegar pergunta de cliente beta e transformar em Bastidor. |

---

## 7. Por que domingo e não outro dia

| Dia candidato | Por que não |
|---------------|-------------|
| Sábado de manhã | Conflita com descanso + família. Risco de virar trabalho disfarçado. |
| Sábado à noite | Mesmo problema + Jhonatan já cansado do dia. |
| Domingo de manhã | Conflita com brunch/família. Risco de cortar tempo pessoal. |
| **Domingo 19–21h** | **Escolhido.** Slot com menos conflito típico. Jhonatan chega descansado do fim de semana e fecha a semana antes da próxima começar. |
| Segunda de manhã | Conflita com produção. Decidir pauta E produzir no mesmo dia sobrecarrega. |
| Sexta à noite | Cansaço acumulado. Risco de brief medíocre. |

---

## 8. Quando evoluir o ritual

| Sinal | Evolução |
|-------|----------|
| Banco de Teses tem >50 teses prontas | Considerar **2 sessões-âncora/mês** em vez de semanal (a cada 15 dias). |
| Briefs do domingo saem em <1h30 (ao invés de 2h) | Ritmo saudável — manter, não aumentar. |
| Jhonatan pula 3 sessões-âncora seguidas | Voltar pra ritual "enxuto" (15 min DOM, prioriza 3 peças em vez de 7). Aceitar queda temporária de cadência. |
| Mês 2 com Nível A fluindo | Considerar upgrade pra Nível A+ (ADR 0006 — 4 shorts/mês). |

---

## 9. Conexão com ADRs

- **ADR 0001** — define os 3 pilares Lab Notes que estruturam o Banco de Teses.
- **ADR 0002** — define a cadência semanal que este ritual preenche.
- **ADR 0003** — origem desta versão 2 do ritual.
- **ADR 0004** — Stack de Qualidade bloco 4 (revisão Mavis) roda na segunda 8h.
- **ADR 0005** — Fontes de pauta Tier 1/2/3 alimentam o Bloco A do domingo.
- **ADR 0006** — define Nível A conservador (~7 peças/sem).
- **ADR 0008** — Tom 80/20/0 entra no checklist do Mavis (revisão segunda).

---

*Mantido em `marketing/2026-Q3/` · PT-BR · Versão 2 · Última atualização: 2026-06-25 · Owner: Jhonatan Soares*
