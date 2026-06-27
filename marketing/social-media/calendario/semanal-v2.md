# Calendário Semanal — v2 (regra âncora, Q3 efetivo)

> **A semana de produção de conteúdo da ADScale, no detalhe.**
> Versão 2 (2026-06-26) — baseada nos ADRs 0002, 0003, 0006, **0009**.
> **Q3 (até set/2026):** YouTube congelado → cadência efetiva = **6 peças/sem** (3 IG + 3 LI, sem Short).
> **Framework (Q4+):** quando YouTube reativar, volta pra 7 peças/sem (com Short de sexta reaproveitado do Reels Lab Notes).
>
> Complementa o `marketing/social-media/canais/{instagram,linkedin}.md` (v2). YouTube v2 está em arquivo de referência.

---

## 1. Visão semanal — Q3 efetivo (YouTube congelado)

| Dia | Pilar | Canal | Formato | Tempo produção |
|-----|-------|-------|---------|----------------|
| **Seg** | A — Tese | Instagram | Carrossel híbrido 7 slides (1080×1350) | 60 min |
| **Ter** | A — Tese | LinkedIn | Post longo EN (1.200–1.500 chars) | 45 min |
| **Qua** | B — Experimento | Instagram | Reels Lab Notes (60–90s) | 60 min |
| **Qui** | C — Bastidor | LinkedIn | Post texto EN (micro 200–400 ou long 1.200–1.500) | 45 min |
| **Sex** | B + C | IG Reels curto + LI post | 2 peças | 60 min |

**Total:** 3 IG + 3 LI = **6 peças/semana**. Extrapolado: ~24 posts/mês.

**Framework original (com YouTube):** Seg=A / Ter=A-texto / Qua=B / Qui=C / **Sex=B + C + Short** = 7 peças. Vale no Q4+ se ADR 0009 for desativado.

Fonte: ADR [`0002-cadencia-semanal.md`](../../../docs/adr/0002-cadencia-semanal.md) (framework) + ADR [`0009-youtube-congelado-q3.md`](../../../docs/adr/0009-youtube-congelado-q3.md) (Q3 override).

---

## 2. Por que essa rotação

- **Seg + Ter:** mesma tese, dois formatos. Reaproveitamento sem repetir.
- **Qua:** dia de produção "pesada" (Reels Lab Notes é o formato mais trabalhoso).
- **Qui:** texto curto, peso pessoal. Recuperação após dia pesado.
- **Sex:** dia de "fechamento" — 2 peças (Reels curto + post pessoal). Mais leve que o framework original (que tinha 3 peças com Short).

**Sábado:** descanso intencional (protege sustentabilidade de 6 meses).
**Domingo:** sessão-âncora (gestão, não produção).

---

## 3. Convenção de slot

Cada peça da semana segue:
```
[Data] [Canal] [Pilar] [Formato] [Status]
Ex: 2026-06-30 · Instagram · A-Tese · Carrossel · rascunho
```

Status possíveis:
- `ideia` (no `01-ideias.md`)
- `brief` (no `02-briefs.md`, copy draft pronto)
- `pronto` (no `03-prontos.md`, arquivo final exportado)
- `publicado` (no `04-publicados.md`, métricas preenchidas)

---

## 4. Exemplo de semana concreta (template Q3)

> **Esta é a estrutura. Os temas específicos vêm do Banco de Teses + Fontes de Pauta Tier 1, decididos na sessão-âncora de domingo.**

### Domingo 19h–21h (sessão-âncora)
- [ ] Ler Banco de Teses (`marketing/2026-Q3/banco-teses/`) e Fontes Tier 1 acumuladas na semana.
- [ ] Escolher **6 peças** (1 por dia útil, sem Short no Q3).
- [ ] Atribuir pilar A/B/C e canal/forma a cada uma.
- [ ] Escrever **6 briefs** completos no `kanban/02-briefs.md` (copy draft incluso).
- [ ] Agendar checkpoint Mavis pra SEG 8h.

### Segunda 8h (checkpoint Mavis)
- [ ] Submeter 3 briefs (Seg, Ter, Qua) pra revisão Mavis.
- [ ] Ajustar copy se Mavis bloquear.

### Segunda (produção) — Pilar A Tese · IG Carrossel
- [ ] 09h00 — abrir brief do `02-briefs.md`.
- [ ] 09h15 — escrever copy final dos 7 slides.
- [ ] 10h00 — produzir arte no template ADScale (tokens do `design.md`).
- [ ] 10h45 — exportar PNG (1080×1350) + escrever legenda.
- [ ] 11h00 — submeter pra Mavis (revisão final). Se OK, agendar no Meta Business Suite pra próxima segunda 09h.

### Terça (produção) — Pilar A Tese · LinkedIn Post Longo EN
- [ ] 09h00 — abrir brief.
- [ ] 09h15 — escrever post (1.200–1.500 chars, EN).
- [ ] 09h45 — submeter pra Mavis.
- [ ] 10h00 — agendar no LinkedIn (ou postar direto).

### Quarta (produção) — Pilar B Experimento · IG Reels Lab Notes
- [ ] 09h00 — abrir brief + roteiro (estrutura Lab Notes: premissa → gargalo → tese → demo → evidência → CTA).
- [ ] 09h15 — gravar takes (câmera frontal iPhone + mic lapela).
- [ ] 10h00 — editar no CapCut (música 15–20%, highlights verde accent, tela quando fizer sentido narrativo).
- [ ] 10h45 — exportar MP4 (1080×1920, ≤90s, ≤250MB).
- [ ] 11h00 — submeter pra Mavis + agendar.

### Quinta (produção) — Pilar C Bastidor · LinkedIn Post
- [ ] 09h00 — abrir brief.
- [ ] 09h15 — escrever post (micro 200–400 ou long 1.200–1.500, EN).
- [ ] 09h45 — submeter pra Mavis.
- [ ] 10h00 — agendar no LinkedIn.

### Sexta (produção) — Pilar B + C (sem Short no Q3)
- [ ] 09h00 — abrir 2 briefs (Reels curto IG + post LI).
- [ ] 09h30 — Reels curto IG: gravar 1 take + editar (30–60s).
- [ ] 10h00 — post LI: escrever copy pessoal-profissional (regra 80/20/0 do ADR 0008).
- [ ] 10h30 — submeter os 2 pra Mavis + agendar.

### Sexta 17h (review semanal)
- [ ] Preencher `kanban/04-publicados.md` com peças da semana + métricas iniciais.
- [ ] Anotar aprendizados no `banco-teses/sources/from-tier1/` (DMs/comentários da semana).
- [ ] Anotar concorrência observada no `banco-teses/sources/from-tier2/`.

### Sábado
- [ ] Descanso. Stories leves opcionais (1–3, sem CTA).

### Domingo 19h–21h (próxima sessão-âncora)
- [ ] Volta pro passo 1.

---

## 5. Métricas por semana (template)

| Canal | Posts | Saves/DMs | Impressões/Reach | Comentários qualificados |
|-------|-------|-----------|-------------------|---------------------------|
| Instagram | — | — | — | — |
| LinkedIn | — | — | — | — |
| YouTube Short | (congelado Q3) | — | — | — |

Preencher sexta 17h em `kanban/04-publicados.md`.

---

## 6. Exceções e ajustes

- **Jhonatan doente / urgência:** pular o dia, não recuperar. Próxima sessão-âncora reposiciona a semana.
- **Brief do domingo não ficou pronto:** produzir segunda com brief improvisado de 30 min + submeter pra Mavis (gatekeeper pega desvio).
- **Tema urgente (concorrente anunciou, trend do nicho):** quebrar cadência — post fora do calendário. Mas registrar como exceção no `04-publicados.md`.
- **Mês 2+ com Nível A fluindo (6 peças/sem Q3):** considerar upgrade pra Nível A+ (3 IG + 3 LI + 4 shorts/mês extras) — exige YouTube reativado (ADR 0009). Não forçar.

---

## 7. Pendências e melhorias

> {{ status: RESOLVIDO em 2026-06-27 (ciclo W26). Jhonatan passou os 8 perfis (7 IG + 1 website) — ver `fontes-pauta.md` §4.5 + `banco-teses/inbox/from-tier3-5-perfis-2026-W26.md`. Stalker já rodou primeira coleta (67 IDs próprios catalogados, 10 posts detalhados na janela 7d, 7 pautas geradas). }}

---

## 8. Ligação com o ritual semanal

Este calendário **é o output da sessão-âncora de domingo** (ADR 0003). O ritual detalha COMO produzir a semana; este calendário detalha O QUE produzir em cada dia.

Ambos caminham juntos:
- **Domingo 19–21h:** preenche `02-briefs.md` segundo este calendário (Q3 = 6 briefs).
- **Segunda a sexta:** executa `02-briefs.md` na produção.
- **Sexta 17h:** mede resultado, alimenta Banco de Teses.

---

*Mantido em `marketing/social-media/calendario/` · PT-BR · Versão 2 · Última atualização: 2026-06-26 · Owner: Jhonatan Soares*
