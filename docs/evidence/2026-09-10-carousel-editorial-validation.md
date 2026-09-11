# Carrossel editorial — evidência de validação (2026-09-10 / Task 8)

Data: 2026-09-11  
Worktree: `.worktrees/cursor-carousel-editorial-f786`  
Branch: `cursor/carousel-editorial-f786`  
Provedor real: **não autorizado nesta execução**

## O que esta evidência cobre

Esta nota registra resultados efetivos da Task 8 (storyboard na produção, freeze, export de legenda/referências, E2E escrito). Distingue quatro planos que **não** se confundem:

| Plano | O que prova | Status nesta execução |
| --- | --- | --- |
| Fluxo local / mock (simulador E2E + testes unitários) | Gates, freeze, prompt por ID, export compatível, contrato de dispatch | **Passou** nos testes focais |
| Verdade factual das fontes | Consulta real, abertura de páginas, lastro das alegações | **Não executado** (sem rodada autorizada de pesquisa paga) |
| Qualidade criativa | Originalidade dos ganchos, payoff, progressão, legibilidade do storyboard | **Pendente** — protocolo manual abaixo |
| Geração visual real | Texto fiel, continuidade de marca, imagens que explicam mensagens distintas, leitura em celular | **Pendente** — sem provider real |
| Produção | Carrossel validado em produção | **Não declarado**. Nenhum ambiente de produção foi exercitado |

O simulador controlado (`E2E_CONTROLLED_PROVIDER`) prova o fluxo. **Não** conta como avaliação editorial real, verdade factual, qualidade criativa nem evidência de produção (ADR 0014).

## Manifesto de exportação

Não foi necessário bump de versão. `CarouselManifestV1` permanece `version: 1`. Campos aditivos compatíveis no topo: `caption` e `references`. Nomes/ordem dos PNGs (`01.png`…`NN.png`) e o único `manifest.json` permanecem iguais.

## Testes automatizados (locais)

```
cd app && npm test -- \
  src/server/creative-work/prompt.test.ts \
  src/server/creative-work/carousel-visual.test.ts \
  src/server/creative-work/carousel-contracts.test.ts \
  src/server/application/prepare-carousel-work.test.ts \
  src/server/application/export-carousel-work.test.ts \
  src/server/jobs/creative-work-carousel.test.ts \
  src/server/creative-work/carousel-research.test.ts
```

Resultado: 7 files, 159 tests passed.

Relacionados (generate/advance/prepared-plan/editorial): 5 files, 79 tests passed.

`cd app && npm run typecheck` — passou.

ESLint nos arquivos tocados — 0 errors; 2 warnings pré-existentes (`_confirmedAt` em `carousel-visual.ts`, `slide` unused no job test).

`git diff --check` — limpo.

### Prompt / freeze / prepare / export

- Direção por ID: `"Comparar duas rotinas com o mesmo critério"` entra no prompt; `drafts/angles-hooks.md` não.
- Capa orienta identidade; interiores orientam cena/densidade do storyboard e não copiam a silhueta da capa.
- Snapshot congelado inclui `storyboard` + `caption` (opcionais, legado sem esses campos continua legível).
- Referência de claim inexistente é bloqueada na preparação (`editorial_invalid` / `missing_claim_reference`).
- Export inclui `caption` e `references` sem duplicar o manifest nem mudar PNG.

## Playwright

**Não executado.** Infra local não confirmada neste ambiente:

- Postgres `:5433` / `:5432` — down
- App `:3000` — down
- Inngest `:8288` — down
- Object storage MinIO `:9000` — down
- `DATABASE_URL` / `APP_URL` / `E2E_CONTROLLED_PROVIDER` — unset

A spec `app/tests/e2e/creative-work-carousel.spec.ts` foi reescrita para o fluxo editorial (bastidores → 3 ganchos → edição/escolha → roteiro → aprovação → uma capa → pausa → lote → revisão/export, contagem de dispatch por etapa, reload + confirmação stale). Sem DB/storage/Inngest locais, a spec **não** foi rodada e **não** se afirma que passou. Nenhum seed foi disparado contra ambiente remoto.

## Protocolo de avaliação manual (não executado aqui)

Dois briefings, para um revisor humano em rodada autorizada. Mocks não substituem esta leitura.

### Briefing A — factual, com fontes fornecidas verificáveis

Tema: um ato ou dado público com documentos oficiais anexados ao Trabalho (URL HTTP(S) aberta ou material `provided` com `sourceId` autorizado). O revisor confere:

1. Três ganchos com abordagens distintas (não paráfrases).
2. A promessa escolhida é entregue no roteiro.
3. Alegações centrais apontam para evidências sustentadoras (`opened`/`provided`, não `discovered`).
4. Progressão: cada slide acrescenta, sem repetir a capa.
5. Storyboard: cena e densidade específicas por slide; interiores não copiam a silhueta da capa.

Marcar resultado real: **pendente**.

### Briefing B — institucional de marca fictícia

Tema: posicionamento da marca sem alegação externa (pesquisa `not_needed`). O revisor confere as mesmas cinco lentes, mais: fatos de produto só do contexto autorizado; nenhuma prova inventada.

Marcar resultado real: **pendente**.

### Avaliação visual com provider real

Somente em rodada autorizada de geração: texto fiel, continuidade de marca, imagens que explicam mensagens distintas, leitura em tamanho de celular. **Pendente.** Sem essa rodada, o carrossel **não** está validado em produção.
