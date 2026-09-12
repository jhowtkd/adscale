# Runbook: gate de release web + worker + schema (PR-04)

Gate manual/por release que prova, **no mesmo SHA candidato**, que web, worker e
schema sobem juntos e que o Trabalho sobrevive a reentrega, reinício do worker
e falha parcial de lote. Criado na Task 14; deve estar disponível **antes** da
ativação da Task 17. **Não substitui o CI de PR.**

## Status honesto deste gate (ler antes de confiar nele)

A branch `main` está **deliberadamente desprotegida**: não há required check,
não há bloqueio de merge por status, e este gate não é avaliado pela
plataforma em nenhum SHA. Consequência direta: **este gate depende de
disciplina, não de mecanismo**. Rodar o smoke, ler o relatório e segurar o
release quando o veredito for `blocked`/`failed` é um ato humano em cada
release — não existe trava técnica que impeça um merge ou deploy sem ele.

Este runbook **nunca** descreve o procedimento manual como bloqueio técnico
equivalente: sem required check, "rodar antes de liberar" é convenção, e
convenção falha silenciosamente sob pressa. Se a proteção de branch for
habilitada no futuro, este runbook deve ser atualizado para dizer qual check é
exigido e em qual SHA ele é avaliado; até lá, vale o parágrafo acima.

## Quando rodar

- Obrigatório (por disciplina, ver acima): antes de ativar a Task 17 e antes
  de **cada release que toque preparação, seleção, settlement, ledger ou o
  worker de imagem**.
- Recomendado: antes de qualquer release, mesmo sem toque nessas áreas, quando
  o SHA candidato estiver há mais de alguns dias do último gate verde.

## Regra dura

**CI verde de outro SHA não é aceito.** O gate só aprova o SHA que ele mesmo
executou: o relatório carrega o SHA, e a leitura do relatório começa
conferindo que o SHA do relatório é o SHA candidato. Evidência de outro SHA —
CI, smoke anterior, "não mudou nada relevante" — é contexto, não aprovação.
O gate produz **evidência positiva ou bloqueio explícito**; não existe
terceiro estado ("provavelmente ok").

## Pré-requisitos (ação do dono, uma vez por ambiente de staging)

1. **Staging isolado sob demanda.** Banco Postgres 16 próprio, bucket R2 de
   staging, app Inngest de staging. Nada de staging aponta para produção:
   sem webhooks de produção, sem e-mails reais, sem workers de produção
   consumindo as filas do exercício. O ambiente é criado para o gate e
   encerrado ao fim da validação.
2. **Credenciais de staging nos secrets do workflow** (nomes exatos usados por
   `.github/workflows/reliability-release-smoke.yml`):
   `STAGING_DATABASE_URL`, `STAGING_WEB_URL` (base do deploy de staging),
   `STAGING_INNGEST_EVENT_KEY`, `SMOKE_AUTH_COOKIE` (sessão de um usuário de
   staging com acesso ao workspace de fumaça), `SMOKE_CLIENT_PROFILE_ID`
   (perfil de cliente **sintético**, criado só para o smoke),
   `SMOKE_WORKER_SIGNAL_CMD` (comando que imprime o sinal próprio do worker,
   ver abaixo), `SMOKE_WORKER_RESTART_HOOK` (comando que reinicia o worker de
   staging mid-run, ver prova 3). Nenhum desses valores entra no relatório.
3. **Sinal próprio do worker.** A web expõe `GET /api/health`; o worker
   (Inngest Connect, sem HTTP) expõe o próprio sinal: a linha
   `image_worker_connected` nos logs do serviço `adscale-image-worker` e as
   oito funções v2 sincronizadas no app Inngest
   (`generate-creative-work-output-v2`, `generate-creative-work-carousel-slide-v2`,
   `generate-derivation-v2`, `analyze-creative-work-source-v2`,
   `analyze-workspace-asset-v2`, `analyze-brand-training-asset-v2`,
   `layerize-creative-work-output-v2`, `regenerate-creative-work-layer-v2` —
   fonte: `buildImageWorkerConnectOptions` em
   `app/src/server/jobs/image-worker.ts`).
   `SMOKE_WORKER_SIGNAL_CMD` deve imprimir um JSON com
   `{ connectionId, observedAt, service, syncedV2FunctionIds }`; o script
   rejeita sinal velho (fora da janela do run), de outro serviço, ou com menos
   de 8 funções. **`/api/health` da web sozinho nunca comprova worker pronto**
   — o script bloqueia sem o sinal do worker, sem exceção.
4. **Provedor.** Por padrão o staging roda com **provedor controlado** (stub
   determinístico, sem custo, sem dado real). Um smoke pequeno com o provedor
   real, para validar a integração, exige **autorização explícita do dono em
   cada execução** (`owner_authorized: true` no dispatch) **e** teto de
   chamadas (`REAL_PROVIDER_MAX_CALLS`, padrão 5); o script aborta antes de
   exceder o teto. Modelo real nunca entra no CI de PR.
5. **Fixtures.** Apenas dados sintéticos criados pelo próprio script
   (`request` marcado como fumaça, perfil sintético). **Nunca usar dados
   privados de clientes como fixture.** Prompts, chaves, conteúdo de cliente
   e URLs assinadas nunca entram em log, relatório ou fixture.

## Como rodar

Via workflow (recomendado — cria o ambiente, migra, sobe web+worker no mesmo
SHA, coleta o sinal, roda o script, arquiva o relatório e desmonta tudo):

```bash
gh workflow run reliability-release-smoke.yml \
  -f sha=<SHA_CANDIDATO> -f provider=controlled
gh run watch
```

Para o smoke pequeno de provedor real (somente com autorização explícita do
dono e teto consciente):

```bash
gh workflow run reliability-release-smoke.yml \
  -f sha=<SHA_CANDIDATO> -f provider=real \
  -f owner_authorized=true -f real_provider_max_calls=5
```

O workflow também dispara em `release` (publicação). Ele **nunca** roda em
`pull_request`, e não cria previews permanentes: `render.yaml` mantém
`previews: { generation: manual }`.

Manual (somente para depurar o script; o veredito oficial sai do workflow):

```bash
cd app
npx tsx scripts/reliability-release-smoke.ts \
  --sha "$(git rev-parse HEAD)" \
  --provider controlled \
  --web-url "$STAGING_WEB_URL" \
  --artifacts-dir ../artifacts/reliability-release
```

Variáveis lidas do ambiente: `STAGING_DATABASE_URL` (obrigatória),
`SMOKE_AUTH_COOKIE` (obrigatória), `SMOKE_CLIENT_PROFILE_ID` (obrigatória),
`SMOKE_WORKER_SIGNAL_CMD` ou `SMOKE_WORKER_SIGNAL_FILE` (obrigatória uma
delas), `SMOKE_WORKER_RESTART_HOOK` (obrigatória para a prova 3),
`REAL_PROVIDER_MAX_CALLS` (default 5). Sem o wiring de staging, o script
**bloqueia** — ele nunca aprova no vazio.

## As cinco provas (o que o script executa)

Web e worker rodam em **processos separados**, ambos no **mesmo SHA
candidato**, contra o staging isolado.

1. **Schema primeiro + readiness dos dois.** A migração (`npm run db:migrate`)
   é aplicada **antes** de liberar web/worker novos; o script registra a tag
   do journal esperada e confirma que ela está aplicada no banco de staging,
   que a web responde `/api/health` e que o worker emitiu seu próprio sinal
   (fresco, mesmo serviço, 8/8 funções v2). Falta de qualquer um = bloqueio.
2. **Correlação fim a fim.** Publicar → consumir → persistir → selecionar →
   baixar objeto válido, correlacionando a **mesma** operação em todas as
   etapas pelo `generationCorrelationId`: cria rascunho sintético
   (`POST /api/creative-work`), prepara (`POST /api/creative-work/[id]`
   `{action:"prepare"}`), gera (`POST .../generate` `{action:"initial"}`),
   aguarda `creative_work_outputs` com o correlation id, seleciona
   (`POST .../outputs/[outputId]/select`) e baixa (`GET .../download`,
   seguindo o 302 e conferindo bytes > 0 sem registrar a URL).
3. **Reentrega + reinício + ack ambíguo.** Reemite a mesma geração (a web
   re-dispatcha o evento v2 pelo caminho real), executa
   `SMOKE_WORKER_RESTART_HOOK` com trabalho em voo e cancela/retenta uma
   saída (`.../cancel`, `.../retry`) para simular o erro ambíguo. Depois
   exige: novo `connectionId` do worker observado (prova de que o reinício
   aconteceu mid-run), estado terminal coerente (uma saída `completed` e
   selecionada por operação, sem órfãs presas em intermediário) e
   **cobrança/reembolso não duplicados** (contagem em `usage_events` +
   `credit_transactions` por chave de idempotência antes/depois).
4. **Falha parcial de lote + reuso.** Cancela um item do lote no meio do voo
   e retenta; prova que o item já concluído foi **reusado** (mesma linha,
   sem nova chamada de provedor para ele) e que só o item pendente foi
   refeito.
5. **Relatório arquivado.** Escreve
   `artifacts/reliability-release/<sha>.json` com: veredito, SHA, ambiente,
   flags (provider, teto, autorização), prova a prova com evidência, IDs de
   eventos/correlação, versões dos processos (SHA de web e worker, tag do
   schema) e custo do exercício (chamadas de provedor, linhas de ledger).
   Sem segredos, sem prompts, sem URLs assinadas, sem conteúdo de cliente.

## Como ler o relatório

1. Confira `sha` = SHA candidato e `verdict`: `pass` libera (por disciplina);
   `fail` ou `blocked` segura o release. `blocked` significa "não consegui
   provar" (wiring incompleto, sinal velho, teto) — trata-se como vermelho,
   nunca como "ok com ressalva".
2. Confira `processes.web.sha === processes.worker.sha === sha` e
   `schema.expectedTag === schema.appliedTag`.
3. Confira as cinco provas em `proofs[]`: cada uma tem `status`, `summary` e
   `evidence` (IDs, contagens, timestamps). `providerCalls` mostra o consumo
   contra o teto.
4. Em `fail`, a primeira prova vermelha diz o que quebrou; os campos
   `expected`/`observed` dizem o valor esperado e o encontrado. Corrija,
   gere **novo SHA** e rode o gate de novo — não reaproveite o relatório.

## Como bloquear

Não existe botão: bloquear é **não liberar o release** enquanto o relatório
do SHA candidato não disser `pass`, e dizer isso explicitamente no canal de
release ("SHA X bloqueado: prova 3 falhou — duplicou `usage_events`").
Lembrete da seção de honestidade: sem required check, esse bloqueio é
disciplina humana. Se a pressão for liberar sem o gate, registre por escrito
quem assumiu o risco e por quê; não reescreva este runbook para chamar a
exceção de "bloqueio equivalente".

## Reversão

Parar novas tentativas, manter dados/ledger, drenar ou invalidar execuções em
voo e restaurar somente versão compatível de web+worker (mesmo SHA).
**Não executar rollback destrutivo do schema** para acompanhar rollback de
aplicação: as migrações deste plano são aditivas e versões antigas as
ignoram; apagar coluna/tabela destrói pendências reais.

## Custo e limpeza

O workflow encerra o ambiente de staging ao fim (`if: always()`), inclusive
em falha. Se o teardown falhar, o dono desliga manualmente os serviços de
staging e registra o resíduo no relatório do run antes de fechar o release.
