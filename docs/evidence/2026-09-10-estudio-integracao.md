# Estúdio — Registro da coordenação

Data: 2026-09-10. Registro de preparação, integração e verificação local; não declara publicação.

## Correção após rejeição visual da integração — 10/09, 19h

O usuário rejeitou a interface local ao compará-la com `https://adscale.jhonatansoares.com/`. A revisão anterior validou fluxos, mas não reconheceu que BASE_COMUM/ac38a30e não continha a estrutura de Estúdio já publicada em **becca0a8 (#325)**. Portanto, a afirmação anterior de preservação da composição externa era insuficiente. A sidebar não mudou geometricamente; a mesa, seus controles e o encaixe da caixa diferiam da versão publicada.

Recuperado o escopo de Estúdio do commit publicado: mesa Inspirações/Produção, paginação e consulta de produção por marca/campanha, CSS de posicionamento e caixa expansível que mantém o formulário montado. Também conservada sua correção de revisão CAS e testes. Não incorporados seed ou screenshots históricos daquele commit, nem mudanças posteriores de Sunburst. Sem migration ou dependência nova.

O editor da Peça única agora ocupa somente o conteúdo do dock existente. A mesa permanece montada atrás dele, inerte durante inspeção. Configuração e plano inicial usam a altura natural da caixa publicada, sem impor580–690px ao pedido inicial. Abertura explícita de trabalho ou confirmação da geração ativa o editor; hidratação de rascunho não transforma uma visita à home em sessão de edição. O TalkBox permanece montado quando oculto. `controlsOnly` impede que o portal do grid legado duplique o resultado fora da caixa.

**Provas desta correção:** build otimizado e TypeScript aprovados;120 testes em quatro arquivos de superfície aprovados, incluindo61 de Dashboard; o teste de CreativeComposer foi ampliado para cobrir o portal oculto e passou50/50. Os outros sete arquivos de consulta/produção/carrossel/revisão/entry passaram no lote inicial. Lint final sem erros, com o warning preexistente de dependência do callback em Dashboard. Graphify atualizado por AST. Esses lotes se sobrepõem: não somar as contagens.

Navegador controlado: **cinco casos passaram** em `published-restore-e2e.log` (home nos três tamanhos, entrada adiada, jornada completa com comentários/refinamento/variação/formato, QA preview e camadas). Carrossel passou separadamente **1/1 em1.8s**, `published-carousel-final.log`. Seus dois retestes anteriores falharam por configuração do teste: seletor antigo de textarea duplicada e ausência de escolha explícita de marca após a fixture de camadas adicionar uma segunda marca. O reteste usa o pedido compartilhado publicado e a mesma seleção de perfil já usada pelo teste completo de carrossel; nenhum patch de produto foi criado para essas falhas.

Comparação visual realizada no Chrome da versão publicada e na aba real do navegador interno. Mesa/caixa recolhida e expansão conferidas na sessão local. O ambiente sintético não possui catálogo de inspirações; a aba Produção contém PNGs de teste majoritariamente pretos. Isso não representa qualidade gerativa nem os dados Cenbrap de produção. Prints novos em `docs/screenshots/2026-09-10-estudio-mesa-restaurada/`. A aprovação visual final permanece com o usuário; nenhuma alteração foi publicada.

## Situação ao encerrar a integração local (registro anterior à rejeição visual)

As quatro frentes estão integradas na branch `codex/estudio-integracao`, até o merge `1a82a719`. **18 cenários funcionais passaram por lotes: nove API e nove UI; não foi uma execução única 18/18.** Build otimizado com TypeScript, lint dos arquivos finais e atualização AST do Graphify concluídos. Os dez checks SQL locais são evidência separada dos testes simulados. O checkout original e seu WIP, inclusive conflitos existentes em arquivos de planejamento, foram preservados.

A caixa mantém comentários, revisão, variação, adaptação e camadas no mesmo trabalho. Formatos abrem junto à ação; miniaturas ficam junto à arte. O fechamento mobile passou as verificações de largura, sem cortar Revisar. **Aprovação visual humana continua pendente:** os prints do editor de camadas mostram a barra de zoom sobre parte da imagem, sobretudo nas larguras menores. Esse refinamento residual está registrado, sem declarar a UI final aprovada.

Nenhuma geração paga, acesso a produção ou deploy foi realizado. As imagens são fixtures sintéticas; esses resultados não comprovam superioridade visual sobre ChatGPT. Continuam pendentes o comparativo cego com briefs/assets congelados e autorização para gerações reais, o teste real de separação em camadas e a decisão de publicação.

Prints preservados em [docs/screenshots/2026-09-10-estudio-integrado](../screenshots/2026-09-10-estudio-integrado/): caixa pronta em390/1045/1440, comentário1045, QA1045 e camadas390/1045/1440. Histórico abaixo conserva falhas, correções e limites de cada execução.



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

## Financeiro e banco — verificação independente concluída

D corrigiu os resíduos em baf04c15, aprovado em revisão independente. Coordenador confirmou103 testes em9 arquivos, typecheck e lint. Integrado em e1369a71. O conjunto B+D passou501 testes em17 arquivos e typecheck; avisos jsdom de navegação permanecem restritos aos testes de UI.

As migrations do SHA61720be8 foram aplicadas somente ao banco novo5434; confirmadas as colunas review_draft/revision_context. D adicionou3 ensaios na suíte real existente em562d2dc6, revisada e integrada em02c3955f. Coordenador executou independentemente **8/8 testes Postgres**, incluindo rollback de débito/refund por FK23503, repetição com mesma chave após rollback e3 cobranças concorrentes com saldo exato resultando em1 recorded+2 duplicate e1 débito. Isso comprova transação local; não execução em produção.

## Recuperação de falha técnica integrada

A identificou que erro técnico com estorno terminal podia perder recuperação após falha do settlement. Correção estreita atribuída: A persiste generation_failed_terminal_refund_pending no CAS failed vencedor do fluxo integrado e usa helper canônico; B recupera pelo GET com failurePhase terminal, userId e mesma chave. Somente após confirmação o código vira generation_failed. Legado preservado; sem novo schema ou scheduler.

B entregou a61c7d55, aprovado em revisão e134 testes do coordenador (rota+helper), typecheck e lint0erros/5warnings existentes. Merge f42aeb87650c623c3c8c55e63f6c1606f2c145cb enviado a A. A ainda termina job/contagem/R1; sua49bc0c82 foi aprovada apenas no recorte interno de prompt/high/replay.

## Preparação do navegador e limites

Configuração sintética de39 valores extraída do CI em /tmp/estudio-integrado-e2e/local-env.sh, sem .env de produção. Seed create-post executado no banco novo e storage local; fixture em /tmp/estudio-integrado-e2e/create-post.json. Seed terminou exit0, mas registrou falha de tarefa de email por next-intl fora do Next; nenhuma prova de fluxo de email é reivindicada. Chave re_test_ci impede envio externo.

Next está em127.0.0.1:3000, Inngest local em127.0.0.1:8288 com --no-discovery e somente o endpoint desta aplicação. Health retornou ok e sync Inngest200. Logs em next.log/inngest.log no mesmo diretório temporário. Isso ainda não prova jornada nova; C não integrado e D prepara os E2E.

Revisão da cobertura identificou ausência de E2E explícito dos novos contratos. D recebeu extensão dos arquivos existentes para jornada UI/reload, CAS/replay, integrated high/1call/QA/refund e fluxos críticos. Camadas seedadas permitem validar painel/edição/publicação; E2E_CONTROLLED_PROVIDER não intercepta a separação Seedream/AtlasCloud. Não disparar separação paga nem declarar cobertura real dessa operação. Comparação visual Cenbrap continua not_run até autorização de geração real.

## Revisão do fechamento A e recuperação concorrente

A entregou ccd91817/360fe53d; coordenador confirmou 409 testes em 13 arquivos, typecheck e lint. Revisão encontrou ausência de userId no estorno técnico após load-scope em cache e no onFailure. A corrigiu em 1f45dbc8; revisão independente aprovada e coordenador confirmou 130 testes do job, typecheck e ESLint. Ainda não integrado: depende da correção concorrente abaixo.

B recebeu dois resíduos P1 do marcador técnico: bloquear retry enquanto generation_failed_terminal_refund_pending antes de consultar/cobrar ledger e nas duas operações CAS; limpar marcador somente por CAS que confira status failed, código exato, manualRetryAttempt null-safe e retryCount da tentativa estornada. Um recovery antigo não pode apagar a pendência de uma tentativa nova. GET e job A devem usar o mesmo helper específico, somente após confirmação do refund. Correção em andamento, sem nova API pública ou schema.

## Terceira devolutiva C — 66a0d53d e b14faea6

Coordenador confirmou 62 testes em quatro arquivos de workspace/canvas/card/editor e 22 testes do hook. Revisão aprovou CAS de A1/A2 por sessão, refetch limpo e flush quando o editor de camadas está montado. Restam:

- P1: fechar painel de scanner sem editor não deve esperar um flush que nenhum componente consome.
- P1: revisar filho falho deve persistir nova chave de operação e passar pelo plano/confirmar; apenas selecionar pai reutiliza a chave já consumida. Não sobrescrever silenciosamente draft mais recente do pai.
- P2: formulário de comentário já aberto deve fechar ou ficar inerte ao entrar readOnly; proteger todos os mutadores.
- P1: trocar A por B antes do debounce descarta edição de A. Salvar antes de trocar e manter A se falhar, ou persistir a sessão capturada. O teste que exige zero saves confirma a perda e deve exigir conservação do conteúdo.
- P2: hidratar B deve resetar seu saveState, sem herdar Salvando de A. Respostas tardias de A não alteram texto/revisão/erro/status de B.

Devolutivas encaminhadas ao autor C; Dashboard/rotas e fluxos críticos permanecem no escopo original. A aplicação local já está autenticada com a conta sintética; isso ainda não verifica a Interface nova, que não foi integrada.

## Continuação após limite do executor D

OpenCode exibiu para a sessão D `monthly usage limit reached`, com reinício em 17 dias. Os três E2E modificados foram preservados em /tmp/estudio-integrado-e2e/d-e2e-preserved.patch. Criado worktree independente estudio-qa-continuacao, branch codex/estudio-qa-continuacao, a partir de 562d2dc6, com esse WIP aplicado e dependências existentes por symlink. O agente Codex billing_findings recebeu explicitamente a autoria dos quatro E2E e dos dois relatórios D nessa cópia. A sessão antiga pode ser retomada sem disputar o novo checkout; nada foi descartado.

C apresentou fault.subscription.runtimeRestarted; reconexão na mesma tarefa recuperou WIP. Envio do texto consolidado com referência à terceira devolutiva foi confirmado no histórico e C iniciou as cinco correções, mantendo GLM-5.3-Flash Max.

A até 1f45dbc8 foi integrado em 2f063b19 para liberar os ensaios locais de motor/CAS/QA já revisados. Esse merge é intermediário: o gate concorrente e a limpeza técnica específica de B continuam pendentes, seguidos da conexão do helper por A. Nenhuma entrega final ou publicação é reivindicada.

## Guardas técnicos B aprovados — 3a818116

Revisão independente confirmou os seis arquivos de código/testes idênticos ao delta pré-revisado. Coordenador executou as suítes de repositório, retry e GET: 290 testes em três arquivos, typecheck e lint passaram (zero erros, cinco warnings existentes). Gate no serviço antes do ledger e nos CAS de claim/requeue; clear específico compara status/marcador/manualRetryAttempt/retryCount. Testes de repositório inspecionam SQL e mocks; prova dos guardas em Postgres real ainda deve ser acrescentada à suíte existente pela continuação D. A conectará esse helper no job após receber o SHA integrado.

## Mapa mínimo para concluir a integração C

Investigação independente somente leitura, após os cinco resíduos, para reaproveitar caminhos existentes:

- Carrossel: useCarouselComposer.ts/postPlan hoje só refetch e catch vazio. Expor por useComposerActions e injetar via useCreativeComposer os helpers existentes flushAutosave() de useComposerPersistence e resolveCanonicalWorkRevision(id) de useComposerRevision. Usar o ID devolvido pelo flush, inclusive antes de criar o draft, e comunicar ausência de ID/revisão/falha por setError existente. Guardar toda a duração flush+plan, não somente isPending da mutation. Estender testes existentes com edição imediatamente anterior ao clique e falha de flush/plano.
- Restyle: em useComposerPlanActions, checar pendingAnalysisBlocksPrepare antes de restylePairMissing, pois a dupla filtra somente fontes ready. TalkBox deve receber o gate canônico e distinguir preparação de fila; DashboardHomeActions não pode chamar toda actionPhase de Na fila.
- Direções: reaproveitar directionTouchedRef/pendingDirectionSuggestions em useComposerDirectionSuggestions. Hidratação precisa preservar escolha já persistida; applySuggestedDirections(..., true) já existe. Capturar trabalho/protocolo/época antes da sugestão e ignorar sucesso/erro tardio de outra sessão; workIdRef/intentRef/draftEpochRef já existem.
- Caixa: CreativeComposer ainda monta CreativeProposalGrid no ponto compartilhado entre Dashboard resultsOnly e CreativeWorkResumeSurface layout=piece. Convergir os resultados elegíveis para StudioPieceWorkspace ali, mantendo carrossel. Remover duplicação de título/configuração/editor dos wrappers do Dashboard e substituir fresh=1 da retomada pela variação da peça no mesmo trabalho. Testes existentes: CreativeComposer, DashboardHomeActions e CreativeWorkResumeSurface.

## Quarta devolutiva C — 8395e4fa

Coordenador confirmou 114 testes em seis arquivos e typecheck. ESLint não passou: nove erros nos novos componentes/hook, mais um import waitFor não usado. Corrigir no próprio código, sem desabilitar regras: PieceReviewCanvas:82 setState síncrono no effect e :86 leitura de imgRef no render; StudioPieceWorkspace:85/:91/:99 setState síncrono nos effects; useOutputReview:117/:131 atribuições em refs durante render. Usar eventos, estado inicial/derivado e callbacks existentes, sem adiar em timers artificiais só para silenciar lint.

Revisão independente confirmou que ainda há perda do rascunho: o timer é global, então editar A, trocar para B e editar B antes de 500 ms cancela o timer de A. Se A chegou a disparar mas o save falha após a troca, o erro é ignorado e o conteúdo não é conservado. Mínimo solicitado: TODA troca manual de peça aguarda review.flush; só seleciona B após sucesso e permanece em A com texto e erro em caso de falha. Testar também falha, não somente sucesso do autosave. Evitar uma segunda arquitetura de cache por output para resolver o que cabe nesse guard de navegação.

Retry ganhou chave nova, mas StudioPieceWorkspace:327–338 ainda ignora revisionContext/revisionInstruction do filho falho. Recuperar ação/formato/instruções/notas da tentativa quando pai não possui rascunho. Se o pai possui rascunho posterior, preservá-lo e oferecer retomada explícita das instruções anteriores, sem sobrescrever silenciosamente. O fluxo continua passando por revisão e confirmação de custo.

P2 adicional confirmado: useOutputReview:268 pula flush quando resaveAfterFailureRef está ativo e deixa o debounce pendente. Retry, editar, Revisar antes de 500 ms pode congelar revisão 2 e depois o timer salva revisão 3, fazendo Confirmar conflitar. Consumir/cancelar o debounce também no caminho de chave nova, antes de congelar o plano; teste deve exigir um único save e confirmação válida após avançar o timer. Scanner, readOnly, reset de saveState e R1 foram aprovados nesta leitura.

## Motor concluído em revisão — 673a1e65

A conectou o clear específico de B nos três caminhos técnicos usando a identidade do mesmo output que originou o refund, sem refetch posterior. Revisor independente aprovou; coordenador confirmou 131 testes do job, typecheck, ESLint e diff check. O teste da tentativa nova surgindo durante settlement conserva a identidade antiga no CAS. Prova SQL real e fluxo completo no navegador continuam com D/coordenação.

## Divisão final do cliente para manter o paralelismo

Com A/B fechados, orchestration_findings passa de revisor a implementador dos três fluxos de formulário em worktree novo estudio-fluxos-cliente / codex/estudio-fluxos-cliente, base 9f653226. Ownership: useCarouselComposer e teste; useComposerActions; useComposerPlanActions; useComposerDirectionSuggestions; useComposerHydration; useCreativeComposer e teste; composer-directions e teste; CarouselComposer.test se necessário. C mantém exclusivamente a caixa/review/canvas/editor e componentes de entrada CreativeComposer/Dashboard/BrandStageHome/TalkBox/ResumeSurface, seus testes e mensagens. Não há dois escritores no mesmo checkout; C recebe depois o SHA revisado para incorporar os hooks. Sua projeção revisionCreditCost já commitada será preservada no merge.


## Banco real e primeira rodada de API integrada

D acrescentou os dois cenários de guardas técnicos à suíte real existente. Coordenador repetiu independentemente: **10/10 testes Postgres passaram**, no banco sintético 127.0.0.1:5434. Comprovados bloqueio enquanto refund está pendente, limpeza pelo marcador e identidade exatos, comparação null-safe e proteção ABA. A simulação ABA é sequencial; não é reivindicada como corrida simultânea de transações. Os três testes financeiros anteriores exercitam concorrência real.

Os quatro novos E2E de API foram integrados em 446f021b e executados no Next + Inngest local com provedor controlado: **2 passaram, 2 falharam**. Passaram a chegada efetiva de high ao provedor com uma chamada e os filtros/reconciliação do histórico. CAS parou antes da asserção de concorrência porque o teste tentou acessar a URL e2e-storage da resposta JSON; a rota autenticada de download já entrega os bytes via objectDownloadResponse quando chamada sem format=json. O cenário de QA comprovou movimentos de crédito/estorno, mas a contagem de usage_events ignorava o evento canônico dispatch-ack de valor zero. Ambos foram devolvidos ao autor D para corrigir as verificações, sem alterar o produto. Log: /tmp/estudio-integrado-e2e/api-first.log. Nenhuma destas duas jornadas é declarada aprovada antes de repetir o teste corrigido.

O agente dos fluxos entregou 201b7230. Coordenador confirmou **172/172 testes em três arquivos**; revisão independente em andamento antes de integrar. C continua nos resíduos de rascunho/retry/lint e nas entradas da caixa.


## Quatro casos API aprovados e processo separado confirmado

Após corrigir as verificações em 8a524ced, a segunda rodada passou high, QA preview/refund e histórico. O caso CAS passou todos os efeitos concorrentes; a última recusa usava status equivocado. O código já mapeia invalid_revision para400/invalidInput quando a chave consumida é reapresentada com outro output base válido. 5824da72 exige esse contrato exato, os mesmos dois IDs, uma chamada e saldo/ledger inalterados. Integrado em f30eb34d.

Coordenador reiniciou somente o Next de QA com IMAGE_JOB_TARGET=worker e iniciou o entrypoint existente image-worker.ts com a mesma configuração sintética. Inngest único em8288; nenhum serviço pago. **CAS e high passaram2/2 no worker**, log api-worker.log. Combinado com a rodada anterior, os quatro casos agora possuem aprovação local. Não é reivindicada uma única execução4/4 num mesmo alvo.

Prova de executor: Next PID71874; worker PID71891, conexão01M26E0E4HQ2P418ENYB9J1H7G. A UI do Inngest confirmou adscale-image-worker CONNECT, um worker ACTIVE, oito funções de trabalho mais cinco handlers de falha (13 linhas). Run01M26E2FBDX28FZV1JVRSZV6HK / creative-work.generate.v2 / generate-creative-work-output-v2 concluiu no PID71891, output5f8f5f62-03d4-4d28-a7e8-d8d33b48fa71. As três peças dos dois testes concluíram no worker, cada uma com uma chamada. Extrato em /tmp/estudio-integrado-e2e/worker-smoke-evidence.json. Nenhuma equivalência visual com ChatGPT é inferida do provedor controlado.

Revisão dos hooks201b7230 encontrou um P1 antes de integrar: após organizar o carrossel, a revisão canônica em memória não recebia result.work.updatedAt; responder perguntas sem editar o texto reenviava a revisão anterior. Devolvido ao autor para usar o setter existente e testar a sequência com o cache real.


## Fluxos integrados e segunda matriz de API

96da1a89 fechou o P1 do cache de revisão do carrossel, aprovado em revisão independente; coordenador repetiu **178/178 testes**. Integração em1fda2376. D entregou os demais testes preparados em7364a4dd, integrados em4f164228; typecheck do conjunto passou e graphify foi atualizado por AST. Os17 casos integrated foram preparados, não declarados executados só por aparecerem em --list.

Cinco casos adicionais no worker: **quatro passaram** — QA indisponível/inconclusivo, falha técnica com refund e retry manual conservando uma cobrança líquida, adaptação sem upload e formato automático4:5 versus escolha manual9:16. Restyle retornou o409 previsto, mas o teste esperava sources_not_ready interno em vez de creativeWorkNotReady público. Devolvido a D para corrigir a asserção e provar a razão pelos estados canônicos das fontes. Log api-remaining.log; ainda falta concluir esse cenário. O teste UI de direções também está sendo alinhado ao contrato: solicitar sugestões é permitido, substituir silenciosamente a escolha não é.

## Quinta devolutiva C — e97a042f

Coordenador confirmou **81 testes em cinco arquivos** de workspace/canvas/popover/card/review e **15 testes** do editor existente em layer-editor/LayerEditorDialog.test.tsx. O comando anterior mencionava um caminho inexistente LayerEditorContent.test.tsx; essa ausência não foi contada como teste aprovado. ESLint dos cinco arquivos alterados passou, sem os nove erros anteriores.

Revisão independente encontrou três resíduos, devolvidos ao mesmo autor: os caminhos de scanner/editor em switchTo ainda retornam antes do flush da revisão; retry sem revisionContext ignora revisionInstruction/revisionAssetId legados; o canvas só oculta seu draft em readOnly e pode fazê-lo reaparecer em outro output ao ficar editável. C confirmou recebimento e continua as entradas, depois estes três ajustes. O merge dos hooks96da1a89 foi enviado para incorporar sem reimplementar e conservando revisionCreditCost.


## Entradas C — revisão de0610aa35 e fechamento4b194627

Revisão independente aprovou4b194627 para os três resíduos anteriores: review.flush antes das saídas de camadas, fallback legado e key por displaySrc para invalidar o comentário do canvas ao mudar a imagem. A revisão das entradas0610aa35 ainda encontrou:

1. P1: DashboardHomeActions347–350 mantém occupancy=empty chamando generateLegacy para single, pulando plano/custo. Single deve sempre chamar preparePlan, inclusive primeira visita/clique antes de500ms; teste exige zero confirmação/geração antes da ação explícita de confirmar.
2. P1: rota canônica de Peça única ainda abria o ResumeSurface/grid com Nova variação fresh=1. Spec9/Task6 exigem redirect somente de single para /?workId=...&compose=1. Os demais protocolos permanecem no fluxo existente. C já está trabalhando na rota/retomada e seus testes.
3. P2: a caixa gradiente desapareceu. Dashboard381 usa apenas styles.workspace, que define geometria;354 desliga a borda de TalkBox e StudioPieceWorkspace não cria outra. Reutilizar o ShineBorder existente como dono único externo dos estados entrada/plano/resultado; não adicionar segunda borda.
4. P2: CreativeComposer490 ainda monta PieceReferenceStrip com Adicionar no controlsOnly/stageChrome, enquanto a TalkBox monta Anexar. Conservar gestão/classificação de referências e esconder somente a ação duplicada nesse encaixe.
5. P2: TalkBox92–119 calcula restylePairReady sem status e só exibe os novos hints se o par não existe. Com content+style presentes, uploaded/analyzing/failed já são tratados como par pronto e os hints/retry somem. Separar presença do par e prontidão da análise; testar pending/failed/ready com os dois anexos presentes.

Todos pertencem ao escopo original de C; sem migração geral de protocolos, dependências ou infraestrutura novas.

## Conclusão da API e dependência de textos da interface

Restyle passou1/1 após42356994 (restyle-r2.log). Os nove casos API têm execução aprovada por lotes. UI carrossel parou no locator antigo role=button; a entrada real é radio Criar carrossel, devolvido a D sem alterar o produto. UI ilimitado comprovou ledger sem débito e os dois usos de valor zero, mas não concluiu: os textos creditHistory.unlimited/unlimitedHint/movementsNote estão no branch C ainda não integrado. A execução também registrou Maximum update depth em SelectTrigger; repetir após C para distinguir dependência de tradução e falha própria do componente. Sidebar mostrou Tester, cuja semântica será conferida antes de ajustar a expectativa. Nenhum desses dois ensaios de UI está aprovado.


## UI congelada: carrossel aprovado, financeiro ainda pendente

No HEAD6683e21b, o coordenador repetiu o caso de carrossel sem alterações no checkout durante a execução: **1/1 passou em40s**, incluindo organizar imediatamente após editar o pedido e preservar texto/erro422. Log /tmp/estudio-integrado-e2e/carousel-ui-r4.log. O r3 anterior coincidiu com merge de AppSidebar no servidor Next ativo: dois Fast Refresh cobriram praticamente todo o timeout15s do primeiro create; o segundo create idempotente retornou201. O r4 passou sem patch de persistência. O experimento de retry permaneceu não commitado no worktree estudio-fluxos-cliente e não faz parte da integração.

A falha Maximum update depth do financeiro também ocorreu após seis ciclos Fast Refresh, antes de qualquer interação com filtros. Revisão somente leitura não encontrou relação causal demonstrada com traduções nem motivo suficiente para mudar Select/BaseUI. Repetir após C, com código congelado. A ausência dos textos de C é uma dependência separada. Daqui em diante, não mesclar fontes durante jornadas E2E.

A sidebar foi corrigida pela continuação D emfb9376ce/5abf2609: conta Tester com autoridade unlimited=true mostra Ilimitado, sem sufixo créditos; Tester sozinho não infere acesso ilimitado. Coordenador confirmou **14/14 testes**. Integrado até6683e21b; falta a jornada financeira UI completa após as mensagens de C.

C entregou0129ef9e/dd9554ef. Coordenador confirmou **102 testes em quatro arquivos de entradas/retomada/rota** e **39 testes workspace/editor**, typecheck e lint sem erros (um warning). A revisão de fechamento ainda está em andamento; nenhum desses checks substitui aprovação da UI integrada.


## Quatro frentes integradas e achados do navegador

Interface atédd9554ef integrada em bdca74c3 para validação local; fechamento visual ainda pendente. A execução de fila passou persistência/reload/nenhum despacho, mas a inspeção dos screenshots revelou canvas vazio editável: outputSource retorna uma URL mesmo sem arte. C recebeu o guard hasUsableOutput antes de montar o canvas, reaproveitando o estado de fila existente; não há autosave na montagem, o erro observado era GETdownload409. Não declarar o screenshot de fila aprovado antes dessa correção.

**Retry técnico e direções manuais passaram2/2** no conjunto integrado, log /tmp/estudio-integrado-e2e/retry-directions-ui.log: confirmação explícita, mesma linha, duas chamadas controladas no retry; seleção manual conservada após sugestão/reload e uma proposta/cobrança. Carrossel e persistência de fila também possuem execução aprovada; os quatro cenários UI restantes são financeiro, duas jornadas da caixa e camadas prontas.

Financeiro inicialmente atravessou os filtros e parou na asserção ambígua de Ilimitado em sidebar/main;8ef47541 restringiu ao main, integrado em45b16cbc. Porém o reteste falhou antes dos filtros com Maximum update depth, sem Fast Refresh ou mensagens ausentes. A análise de D identificou o gráfico Recharts carregado dinamicamente suspendendo toda a aba; a tentativa anterior navegou antes de completar o chunk, portanto não provou o gráfico. Correção mínima autorizada: Suspense apenas em volta do gráfico, com teste de carregamento adiado, sem alterar Select/dependências. Reteste obrigatório.

A jornada firstVisit foi interrompida pelo coordenador após o texto desaparecer e o botão Começar permanecer desabilitado por244 tentativas; não esperou o limite900s. Trace preservado em box-billing-ui-results/first-studio-piece-integra-84ba1-ermanecem-no-mesmo-trabalho-serial-flows/trace.zip. Investigação de hidratação em andamento; nenhum resultado final de comentários/formatos reivindicado. O segundo caso da caixa não executou.

Durante seu fechamento, C iniciou npm run dev fora do ambiente de QA e depois encerrou Next por pkill amplo, atingindo o Next de QA entre execuções. Inngest15146 e worker71891 permaneceram vivos; coordenador restaurou somente Next com a configuração sintética, log next-c-integrated.log. Não houve E2E em andamento nesse encerramento. C recebeu proibição de operar servidores/browser/DB; toda validação de runtime permanece centralizada no coordenador.


## Fechamento técnico e revisão visual ainda aberta

Os agentes internos de financeiro e hooks atingiram o limite de uso; o coordenador assumiu somente as correções já delimitadas. O experimento de retry no worktree de fluxos continua fora da integração.

**Financeiro:** Suspense local não eliminou o ciclo quando as sete primitivas Recharts terminavam de carregar separadamente. A correção final6131cc2f importa as primitivas juntas dentro de CreditHistoryTab, que já é carregada dinamicamente pela página. Preserva a divisão do bundle e não altera Select. Teste existente com carregamento adiado: versão anterior falha, final passa7/7 (history-static-before-final.log e history-static-final.log). O primeiro experimento de comparação, sem o gate de carregamento, passou e não é usado como prova de regressão. A jornada financeira completa passou2.6s no build otimizado, stable-ui.log.

**Pedido inicial:** a0930ec8 impede que a hidratação inicial do perfil ou a entrevista desativada limpem o texto digitado. Troca explícita de perfil com entrevista ativa conserva o reset. Coordenador confirmou16/16 testes e lint. O teste de entrada52d7f7db aguarda o carregamento real dos perfis, preenche uma vez e aceita o rótulo de entrada correspondente à ocupação; não reescreve continuamente o campo para mascarar perdas.

**Interface:**31cd293a e395657e7 integrados atéc5e04e6b. Coordenador confirmou79 testes de Dashboard/Workspace; a matriz de referências cobre estados de ambas as fontes e retry no id correto. Retificação: o achado de duplicação de anexo SEM fontes foi falso positivo do revisor, pois o ternário externo de CreativeComposer já ocultava o strip. Nenhuma nova correção é necessária para esse caso. Fila sem imagem agora não monta canvas nem dispara download inválido.

**Runtime estável:** next build --webpack compilou, passou TypeScript e concluiu. Next start usa o suporte já existente do provedor controlado a build otimizado em loopback com E2E_DISABLE_RATE_LIMIT. Postgres5434, Inngest8288 e worker continuam sintéticos; nenhum provedor pago foi chamado. Build em next-stable-build.log. Não editar fontes durante E2E; alterações posteriores exigem novo build.

A rodada stable-ui passou fila persistida1.8s e financeiro2.6s. A inspeção dos screenshots da jornada da caixa encontrou defeitos visuais reais antes de declarar aprovação: popover de formatos fechado aparece no canto superior esquerdo (classe flex sobrescreve display:none nativo); caixa/imagem excedem o espaço previsto no viewport1045x586. Evidências em stable-ui-results e inspect-current.png. Devolvidos a C, único autor dessa interface; coordenador continua responsável pelo navegador. Jornada completa de comentários/formatos, QA preview e camadas ainda pendentes. Não confundir PNG sintético preto com avaliação de qualidade visual gerativa.


## Correções após inspeção dos prints

8a27c79d/ce28cd81 corrigem display do popover nativo fechado, limitam a altura da caixa e deixam WorkMosaic fora da superfície com workspace. Coordenador confirmou60/60 testes e novo build completo. O trace anterior provou o menu fechado interceptando o clique após selecionar9:16; a jornada foi interrompida em7.4min, sem aprovação. Antes do bloqueio passaram salvar/recarregar/editar comentário, coordenadas20%/75% e exclusão.

A rodada visual-final passou **QA preview3.7s e camadas1.7s**. O teste QA inicialmente exigia um botão desabilitado, mas CreativeResultCard conserva a política existente de ocultar a escolha proibida; o teste agora exige alerta objetivo, nenhuma ação Escolher e isSelected=false, além da prova API409 já registrada. As camadas agora usam no navegador os próprios bytes PNG do storage local, traduzindo apenas imageUrl com esquema e2e-storage na resposta do teste; todas as imagens precisam completar com naturalWidth>0. Nenhuma resposta de contrato ou comportamento de publicação é simulada. No reteste, a fixture já tinha filhos: após reload o app escolhe o mais recente. O teste agora volta explicitamente à versão1 antes de publicar, conservando a origem pretendida.

A mesma rodada isolou a falha de entrada antes de digitar: focus() seguido de toBeFocused perdeu o foco quando useCanonicalWorks terminou e occupancy mudou empty→work. Essa transição remonta a TalkBox. A correção anterior da entrevista permanece necessária, mas não cobre essa remonta. c7e87f34 desabilita somente o campo durante o carregamento inicial sem trabalhos; refetch com dados e erro inicial não bloqueiam. O E2E novo segura a resposta da lista: falhou na versão anterior por campo habilitado, em entry-gate-before.log. A versão nova ainda aguarda build/execução; não atribuir a correção a retyping ou pausa arbitrária.

Inspeção1045x586 encontrou o dock escondendo o pedido de revisão após a redução para min-height420. C recebeu ajuste para manter o limite de altura sem o antigo height:auto, recuperando espaço para arte e pedido. Este refinamento final ainda está em andamento; não declarar aprovação visual humana.


## Jornadas aprovadas; último ajuste mobile

Após c7e87f34/e02db608, o novo build passou integralmente. O coordenador repetiu55 testes de Dashboard e lint dos arquivos alterados. A rodada final-ui aprovou fila1.5s, entrada atrasada1.3s, QA preview3.7s e camadas1.7s. A primeira asserção do dock era excessiva no estado plano (112px de rolagem em detalhes permitidos); foi restringida ao pedido normal, preservando a exigência de altura/controle básicos. A jornada completa passou **1/1 em11s** em journey-final.log: quatro outputs, comentários persistidos/editados/removidos, coordenadas20%/75%, refinamento, variação, adaptação1080x1920, formato e original com hash inalterado, quatro despachos explícitos e zero seleção automática. Não é uma única execução18/18: os nove casos API e nove UI têm provas por lotes.

A inspeção humana dos prints ainda encontrou o botão Revisar parcialmente cortado em390px. Medidas: caixa326px/scroll354px, dock326/368, linha de ações298/354; miniatura44px dentro de coluna comprimida38px. C recebeu limites de largura para as linhas flexíveis e flex:none na coluna de versões. eea642e6 corrige a linha de ações; ajustes da área de comentários em andamento. Asserções horizontais foram acrescentadas ao E2E existente; precisam passar no novo build antes do fechamento visual local.

O encerramento do Next2622 foi inicialmente rejeitado pela revisão automática porque os logs de despacho usam executorAppId do worker. ps/lsof comprovaram2622=next-server(v16.2.6), único listener127.0.0.1:3000 e cwd desta integração; worker71891 era separado. A mesma ação foi então aprovada com essa evidência. Não houve bloqueio remanescente nem encerramento do worker.


## Verificação final de largura e camadas

3e490c2d/eea642e6 eliminaram o overflow horizontal observado em390px. A rodada `mobile-final.log` passou4/4 em18.2s: entrada com lista adiada, jornada completa da caixa, QA preview e camadas prontas. Coordenador confirmou33 testes de Canvas/Workspace e lint; build otimizado completo passou.

A inspeção dos prints encontrou uma falha adicional de geometria: Canvas de camadas e imagem Base tinham10px de altura no celular. C corrigiu somente a apresentação inline em9285afc9/5bcedb6b: altura integral, área mínima200px no grid e painel inativo oculto no modo inspect. Dialog, modo edit e status de regeneração existente mantêm o painel. Integrados em1a82a719. Coordenador confirmou **17/17 testes do editor**, lint sem erros, build completo com TypeScript e `graphify update .` (AST, sem chamadas pagas).

O E2E final `layer-final.log` passou **1/1 em2.6s** (3.2s total): abre/reabre, imagens carregadas, canvas>=150px e Base>=80px em390/1045/1440, inspeção mobile sem mutações/cobrança e publicação de exatamente um filho no mesmo trabalho. A fixture pronta vem de PNGs locais; o teste não executa Layerize real. Prints finais inspecionados pelo coordenador: colapso de altura resolvido; barra de zoom ainda sobrepõe parte da arte. Isso é ressalva visual explícita para revisão humana, não motivo para alegar aprovação final de design.

Logs finais em `/tmp/estudio-integrado-e2e/`: `mobile-final.log`, `layer-final.log`, `layer-final-unit.log`, `layer-final-lint.log`, `layer-final-build.log`, `layer-final-graphify.log`. A rodada final de camadas ocorreu com fonte congelada após o build; nenhuma outra jornada foi repetida sem necessidade.
