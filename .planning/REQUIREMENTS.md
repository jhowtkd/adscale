# Requirements: ADScale v12.7 Olhar ADScale

**Defined:** 2026-06-19
**Milestone:** v12.7 Olhar ADScale: Direcao de Arte Antes de Compliance
**Core Value:** Users can go from a single base creative and a brief to multiple platform-ready ad variations in minutes, with full creative control and review.

## Scope

Trocar o eixo do advisor criativo: sair de um checklist de UX/performance que trata anuncios como interfaces e implantar um julgamento de direcao de arte que avalia figura, gestalt, voz e convite antes de compliance de exportacao.

**Starting point:** audits de campanhas reais mostraram outputs invalidos, aprovacao de peca `approved + invalid`, outputs com cara de template/interface, CTA tratado como widget clicavel e baixa confianca entre score automatico e julgamento humano. v12.3 preservou fidelidade factual mas manteve QA-19 como gap visual aceito; v12.5/v12.6 criaram infraestrutura de corpus, mas nao resolveram a regua criativa.

**In scope:** nova ontologia do Olhar ADScale, voz Cenbrap inicial, contratos `olhar` + `exportacao`, validador deterministico de exportacao, reescrita de preflight/QA/score/prompt-builder, review UI com veredito editorial, override consciente e calibracao em campanhas Cenbrap reais.

**Out of scope:** fine-tuning de modelo, trocar modelo de imagem, publicar diretamente em midia paga, performance-media blending, marketplace de revisores, video, multi-tenant completo de vozes por cliente, claims comerciais de melhora sem corpus suficiente.

## Requirements

### Olhar Foundation (OLHAR)

- [x] **OLHAR-01**: System has a global `Olhar ADScale` constitution that defines figure, gestalt, voice, invite, anti-template judgment and the separation between creative quality and export compliance.
- [x] **OLHAR-02**: System has a first client voice document for Cenbrap that describes editorial principles, anti-references, brand presence, people/authority handling, CTA rhythm and common "correct but soulless" failures.
- [x] **OLHAR-03**: Creative prompts and rubrics no longer use UI-first vocabulary as the default creative solution, including `clickable-looking`, `CTA module`, `UI modules`, generic card-grid language and button-as-default CTA framing.
- [x] **OLHAR-04**: Existing visual failure concepts (`generic_template_aesthetic`, `missing_dominant_idea`, `visual_overload`) are promoted into first-class art-direction verdicts rather than optional polish notes.

### Dual Verdict Contract (VERDICT)

- [x] **VERDICT-01**: Generated outputs receive a creative verdict `olharVerdict` with values `pronta`, `quase`, `sem_opiniao` or `confusa`.
- [x] **VERDICT-02**: Generated outputs receive an independent export verdict `exportStatus` with values `ok`, `ajuste_menor` or `bloqueado`.
- [x] **VERDICT-03**: `olharVerdict` includes four compact axes (`figura`, `gestalt`, `voz`, `convite`) scored 0-3 plus short direction notes, what works and what blocks.
- [x] **VERDICT-04**: Quality gate never treats `completed` as ready-to-approve unless the creative verdict and export verdict both allow it.

### Export Validator (EXPORT)

- [x] **EXPORT-01**: Deterministic export validation checks brand/source identity, CTA drift, offer/claim drift, required text readability, format ratio and output resolution separately from art-direction judgment.
- [x] **EXPORT-02**: Campaign setup mismatches such as campaign name `Teste 5` with a CENBRAP base creative are reported as setup/contract problems, not as weak art direction.
- [x] **EXPORT-03**: Approval APIs reject `approved + invalid` states by default and require an explicit audited override path for exceptional cases.
- [x] **EXPORT-04**: Character-level CTA issues such as punctuation, NBSP, hyphen and typographic quotes are normalized before deciding whether CTA drift is material.

### Advisor And Generation (ADVISOR)

- [x] **ADVISOR-01**: Preflight becomes `Leitura do base`, returning dominant idea, gestalt, invite weight, thumbnail read, brand presence and at most two real pre-generation risks.
- [x] **ADVISOR-02**: Post-generation QA and score are rewritten as `Passagem Olhar`, using art-direction language instead of compliance-ticket language.
- [ ] **ADVISOR-03**: Image generation prompts inject a short direction paragraph that states the gestalt to preserve, sacred facts, allowed variation range and explicit anti-patterns.
- [ ] **ADVISOR-04**: Numeric quality score is demoted to internal analytics/detail; the primary user-facing decision is the dual verdict and direction note.

### Review Surface And Override (REVIEW)

- [ ] **REVIEW-01**: Campaign workspace review surface displays `Olhar` and `Exportacao` separately, with `Sem opiniao` and `Confusa` visibly unable to enter the approval package.
- [ ] **REVIEW-02**: Review modal prioritizes the creative verdict, what works, what blocks and a collapsed export section instead of a long checklist of generic score dimensions.
- [ ] **REVIEW-03**: User decisions use `Entra`, `Quase - regenerar assim` and `Nao entra` language, capturing a structured direction reason when rejecting or regenerating.
- [ ] **REVIEW-04**: Overrides require a typed reason, are logged with actor/campaign/derivation/context, and do not silently convert a weak creative into a normal approved state.

### Cenbrap Calibration And Evidence (CALIB)

- [ ] **CALIB-01**: At least two real Cenbrap campaigns are re-evaluated with the new dual-verdict system and exported as contact sheets for side-by-side operator review.
- [ ] **CALIB-02**: Jhonatan's `entra`, `quase` and `nao entra` decisions are captured against system verdicts to measure agreement and mismatch reasons.
- [ ] **CALIB-03**: Milestone evidence reports agreement rate, approved-invalid prevention, sem-opiniao detection, export-block separation and remaining visual-quality gaps without claiming sample sufficiency if corpus is too small.
- [ ] **CALIB-04**: The release gate keeps factual fidelity separate from art-direction quality and preserves `insufficient_sample` / accepted-gap language when evidence is not strong enough.

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
| Fine-tuning image or judgment models | Premature until the new rubric produces reliable operator agreement |
| Replacing the OpenAI image model | This milestone changes judgment and prompt direction, not provider strategy |
| Direct media publishing | ADScale still reviews and exports creatives; it does not operate spend |
| Full multi-client voice management UI | Cenbrap validates the structure first; client-profile UI can follow |
| Commercial quality claims | Blocked until sample sufficiency and factual pass are proven |
| Video advisor | Static image outputs remain the product scope |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| OLHAR-01 | Phase 138 | Complete |
| OLHAR-02 | Phase 138 | Complete |
| OLHAR-03 | Phase 138 | Complete |
| OLHAR-04 | Phase 138 | Complete |
| VERDICT-01 | Phase 139 | Complete |
| VERDICT-02 | Phase 139 | Complete |
| VERDICT-03 | Phase 139 | Complete |
| VERDICT-04 | Phase 139 | Complete |
| EXPORT-01 | Phase 139 | Complete |
| EXPORT-02 | Phase 139 | Complete |
| EXPORT-03 | Phase 139 | Complete |
| EXPORT-04 | Phase 139 | Complete |
| ADVISOR-01 | Phase 140 | Complete |
| ADVISOR-02 | Phase 140 | Complete |
| ADVISOR-03 | Phase 140 | Pending |
| ADVISOR-04 | Phase 140 | Pending |
| REVIEW-01 | Phase 141 | Pending |
| REVIEW-02 | Phase 141 | Pending |
| REVIEW-03 | Phase 141 | Pending |
| REVIEW-04 | Phase 141 | Pending |
| CALIB-01 | Phase 142 | Pending |
| CALIB-02 | Phase 142 | Pending |
| CALIB-03 | Phase 142 | Pending |
| CALIB-04 | Phase 142 | Pending |

**Coverage:**
- v12.7 requirements: 24 total
- Mapped to phases: 24
- Unmapped: 0

---
*Requirements defined: 2026-06-19 after v12.7 milestone initialization*
