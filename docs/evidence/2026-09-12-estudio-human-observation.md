# Observação humana vs Estúdio atual (item 9)

**Data:** 2026-09-12
**Modo:** Synthesise (corpus Phase 8) + Plan (lacuna do Estúdio de agora)
**Decisão:** [`docs/decisions/2026-09-12-estudio-atual-nao-observado.md`](../decisions/2026-09-12-estudio-atual-nao-observado.md)
**Fonte bruta:** `.planning/convergence/phase8-human-journeys.json` (`status: approved_with_accepted_debt`, veredito `iterate`)

Confiança neste arquivo: *observed* só quando o verbatim está no corpus e a jornada é de julho de 2026. Tudo sobre o Estúdio de setembro é *assumed* até existir sessão datada nessa versão.

## Separação: humano vs não-humano

| Classe | O que é | Entra no denominador humano? |
| --- | --- | --- |
| P01, P02 | `observerConfirmedHuman: true` em **24/24** registros | sim — jornada de **2026-07-15/16** |
| Smoke 6/6 | `docs/plans/2026-07-16-phase8-post-fix-agent-smoke.md` — `Jornada humana: não`; conta `dev-admin@adscale.local` | não |
| E2E / provedor controlado | ex. `docs/evidence/2026-09-08-studio-caixa-unificada.md` | não |
| Sunburst / carrossel mock | `docs/evidence/2026-09-08-sunburst-*`, `2026-09-10-carousel-editorial-validation.md` | não |
| Client cases Nike/Amazon/BK | estudos comerciais | não |

P01: 22 jornadas, 0 completed. P02: 2 jornadas, 1 completed / 1 failed. After: 13 registros (12 failed + 1 completed). Before: 11, todos failed. Dispositivos: 16 desktop, 8 mobile. Marcas do protocolo: Horizonte Educação, Café Aurora, Studio Pulso. Segmentos: educacao, fitness, alimentacao(_local).

## Versão observada vs versão atual

Corpus: entradas `home`, `home_new_campaign`, `home_create_post`, `create_post`, `campaigns`, `campaign_assistant`, `templates`, `assistant`, `recent_work`. A única conclusão humana foi **Criar Post**.

Produto agora: Estúdio em `/` com rollout progressivo 100%, CTA Novo trabalho, Criar Post como redirect de compatibilidade. **Zero** registro Phase 8 com essa superfície. Item 8 já desqualificou `campaign.completed` 12/18 como go; esta nota desqualifica a conclusão humana de julho como validação do Estúdio.

## Observações (verbatim, julho 2026)

- P01, C01-attempt-1, home, failed: participante relatou **«travou aqui»** depois do create 201. Brand: criou perfil vazio `C01` em vez de selecionar Horizonte Educação.
- P01, C01-attempt-2: workspace chamou faltas de oferta/QA de «blocking problems» sem lugar para responder; geração inseriu marca/oferta CENBRAP sem lastro; lote de produção apareceu sem aprovação explícita do piloto.
- P01, C03-attempt-1: «Continuar para acoes» habilitado, sem imagem base; cliques repetidos emitiram telemetria de conclusão e **nenhuma** geração; espera de quatro minutos.
- P01, N05-after-attempt-1: trabalho preparado ausente dos recents da Home e da sidebar — só entrou com URL fornecida pelo observador; na segunda abertura, `ready` sem outputs abriu Propostas com três cards vazios e sem gerar/voltar.
- P02, C01-after-attempt-2, `home_new_campaign`, failed: com provedor real, segundo output gerado **antes** de o participante aprovar o piloto (`preview-approval-bypassed`).
- P02, N01-after-attempt-2, `home_create_post`, **completed**: três outputs 1:1; download bold; save conservative/balanced. Mesmo assim: grid só atualizou depois de cliques repetidos; não percebeu progressão conservative/balanced/bold; Select mudou vencedor interno sem passo visível.

## Padrões (diagnóstico, não prova do Estúdio atual)

Agrupados por situação. Frequência = ids de breakpoint no corpus (40 ids distintos; categorias: abandonment 18, error 17, context_loss 11, doubt 8). O id mais repetido foi `creative-work-generation-success-not-finalized` (5).

| Padrão | Evidência no corpus | Confiança **hoje** |
| --- | --- | --- |
| Marca/contexto não pega ou é inventado | perfil vazio C01; CENBRAP/oferta inventada; continue sem base vira no-op | *observed* em julho; *assumed* no Estúdio 2026-09 |
| O servidor termina e o humano não vê o próximo passo | jobs stuck; resume vazio; recents sumidos; grid que não atualiza sozinho | *observed* em julho; *assumed* no Estúdio 2026-09 |
| Escolha/aprovação opaca | piloto furado; Select inerte; níveis indistintos — inclusive na única jornada completed | *observed* em julho; *assumed* no Estúdio 2026-09 |

Workaround observado: observador fornecendo URL direta para retomar (N05). Sinal de que “continuar de onde parei” não era encontrável.

## Candidate job stories (para o item 10, não resolvidas aqui)

O «When» é picturável a partir de julho. O produto nomeado no When é a jornada **de então**; não reescrever como se fosse o Estúdio de agora.

1. *When I start a job and the real brand is easy to miss, I want the work bound to that client, so I do not generate for a ghost brand or an invented offer.* — *observed* (P01 C01); *assumed* for current Estúdio.
2. *When generation has finished on the server, I want to see the piece and the next action without hunting, so I know whether to continue, retry, or leave.* — *observed* (N05, N01 refresh, stuck jobs); *assumed* for current Estúdio.
3. *When I am shown more than one piece, I want to tell them apart and know what choosing one does, so I can approve or discard without guessing.* — *observed* (P02 N01 levels + Select; P02 C01 approval bypass); *assumed* for current Estúdio.

## Lacunas (Plan)

Perguntas de aprendizagem para a próxima sessão humana no Estúdio **atual** — não JTBD de mercado (item 10):

1. Um operador consegue, a partir de Estúdio / Novo trabalho, chegar a uma Peça exportável sem URL do observador?
2. Onde hesita ou improvisa (marca, protocolo, confirmar geração, revisão)?
3. Como nomeia o objeto no meio do trabalho — campanha ou trabalho? (alimenta o item 11; não resolve domínio aqui)

Método: observação / inquiry no Estúdio de agora. 4–6 sessões bastam para saturação diagnóstica; 10 completas **não** é denominador. Registrar versão/commit, ambiente, protocolo, perfil, origem, **todas** as tentativas (falha e abandono). Separar novato vs recorrente. Recrutamento: P01/P02 se alcançáveis; senão founder-as-operator com `observerConfirmedHuman` e commit gravado. Reabrir waitlist é decisão de founder.

Não afirmar superioridade estatística nem validação de mercado com essa amostra.

## Fora desta nota

Correções de código, Veredito, carrossel pago, rename de Campanha, quarta auditoria Layers.
