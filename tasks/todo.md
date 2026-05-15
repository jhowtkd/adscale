# Creative Diagnosis + Variation-Level Contract

Date: 2026-05-15
Feature: Creative Diagnosis + Variation-Level Contract for art_variation demo path
Design: docs/plans/2026-05-15-creative-diagnosis-variation-contract-design.md

## Implementation Checklist

### Backend
- [x] Schema DB: campos `creativeDiagnosisStatus`, `creativeDiagnosis`, `creativeDiagnosisSource`, `creativeDiagnosisUpdatedAt`
- [x] Migration SQL `0007_creative_diagnosis.sql`
- [x] Repository: atualizar `CreateCampaignInput`, `UpdateCampaignInput`, `campaignFields`, `createCampaign`, `updateCampaign`
- [x] Módulo AI: `src/server/ai/creative-diagnosis.ts` — analyze, build prompt, normalize
- [x] API routes:
  - `POST /api/campaigns/[id]/diagnosis` — gerar diagnóstico
  - `PATCH /api/campaigns/[id]/diagnosis` — atualizar/editar diagnóstico
  - `POST /api/campaigns/[id]/diagnosis/regenerate` — regenerar diagnóstico
- [x] Prompt builder: usar approved diagnosis para `art_variation`; variation level contract visível nos prompts
- [x] Scoring: adicionar `variationLevelFit` ao breakdown; prompt de scoring avalia respeito ao nível

### Frontend
- [x] `use-campaigns.ts`: adicionar campos de diagnosis à interface `Campaign`
- [x] `page.tsx`: propagar `creativeDiagnosisStatus`, `creativeDiagnosis`, `creativeDiagnosisSource` para `BriefingStep`
- [x] `use-creative-diagnosis.ts`: invalidar `["campaigns", campaignId]` após generate/update/regenerate
- [x] `BriefingStep.tsx`: card compacto editável de diagnóstico (conceito, elementos, oportunidades)
- [x] `BriefingStep.tsx`: helper copy por variation level (conservative/balanced/bold/extreme)
- [x] `BriefingStep.tsx`: estados analyzing/ready/failed; botões editar/regenerar
- [x] Traduções `pt-BR.json` e `en.json`: chaves de diagnosis e variation level contract

### Tests
- [x] Unit: `creative-diagnosis.test.ts` — parser, normalização, prompt builder
- [x] Unit: `creative-score.test.ts` — variationLevelFit no heuristic e suggestion builder
- [x] Unit: `prompt-builder.test.ts` — diagnosis incluso para art_variation, ausente para format_adaptation
- [x] Fix: `briefing-doctor-ui.test.tsx` — mocks para novos hooks de diagnosis + next-intl `.raw`
- [x] Fix: `prompt-builder.test.ts` e `prompt-parser.test.ts` — asserts atualizados para prompts atuais
- [x] Fix: `derivation.test.ts` — variationLevelFit no breakdown

### Correções Pós-Review
- [x] `page.tsx`: inclui diagnosis fields no objeto `campaign` repassado a `BriefingStep`
- [x] `use-creative-diagnosis.ts`: invalida query `campaigns/[id]` após mutações
- [x] `derivation.ts`: passa `creativeLevel` para `analyzeDerivationCreative`
- [x] `creative-score.ts`: prompt de scoring recebe e avalia o `creativeLevel` real
- [x] `en.json`: bloco `diagnosis` adicionado (faltava, quebrava locale en)
- [x] `regenerate/route.ts`: responde `source: "regenerated"` consistente com DB
- [x] API routes + repository: `creativeDiagnosisUpdatedAt` preenchido em generate/edit/regenerate

### Verification
- [x] `npm run typecheck` passa
- [x] `npm run lint` passa (4 warnings pré-existentes, nenhum erro novo)
- [x] `npm run test` — 133 passaram, 1 falha pré-existente (`template.test.ts` sem env de teste)
- [x] `npm run build` passa
- [x] `npx drizzle-kit check` passa

## Review

### O que foi feito
1. **Schema & Migration**: 4 novos campos na tabela `campaigns` com migration `0007_creative_diagnosis.sql`.
2. **Repository**: Tipos e helpers para ler/escrever diagnosis e `variationLevelFit` no score breakdown.
3. **Módulo AI Creative Diagnosis**: `src/server/ai/creative-diagnosis.ts` com análise via vision model, parser/normalização robusto, e lazy OpenAI para evitar falha em importação.
4. **API Routes**: 3 rotas autenticadas sob `/api/campaigns/[id]/diagnosis`. Todas validam ownership, preenchem `creativeDiagnosisUpdatedAt` e retornam source consistente.
5. **Prompt Builder**: `art_variation` inclui `APPROVED CREATIVE DIAGNOSIS` quando disponível. Outros modos não afetados.
6. **Scoring**: `variationLevelFit` adicionado ao breakdown. O prompt de análise visual recebe o `creativeLevel` real da campanha e instrui o modelo a avaliar o respeito ao contrato de variação.
7. **UI BriefingStep**: card compacto com estados `pending`/`analyzing`/`ready`/`failed`. Suporta edição manual e regeneração. Invalidação de query garante que UI atualiza após mutação.
8. **Variation Level Contract**: helper copy visível para cada nível no radio group.
9. **Traduções**: chaves adicionadas em `pt-BR.json` e `en.json`.
10. **Frontend data flow**: `page.tsx` propaga todos os diagnosis fields. Hooks invalidam query após sucesso.

### O que foi verificado
- TypeScript: zero erros
- Lint: zero erros novos
- Testes: 133 passaram. Falha única pré-existente (`template.test.ts` sem env)
- Build: passou
- Drizzle check: passou

### Riscos restantes
1. **Integração OpenAI real**: prompts de diagnosis e scoring não testados com chamadas reais. Formato `json_object` pode variar.
2. **Migration não aplicada**: migration criada mas não aplicada em staging/produção.
3. **Cobertura de UI**: não há testes específicos para o card de diagnosis (apenas mocks corrigidos no teste existente).
4. **QA manual recomendada**: smoke test completo para validar o fluxo end-to-end de diagnosis → geração → scoring.

### Próximos passos recomendados
1. **Smoke test manual**: criar campanha `art_variation`, upload, gerar diagnosis, editar, gerar variações, verificar `variationLevelFit` no score.
2. Aplicar migration `0007_creative_diagnosis.sql` no banco de staging.
3. Adicionar testes de integração para as rotas de diagnosis.
4. Considerar cache do diagnosis para evitar re-análise desnecessária.
