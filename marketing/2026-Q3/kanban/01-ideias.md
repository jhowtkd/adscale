# 💡 Banco de Ideias (pré-tese)

> Banco infinito. Adicione sem filtro. Filtre domingo à noite no Banco de Teses.
> Quando uma ideia virar tese (claim + prova + implicação), mover pra `../banco-teses/tese-00X-*.md`.
> Regra: deletar daqui só se a ideia for manifestamente ruim. Não deletar por preguiça.

---

## Formato

```
- [ ] "[título em 1 frase]" — Pilar: [A-Tese / B-Experimento / C-Bastidor] — origem: [pergunta DM / trend / concorrente / newsletter / perfil / bastidor]
```

---

## Tópicos brutos

<!-- Adicione bullets abaixo seguindo o formato acima. -->

- [ ] "5 coisas que travam a produção de criativos da sua agência" — Pilar: B-Experimento — origem: pergunta ICP
- [ ] "Por que IA não mata o designer (e o que mata)" — Pilar: A-Tese — origem: trend do nicho
- [ ] "Bastidor: como geramos 24 variações em 11 min" — Pilar: B-Experimento — origem: bastidor ADScale
- [ ] "3 perguntas que todo cliente deveria fazer pro designer antes de aprovar" — Pilar: B-Experimento — origem: pergunta ICP
- [ ] "A matemática do criativo: por que testar 10 é melhor que testar 2" — Pilar: B-Experimento — origem: benchmark Meta Ads
- [ ] "Como eu organizo 50 criativos sem enlouquecer (workflow)" — Pilar: B-Experimento — origem: bastidor ADScale
- [ ] "Mito vs realidade: IA na produção criativa" — Pilar: A-Tese — origem: trend do nicho
- [ ] "O que aprendi construindo o ADScale em 6 meses" — Pilar: C-Bastidor — origem: reflexão pessoal
- [ ] "AdCreative.ai faz X, mas erra em Y. Aqui está por quê." — Pilar: A-Tese — origem: concorrência
- [ ] "Por que a maioria dos criativos de ecommerce não converte" — Pilar: A-Tese — origem: pergunta ICP
- [ ] "O briefing que eu queria ter lido quando comecei" — Pilar: C-Bastidor — origem: reflexão pessoal
- [ ] "Como o Briefing Doctor funciona (30s de demo)" — Pilar: B-Experimento — origem: bastidor ADScale
- [ ] "Por que o designer continua essential (mesmo com IA)" — Pilar: A-Tese — origem: pergunta ICP
- [ ] "5 ferramentas que toda agência precisa (e o ADScale é só uma)" — Pilar: A-Tese — origem: trend do nicho
- [ ] "3 erros que cometi no 1º deploy do ADScale" — Pilar: C-Bastidor — origem: bastidor ADScale
- [ ] "Por que contratar 1 designer a mais não escala o problema" — Pilar: A-Tese — origem: pergunta ICP
- [ ] "Curator vs operator: a diferença em 1 exemplo de campanha" — Pilar: A-Tese — origem: crença central
- [ ] "Briefing estruturado em 3 passos (ângulo, público, prova)" — Pilar: B-Experimento — origem: iteração com ICP
- [ ] "Por que a curadoria humana no fim do workflow não é gargalo" — Pilar: B-Experimento — origem: benchmark Meta Ads
- [ ] "Case: como uma agência fez 200 criativos em 1 semana" — Pilar: B-Experimento — origem: caso beta

---

## Backup de prompts (pra usar quando a lista acabar)

> Puxar 1 prompt, escrever 1 frase, virou ideia nova. Mover pra `../banco-teses/inbox/` se amadurecer.

1. "O erro mais comum que agências cometem em [briefing/variação/formato] é…"
2. "Aqui está o que [X meses] me ensinou sobre produção criativa…"
3. "Por que a maioria dos criativos de [segmento] não converte…"
4. "Bastidor: como o ADScale gera [X] em [Y] minutos…"
5. "3 perguntas que todo cliente deveria fazer pro designer antes de aprovar…"
6. "O que aprendi lançando [feature] essa semana…"
7. "Por que [concorrente X] faz Y mas eu prefiro Z…"
8. "Mito: IA mata o designer. Realidade:…"
9. "Antes e depois: [descreve caso real ou fictício]…"
10. "Por que [decisão técnica] do ADScale foi a mais difícil…"
11. "Como usar [feature do ADScale] em 30 segundos…"
12. "Feedback real de cliente (verbatim)…"
13. "Por que copiar concorrente não funciona (o que o ADScale faz diferente)…"
14. "A regra 80/20/0 do tom ADScale (sem virar coach)…"
15. "Por que carrossel educativo é o melhor formato pra save no IG…"
16. "3 decisões técnicas do ADScale que ninguém te conta…"
17. "Briefing em 5 minutos: o template que uso toda semana…"
18. "Por que meu ICP me corrigiu em 4 DMs (reflexão)…"
19. "O que aprendi rejeitando 70% das variações geradas…"
20. "Como testar 10 ângulos em 1 hora (workflow)…"

---

## Migração de v1 → v2

**Mudanças (2026-06-26):**
- Pilares passaram de `Educação/Opinião/Bastidor/Caso/Comunidade` (5) → `A-Tese / B-Experimento / C-Bastidor` (3 — Lab Notes).
- Origem agora rotula qual **Tier** (1/2/3/3.5) alimentou a ideia.
- "Comunidade" e "Caso" viraram prática operacional (Tier 1 do ICP) ou absorvidos em Pilar A (prova) / Pilar B (números).
- Conexão explícita com `../banco-teses/` (essa pasta vira pré-tese; teses defensáveis migram pra lá).

Detalhes: ADRs [`0001-pilares-3-lab-notes.md`](../../docs/adr/0001-pilares-3-lab-notes.md) e [`0005-fontes-pauta.md`](../../docs/adr/0005-fontes-pauta.md).

---

*Mantido em `marketing/2026-Q3/kanban/` · PT-BR · Versão 2 · Última atualização: 2026-06-26 · Owner: Jhonatan Soares*
