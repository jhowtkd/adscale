# Research Summary: v13.2 Calibração Multi-Marca

**Synthesized:** 2026-06-23 (4 parallel researchers + codebase verification)

## Stack Additions

**Nenhuma dependência npm nova.** Estender Drizzle/Postgres com `client_profile_olhar_config` (ou JSONB dedicado), reutilizar `brand-taste`, `client_learning_proposals` (0051/0052), Inngest aggregator e APIs admin. Substituir `resolveClientVoice()` por resolução via `clientProfileId`. Anti-stack: vector DB, fine-tuning, eval platforms, CMS de voz.

## Feature Table Stakes

- Container por `clientProfileId` (não match de string em campanha)
- Constituição/voz declarativa por marca com approve-before-apply
- Constraints bounded no prompt (Olhar → voice → brand-taste → corpus_quality)
- Perfil + regras inspecionáveis (owner-only)
- Isolamento por marca e evidence level honesto (fixture vs customer-real)

## Differentiators ADScale

- Loop corpus → propostas → regras → próxima geração (raro em creative SaaS)
- Extração por mismatch sistema-humano + fila de incerteza
- Promoção cross-client → `rubric_calibration_adjustments`
- Olhar (direção de arte) + dual verdict export
- Provenance com rule IDs no generation log

## Watch Out For

| Risco | Fase |
|-------|------|
| Vazamento cross-brand em prompt injection | 164 |
| Regressão Cenbrap (3 paths hardcoded) | 162 |
| Prompt bloat (cap 10 + budget total) | 164 |
| Overfitting slice (MIN=3) | 163 |
| Claims falsos com fixture-only | 166 |
| `factual_issue` → regra de prompt | 163 |
| Accept sem fixture acknowledgment | 163 |

## Code Gaps (verified)

1. `derivationJob` carrega só `corpus_quality` — brand-taste rules não wired
2. Ordem de seções no prompt pode divergir do spec aprovado
3. `calibration_signals` só via scripts Cenbrap, não APIs de review
4. Corpus loop parcialmente live; falta E2E proof para qualquer marca

## Roadmap Alignment

Roadmap commitado (162–167) alinha com pesquisa. Reforços para plan-phase:

- **162:** golden tests Cenbrap + schema `client_profile_olhar_config`
- **163:** fixture ack on accept + agregador hardened
- **164:** `taste-loader` + wire `getApprovedRuleConstraints` + provenance
- **165:** separar brand-taste vs corpus_quality na UI
- **166–167:** claims gate por marca + promoção global com source gate

## Open Questions (carry to `/gsd-plan-phase 162`)

- Tabela dedicada vs JSONB em `client_profiles` (pesquisa recomenda tabela)
- Corpus eval → `calibration_signal` automático vs só path `corpus_quality`
- Hard-block vs warn-only para campanhas sem `clientProfileId`

## Sources

- `.planning/research/STACK.md`, `FEATURES.md`, `ARCHITECTURE.md`, `PITFALLS.md` (2026-06-23)
- `docs/superpowers/specs/2026-06-21-corpus-learning-loop-design.md`
