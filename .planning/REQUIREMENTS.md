# Requirements: ADScale v12.8 Operacao Real do Olhar Cenbrap

**Defined:** 2026-06-19
**Milestone:** v12.8 Operacao Real do Olhar Cenbrap
**Core Value:** Users can go from a single base creative and a brief to multiple platform-ready ad variations in minutes, with full creative control and review.

## Scope

Transformar a infraestrutura v12.7 do `Olhar ADScale` em uma operacao real de calibracao Cenbrap: rodar ou semear campanhas reais/revisaveis, capturar decisoes do Jhonatan, medir acordo/desacordo e atualizar a evidencia sem claims falsos.

**Starting point:** v12.7 fechou como `tech_debt`; Phase 143 depois provou o runner live (`mode=live`) mas encontrou `evaluatedCampaignCount=0`, `humanDecisionCount=0`, contact sheet sem linhas reais e `agreementRate` corretamente withheld.

**In scope:** conexao com ambiente que tem campanhas Cenbrap, seeding/import seguro quando o corpus esta vazio, calibracao live, contact sheet preenchido, decisoes humanas `entra/quase/nao_entra`, triagem de mismatches, refresh de evidencia v12.7/v12.8 e playbook operacional repetivel.

**Out of scope:** novas features de geracao, fine-tuning, mudanca de modelo de imagem, dashboard novo de taste profile, multi-client voice management, claims comerciais de melhoria, performance-media blending.

## Requirements

### Live Cenbrap Calibration (CENLIVE)

- [x] **CENLIVE-01**: Operator can run live Cenbrap calibration against a configured `DATABASE_URL` without using template fallback.
- [x] **CENLIVE-02**: Calibration selects at least two real Cenbrap campaigns or records an explicit blocker explaining why the environment lacks enough campaigns.
- [x] **CENLIVE-03**: Generated contact sheet includes real campaign rows with safe derivation refs, `olharVerdict`, `exportStatus`, package eligibility and override markers.
- [x] **CENLIVE-04**: Rows missing `olharVerdict` or `exportStatus` are classified as missing evidence and routed to QA/regeneration follow-up, not inferred as agreement or disagreement.

### Cenbrap Corpus Readiness (CORPUS)

- [x] **CORPUS-01**: Operator can inspect the connected database for existing Cenbrap candidates without exposing `DATABASE_URL`, prompts or signed URLs.
- [x] **CORPUS-02**: Calibration environment contains at least two Cenbrap campaigns with derivations and explicit source labels (`real_customer`, `operator_imported` or `synthetic_fixture`), or records `operator_data_unavailable`.
- [x] **CORPUS-03**: Reviewable derivation rows have safe `outputKey`, `olharVerdict` and `exportStatus`; missing verdict/output rows are excluded or routed before human judgment.
- [x] **CORPUS-04**: Live calibration rerun produces `mode=live`, `evaluatedCampaignCount >= 2` and `review_ready > 0`, or keeps Phase 145 blocked with an exact blocker.

### Human Judgment Capture (JUDGE)

- [x] **JUDGE-01**: Jhonatan can record `entra`, `quase` and `nao_entra` decisions for each calibration row with optional mismatch reason.
- [x] **JUDGE-02**: Operator decisions are persisted or normalized into the calibration artifact with reviewer and reviewedAt metadata.
- [x] **JUDGE-03**: Mismatches are classified into actionable buckets: system too harsh, system too permissive, voice nuance, export/setup issue, acceptable override or unclear sample.
- [x] **JUDGE-04**: Calibration can compute agreement metrics only from comparable rows with both system verdict and human decision.

### Evidence Refresh And Claims Gate (CLAIM)

- [ ] **CLAIM-01**: Release evidence refresh consumes live calibration JSON and updates agreement, mismatch, approved-invalid prevention, sem-opiniao detection and export-block separation counters.
- [ ] **CLAIM-02**: Evidence status remains `insufficient_sample` or `human_needed` until sample guidance thresholds are met.
- [ ] **CLAIM-03**: v12.8 audit separates factual/export safety from art-direction agreement and explicitly withholds quality claims when sample guidance blocks them.
- [ ] **CLAIM-04**: v12.7 tech debt is either closed with live evidence or carried forward with exact operator blockers and next actions.

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
| New image-generation capability | v12.8 is operational calibration, not more generation surface |
| Fine-tuning model/rubric | Premature until live operator disagreement data exists |
| Multi-client voice UI | Cenbrap must validate the operational loop first |
| Commercial quality claims | Blocked until sample sufficiency and human agreement are real |
| Performance/media blending | Requires separate performance sample sufficiency |
| Full dashboard redesign | Contact sheet + evidence refresh are enough for this milestone |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| CENLIVE-01 | Phase 143 | Complete |
| CENLIVE-02 | Phase 143 | Complete |
| CENLIVE-03 | Phase 143 | Complete |
| CENLIVE-04 | Phase 143 | Complete |
| CORPUS-01 | Phase 144 | Complete |
| CORPUS-02 | Phase 144 | Complete |
| CORPUS-03 | Phase 144 | Complete |
| CORPUS-04 | Phase 144 | Complete |
| JUDGE-01 | Phase 145 | Complete |
| JUDGE-02 | Phase 145 | Complete |
| JUDGE-03 | Phase 145 | Complete |
| JUDGE-04 | Phase 145 | Complete |
| CLAIM-01 | Phase 146 | Pending |
| CLAIM-02 | Phase 146 | Pending |
| CLAIM-03 | Phase 146 | Pending |
| CLAIM-04 | Phase 146 | Pending |

**Coverage:**
- v12.8 requirements: 16 total
- Mapped to phases: 16
- Unmapped: 0

---
*Requirements defined: 2026-06-19 after v12.7 tech_debt audit*
