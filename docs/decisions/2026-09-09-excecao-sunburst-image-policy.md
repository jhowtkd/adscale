# Exceção ao congelamento: política de imagem Sunburst

**Data:** 2026-09-09
**Status:** Proposta — aprovada quando este commit for mergeado na `main`
**Manifesto:** [`allowed-primary-destinations.json`](./allowed-primary-destinations.json)
**PR de implementação (depois desta exceção):** [#326](https://github.com/jhowtkd/adscale/pull/326)

## Contexto

O anti-expansion gate rejeita qualquer arquivo novo em `app/src/server/ai/`.
A preparação local de GPT Image 2.5 Sunburst precisa de dois módulos no
pipeline canônico já existente: política congelada por workspace e observador
de chamadas. Não é destino novo, jornada concorrente, provedor paralelo nem
ativação do modelo. O percentual permanece `0` até evidência visual e
autorização explícita.

Sem esta exceção na base, o PR de implementação não consegue passar o gate,
porque o snapshot é lido de `main`, não do próprio PR.

## Escopo da exceção

Somente estes módulos do pipeline de imagem existente entram no snapshot:

| Artefato | Motivo |
| -------- | ------ |
| `src/server/ai/image-render-policy.ts` | Escolher e validar modelo/qualidade congelados. Percentual `0` = legado. |
| `src/server/ai/image-render-policy.test.ts` | Testes do seletor e do schema. |
| `src/server/ai/image-call-observation.ts` | Registrar `usage` bruto (ausente = desconhecido) antes do decode. |
| `src/server/ai/image-call-observation.test.ts` | Testes do observador. |

O manifesto também absorve rotas de API que já existem na `main` e eram
aceitas só pelo reparo de drift do gate. Isso sincroniza o snapshot sem
autorizar artefato adicional desta mudança.

## Fora do escopo

- Percentual Sunburst > 0, Flare, `input_fidelity`, 4K ou segundo provedor.
- Nova página, grupo de dashboard ou árvore de API.
- Lotes pagos, calibração visual ou I6.
- Landing Page e Persona Simulation continuam congelados.

## Consequências

- Depois do merge em `main`, o PR #326 deve ser rebased; o gate deixa de
  recusar os quatro arquivos acima.
- Qualquer outro arquivo novo em `src/server/ai/` continua bloqueado.
- Ativar Sunburst em produção exige evidência visual e autorização à parte.
