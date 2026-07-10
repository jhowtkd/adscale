# ADRs — ADScale

> **Architecture Decision Records.**
> Cada decisão estratégica do ADScale vira um ADR. Contexto, decisão, consequências, alternativas.
> Formato adaptado do MADR (Markdown Any Decision Record).

---

## Índice

| # | Título | Data | Status |
|---|--------|------|--------|
| [0001](./0001-pilares-3-lab-notes.md) | Os 3 pilares Lab Notes (Tese / Experimento / Bastidor) | 2026-06-25 | ✅ Aceita |
| [0002](./0002-cadencia-semanal.md) | Cadência semanal âncora Seg=A / Ter=A-texto / Qua=B / Qui=C / Sex=C+B+Short | 2026-06-25 | ✅ Aceita |
| [0003](./0003-ritual-semanal-ancora-domingo.md) | Ritual semanal com sessão-âncora no domingo 19–21h | 2026-06-25 | ✅ Aceita |
| [0004](./0004-stack-qualidade.md) | Stack de QUALIDADE (não de produção) | 2026-06-25 | ✅ Aceita |
| [0005](./0005-fontes-pauta.md) | Fontes de pauta Tier 1 (60%) / Tier 2 (30%) / Tier 3 (10%) | 2026-06-25 | ✅ Aceita |
| [0006](./0006-frequencia-nivel-a.md) | Frequência Nível A conservador (~7 peças/sem) | 2026-06-25 | ✅ Aceita |
| [0007](./0007-carrossel-hibrido.md) | Carrossel Instagram alterna opinião/educação por post | 2026-06-25 | ✅ Aceita |
| [0008](./0008-tom-founder-pessoal.md) | Tom founder-pessoal 80% / pessoal-profissional 20% / íntimo 0% | 2026-06-25 | ✅ Aceita |
| [0009](./0009-youtube-congelado-q3.md) | YouTube congelado no Q3 inteiro (até set/2026). Cadência efetiva vira 6 peças/sem (sem Short). | 2026-06-26 | ✅ Aceita |
| [0010](./0010-brasil-only-suspende-bilingue.md) | Brasil-only (suspende bilíngue). LinkedIn sai de EN → PT-BR. YouTube EN trilha suspensa. | 2026-06-27 | ✅ Aceita |
| [0011](./0011-threads-como-canal-novo.md) | Threads vira canal oficial no Q3 (substitui YouTube). Reaproveita copy de LI/IG. Sem criação original. | 2026-06-27 | ✅ Aceita |
| [0012](./0012-cognitive-atlas.md) | Cognitive Atlas — órgãos da cabeça criativa (Cortex, Hands, Gaze/Olhar, Skin, Nerve, Taste, Memory, Marrow, Energy) | 2026-07-09 | ✅ Aceita |

---

## Formato

Todo ADR segue:

```markdown
# NNNN — Título da decisão

**Data:** YYYY-MM-DD
**Status:** Proposta / Aceita / Superseded by NNNN / Deprecated
**Decisor:** Jhonatan Soares (founder)

## Contexto

[O problema que motivou a decisão. Sem contexto, sem decisão.]

## Decisão

[O que foi decidido. Uma frase principal + detalhes.]

## Consequências

[O que fica mais fácil. O que fica mais difícil. O que destrava.]

## Alternativas consideradas

[O que mais foi avaliado, e por que não foi escolhido.]
```

---

## Regra de uso

- **Toda decisão nova** sobre pilares, cadência, ritual, tom, fontes, stack, mapa cognitivo (atlas) → vira ADR.
- **Antes de mudar** qualquer decisão → ler o ADR correspondente primeiro.
- **Conflito** entre ADR e arquivo operacional (marketing/, brand/) → vence o ADR (atualizar o arquivo).
- **Mudança de decisão** → marcar o ADR antigo como `Superseded by NNNN` e criar o novo.

---

*Mantido em `docs/adr/` · PT-BR · Última atualização: 2026-07-09*
