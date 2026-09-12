# Decisão: o Estúdio atual não foi observado com operadores

**Data:** 2026-09-12
**Status:** Aprovada neste commit
**Síntese:** [`docs/evidence/2026-09-12-estudio-human-observation.md`](../evidence/2026-09-12-estudio-human-observation.md)
**Corpus lido:** [`.planning/convergence/phase8-human-journeys.json`](../../.planning/convergence/phase8-human-journeys.json)
**Encerramento histórico:** Gate 8 permanece `approved_with_accepted_debt` (1/10). Este arquivo não reabre nem reescreve esse encerramento.
**Item 8:** [`2026-09-12-funnel-read-gate8-holds.md`](./2026-09-12-funnel-read-gate8-holds.md) — `campaign.completed` já estava desqualificado como go. Esta decisão desqualifica a **jornada humana** de julho como validação do Estúdio de setembro.

## Modo

Synthesise do que existe, depois Plan do que falta. Não houve sessão nova com operador no Estúdio progressivo. Waitlist continua 410. Agente, E2E e client case não entram no denominador humano.

## Uma decisão que muda

A única jornada humana `completed` do Gate 8 é `N01-after-attempt-2`: P02, 2026-07-16, `no_campaign` / `home_create_post` (wizard Criar Post). **Não valida o Estúdio atual** (home progressiva, CTA Novo trabalho, caixa unificada).

Consequências:

1. Não citar Gate 8, P02, nem “1 jornada completa” como evidência de que o Estúdio de agora funciona.
2. Smoke de agente (`docs/plans/2026-07-16-phase8-post-fix-agent-smoke.md`, 6/6), E2E com provedor controlado, Sunburst, carrossel mock e client cases Nike/Amazon/BK **não** são observação de operador.
3. A matriz Gate 8 (24 registros, 23 falhas, 40 breakpoint ids) é **referência diagnóstica** da jornada de julho — campanha/cockpit e Criar Post — não prova estatística nem punch list de “corrigir e declarar validado”.

## O que esta decisão não faz

- Não recruta gente nem reabre waitlist.
- Não executa JTBD de mercado (item 10).
- Não colapsa Veredito nem estados do Trabalho (itens 12–13).
- Não amplia carrossel (item 14).
- Não afirma que os breakpoints de julho ainda reproduzem no código de hoje — isso só volta a ser *observed* com sessão datada na versão atual.
