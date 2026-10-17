# Jev: decisão verificável e encerramento

A #473 consolida os contratos [de avaliação](jev-evaluation-pilot.md) e
[do observador](jev-observer-pilot.md). A decisão nunca ativa produto, envia
HTTP, executa smoke ou cria corpus. `enablesProductBehavior` é sempre `false`.

## Comandos e pacote privado v1

```sh
cd app
# Node 22, PostgreSQL descartável explícito; ferramentas controladas, sem Jev real.
TEST_DATABASE_URL=postgres://test:test@localhost:5433/adscale_test \
  npm run jev:decide -- collect-g0 --output-dir /private/new-g0
npm run jev:decide -- --evidence /private/new-g0/package.json --gate g0
npm run jev:decide -- --evidence /private/new-g0/package.json --gate g1
npm run jev:decide -- --evidence /private/new-g0/package.json --gate g2 --validate-only
```

O coletor exige árvore limpa, SHA atual e Node 22. Executa passo Jev completo,
regressões, testes e gates convergence, fronteira, fixture offline e harness da
#472, guardando saídas originais e hashes. Não aceita comandos fornecidos no
pacote. Diretório novo 0700, arquivos 0600; fora do Git. Não contém credencial.
O coletor herda somente PATH/HOME/locale/diretório temporário e os dois parâmetros
numéricos explícitos de carga; não repassa chaves, NODE_OPTIONS ou overrides Vitest.
Vitest escreve JSON em um descritor privado 0600 (`--outputFile=/proc/self/fd/3`);
stdout e stderr ficam separados. Uma linha de EXPLAIN do teste não vira JSON
nem é descartada para fazer o parser aceitar evidência contaminada.
A CLI de decisão lê arquivos privados e código local, criando/removendo somente
as travas transitórias da #471. Lock residual após crash exige confirmar ausência
de execução ativa antes de remover a trava; não apagar histórico. Não reexecuta
ferramentas. `--gate g0` passa com G0 controlada, embora a decisão geral continue
`hold`; G1/G2 hold/reject saem com código 1. `--validate-only` valida formato e
integridade, retorna `validationOnly:true`, decisão `hold` e nenhum gate liberado.
Arquivo fornecido ilegível ou malformado falha com código 1, inclusive
operational/freeze sem corpus. Arquivo opcional omitido mantém o formato válido,
mas não supre a evidência do gate. Incidente conhecido preserva `reject` mesmo
ao lado de campos/elementos inválidos ou outra evidência ausente.

Shape do pacote (objetos estritos; campos opcionais podem ser omitidos):

```json
{
  "version": 1,
  "codeSha": "SHA Git de 40 hex",
  "versions": {"profile":"single_shadow_v1","model":"jev-1.13.0","inputVersion":"semantic_input_v1","rubricVersion":"brief_copy_v1","rubricHash":"hash da rubrica"},
  "tools": [
    {"id":"jev_tests","codeSha":"SHA Git","command":["argumentos exatos de G0_COMMANDS"],"exitCode":0,"artifact":"jev_tests.json","sha256":"hash dos bytes"}
  ],
  "incidents": [],
  "evaluationRoot": "/private/evaluation",
  "exportApprovals": ["/private/export-approval.json"],
  "operational": "/private/operational.json",
  "freeze": "/private/freeze.json"
}
```

`tools` e `incidents` são obrigatórios (podem ser vazios). Cada incidente tem
`kind: workspace_leak|duplicate_send|business_mutation|raw_diagnostic`,
`reference` HTTPS e `observedAt` ISO. Qualquer incidente conserva `reject` mesmo
se outras evidências estiverem faltando. Flags como `g0Passed` não são prova e
campos desconhecidos invalidam o formato. Recibos registram execução local;
hashes comprovam integridade, não autenticidade humana contra um autor malicioso.
É preciso conferir as referências de aprovação antes de decidir humanamente.
Recibos não são reexecutados pela decisão; o `collect-g0` reproduz a origem
das saídas. A G0 confere as migrations auditadas e recusa migration posterior
que altere `semantic_review_*` sem atualizar a auditoria.

`evaluationRoot` é a raiz privada **inteira** da #471, sem excluir exportações ou
julgamentos antigos. O leitor confere complete/blind/manifest, histórico e cada
relatório guardado, recalcula `buildSemanticEvaluationReport`, conserva
manifestHash/judgmentHashes/planHash/blindHash e identidade da raiz. Confere
famílias, representantes e Trabalhos entre pacotes. Repetição de snapshots
operacionais idênticos de uma política conta uma vez; snapshots divergentes da
mesma política mantêm hold. Nunca soma seis perguntas como seis famílias.

O schema executável de `operational` e `freeze` está em
`app/scripts/jev-decision-evidence.ts`. Operação registra responsáveis designados,
aprovações verificáveis de dados/fornecedor/gasto/retenção/segurança/limites/tone,
escopo e validade, smoke autorizado, runtime e auditoria de integridade. Ausência
de qualquer registro mantém hold. O comando valida coerência, não cria registros
nem afirma ter testemunhado seu conteúdo. As categorias normal/difícil são listas
disjuntas de IDs `workspaceId:sourceFamilyId`, conferidas contra famílias primárias
com referência clara resolvida pelo código da #471; linguagem/categoria continuam
sujeitas à verificação humana da referência de auditoria.

Dados/fornecedor/gasto exigem cobertura temporal dos smoke/envios e autorização
de no máximo 14 dias. Não precisam estar vigentes hoje para analisar evidência
histórica. Retenção/segurança/limites/tone são decisões versionadas e não herdam
esse teto; um expiresAt explícito continua sendo respeitado na cobertura.
Todas referenciam perfil, projeção, rubrica e modelo cobertos. #777,
se aprovada, exige projeção `semantic_input_v2` e novas revisões compatíveis.
Decisão retrospectiva não autoriza envio novo; nova ativação exige autorização
própria vigente. Consentimento de conservação/acesso ao corpus segue revisão
própria enquanto qualquer cópia existir.

Freeze liga os planos a `criteriaHash = semanticDigest({criteria: G2_CRITERIA,
codeSha: freeze.codeSha, versions: freeze.versions})`. Esse SHA precisa ser
ancestral de HEAD, sem alteração posterior dos sete módulos de
métricas/avaliação/rubrica/critério auditados pelo comando. Guarda
`historyReference` e `previousHoldout` (null na primeira avaliação; senão raiz,
hashes de versões/critérios e famílias anteriores). Esse histórico precisa de conferência humana;
o comando não descobre raízes antigas omitidas. Modelo/rubrica diferentes exigem
raiz e famílias de holdout novas. Sobreposição com holdout anterior é proibida
se versões ou criteriaHash mudarem. Com ambos idênticos, é continuação da mesma
avaliação: a saída informa continuation/sharedFamilies e independentEvaluation=false,
sem contar a continuação como evidência independente. Calibração pode preceder o freeze; critérios
congelam depois dela e antes de selecionar/abrir/ver resultados do holdout.
Julgamentos que incluam qualquer caso de holdout precisam ser posteriores à
abertura, inclusive em exportações que também tenham casos de calibração.

Para snapshots operacionais coerentes, encerrar/revogar coleta, deixar envios em
voo terminar e recuperar leases desconhecidos antes de produzir as exportações
da decisão. Não limpar observações/ledger até fechar os pacotes. Exportações da
mesma política devem registrar o mesmo snapshot completo; divergência mantém
hold. O comando não tenta mesclar snapshots sem identidade operacional individual.

## Gates

| Gate | Regra |
| --- | --- |
| G0 | Testes sem skips e com contagens coerentes, cobertura dos arquivos obrigatórios, fronteira e convergence aprovados, migrations 0159/0160/0161 aditivas intactas, flags off testadas e fixture recalculada. Carga inconclusiva pode passar como limitação explícita. Não demonstra qualidade do modelo. |
| G1 | G0; responsáveis e autorizações verificáveis, retenção/segurança/limites/tone revisados, perfil fixo, smoke real autorizado, runtime auditado, 50 famílias humanas claras PT-BR, casos normais/difíceis e carga conclusiva em ambiente comparável. |
| G2 | G1; 300 famílias independentes (100 calibração, 200 holdout), referência humana independente, critérios congelados, corpus sem mistura e mesmas versões. Métricas do holdout: falso alerta n≥100, precisão n≥30, incremental n≥30; limites #465 e Wilson 95%. Respostas válidas usam processing completo; reconstituição usa todos os representantes selecionados. |

Evidência sintética somente testa instrumentação. Amostra/intervalo insuficiente,
split inválido, origem/ambiente/versões misturados ou evidência incompleta mantêm
hold. Incidentes de integridade rejeitam. Generalização só às marcas do holdout;
nunca inferir economia causal, conversão, prontidão ou autorização de bloqueios.

## Runbook operacional futuro

| Responsabilidade | Designação a registrar pelo dono |
| --- | --- |
| Produto | A designar; decide continuar, ajustar ou abandonar, ratifica critérios/limites e #777 (`tone`) |
| Operação | A designar; staging, deploy off, runtime, monitoramento, revogação e limpeza |
| Segurança | A designar; consentimento, fornecedor, retenção, acesso e eliminação do corpus |

G1 fica hold enquanto essas designações não estiverem em registro verificável.

1. **Autorizar:** dono registra responsáveis, workspace/marca, finalidade,
   fornecedor, gasto, vigência, acesso/eliminação do corpus e revisão de segurança.
   Confirmar contrato/disponibilidade de `jev-1.13.0` e retenção do fornecedor.
   Resolver #777 antes de G1. Limites de 14 dias, 100 tentativas/dia/workspace,
   10%, 5s HTTP, 20s varredura, 3 chamadas e demais tetos da #465 são **a ratificar
   antes da ativação**. Credencial e merge não equivalem a consentimento.
2. **Staging e implantação off:** obter aprovação humana própria para migrations
   e deploy. Merge na `main` aplica migrations em produção: `render.yaml` executa
   `db:migrate` no start. Conferir 0159–0161, locks e plano de reversão por flags.
   Deploy com `JEV_OBSERVER_ENABLED` ausente/false, políticas disabled e nenhuma
   chamada. Registrar SHA, ambiente e job único. Cron permanece registrado (288
   horários/dia); conferir guard e regressão da preparação existente.
3. **Smoke autorizado separado:** autorização específica de dados/fornecedor/gasto,
   teto de chamadas, modelo/perfil/rubrica fixos; operador executa e guarda recibo
   real sem texto/credencial. Confirmar modelo retornado, runtime, assinatura e
   ausência de `INNGEST_DEV` em produção. A CLI de decisão não executa esse passo.
4. **G1:** reunir 50 famílias PT-BR normais/difíceis, dois revisores cegos distintos,
   adjudicação e carga conclusiva (`JEV_LOAD_SAMPLE` ≥100, ≥200 por condição)
   em ambiente comparável. Registrar essa comparabilidade e limitações. Rodar
   gate; responsável verifica referências e autoriza staging/uma marca delimitada.
5. **Coorte real:** congelar critérios, perfil/modelo/rubrica e planos antes de
   abrir holdout. Nova rubrica/modelo exige holdout novo. Usar somente política
   explícita, projeção congelada e exportação cega da #471. Preservar raiz inteira
   e julgamentos; não publicar corpus no Git/PR/diagnóstico.
6. **Monitorar:** contagens do ledger, cobertura, erros/desconhecidos, cota, latência
   HTTP/fila, uso conhecido/ausente, pool e efeitos da preparação. Ler desfechos
   por fase do Inngest: raiz completed não certifica resposta do fornecedor.
   Incidente de vazamento/duplicação/mutação/conteúdo bruto implica reject e corte.
7. **Revogar:** desligar flag em todos executores e revogar política canônica;
   guardar UTC de corte e marcadores/cota, confirmar zero novos sendStartedAt.
   Chamadas em voo não podem ser retiradas. Recuperar lease vencido (60s) com
   marcador como `outcome_unknown`, sem retry/estorno presumido. Seguir consultas
   e APIs do [runbook de retenção](jev-retention-pilot.md).
8. **Retenção:** expirar pendências, preservar relatórios/exportações, fazer prévia
   e aplicar limpeza manual com workspace explícito e lotes ≤100. Observações,
   cota e ledger seguem #470/#471; 30 dias são piso de idade, e janela ativa
   bloqueia limpeza mesmo com política disabled. Não apagar dedupe para reenviar.
   Limpeza de banco não elimina corpus privado, backups, cópias dos revisores ou
   journal global; segurança registra eliminação de cada cópia segundo consentimento.
9. **Decisão humana:** guardar pacote e hashes, executar G2, verificar limitações,
   marcas do holdout e aprovações, registrar continuar/ajustar/abandonar e motivos.
   `eligible_for_human_review` só habilita essa discussão. Sugestões, UI, bloqueios
   e qualquer promoção exigem outra decisão e implementação próprias.
