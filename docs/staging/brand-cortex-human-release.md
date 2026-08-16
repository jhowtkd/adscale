# Brand Cortex: aprovação humana da Peça única

Este gate separa regressão técnica de fidelidade visual. O replay controlado continua gratuito; somente Peças únicas geradas pelo provider real podem sustentar a aprovação humana.

## Pré-condições

- Brand Kit, assets, fontes e claims revisados por uma pessoa.
- Uma versão de Brand Knowledge publicada.
- `BRAND_CORTEX_SINGLE_PIECE_ENABLED=true` apenas no ambiente autorizado para o piloto.
- Orçamento e execução paga autorizados fora deste runbook.

## 1. Gerar o piloto

No app, gere duas Peças únicas atuais (`quality_recovery_v1`) por formato (`1:1`, `4:5` e `9:16`) com a mesma versão publicada. Outputs legados e o provider E2E controlado são recusados. Registre os seis pares `workItemId`/`outputId`.

## 2. Montar o pacote

O comando apenas lê outputs já concluídos e copia os artefatos do storage; ele não gera imagens nem cobra créditos.

```bash
cd app
npm run brand-cortex-pilot-package -- \
  --workspace WORKSPACE_ID \
  --pilot PILOT_ID \
  --user OPERATOR_USER_ID \
  --selections '[{"workItemId":"...","outputId":"..."}]' \
  --out ../.planning/validation/brand-cortex-pilot/PILOT_ID
```

Para um workspace com `unlimitedBillingBypass`, passe `--paid-generation false` (padrão). O manifesto registra `realProviderExecuted: true` e um `settlement` de bypass sem débito interno; saldo ou débito interno não prova reembolso. Use `--paid-generation true` somente quando o ledger bruto confirmar débito real e informe `--raw-ledger-evidence` com JSON contendo `provider`, `reference`, `capturedAt` e `sha256`; sem esse vínculo o builder recusa o pacote.

O diretório contém:

- `pilot.manifest.json`: versão da marca, prompts, request IDs selecionados e excluídos, settlement, custos, latências e hashes;
- `artifacts/`: seis peças e referências congeladas;
- `index.html`: revisão visual local;
- `review.template.json`: contrato da revisão preso ao hash do manifesto.

O builder recusa provider controlado ou fora de GPT Image 2, crédito zero, formato incorreto, proveniência incompleta, mistura de versões ou perfil e divergência entre o hash persistido e o arquivo no storage. A ordem e o hash normalizado das referências realmente enviadas também precisam coincidir.

## 3. Revisar

Abra `index.html`, avalie todos os critérios e baixe `brand-cortex-release-review.json`. Notas são obrigatórias para `fail` ou `needs_changes`.

Não edite o manifesto nem os artefatos depois da revisão: o gate relê cada peça e referência e invalida qualquer mudança de hash.

`reviewerId` identifica o revisor neste pacote local, mas não é uma assinatura autenticada. Para promoção operacional, anexe o JSON a um change/issue aprovado pelo owner; o gate nunca habilita a flag sozinho.

## 4. Executar o gate

```bash
cd app
npm run brand-cortex-readiness-gate -- \
  --pilot ../.planning/validation/brand-cortex-pilot/PILOT_ID/pilot.manifest.json \
  --review /caminho/brand-cortex-release-review.json
```

O resultado só será `approved` quando o replay estiver estável, o seam autenticado estiver verde, houver duas peças reais por formato, os checks determinísticos estiverem conformes e toda revisão humana estiver aprovada. O gate não altera a feature flag; o rollout em produção continua sendo uma ação operacional separada.
