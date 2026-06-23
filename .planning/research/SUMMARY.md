# Research Summary: v13.2 Calibração Multi-Marca

## Stack Additions

**Nenhuma dependência npm nova.** Estender Postgres (tabela `client_profile_voice_config`), reutilizar `brand-taste`, `client_learning_proposals` (migrations 0051/0052) e APIs admin existentes. Substituir `resolveClientVoice()` hardcoded por resolução via `clientProfileId`.

## Feature Table Stakes

- Voz/taste por `clientProfileId` (não match de string em nome de campanha)
- Perfil de gosto + regras aprovadas inspecionáveis (owner-only)
- Corpus global → propostas → aceite → `calibration_rules` (`corpus_quality`)
- Constraints no prompt-builder com provenance logada
- Isolamento por marca e claims gate honesto (fixture vs customer-real)

## Watch Out For

- Vazamento de regras entre `clientProfileId`
- Regressão Cenbrap na migração do hardcode
- Prompt bloat (cap ~10 regras ativas por marca)
- Overfitting com amostra mínima (3 evals)
- `factual_issue` virando regra de prompt
- Claims de calibração sem evidência real

## Roadmap Implication

Sequência natural:

1. Schema + resolver de voz por marca (seed Cenbrap)
2. Remoção do hardcode + testes de paridade
3. Agregador corpus → propostas cliente
4. Aceite → regra → aplicação no prompt
5. UI owner por marca (perfil, regras, propostas)
6. Evidence gate multi-marca

Promoção cross-client → global (`rubric_calibration_adjustments`) pode ser fase final ou v13.3.

## Sources

- `docs/superpowers/specs/2026-06-21-corpus-learning-loop-design.md`
- `.planning/milestones/v13.0-REQUIREMENTS.md`
- `app/src/server/brand-taste/`, `app/src/server/ai/voices/`
