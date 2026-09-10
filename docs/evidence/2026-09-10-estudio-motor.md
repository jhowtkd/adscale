# Agente A — Motor, qualidade e formato

Data: 2026-09-10. **Entrega parcial local: integração do job pendente de B1 e R1 revisados.** Os testes verdes desta entrega não significam que a política integrada já percorre o job inteiro ou que o produto esteja pronto para publicação.

## Base e commits

- Worktree: `/Users/jhonatan/Repos/ADScale_2/.worktrees/estudio-motor`.
- Branch: `codex/estudio-motor`.
- BASE_COMUM: `3063ff4a8c8bad1091d2876a070314e7653c922a`, pai `ac38a30e4611ee62d534b34a2b80579dbfe893d3`.
- `931f6578`: política pura, qualidade interna no executor, protocolo de revisão e helpers de formato.
- `9b635b9a`: direção de arte, prompt integrado, contexto de QA e regressão da fidelidade.
- `ff6aa457`: congelamento de `renderPolicy` em novas preparações single.
- `13843113`: pai como autoridade original na adaptação e projeção explícita do brand kit para QA.
- Adendos documentais do coordenador recebidos por merge: `1bbe1093` via `bdaaf225`; `52cb1485` via `3e44feaf`. Nenhum documento de coordenação foi editado por A.
- Helper compensatório R1 de D aprovado em `a822f2f3`, recebido por merge `5298d7c1c4d768e9eeef946312d943d1ce42df73`. Arquivos de D preservados sem edição.

O coordenador revisou e integrou os dois primeiros commits na integração pelo merge `ba84e7ca4786708578281e1162119d5ef51a712c`. Também revisou `ff6aa457`/`13843113` sem achados, confirmando os 372 testes, typecheck e lint; sua integração aguarda o job completo. A não mergeou a própria branch na integração.

## Implementado

- `render-policy.ts` interpreta o marker congelado: integrated usa high, teto inicial 1 e nenhuma correção automática; ausência/valor desconhecido conserva a interpretação histórica.
- O executor canônico repassa `quality` opcional ao caminho de imagem, sem trocar defaults, modelo, rotas ou preço dos demais callers. Teste usa o mock de imagem existente e prova ausência de planner/selector sob execução direta.
- Preparação single congela `renderPolicy: integrated_v1` e `generationPolicyVersion: quality_recovery_v1`, sem `typographyPlan`. A igualdade de snapshots inclui o marker; segunda preparação idêntica reaproveita a copy, enquanto plano sem marker é invalidado. Outros protocolos conservam a decisão existente.
- Direção de arte: uma chamada de texto com timeout de 30 segundos e sem retry; limite de 120 palavras e 1600 caracteres só no brief. Resposta inválida/indisponibilidade devolve fallback explícito. Provider controlado não acessa o SDK. O contexto enviado é uma projeção de fatos, copy, marca e referências; não serializa snapshots/font assets/storage keys.
- Prompt integrado reutiliza helpers de contrato de copy, fatos, regras publicadas, assets, referências e política por modo. Mantém a proibição explícita de parafrasear/traduzir/omitir copy e a exclusão de assets exatos dos pixels gerados.
- QA recebe marca/revisão opcionais e projeta somente cores, fontes declaradas e elementos exigidos/proibidos. Não transforma aproximação tipográfica/paleta em prova exata nem acrescenta categoria subjetiva bloqueante.
- `brand-fidelity.ts` já satisfazia o caso sem tipografia determinística; não foi alterado. A nova regressão prova que assets exatos podem estar comprovados enquanto copy/font/safe_area continuam `not_applicable`.
- `formatFromDimensions` reconhece 1:1, 4:5 e 9:16 com tolerância de 1%, rejeita valores inválidos e proporções não suportadas. O helper de inferência aceita formato da fonte antes de palavras genéricas; um único alvo numérico explícito vence; duas proporções no pedido não escolhem alvo arbitrário.
- Protocolo mapeia `revisionAction: format` para `format_adaptation`. Com ownership adicional autorizado, o planner aceita o pai como primeira referência original obrigatória, sem exigir upload; a referência adicional fica opcional. Adaptação autônoma continua exigindo original.
- Integração interna parcial do job: snapshot integrated seleciona high e budget do executor de uma chamada, ignora tipografia determinística, executa direção de arte em step próprio, usa prompt integrado/fallback e envia marca/revisão ao QA. O step de geração devolve contador, providerInvoked e evidência serializável; completion persiste direção/renderPolicy/quality. Replay JSON recupera tentativa 2 sem repetir claim/provider/brief; payload histórico sem os campos novos usa fallback compatível.

## Arquivos de aplicação de A

```text
app/src/server/creative-work/contracts.ts
app/src/server/creative-work/render-policy.ts
app/src/server/creative-work/render-policy.test.ts
app/src/server/creative-work/art-direction.ts
app/src/server/creative-work/art-direction.test.ts
app/src/server/creative-work/prepare.ts
app/src/server/creative-work/prepare.test.ts
app/src/server/creative-work/prompt.ts
app/src/server/creative-work/prompt.test.ts
app/src/server/creative-work/protocol.ts
app/src/server/creative-work/protocol.test.ts
app/src/server/creative-work/reference-plan.ts
app/src/server/creative-work/reference-plan.test.ts
app/src/server/creative-work/brand-fidelity.test.ts
app/src/server/application/prepare-creative-work.ts
app/src/server/application/prepare-creative-work.test.ts
app/src/server/generation/pipeline/execute.ts
app/src/server/generation/pipeline/execute.test.ts
app/src/server/ai/creative-qa.ts
app/src/server/ai/creative-qa.test.ts
app/src/server/jobs/creative-work.ts
app/src/server/jobs/creative-work.test.ts
```

## Verificação

Executados em `app/`, usando dependências instaladas pelo symlink preparado pelo coordenador e mocks existentes. Nenhum `.env` foi copiado e nenhum banco, provider pago, migration ou seed foi acionado.

```bash
npm test -- src/server/creative-work/render-policy.test.ts src/server/creative-work/art-direction.test.ts src/server/creative-work/contracts.test.ts src/server/creative-work/prompt.test.ts src/server/creative-work/protocol.test.ts src/server/creative-work/prepare.test.ts src/server/creative-work/brand-fidelity.test.ts src/server/application/prepare-creative-work.test.ts src/server/generation/pipeline/execute.test.ts src/server/jobs/creative-work.test.ts src/server/ai/creative-qa.test.ts src/server/creative-work/reference-plan.test.ts
npm run typecheck
npx eslint src/server/creative-work/render-policy.ts src/server/creative-work/render-policy.test.ts src/server/creative-work/art-direction.ts src/server/creative-work/art-direction.test.ts src/server/creative-work/prepare.ts src/server/creative-work/prepare.test.ts src/server/creative-work/prompt.ts src/server/creative-work/prompt.test.ts src/server/creative-work/protocol.ts src/server/creative-work/protocol.test.ts src/server/creative-work/brand-fidelity.test.ts src/server/creative-work/contracts.ts src/server/creative-work/reference-plan.ts src/server/creative-work/reference-plan.test.ts src/server/application/prepare-creative-work.ts src/server/application/prepare-creative-work.test.ts src/server/generation/pipeline/execute.ts src/server/generation/pipeline/execute.test.ts src/server/ai/creative-qa.ts src/server/ai/creative-qa.test.ts
```

Resultados: **12 arquivos, 372 testes passaram**; typecheck passou; ESLint passou (executado em dois grupos cobrindo todos os arquivos tocados e repetido nos arquivos corrigidos). Os logs de teste incluem aviso DEP0205 e diagnóstico Fontconfig; nenhum caso falhou. Logs locais em `/tmp/estudio-motor-final-tests.log`, `/tmp/estudio-motor-a2-typecheck.log`, `/tmp/estudio-motor-a1-lint.log`, `/tmp/estudio-motor-a2-lint.log`.

Na raiz: `git diff --check` passou. `graphify query` foi usado na descoberta; `graphify update .` foi executado em modo AST, sem chamadas de API, com saída ignorada pelo Git.

Ciclo vermelho → verde observado para política/quality/formato/protocolo, brief/prompt, QA, snapshot e pai na adaptação. Revisão independente identificou a ausência da regra explícita de preservar copy no primeiro builder; correção reutilizou `buildFixedContract` e o teste passou após falhar. Segunda revisão dos sete arquivos de snapshot/referência/QA não encontrou achado acionável.

Após receber o helper D: `npm test -- src/server/application/refund-creative-work-output.test.ts src/server/jobs/creative-work.test.ts` passou com 109 testes. Após integrar o caminho interno do job: 108 testes do job passaram; typecheck e ESLint dos dois arquivos passaram. Os dois novos casos de prompt/high/fallback falharam antes da implementação e passaram depois. Revisão independente apontou compatibilidade com cache histórico; corrigida com fallback dos novos campos e regressão dedicada. Logs: `/tmp/estudio-motor-integrated-red.log`, `/tmp/estudio-motor-integrated-green.log`, `/tmp/estudio-motor-job-intermediate.log`, `/tmp/estudio-motor-job-typecheck.log`, `/tmp/estudio-motor-job-lint.log`. Graphify atualizado novamente em modo AST.

## Dependências para concluir A

1. **B1 corrigido e revisado, distribuído pelo coordenador por merge.** O candidato inicial `e38b530` não foi liberado por lacuna de validação/projeção JSON. O candidato posterior `3470fee9` ainda tinha dois P2 (contexto inválido no replay e lease após 402), segundo o coordenador. A não incorporou esses candidatos nem criou interfaces falsas. Depois do SHA aprovado, consumir `revisionContext`, `maxCalls` e dimensões reais do repositório.
2. **R1 de B.** Completion deve registrar `objective_quality_failed_refund_pending` no mesmo CAS que preserva preview válida/fail. O helper real `refundCreativeWorkOutputCompensatory` de D já foi recebido/testado, com tratamento de reactivation/already_refunded. A só compensa depois de vencer o CAS e deve recuperar replay/onFailure sem nova imagem. O marcador permanece enquanto a liquidação não estiver confirmada.
3. **Job parcialmente conectado.** Falta teto atômico inicial 1/retry humano até 2, ausência de autocorreção/requeue, formato/contexto real, tri-state e recuperação de preview/estorno. O replay de sucesso já está coberto; falta replay de erro com compensação e sem requeue, vinculado ao restante da política.
4. **Serviço de formato ainda sem dimensões.** O helper puro já está pronto; a projeção width/height de B1 será usada apenas para a única fonte de conteúdo, com manual prevalecendo e fonte de estilo incapaz de redimensionar single. Ainda falta esse teste de serviço.

O ajuste `reference-plan` foi pedido ao coordenador com símbolo/comportamento/teste e atribuído formalmente a A em `52cb1485`. A lacuna de refund também foi comunicada e originou R1 em `1bbe1093`; nenhum arquivo de B/D foi editado para contorná-la.

**Não publicar esta entrega parcial como motor completo.** O job já aplica high/prompt integrado, mas ainda mantém as rotas antigas de correção/requeue/compensação enquanto aguarda B. O aceite ponta a ponta continua pendente. Pai intacto/9:16 real/uma chamada por tentativa/refund confirmado ainda precisam da prova do job e E2E de D. Não houve produção, geração real, comparação com ChatGPT ou aceite visual; provider controlado não comprova qualidade humana.
