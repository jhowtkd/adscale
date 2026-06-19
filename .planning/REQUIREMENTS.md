# Requirements: ADScale v12.9 Fechamento Humano do Olhar Cenbrap

**Defined:** 2026-06-19
**Milestone:** v12.9 Fechamento Humano do Olhar Cenbrap
**Core Value:** Users can go from a single base creative and a brief to multiple platform-ready ad variations in minutes, with full creative control and review.

## Scope

Transformar o `human_needed` de v12.8 em calibracao humana real: capturar decisoes do Jhonatan, aumentar amostra ate o minimo de 5 decisoes, substituir ou complementar o corpus `synthetic_fixture` com evidencias customer-real quando disponiveis, e fechar o claims gate sem extrapolar qualidade.

**Starting point:** v12.8 fechou como `tech_debt`: `142-EVIDENCE.json` live existe e o checker passa com status `human_needed`, mas `humanDecisionCount=0`, `missingHumanDecisionCount=2`, `agreementRate=null`, sample guidance `0/5` e corpus `synthetic_fixture`.

**In scope:** decisao operatoria, rerun da calibracao, expansao de amostra, inspecao/import seguro de corpus customer-real, source labels, mismatch learning, refresh de evidencia e audit final de claims.

**Out of scope:** dashboard novo de taste profile, fine-tuning, performance/media blending, claims comerciais de melhoria, mudanca de modelo de imagem, redesign amplo da review UI.

## Requirements

### Operator Decisions (HUMDEC)

- [x] **HUMDEC-01**: Jhonatan can review every current `review_ready` calibration row and record `entra`, `quase` or `nao_entra` with optional mismatch bucket/note.
- [x] **HUMDEC-02**: Decision recording is idempotent and persists reviewer, reviewedAt, derivation id, decision and sanitized snapshot without prompts, signed URLs or secrets.
- [x] **HUMDEC-03**: Calibration rerun after decisions updates `humanDecisionCount`, `missingHumanDecisionCount`, `comparableCount` and mismatch reason counts from persisted decisions.
- [x] **HUMDEC-04**: Any row still lacking human decision remains explicitly `manual_pending` / `human_needed`; no decision is inferred from system verdict.

**Phase 147 note:** HUMDEC is complete at workflow/tooling and blocker-honesty level. Actual Jhonatan decisions are still absent (`humanDecisionCount=0`) and carry forward to SAMPLE / Phase 148.

### Sample Sufficiency (SAMPLE)

- [x] **SAMPLE-01**: Operator can identify or create enough reviewable rows to reach at least 5 human decisions, or records an exact blocker if more rows are unavailable.
- [ ] **SAMPLE-02**: Evidence keeps `agreementRate=null` and quality/agreement claims withheld until sample guidance `additionalNeeded=0`.
- [ ] **SAMPLE-03**: When the minimum sample is reached, evidence computes agreement and mismatch metrics only from comparable rows with both system and human verdicts.
- [x] **SAMPLE-04**: Sample guidance reports source composition (`synthetic_fixture`, `operator_imported`, `real_customer`) so claims cannot hide weak evidence.

### Customer-Real Corpus (REALCORP)

- [ ] **REALCORP-01**: Operator can inspect configured environments for customer-real Cenbrap campaigns without exposing `DATABASE_URL`, prompts, signed URLs or raw payloads.
- [ ] **REALCORP-02**: Customer-real Cenbrap derivations can be imported or queued into calibration with safe refs, dual verdicts and source label `real_customer` or an explicit `operator_data_unavailable` blocker.
- [ ] **REALCORP-03**: Evidence separates `synthetic_fixture` operational calibration from customer-real proof and prevents external claims from blending them.
- [ ] **REALCORP-04**: Contact sheet and corpus manifest show which rows are eligible for customer-real claims and which remain fixture-only.

### Agreement Calibration and Claims (AGREE)

- [ ] **AGREE-01**: Mismatch audit identifies actionable reasons for disagreement: system too harsh, system too permissive, voice nuance, export/setup issue, acceptable override or unclear sample.
- [ ] **AGREE-02**: Any prompt/rubric adjustment is based on recorded disagreement patterns and has regression coverage against factual/export safety.
- [ ] **AGREE-03**: Release evidence refresh states which claims are allowed, forbidden or still blocked after decisions and sample guidance.
- [ ] **AGREE-04**: v12.9 final audit closes or carries forward remaining v12.8 debt with exact blockers and next operator actions.

## Future Requirements

### Taste Profile (deferred)

- **TASTE-01**: System builds a workspace-level taste profile from repeated human decisions and uses it to rank future outputs.
- **TASTE-02**: Weekly calibration report highlights where system verdicts disagree with Jhonatan's judgment.
- **TASTE-03**: Client voice documents can be managed per client profile instead of being hardcoded.

### Performance Blending (deferred)

- **PERFLOOK-01**: Creative verdicts can be compared with imported CTR/CPA/ROAS once quality and performance samples are both sufficient.
- **PERFLOOK-02**: Recommendations can balance art-direction quality and media outcome without weakening export compliance.

## Out of Scope

| Feature | Reason |
|---------|--------|
| New image-generation capability | v12.9 closes calibration evidence, not generation breadth |
| Fine-tuning model/rubric | Premature until disagreement data is recorded |
| Multi-client voice UI | Cenbrap must validate the operator loop first |
| Commercial quality claims | Blocked until human decisions, sample sufficiency and customer-real evidence support them |
| Performance/media blending | Requires separate performance sample sufficiency |
| Full dashboard redesign | Contact sheet, scripts and evidence gate are enough for this milestone |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| HUMDEC-01 | Phase 147 | Complete (human_needed carry-forward) |
| HUMDEC-02 | Phase 147 | Complete (human_needed carry-forward) |
| HUMDEC-03 | Phase 147 | Complete (human_needed carry-forward) |
| HUMDEC-04 | Phase 147 | Complete (human_needed carry-forward) |
| SAMPLE-01 | Phase 148 | Complete |
| SAMPLE-02 | Phase 148 | Pending |
| SAMPLE-03 | Phase 148 | Pending |
| SAMPLE-04 | Phase 148 | Complete |
| REALCORP-01 | Phase 149 | Pending |
| REALCORP-02 | Phase 149 | Pending |
| REALCORP-03 | Phase 149 | Pending |
| REALCORP-04 | Phase 149 | Pending |
| AGREE-01 | Phase 150 | Pending |
| AGREE-02 | Phase 150 | Pending |
| AGREE-03 | Phase 150 | Pending |
| AGREE-04 | Phase 150 | Pending |

**Coverage:**
- v12.9 requirements: 16 total
- Mapped to phases: 16
- Unmapped: 0

---
*Requirements defined: 2026-06-19 after v12.8 human_needed claims gate*
*Last updated: 2026-06-19 after Phase 147 human_needed verification*
