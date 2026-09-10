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

## Pendências objetivas (atualizadas após integração de B)

- BASE_COMUM incorporada por A/B/C/D; B1/B2/R1 revisados e integrados em61720be8, liberados a A/C.
- Entregar e revisar R1 entre B/D/A/C antes de fechar o caso QA fail.
- Receber as quatro entregas, integrar SHAs fixos, verificar seams e executar QA controlado com D.
- Comparação Cenbrap real, aceite visual da aplicação e publicação permanecem posteriores e separados.

## Revisão inicial de B1 — e38b530

Revisão estática do SHA fixo `e38b53077d1d02021d688996eea1e3ad87c8f8a1`; não inclui WIP posterior. **Ainda não liberar a A/C.**

- **P2, corrigir por B:** GET `app/src/app/api/creative-work/[id]/route.ts:561–562` devolve reviewDraft/revisionContext do JSON persistido sem aplicar os schemas; `app/src/server/repositories/creative-work-output-review.ts:69` usa revision cru com fallback para0. Um objeto persistido inválido pode ser sobrescrito como rascunho inicial; campos extras privados podem atravessar a projeção pública. Validar valores não nulos com os schemas, projetar somente dados validados e rejeitar estado inválido sem reset/overwrite. Manter null histórico. Acrescentar regressões de campo privado extra e versão/revision inválida nas suítes existentes.
- CAS transacional, isolamento de workspace, compiler de entrada, maxCalls e width/height não tiveram outro achado acionável nesta revisão estática. Isso não substitui testes do commit corrigido.

B entrega um novo commit com a correção e os checks; preservar o commit original na ancestry. Coordenador revisa o delta antes de integrar e distribuir B1.

## Entrega parcial A e atribuição complementar

A entregou `931f6578` e `9b635b9a`: política/qualidade/formato, direção/prompt e QA. Revisão independente dos SHAs sem achado bloqueante nessa entrega parcial. Integrados preservando ancestry no merge `ba84e7ca4786708578281e1162119d5ef51a712c`; não é A1 completo e ainda não ativa integrated no produto. Como são unidades independentes de B1, sua verificação pôde acontecer antes da entrega de Contratos, sem introduzir stub.

No worktree de integração, o coordenador confirmou **11 arquivos / 348 testes passando**, `npm run typecheck` com exit0 e ESLint dos15 arquivos tocados com exit0. A suíte foi exatamente a lista do prompt A. Avisos não bloqueantes: Node DEP0205 e Fontconfig sem configuração padrão; não constituem prova de renderização visual. Não houve chamada paga nem migration nesse teste. Esses checks verificam a entrega parcial combinada com a base, não as quatro frentes completas.

A identificou também que reference-plan exige upload original na adaptação mesmo com pai de revisão. A recebeu propriedade explícita de reference-plan.ts/teste para aceitar o pai como original válido e primeira referência, preservando a exigência de original na adaptação autônoma. Detalhe registrado no plano coordenador; sem source fictício no job.

## Segunda revisão de A — 16adbd18

`ff6aa457` e `13843113` aprovados em revisão estática parcial: snapshot integrated, idempotência de prepare, autoridade do pai na adaptação e projeção explícita de QA. O coordenador executou no worktree A em HEAD `16adbd18`: **12 arquivos/372 testes, typecheck, lint dos7 arquivos novos neste delta e diff check passaram**. A entrega permanece na branch A até fechar job/B1/R1; o snapshot já declara a nova política mas o job ainda não a aplica. Não publicar ou tratar como A1 completo.

## Devolutiva B2 — be4451bc

Além da correção B1 acima, B deve corrigir os seguintes achados por novos commits, preservando os SHAs entregues:

1. **P1, replay sem recuperação:** `app/src/server/application/revise-creative-work-output.ts:122–135` retorna sucesso ao encontrar operationKey, pulando o join canônico. Crash pós-débito/pré-dispatch ou ack deixa o envio sem retomada; dispatch_failed também pula compensação pendente. Retomar settlement com revisionContext congelado, sem reinterpretar draft editado. Testar replay pós-débito, dispatch/ack e refund pendente, sem cobrança duplicada.
2. **P2, recuperação após402:** reserva mantém filho failed/credit_blocked. Repetir após recarga devolve esse filho sem gerar/cobrar. Só remover o retorno antecipado não basta: join sem chargeUsage também retorna settled. Retomar idempotentemente com mesma chave, uma cobrança e uma geração após recarga; testar concorrência/replay.
3. **P2, DTO da revisão:** `app/src/app/api/creative-work/[id]/generate/route.ts:78` serializa a linha interna inteira no reviewed_revision. Replay de completed expõe outputKey e estados internos de camadas. Aplicar projeção pública compatível com GET e testar sentinelas privadas nessa resposta.

Revisão estática, sem banco real ou E2E. B1/B2 não liberados até correções e testes. B também é dono de CAS/marker/list/limpeza/GET de R1; D entrega o helper, A job e C polling. Não criar stubs ou editar arquivo de outro dono.

## Sessões localizadas

O usuário informou OpenCode Desktop e Z Code Desktop. OpenCode: B em `ses_f73a02338ffe3uD6yfKwgZVHn8` (“Contratos, persistência e reserva outputs”) e D em `ses_f739be295ffeiIXxpSX0Aa6QaC` (“Créditos auditáveis e QA integração”). D recebeu e iniciou R1 pela UI. B recebeu a devolutiva correta e iniciou as correções. C foi localizado no ZCode, tarefa “Agente C: interface estudio e estados silenciosos”, e recebeu a orientação via Steer; iniciou a nova mensagem. Uma mensagem incorreta de clipboard chegou a B e foi imediatamente corrigida; o recebimento do texto correto foi confirmado na UI.


## Segunda devolutiva B e revisão D

B entregou `3470fee9`, com BASE_COMUM na ancestry. Coordenador confirmou **8 arquivos/397 testes passando**. DTO privado, save e replay pós-débito foram corrigidos. Ainda pendente no SHA:

- B/P2: revise-creative-work-output.ts:128–164 converte revisionContext inválido em null e cai no caminho legado. Comando reviewed deve exigir contexto válido. Testar com revisionInstruction válida e contexto version2/campo extra; o teste atual com instruction null rejeita pelo motivo errado.
- B/P2: repositories/creative-work.ts:1565–1568, retomada credit_blocked precisa renovar updatedAt e limpar terminalAt além de queuedAt, para GET não vencer imediatamente a lease antiga após uma recarga tardia. Preservar chave e contador.
- GET deve consumir o helper real de D e remover a função local duplicada. Completion/list/limpeza R1 estão coerentes na revisão.

D entregou `22879a5b`, `0f6d53bc`, `3cceb8c1`, `167ab700`. Coordenador confirmou **9 arquivos/95 testes passando**, com avisos de navegação não implementada em jsdom. Helper R1 de `167ab700` aprovado separadamente para A/B; preserva already_refunded, userId, chave e confirmação. Fechamento financeiro integral ainda pendente:

- D/P2: revalidar usage idempotente após adquirir locks dos grants e tratar23505 de recordUsage consultando workspace/chave fora da transação abortada. Corrida preexistente coberta pelo critério de idempotência desta entrega. Testar saldo exato para uma operação e23505 sem usage correspondente.
- D/P2: history/route aceita data impossível com horário, como2026-02-31T12:00:00Z. Exigir ISO com timezone e calendário válido, estendendo o teste existente.
- Rollback/concorrência reais e traduções financeiras continuam dependentes da integração/QA.


## Devolutiva C — hooks e geometria

Revisão estática dos SHAs fixos a986aa8a,1b5be14d,3f88c3c0; não avalia WIP posterior de workspace/dock. Corrigir por C antes de integrar:

1. **P1, revisão persistida perdida:** useOutputReview.ts:91,262–269,288–306 nunca hidrata lastRevisionRef com output.reviewDraft. Reabrir revisão2 mostra texto mas bloqueia Revisar; próxima edição envia expectedReviewRevision0 e recebe409. Hidratar revisão canônica junto ao conteúdo, inclusive reloadDraft. Estender teste de fresh mount para revisar/confirmar e editar a partir da revisão2.
2. **P1, gravação cruzada de peças:** useOutputReview.ts:104–125 lê outputIdRef.current quando a fila executa. Save A em voo + segunda edição A enfileirada + troca para B pode enviar a edição de A para B; respostas antigas alteram lastRevisionRef de B. Capturar identidade work/output/epoch por operação; proteger saves, uploads e confirmações, conservando a edição no output de origem e ignorando respostas antigas na peça visível. Testar duas peças, save e upload adiados.
3. **P1, confirmar conteúdo antigo após falha:** useOutputReview.ts:162–172 ignora flush null quando freshSave=false e usa último sucesso. SalvarX, editarY, autosaveY falhar e clicar Revisar pode gerarX comY visível. Exigir save bem-sucedido do conteúdo/epoch atual; erro ou edição durante await não aceita último sucesso. Testar zero confirmações após falha.
4. **P2, geometria de imagem pequena:** PieceReviewCanvas.tsx:36/117 calcula upscaling mas CSS max-h/max-w não amplia imagem100x100 dentro de600x400. Pins e hit-test divergem do retângulo real. Alinhar dimensionamento da imagem à geometria ou medir rect real do img relativo ao container; teste com rects diferentes e resize.

Extração LayerEditorContent de1b5be14d aprovada parcialmente; não inicia geração paga no mount. Popover sem achado bloqueante em leitura, mas browserQA ainda pendente. C deve preservar o layout contido e continuar sua tarefa original após corrigir esses pontos.

Helper R1 aprovado foi isolado pelo coordenador em `a822f2f3` via cherry-pick -x de167ab700 (dois arquivos de D, autoria/origem preservadas), para A/B receberem o mesmo SHA real sem antecipar as correções financeiras pendentes.

## Contratos B liberados — 61720be8

B corrigiu os resíduos em157a698667ea4d95158f9a70c465b5c1efecd6ca. Revisão independente sem bloqueadores; coordenador confirmou398 testes em8 arquivos, typecheck e diff check. ESLint:0 erros/7 warnings (destructures do carrossel e tipos não usados em settlement). Merge preservando ancestry em61720be860234617dda998a9fb0476bac1c42698. Esse SHA fixo foi enviado a A/C, sem financeiro D ainda em revisão. Inclui0095_output_review; migration só será executada no banco sintético isolado.

## Segunda devolutiva financeira D

690d2512/922489e7: coordenador confirmou37 testes em3 arquivos, typecheck e lint. Datas inválidas/timezone corrigidos; restam dois caminhos de idempotência, enviados ao autor via OpenCode:

- credits.ts:206–211: commit concorrente antes de canSpend pode devolver blocked antes dos locks. Reconsultar workspace/chave antes desse retorno e testar intercalação com saldo exato.
- recordUsage:328–332 e refundCredits:490–494: DrizzleQueryError expõe SQLSTATE em cause.code. Usar extração mínima compartilhada, confirmar a operação fora da transação abortada, relançar23505 sem a usage esperada. Teste com wrapper real, não somente code na raiz.

## Segunda devolutiva C — workspace e revisão persistida

Revisão independente de bfd0db72, enviada a C via ZCode:

1. P1: fechar Camadas/abrir Comparar desmonta o editor sem flushAndRelease e perde edição em debounce. Toda saída deve salvar antes; falha preserva editor aberto.
2. P1: retry legado chama geração sem plano/custo e cria UUID por clique, sem proteção isRevising. Retomar fluxo confirmado com identidade estável.
3. P2: seleção null segue cada novo output via polling. Fixar seleção inicial por trabalho e testar rerender.
4. P2: filho queued exibe ancestral mas canvas grava pinos no filho não concluído. Exibir base somente leitura enquanto pendente.
5. P2: outputs=[] chama hook com selected indefinido antes do guard. Proteger sessão e testar vazio sem mock que oculte crash.

C entregou b149b5eb para os quatro achados anteriores. Corrigidos first mount/reload, flush que rejeita X quandoY não salvo e geometria. Ainda corrigir:

- P1 useOutputReview.ts:140: a operação captura outputId mas lê expectedReviewRevision do lastSavedRef global quando executa. A1 em voo+A2 enfileirada+troca paraB faz A2 usar CAS deB. Debounce197–199 também lê draft deB na troca antes de disparar. Capturar sessão desde agendamento, conservar CAS por sessão e impedir callbacks antigos de alterar erro/status atual. Testar duas operações enfileiradas e troca antes do debounce.
- P2 useOutputReview.ts:343: refetch limpo do mesmo output hidrata texto mas não lastSavedRef/revisão. Hidratar ambos; testar rerender com reviewDraft mais recente, depois review e próxima edição.

## Ambiente de QA local

Docker iniciado localmente. O container antigo adscale-test-postgres estava parado e foi preservado. Criado container exclusivo adscale-estudio-qa-20260910 (label desta tarefa), imagem postgres:16-alpine já instalada, bind127.0.0.1:5434, banco adscale_estudio_qa com credenciais sintéticas test/test. pg_isready confirmou pronto. Ainda não constitui prova de migration, concorrência, browser ou qualidade visual.
