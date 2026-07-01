# Spike: Progression como fonte de verdade para Missions

**Branch:** `arch/refactor-2026-q3` (PR 9)  
**Data:** 2026-07-01  
**Tipo:** Discovery — sem refatoração de produção neste PR.

## Veredito

**Tese rejeitada:** `missions` **não** pode ser uma view fina de `progression` com o modelo atual.

Cinco das onze missões (`setup`, `upload`, `readiness`, `export`, `share`) já derivam de evidências de progression via `PROGRESSION_TO_MISSION`. As outras seis têm regras de evidência independentes, e os dois sistemas divergem em pré-requisitos, granularidade, modelo de status, overlay de créditos e instrumentação.

Consolidação futura é possível apenas se progression for estendido para representar os 11 passos (ou se missions for explicitamente mantido como camada de apresentação com evidência própria).

---

## 1. Regras duplicadas

| Conceito | Progression | Missions | Observação |
|----------|-------------|----------|------------|
| Campanha criada | `campaign_created` | `setup` | Mapeamento via `PROGRESSION_TO_MISSION` |
| Upload de criativo base | `base_creative_uploaded` | `upload` | Idem |
| Readiness executado | `readiness_ran` | `readiness` | Idem |
| Export | `creative_exported` | `export` | Idem, mas pré-requisitos diferentes (ver §4) |
| Share | `share_created` | `share` | Idem, mas pré-requisitos diferentes |
| Evidência base do workspace | `inferWorkspaceEvidence` | Chamado em `inferMissionCompletions` | Missions reutiliza progression como seed |
| Deep links (5 alinhados) | `buildEvidenceHref` | `buildMissionHref` via `MISSION_TO_PROGRESSION` | Duplicação inversa do mapa |
| Copy de bloqueio (5 passos) | `dashboard.progression.blockedReasons.*` | `dashboard.missions.blockedReasons.*` | Texto quase idêntico, namespaces separados |
| Copy de prompt (5 passos) | `dashboard.progression.evidence.*` | `dashboard.missions.items.*` | Framing diferente (tutorial vs milestone) |

**Três mapas paralelos hoje:**

1. `PROGRESSION_TO_MISSION` — `missions/evidence.ts` (runtime)
2. `MISSION_DEFINITIONS[].progressionEvidence` — `missions/definitions.ts` (documentação, não usado em runtime)
3. `MISSION_TO_PROGRESSION` — `missions/hrefs.ts` (runtime, inverso de 1)

---

## 2. Regras só em missions

| Regra | Arquivo | Detalhe |
|-------|---------|---------|
| 11 passos ordenados | `missions/definitions.ts` | `MISSION_ORDER`, cadeia de `prerequisite` |
| Evidência de briefing guiado | `missions/evidence.ts` | `objective` + (`audience` \| `tone`) ou `offer` não vazio |
| Evidência de recipe | `missions/evidence.ts` | `creativePlans` ou `targetFormats` / `ctaVariants` |
| Evidência de preview | `missions/evidence.ts` | Primeira derivação `isPreview=true` com status `completed\|approved` |
| Evidência de batch | `missions/evidence.ts` | Primeira derivação não-preview com status `completed\|approved\|processing\|queued` |
| Evidência de review | `missions/evidence.ts` | Primeira derivação `approved\|rejected` (rejeição conta) |
| Evidência de regeneration | `missions/evidence.ts` | Primeira derivação com `parentId` não nulo |
| Status por passo | `missions/status.ts` | `completed \| active \| blocked \| upcoming` para os 11 |
| Progresso /11 | `missions/status.ts` | `calculateMissionProgressPercent` |
| Export requer `review` | `missions/definitions.ts` | Progression exige só `creative_approved` |
| Share requer `export` | `missions/definitions.ts` | Progression exige só `creative_approved` |
| Estimativa de créditos | `missions/credits.ts` | `preview`, `batch`, `regeneration` |
| Flag insufficient-credits | `missions/service.ts` | Overlay de billing no passo ativo |
| Upgrade prompt (CRED-03) | `lib/progression/credit-activation.ts` | `shouldShowUpgradePrompt` por `MissionKey` |
| Hrefs mission-only | `missions/hrefs.ts` | `MISSION_HREF_OVERRIDES` (briefing, recipe, preview, etc.) |
| Instrumentação owner | `feedback/mission-credit-signals.ts` | Classificação por `missionKey` |
| Skip / insights UX | `MissionPathCard`, `LaboratoryProgressPanel` | `mission_skipped`, prompts por missão |

---

## 3. Regras só em progression

| Regra | Arquivo | Detalhe |
|-------|---------|---------|
| 7 chaves de evidência | `levels.ts` `EVIDENCE_ORDER` | Inclui `derivation_generated`, `creative_approved` |
| 4 níveis | `levels.ts` `LEVEL_DEFINITIONS` | `aprendiz → analista_criativo → estrategista_ads → cientista_ads` |
| Gate de nível por aprovação | `levels.ts` `calculateLevel` | Sem `creative_approved`, nível permanece `aprendiz` |
| Próxima ação única | `levels.ts` `buildNextAction` | Um passo com flag `blocked` |
| Progresso /7 | `levels.ts` `calculateProgressPercent` | Denominador diferente de missions |
| Share após aprovação | `levels.ts` `EVIDENCE_DEFINITIONS` | Pré-requisito `creative_approved`, não export |
| Export após aprovação | `levels.ts` | Pré-requisito `creative_approved`, não review |
| Snapshot em DB | `service.ts` | `upsertWorkspaceProgressionSnapshot` |
| Derivação (coarse) | `evidence.ts` | `derivation_generated`: primeira não-preview `completed\|approved` |
| Aprovação (coarse) | `evidence.ts` | `creative_approved`: primeira `approved` apenas |

---

## 4. Estados que não podem ser colapsados (hoje)

| Estado / regra | Por que não colapsa |
|----------------|---------------------|
| `guided_briefing` … `regeneration` | Sem chave equivalente em `ProgressionEvidenceKey` |
| `derivation_generated` / `creative_approved` | Sem item de missão 1:1; missions usa 4 passos (preview, batch, review, regeneration) |
| Review com rejeição | Progression ignora `rejected` |
| Batch em `processing\|queued` | Progression só marca `derivation_generated` em `completed\|approved` |
| Pré-requisito export | Missions: `review`; progression: `creative_approved` |
| Pré-requisito share | Missions: `export`; progression: `creative_approved` |
| Overlay de créditos | Só em missions |
| Níveis (`aprendiz` … `cientista_ads`) | Só em progression |
| Status `upcoming` / path completo | Só em missions |

**Cenário concreto de divergência:** usuário com criativo aprovado mas sem export pode ter `share_created` desbloqueado em progression, mas `share` ainda bloqueado em missions até completar `export`.

---

## 5. `PROGRESSION_TO_MISSION` pode ser deletado?

**Não como conceito; sim como duplicata.**

Usado em `inferMissionCompletions` para:
1. Seed inicial a partir de `inferWorkspaceEvidence`
2. Re-sync de `export` / `share` (segundo loop, sobrescreve)

`MISSION_DEFINITIONS[].progressionEvidence` já documenta o mesmo mapeamento mas **não é lido em runtime**.

**Recomendação:** substituir os três mapas por um único módulo (ex.: `progression-mission-map.ts`) derivado de `progressionEvidence` nas definições. Deletar `PROGRESSION_TO_MISSION` só após essa consolidação.

---

## 6. Forma canônica de i18n (proposta)

Objetivo: uma árvore que cubra os 11 prompts de missão **e** os níveis de progression, sem campos vazios de back-compat no servidor.

### Problema atual

`MISSION_DEFINITIONS` carrega `blockedReason: ""` em 10 missões — copy real vem do cliente via `dashboard.missions.blockedReasons.<key>`. Campos vazios existem só para shape da API.

### Árvore proposta

```json
{
  "dashboard": {
    "onboarding": {
      "shell": {
        "title": "...",
        "progressAria": "...",
        "cta": "...",
        "blockedCta": "..."
      },
      "steps": {
        "setup": {
          "label": "...",
          "description": "...",
          "progressionEvidence": "campaign_created",
          "blockedReason": null
        },
        "upload": {
          "label": "...",
          "description": "...",
          "progressionEvidence": "base_creative_uploaded",
          "blockedReason": "..."
        },
        "guided_briefing": {
          "label": "...",
          "description": "...",
          "blockedReason": "..."
        }
      },
      "levels": {
        "aprendiz": {
          "label": "...",
          "shortLabel": "...",
          "description": "..."
        }
      },
      "credits": {
        "costSingle": "...",
        "insufficient": "..."
      }
    }
  }
}
```

**Chave única de exemplo:** `dashboard.onboarding.steps.preview.label` — substitui `dashboard.missions.items.preview.label` e não conflita com `dashboard.progression.evidence.derivation_generated.*` (que permanece como milestone coarse até progression absorver os 11 passos).

**Migração incremental:** manter aliases `dashboard.missions.*` e `dashboard.progression.*` como re-exports no JSON até os componentes migrarem; remover `blockedReason: ""` do servidor — o campo deixa de existir na API, copy só via i18n.

---

## 7. Diff de cobertura i18n (en vs pt-BR)

### Missions + progression (escopo deste spike)

| Namespace | Chaves em `en.json` | Chaves em `pt-BR.json` | Paridade |
|-----------|---------------------|------------------------|----------|
| `dashboard.missions.*` | 68 | 68 | ✅ Simétrico |
| `dashboard.progression.*` | 43 | 43 | ✅ Simétrico |

Nenhuma chave de missions ou progression existe em um locale e falta no outro.

### Chaves só em missions (68 total, 25 exclusivas de conteúdo)

Não têm equivalente em progression:

- Shell: `pathLabel`, `activeMission`, `expand`, `collapse`, `resume`, `done`, `skipMission`, `allCompleteTitle`, `allCompleteDescription`, `empty`, `blockedCtaHint`, `blockedResume.*` (10 chaves)
- Itens: `guided_briefing`, `strategy_recipe`, `preview`, `batch`, `review`, `regeneration` (12 chaves label+description)
- Blocked: `guided_briefing` … `share` exceto overlap semântico com progression (8 chaves)
- Credits: `credits.*` (6 chaves)

### Chaves só em progression (43 total, 18 exclusivas)

- Levels: `levels.*.{label,shortLabel,description}` — 12 chaves
- Evidence sem missão 1:1: `derivation_generated`, `creative_approved` — 4 chaves
- `nextActionAllComplete` — presente em ambos locales, **não referenciado em `app/src`** (candidato a remoção)
- Blocked reasons com chave de evidência: `derivation_generated`, `creative_approved` — 2 chaves

### Paridade global en/pt-BR (fora do escopo, mas registrado)

`pt-BR.json` tem **25 chaves a mais** em `assistant.guidedFlow.*` que não existem em `en.json`. Não bloqueia este spike, mas deve ser corrigido em PR de i18n separado.

### Conclusão i18n

**Não é seguro colapsar** `dashboard.missions.*` e `dashboard.progression.*` sem perder cobertura: ~25 chaves de conteúdo são exclusivas de cada namespace. Colapso exige a árvore `dashboard.onboarding.*` acima (ou equivalente) com aliases temporários.

---

## 8. Testes executados

```bash
cd app
npm run typecheck          # ✅ passou
npm test -- progression    # ✅ 8 files, 25 tests
npm test -- missions       # ✅ 5 files, 14 tests
```

---

## 9. Plano de PRs futuros (se consolidar)

| PR | Escopo | Pré-requisito |
|----|--------|---------------|
| PR 9b | Extrair `progression-mission-map.ts` único; remover `PROGRESSION_TO_MISSION` duplicado | Este spike aprovado |
| PR 9c | Remover `blockedReason: ""` da API; copy 100% client-side | Sem breaking change em consumidores |
| PR 10+ | Spike sanitizers (plano original) | Independente |
| Futuro A | Estender `ProgressionEvidenceKey` para 11 passos **ou** documentar missions como presentation layer permanente | Decisão de produto |
| Futuro B | Migrar i18n para `dashboard.onboarding.*` com aliases | PR de copy/design |
| Futuro C | Alinhar pré-requisitos export/share entre sistemas | Decisão de produto (qual gate é canônico?) |

**Recomendação:** não fundir os serviços. Tratar missions como onboarding path (11 passos, créditos, instrumentação) e progression como gamificação/níveis (7 evidências, snapshot). Unificar apenas mapas e copy onde há overlap real (5 passos).

---

## 10. Arquivos de referência

| Área | Path |
|------|------|
| Progression service | `app/src/server/progression/service.ts` |
| Progression evidence | `app/src/server/progression/evidence.ts` |
| Levels / next action | `app/src/server/progression/levels.ts` |
| Missions service | `app/src/server/progression/missions/service.ts` |
| Missions evidence | `app/src/server/progression/missions/evidence.ts` |
| Definitions | `app/src/server/progression/missions/definitions.ts` |
| Status | `app/src/server/progression/missions/status.ts` |
| Credits | `app/src/server/progression/missions/credits.ts` |
| Hrefs | `app/src/server/progression/missions/hrefs.ts` |
| Credit activation | `app/src/lib/progression/credit-activation.ts` |
| Owner signals | `app/src/server/feedback/mission-credit-signals.ts` |
| i18n | `app/messages/en.json`, `app/messages/pt-BR.json` |
