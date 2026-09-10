# Agente A — Motor, qualidade e formato

Data: 2026-09-10. Implementação de A concluída para revisão local. **Integração/publicação bloqueada pela corrida entre retry e estorno pendente atribuída a B**, descrita abaixo. Este relatório substitui o estado das entregas parciais anteriores.

## Base e commits

- Worktree: `/Users/jhonatan/Repos/ADScale_2/.worktrees/estudio-motor`.
- Branch: `codex/estudio-motor`.
- BASE_COMUM: `3063ff4a8c8bad1091d2876a070314e7653c922a`, pai `ac38a30e4611ee62d534b34a2b80579dbfe893d3`.
- `931f6578`: política pura, qualidade interna no executor, protocolo de revisão e helpers de formato.
- `9b635b9a`: direção de arte, prompt integrado, contexto de QA e regressão de fidelidade.
- `ff6aa457`: congelamento de renderPolicy nas novas preparações single.
- `13843113`: pai como autoridade original na adaptação e projeção explícita da marca no QA.
- `49bc0c82`: ligação interna de high/prompt/brief/fallback e evidência de replay no job.
- `ccd91817bf348ce8c86b63744f7f016e14ea24b4`: limite de tentativas, formato real, QA sem autocorreção, preview preservada, recuperação de estorno e formato automático por geometria.
- Adendos do coordenador: `1bbe1093` via `bdaaf225`; `52cb1485` via `3e44feaf` (ownership adicional de reference-plan).
- Helper D aprovado `a822f2f3` recebido via `5298d7c1`; contratos B aprovados `61720be860234617dda998a9fb0476bac1c42698` recebidos por merge fixo; recuperação terminal/financeiro aprovados `f42aeb87650c623c3c8c55e63f6c1606f2c145cb` recebidos via `ad073673`.

A não editou arquivos de B/D nem mergeou a própria branch na integração. Os commits recebidos por merge têm ownership e validação separados; sua presença não significa que A executou seus testes de banco ou E2E.

## Comportamento entregue

- Novos snapshots single congelam integrated_v1 e quality_recovery_v1. Histórico sem marker mantém o caminho anterior. Reuso de preparação compara o marker; mudanças invalidam o snapshot antigo.
- O job envia qualidade high e budget de uma chamada ao executor, sem mudar modelo, preço ou defaults globais. Não aplica tipografia determinística em integrated; mantém composição dos assets exatos e sua exclusão dos pixels gerados.
- Direção de arte em step próprio: uma chamada textual, timeout de 30 segundos, sem retry; até 120 palavras e 1600 caracteres somente no brief. Copy, fatos e referências permanecem completos. O contexto é projetado, sem snapshots/storage keys. Provider controlado não acessa o SDK. Indisponibilidade/resposta inválida usa fallback generativo explícito.
- Prompt integrado reutiliza contrato de copy, fatos, marca, referências e regras por modo. Marca/revisão chegam ao QA sem tratar aproximação tipográfica como prova exata.
- Claim atômico recebe teto 1 inicialmente e 2 apenas quando manualRetryAttempt está reservado. Nenhuma terceira chamada, autocorreção QA ou requeue técnico automático em integrated.
- Arquivo inutilizável falha e é removido. QA fail com imagem utilizável conclui com preview, mantém verdict fail e continua não selecionável. QA indisponível conclui inconclusive, exigindo confirmação pela política existente, sem estorno/correção automática.
- Completion vencedor registra o marker objetivo no mesmo CAS da imagem/qualidade. Só depois preserva a chave e tenta o helper compensatório real. Perder o CAS não estorna; a imagem órfã é removida.
- O helper privado do job recupera pendências por completion, evento duplicado e onFailure, fora de steps que poderiam cachear um resultado false. O marker só é removido após liquidação confirmada. Refund confirmado com falha no clear continua confirmado e recuperável. Reativação já compensada não gera outro crédito.
- Falhas técnicas integrated publicam generation_failed_terminal_refund_pending no CAS failed vencedor antes do estorno; após confirmação usam generation_failed. Losing CAS não estorna. GET de B recebeu o mesmo mapeamento de chave terminal. O gate de retry ainda requer a correção concorrente de B abaixo.
- Contador, providerInvoked e evidência de renderização cruzam o step de geração como JSON. Replay recupera tentativa 2 sem repetir claim/provider/brief. Payloads históricos sem campos novos permanecem aceitos. onFailure com CAS cacheado não troca a chave de refund após o marker já ter sido limpo.
- Revisão usa revisionContext.action, formato da filha e pai como primeira referência obrigatória. Adaptação 9:16 não exige upload adicional nem altera pai/formato do trabalho. Adaptação autônoma continua exigindo original.
- Formato automático usa geometria da única fonte de conteúdo antes de palavras genéricas; 1080×1350 resulta em 4:5. Alvo numérico explícito e escolha manual prevalecem. Múltiplas fontes/geometria inválida usam fallback; referências temporárias de estilo de single não redimensionam a peça.

## Arquivos de aplicação de A

```text
app/src/server/creative-work/contracts.ts
app/src/server/creative-work/render-policy.ts e render-policy.test.ts
app/src/server/creative-work/art-direction.ts e art-direction.test.ts
app/src/server/creative-work/prepare.ts e prepare.test.ts
app/src/server/creative-work/prompt.ts e prompt.test.ts
app/src/server/creative-work/protocol.ts e protocol.test.ts
app/src/server/creative-work/reference-plan.ts e reference-plan.test.ts
app/src/server/creative-work/brand-fidelity.test.ts
app/src/server/application/prepare-creative-work.ts e prepare-creative-work.test.ts
app/src/server/generation/pipeline/execute.ts e execute.test.ts
app/src/server/ai/creative-qa.ts e creative-qa.test.ts
app/src/server/jobs/creative-work.ts e creative-work.test.ts
```

brand-fidelity.ts já satisfazia o contrato e foi preservado; apenas a regressão foi acrescentada. Nenhuma dependência, configuração de produção, schema, migration, rota ou arquivo de UI foi editado por A.

## Verificação local

Executados em app/, com dependências instaladas pelo symlink preparado pelo coordenador e mocks existentes. Nenhum .env foi copiado, banco acessado, provider pago chamado, migration ou seed executado por A.

```bash
npm test -- src/server/creative-work/render-policy.test.ts src/server/creative-work/art-direction.test.ts src/server/creative-work/contracts.test.ts src/server/creative-work/prompt.test.ts src/server/creative-work/protocol.test.ts src/server/creative-work/prepare.test.ts src/server/creative-work/brand-fidelity.test.ts src/server/application/prepare-creative-work.test.ts src/server/generation/pipeline/execute.test.ts src/server/jobs/creative-work.test.ts src/server/ai/creative-qa.test.ts src/server/creative-work/reference-plan.test.ts src/server/application/refund-creative-work-output.test.ts
npm run typecheck
npx eslint src/server/jobs/creative-work.ts src/server/jobs/creative-work.test.ts src/server/application/prepare-creative-work.ts src/server/application/prepare-creative-work.test.ts
```

**Resultado final: 13 arquivos / 409 testes passaram**, incluindo 130 do job e 54 da preparação. Typecheck passou; ESLint final dos quatro arquivos alterados passou. Os demais arquivos de A tiveram lint aprovado nas entregas anteriores e não mudaram depois. DEP0205 e diagnóstico Fontconfig apareceram nos testes, sem falhas.

Na raiz: git diff --check passou. graphify query usado na descoberta e graphify update . executado após alterações, em modo AST sem chamadas de API; resultado final 28648 nós / 54021 relações, arquivos de grafo ignorados pelo Git.

Logs: `/tmp/estudio-motor-complete-tests.log`, `/tmp/estudio-motor-complete-graphify.log`, `/tmp/estudio-motor-b1-typecheck.log`, `/tmp/estudio-motor-b1-lint.log`. O último comando combinado typecheck/ESLint também concluiu com código 0 no terminal desta sessão.

Ciclos vermelho → verde registrados para política, high, prompt/brief/fallback, QA, snapshot, parent reference, geometria, QA-fail/limites, marker técnico e replay de onFailure. Revisões independentes encontraram e levaram à correção do contrato explícito de copy e compatibilidade com cache histórico. Revisão final de A: nenhum bloqueador adicional ao P1 de B abaixo.

## Pendência externa e limites

Revisão posterior do coordenador identificou userId ausente no catch técnico e nas recuperações novas de onFailure. Corrigido passando createdByUserId do trabalho carregado pelo repositório, inclusive após replay; nenhum ator vem do evento externo. Os testes de catch técnico, worker interrompido e recuperação de marker exigem o ator no settlement. Ciclo vermelho (2 falhas) → verde (130 testes do job); logs `/tmp/estudio-motor-refund-actor-red.log` e `/tmp/estudio-motor-refund-actor-green.log`. Nenhum arquivo financeiro de D foi alterado.

**P1 — retry durante estorno técnico pendente (B):** o novo CAS failed torna a linha visível antes da liquidação. Sem gate no serviço e no CAS de reserva/requeue, um retry humano pode começar com o débito anterior ainda ativo; a recuperação o estorna enquanto a nova tentativa gera. O clear genérico também pode apagar o marker de uma tentativa posterior. Coordenador recebeu o interleaving e atribuiu a correção a B. Teste exigido: refund suspenso bloqueia retry sem reserva/débito/dispatch; depois de liquidação e limpeza para generation_failed, retry volta a ser elegível. A aguarda SHA fixo revisado para incorporar essa correção; nenhum stub ou alteração nos arquivos de B foi criado.

O coordenador autorizou fechar a parte A com essa dependência explícita. **Não publicar antes de resolver o P1 e concluir a integração/E2E.** Validação de banco, E2E controlado e validação visual pertencem ao coordenador/D. A não verificou produção, qualidade humana de imagens reais, comparação com ChatGPT ou aceite visual; mocks/provider controlado não comprovam esses resultados.
