# Exceção ao congelamento: Layerize dormente da Peça aprovada

**Data:** 2026-08-13
**Status:** Aceita
**Decisor:** Jhonatan Soares (founder)
**Critério de aprovação:** merge do PR #249 (`feat/227-seedream-layerize`) em `main`.
**Manifesto:** [`allowed-primary-destinations.json`](./allowed-primary-destinations.json)
**ADR:** [`../adr/0013-trabalho-criativo-first.md`](../adr/0013-trabalho-criativo-first.md)
**Demanda:** issues #227 e #229–#234

## Contexto

O ADR 0013 impede nova função ampla antes do Gate 8. Layerize não é um
gerador, um destino criativo nem uma jornada paralela: é uma exportação
opcional, posterior à aprovação humana, da Peça já selecionada no Trabalho
canônico. Sem esta exceção, a capacidade teria de esperar uma nova rodada de
evidência humana mesmo permanecendo desligada sem `FAL_KEY`.

## Escopo da exceção

Somente o seguinte entra antes de nova evidência humana:

| Artefato | Motivo |
| -------- | ------ |
| Campo JSONB `creative_work_outputs.layerization` | Um estado por Peça, sem novo agregado |
| Comando `layerizeOutput` e downloads `psd`/`zip` nas rotas já existentes de Creative Work | Sem árvore de API nova |
| Adapter `src/server/layerize/` e job `creative-work.layerize` | Pós-processamento fora da árvore congelada de geração |
| Ação visível só ao Dono da plataforma e só com `FAL_KEY` | Capacidade dormente no boot, CI e produção sem secret |

Nenhuma nova página, grupo de dashboard, árvore de API, provedor de geração
ou débito de créditos é coberto. Qwen, fallback, billing e smokes pagos
permanecem fora.

## Consequências

- A função permanece desligada até autorização econômica e o gate humano #235.
- Qualquer promoção a função geral, cobrança ADScale ou segundo provedor
  exige nova decisão e não cabe nesta exceção.
- O anti-expansion gate continua rejeitando destinos e pipelines novos.
