# Estúdio — Registro da coordenação

Data: 2026-09-10. Estado observado nesta preparação; este arquivo não declara a aplicação integrada ou publicada.

## Base e isolamento

- Base de código: `ac38a30e4611ee62d534b34a2b80579dbfe893d3`.
- **BASE_COMUM: `3063ff4a8c8bad1091d2876a070314e7653c922a`.** Contém somente os nove arquivos da spec, três planos técnicos, plano coordenador e quatro prompts; cópias verificadas byte a byte. Não inclui estudos privados nem aplicação.
- Integração: `/Users/jhonatan/Repos/ADScale_2/.worktrees/estudio-integracao`, branch `codex/estudio-integracao`.
- `.worktrees` é ignorada. Checkout original e WIP alheio preservados. Dependências de integração/A reutilizam node_modules instalado; nenhum .env foi copiado ou migration aplicada.

| Frente | Worktree relativo à raiz | Estado verificado |
| --- | --- | --- |
| A | `.worktrees/estudio-motor` | Criado em BASE_COMUM; informado diretamente na tarefa “Melhorar motor da Peça única”. |
| B | `.worktrees/estudio-contratos` | Iniciado em ac38a30e antes da preparação. Candidato `e38b53077d1d02021d688996eea1e3ad87c8f8a1` em revisão; BASE_COMUM ainda precisa entrar na ancestry. |
| C | `.worktrees/estudio-interface` | Iniciado em ac38a30e, com cópias não rastreadas do bundle e trabalho de UI. Precisa incorporar BASE_COMUM sem apagar WIP. |
| D | `.worktrees/estudio-creditos-qa` | Já criado em BASE_COMUM por outra sessão; não recriado ou resetado. |

Existência de worktree não prova execução/conclusão da tarefa. B/C/D não aparecem como tarefas acessíveis no inventário atual do Codex; não foi enviado comando para sessões presumidas. Seus donos devem consumir este registro e comunicar IDs/canal ou os SHAs de entrega.

## Sincronização para B e C

No próprio worktree, conferir status antes de incorporar `3063ff4a8c8bad1091d2876a070314e7653c922a` por merge. Não fazer rebase, reset, checkout de arquivo alheio ou stash automático. B já tem commit próprio, então não exigir fast-forward: manter ambos os SHAs na ancestry. O commit comum muda apenas documentos; app WIP pertence ao executor.

C possui documentos untracked: conferir cada arquivo com o conteúdo de BASE_COMUM. Só se forem byte-idênticos, mover exclusivamente essas cópias para diretório temporário preservado, fazer merge e conferir o resultado. Se qualquer cópia divergir, preservar e comunicar o diff ao coordenador; não limpar a pasta inteira. Não alterar os arquivos de componentes em andamento.

Após adotar a base: informar `git rev-parse HEAD`, resultado de `git merge-base --is-ancestor 3063ff4a8c8bad1091d2876a070314e7653c922a HEAD` e status. B1 só será distribuído depois de review e checks; observar um commit não equivale a aceitá-lo.

## Autorização registrada e limites

A tarefa “Melhorar motor da Peça única” (`01a08c5f-a169-7df0-bebb-8cec5bc2454f`) foi aberta pelo usuário com o prompt executor A como pedido. O texto atribui implementação e nomeia renderPolicy, quality e revisionAction. Esse pedido cobre a implementação local desses contratos no escopo de A; o fundamento é a atribuição de execução, não a aprovação visual anterior. Não pedir novamente autorização para esses mesmos itens.

Esse registro não concede autorização em nome do usuário para novas mudanças externas ao recorte. B/C/D devem apontar seus próprios pedidos de execução quando necessário; a presença das branches sozinha não comprova autorização. Nenhuma autorização de produção, banco real, chamadas pagas, publicação ou mudança de preço foi registrada nesta preparação.

## Correção de integração R1

A identificou que preservar QA fail como completed deixa a compensação sem recuperação. Revisão read-only confirmou completion limpando failureCode, seleção de pendentes limitada a failed e saídas antecipadas do job. A instrução antiga de chamar refundTerminalOutput foi corrigida no plano de qualidade.

O contrato R1 do plano coordenador especifica CAS vencedor, marcador durável em failureCode existente, helper canônico compartilhado preservando already_refunded, recuperação por job/onFailure/GET e polling. A/B/C/D continuam donos únicos dos respectivos arquivos. Não implementado por esta preparação; testes de crash/replay/concorrência são condição da integração.

## Verificação local da base

Em `.worktrees/estudio-integracao/app`:

```bash
npm test -- src/server/creative-work/contracts.test.ts src/server/creative-work/prepare.test.ts src/server/generation/pipeline/execute.test.ts
```

Resultado: **3 arquivos, 64 testes passaram**. Aviso Node DEP0205, sem falhas. `git diff --cached --check` passou para o bundle. Esses checks são de baseline local, não testam o conjunto em desenvolvimento, browser autenticado, migrations, providers pagos ou produção.

## Pendências objetivas

- B/C incorporar BASE_COMUM preservando o trabalho atual.
- Revisar candidato B1 e suas evidências; retornar achados ao autor; distribuir somente SHA aceito.
- Entregar e revisar R1 entre B/D/A/C antes de fechar o caso QA fail.
- Receber as quatro entregas, integrar SHAs fixos, verificar seams e executar QA controlado com D.
- Comparação Cenbrap real, aceite visual da aplicação e publicação permanecem posteriores e separados.

## Revisão inicial de B1 — e38b530

Revisão estática do SHA fixo `e38b53077d1d02021d688996eea1e3ad87c8f8a1`; não inclui WIP posterior. **Ainda não liberar a A/C.**

- **P2, corrigir por B:** GET `app/src/app/api/creative-work/[id]/route.ts:561–562` devolve reviewDraft/revisionContext do JSON persistido sem aplicar os schemas; `app/src/server/repositories/creative-work-output-review.ts:69` usa revision cru com fallback para0. Um objeto persistido inválido pode ser sobrescrito como rascunho inicial; campos extras privados podem atravessar a projeção pública. Validar valores não nulos com os schemas, projetar somente dados validados e rejeitar estado inválido sem reset/overwrite. Manter null histórico. Acrescentar regressões de campo privado extra e versão/revision inválida nas suítes existentes.
- CAS transacional, isolamento de workspace, compiler de entrada, maxCalls e width/height não tiveram outro achado acionável nesta revisão estática. Isso não substitui testes do commit corrigido.

B entrega um novo commit com a correção e os checks; preservar o commit original na ancestry. Coordenador revisa o delta antes de integrar e distribuir B1.

## Entrega parcial A e atribuição complementar

A entregou `931f6578` e `9b635b9a`: política/qualidade/formato, direção/prompt e QA. Reportou 348 testes, typecheck e lint passando. Revisão independente iniciada; não é A1 completo e ainda não ativa integrated no produto.

A identificou também que reference-plan exige upload original na adaptação mesmo com pai de revisão. A recebeu propriedade explícita de reference-plan.ts/teste para aceitar o pai como original válido e primeira referência, preservando a exigência de original na adaptação autônoma. Detalhe registrado no plano coordenador; sem source fictício no job.
