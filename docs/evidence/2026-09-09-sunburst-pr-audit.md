# Auditoria de Sunburst — PRs #326 e #327

Data: 2026-09-09. Escopo: leitura dos PRs, código/chamadores e verificações locais sem API paga, alteração de implementação ou publicação.

## Parecer

A dependência #327 → rebase #326 é real e foi reproduzida. Entretanto, “as 14 tarefas terminaram” não descreve o estado integral dos planos: existe uma falha nova no observador e lacunas funcionais em I3 e I5, além da validação visual/corpus explicitamente pendentes. Não recomendo marcar #326 como pronto apenas depois do rebase.

- #326: `fbc78abe9789f31be02f133388d692b381f9b932`, draft, aberto. CI falhou na convergência; lint e typecheck passaram. Testes completos, build e E2E foram **skipped** nessa execução.
- #327: `c07462b15b7807f65aae1973162d2057efc70466`, draft, aberto. CI ainda em andamento na última consulta desta auditoria. Nenhuma conclusão verde presumida.
- Os dois worktrees locais correspondem aos heads consultados no GitHub. Worktree de implementação permaneceu sem alterações da auditoria.

## Achados

### A1 — P2: instrução de revisão não chega ao builder determinístico (I3 incompleta)

Local: `app/src/server/creative-work/prompt.ts:607`, com alteração do PR nas linhas 557–565. Chamador: `app/src/server/jobs/creative-work.ts:1093`. Condição: Peça única com fonte aprovada selecionada, ou única fonte elegível, que torna `typographyPlan.execution` determinístico.

`buildCreativeWorkPrompt` retorna `buildProviderOnlyPrompt` antes de executar o novo bloco `AUTHORIZED CHANGE`. Esse segundo builder não recebe/usa `revisionInstruction`. Reproduzi o pedido visual “Troque somente o fundo por formas triangulares azul-marinho”; a instrução não aparece no prompt entregue ao provedor. Não se trata de pedir ao gerador para desenhar copy: o caso é uma alteração do próprio fundo visual.

Teste adicional isolado: **1 failed / 39 skipped**, sem chamada OpenAI. Log: [reprodução](/Users/jhonatan/Repos/ADScale_2/out/sunburst-audit-20260909/deterministic-revision-repro.log).

Origem: comportamento herdado, não regressão criada pelo #326. A implementação nova não cobre esse fluxo de I3; o teste adicionado no PR cobre apenas o ramo generativo. Corrigir em alteração delimitada ou explicitar I3 como parcial antes de declarar o plano concluído. Aceite: pedido visual e invariantes chegam ao builder determinístico, preservando composição tipográfica externa e proibindo texto gerado nesse fundo.

### A2 — P2: falha do log inicial aborta geração antes da API

Local novo: `app/src/server/ai/image-call-observation.ts:39`.

O `logger.info` de `started` está fora de qualquer proteção. Os eventos de resposta e erro estão protegidos, mas uma exceção no primeiro log rejeita `observeImageCall` sem executar `call()`. Isso contradiz a garantia de telemetria sem interferência e afeta ambos os provedores. No worker de camadas, a reserva já ocorreu e o caminho de erro de provedor pode consumir a operação mesmo sem requisição remota.

Reprodução do módulo atual transpilado, com logger lançando erro e callback local contando invocações:

```json
{"result":"rejected","error":"logger unavailable","providerCalls":0}
```

Script: [observer-repro.cjs](/Users/jhonatan/Repos/ADScale_2/out/sunburst-audit-20260909/observer-repro.cjs). Correção esperada: isolar também o log inicial; teste deve comprovar uma chamada e retorno preservado quando o logger falha em `started`. Não criar retries para resolver falha de observabilidade.

### A3 — lacuna funcional já conhecida: I5 precisa de código, não só avaliação visual

Local: `app/src/server/application/revise-carousel.ts:375`. A revisão visual cria um descendente e reutiliza `slide.anchorKey`; não invalida/reconstrói o painel e seus dependentes quando o slide revisado é âncora. A documentação do próprio PR reconhece o fato.

Origem: anterior ao PR. O estado correto de I5 é “revisão de âncora sem propagação implementada”, não apenas “qualidade ainda não comprovada”. Uma avaliação visual, sozinha, não implementará a atualização dos dependentes. Manter I5 explicitamente bloqueada até correção delimitada ou redução formal do escopo da entrega.

## O que foi confirmado

- Percentual declarado 0 em web e worker; modelo legado continua no Render; high/xhigh/max explicitamente suportados para Sunburst; nenhum Flare adicionado.
- O job usa a política congelada, inclusive quando o percentual é reduzido depois. Percentual 0 é decisão para trabalhos novos, não cancelamento dos que já têm Sunburst congelado.
- n=1 e maxRetries=0 nos provedores; alpha/limites e CAS de camadas preservados.
- Observações propagadas em candidates, merge de correção por callId e conclusão de camadas.
- Documento público de camadas continua com projeção separada; campos internos novos não foram incluídos no DTO público.
- O #327 altera somente manifesto, decisão e inventário: quatro arquivos de IA explicitamente enumerados; nove rotas adicionadas ao snapshot já existem em `origin/main`. Sem liberação por wildcard ou alteração do código do gate.
- Inventário do #327: `SURFACE-INVENTORY: ok`.
- Executando o anti-expansion do #326 com `--base c07462b15b7807f65aae1973162d2057efc70466`: `PRIMARY-DESTINATIONS: no expansion detected`. A dependência é comprovada sem merge/rebase real.

## Verificações

- Executei os 16 arquivos listados pelo autor e acrescentei `src/server/ai/image-generation.test.ts`, para conferir o intermediário entre executor e provedor: **17 arquivos / 396 testes passaram**. Os 16 declarados correspondem a 368; o arquivo adicional contém 28.
- Log: [focused-tests.log](/Users/jhonatan/Repos/ADScale_2/out/sunburst-audit-20260909/focused-tests.log).
- Testes com mocks, sem chamadas cobradas. Houve aviso Fontconfig, sem falha dos testes.
- Reproduções adicionais foram isoladas em `/tmp`; nenhum teste ou arquivo de produção foi alterado.
- `git diff --check` limpo e worktree #326 sem alterações ao final da inspeção.
- Lint/typecheck aceitos pela evidência do CI no head auditado; não os repeti sem motivo.
- A execução CI #326 passou lint/typecheck e 37 testes dos gates, falhou no anti-expansion e não chegou aos testes completos/build/E2E: [execução](https://github.com/jhowtkd/adscale/actions/runs/34343097090).

## Próximos passos corrigidos

1. Ajustar A2 no autor da implementação e cobrir a falha do log inicial.
2. Resolver A1 ou registrar I3 parcial com correção própria. Registrar I5 como dívida funcional de invalidação, não somente QA visual.
3. Concluir a revisão/CI do #327 e obter aprovação antes do merge. Sua exceção técnica é restrita e compatível com o escopo observado.
4. Após #327 na base, rebasear #326, executar o CI completo e revisar eventuais mudanças. Passar o gate inicial não garante o restante do CI.
5. Manter percentual 0. Corpus, comparação high/xhigh/max, revisão humana de decks e I6 visual continuam etapas não executadas; nenhum ganho visual ou custo real foi demonstrado.

Não consultei produção, faturamento nem histórico de chamadas da conta. Portanto, confirmo que **esta auditoria** não fez geração paga ou deploy; não certifico a ausência histórica dessas ações com base apenas no relato do executor.

## Rechecagem — 2026-09-09, 08:20 BRT

Head novo do #326 confirmado no GitHub e worktree: `27cfe6d51cc873880edbfebf8d70e6516e70add6`. Revisão incremental de três commits após `fbc78abe`:

- `63542350`: A2 corrigido; log started protegido, teste de logger falhando antes da API. A reprodução independente com logger sempre lançando erro agora retorna sucesso e exatamente uma chamada.
- `a054dd21`: A1 corrigido para o fluxo determinístico canônico; helper compartilhado de invariantes, modo/instrução encaminhados ao builder de fundo, direção visual baseada na revisão. Mantidos contrato sem texto e composição externa. A reprodução independente da auditoria agora passa.
- `27cfe6d5`: A3/I5 explicitamente documentado como dívida funcional, com teste que caracteriza a ausência de invalidação. Isso não implementa a invalidação; o bloqueio de ativação permanece.

Verificação própria: **55 testes passaram em 3 arquivos** (observador, prompt e revisão de carrossel), mais **1 reprodução independente de prompt passou** e callback do observador executado **uma vez** apesar do logger falhar. Diff revisado sem alterações fora dessas correções, testes e documentação. Logs: `out/sunburst-audit-20260909/recheck-tests.log` e `recheck-prompt.log`.

Parecer atualizado: A1 e A2 fechados tecnicamente; não encontrei novo bloqueador no diff dessas correções. I5 continua pendente e corretamente declarado. Qualidade visual high/xhigh/max e I6 visual continuam sem validação. Ambos os PRs permaneciam draft e com CI em andamento na consulta; #327 ainda não mergeado. A ordem #327 → rebase #326 → CI completo permanece necessária. Percentual 0 mantido, sem execução paga ou deploy nesta rechecagem.
