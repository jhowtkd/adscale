# Exceção ao congelamento: página própria do trabalho criativo

**Data:** 2026-07-30
**Status:** Proposta — aprovada quando este commit for mergeado na `main`
**Manifesto:** [`allowed-primary-destinations.json`](./allowed-primary-destinations.json)
**Demanda:** issue #126 (Creative Work: retomar na página própria ou na campanha)

## Contexto

O congelamento do plano de convergência (ADR 0013) rejeita novas
superfícies criativas. A issue #126, porém, exige que um trabalho sem
campanha possua "um destino próprio, estável e autenticado por
identificador" e que "Continuar de onde parei" abra essa página — sem que
o override da Home capture o destino com uma âncora local.

A página própria não é uma jornada concorrente: ela é um adapter do
mesmo `creative_work` canônico (o componente `CreativeWorkResumeSurface`
retoma o mesmo ciclo de fonte, direcionamentos, geração, revisão e
aprovação que hoje vive na Home). Sem esta exceção, o critério de
aceite da #126 e o anti-expansion gate são mutuamente exclusivos.

## Escopo da exceção

Somente os artefatos abaixo são adicionados ao snapshot do manifesto:

| Artefato | Motivo |
| -------- | ------ |
| Grupo de dashboard `creative-work` | Necessário para a rota `/creative-work/[id]` |
| Página `creative-work/[id]/page.tsx` | Destino próprio autenticado da #126 |
| API `creative-work/[id]/suggest/route.ts` | Sugestão de direcionamentos com IA escopada ao mesmo trabalho (#129), sem consumo de créditos |

Nenhuma outra página, rota ou módulo é coberto por esta exceção. A rota
`creative-work/[id]/directions` chegou a existir no branch e foi
removida antes do merge por duplicar o autosave genérico.

## Consequências

- O anti-expansion gate volta a passar para o branch
  `agent/creative-work-variations-124-130` após o merge deste commit e
  do rebase/merge da `main` nele.
- Qualquer expansão além do escopo acima continua bloqueada e exige
  nova exceção documentada.
