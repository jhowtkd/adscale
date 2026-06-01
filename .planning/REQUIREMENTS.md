# Requirements: ADScale v11.1 Qualidade de Geração e Contratos Criativos

**Defined:** 2026-06-01
**Core Value:** Users can go from a single base creative and a brief to multiple platform-ready ad variations in minutes, with full creative control and review.

## v11.1 Requirements

### Format Adaptation

- [x] **FMT-01**: User can generate a 9:16 format adaptation that fills the target canvas without blurred side/top/bottom bands, letterboxing, or a centered pasted poster.
- [x] **FMT-02**: User can generate a 4:5 format adaptation that rebuilds the layout with portrait-feed spacing instead of compressing all elements into a crowded cluster.
- [x] **FMT-03**: User-visible information from the source creative remains inside safe areas during format adaptation, including headline, CTA, logo, offer/proof, legal copy, faces, and product visuals.
- [x] **FMT-04**: Format adaptation post-processing preserves final dimensions without adding decorative blur-fill, stretched edge filler, or letterbox backgrounds.
- [x] **FMT-05**: Format adaptation prompts explicitly instruct native layout reconstruction by zones for each target format.

### Creative Contract and Restyling

- [x] **CNTR-01**: The generation pipeline resolves one effective creative contract before prompt building, including generation mode, target format, effective CTA, base asset, style asset, client/brand, product, offer, and constraints.
- [x] **CNTR-02**: Prompt generation, creative scoring, QA, and regeneration suggestions all evaluate against the same effective creative contract.
- [x] **CNTR-03**: CTA semantics are mode-aware: explicit CTAs are preserved exactly, inherited CTAs are treated as required source content, and absent CTAs are represented without overloading `null`.
- [x] **CNTR-04**: Brand/product/offer facts come from the base creative, campaign brief, client profile, or approved brand memory, not from unrelated style references.
- [x] **REST-01**: User-selected style reference assets are persisted or passed into the restyling job so the job does not silently pick the first available style asset.
- [x] **REST-02**: Restyling generation uses the base image as the factual source and style references only for visual language.
- [x] **REST-03**: Restyling QA flags copied style-reference factual claims such as unrelated discounts, brands, CTAs, prices, or course names.
- [x] **REST-04**: Restyling outputs preserve the base creative's essential factual content while applying the selected style language.

### Quality Gate and Regeneration

- [x] **QA-01**: Completed derivations receive automatic quality analysis that separates blocking hard-rule failures from advisory polish suggestions.
- [x] **QA-02**: Hard-rule failures cover at least CTA drift, wrong brand, unsupported offer, copied style-reference facts, cropped critical content, unreadable required text, and invalid format adaptation layout.
- [x] **QA-03**: Quality score no longer hides blocking failures; an output with hard failures is visibly marked as needing review even if visual polish is high.
- [x] **QA-04**: Regeneration suggestions are structured from the detected hard failures and preserve the same target format, generation mode, and effective CTA contract.
- [x] **QA-05**: Users can distinguish "invalid output" from "usable but improvable output" before approving, exporting, or saving a reference.

### Workspace Review and Error Visibility

- [x] **WUI-01**: Campaign workspace loading errors distinguish at least unauthorized/session, workspace mismatch or forbidden, campaign not found, network timeout, and generic server failure where the API provides enough signal.
- [x] **WUI-02**: Derivation gallery cards surface hard quality failures and actionable next steps without requiring the user to inspect logs.
- [x] **WUI-03**: The output review surface shows enough source/target contract context to diagnose failures: generation mode, target format, CTA contract, base asset, and style reference when relevant.
- [x] **WUI-04**: Users can retry or regenerate from an invalid output with the failure reasons carried into the regeneration flow.

### Verification and UAT

- [ ] **UAT-01**: A repeatable fixture or documented local scenario verifies 1:1 to 9:16 and 1:1 to 4:5 adaptation on a real campaign asset.
- [ ] **UAT-02**: A restyling fixture verifies that unrelated style-reference factual claims are not copied into the output.
- [ ] **UAT-03**: Focused tests cover prompt contracts, post-processing behavior, creative contract resolution, scoring/QA classification, and workspace error mapping.
- [ ] **UAT-04**: `npm run build` passes after the milestone, and at least one browser/manual visual check confirms generated outputs are inspectable through the campaign workspace.

## Future Requirements

### Review Experience

- **REV-01**: User can compare source creative and generated output side-by-side with contract annotations.
- **REV-02**: User can view platform-specific safe-area overlays for Meta/TikTok/Google placements.
- **REV-03**: User can tune a workspace-level quality threshold for warnings versus blocking failures.

### Image Repair

- **REPAIR-01**: System can run a multi-turn image repair loop if single-shot edit generation repeatedly fails quality gates.
- **REPAIR-02**: System can preserve accepted visual modules from a previous output while repairing only failed areas.

## Out of Scope

| Feature | Reason |
|---------|--------|
| New generation modes | v11.1 is a reliability milestone for existing art variation, format adaptation, and restyling. |
| Direct ad-platform publishing | Quality must be trustworthy before export/publish automation. |
| Full visual diff UI | Useful but larger than the immediate contract/quality fix; tracked as future REV-01. |
| Per-platform safe-area overlays | Valuable but can follow after native format adaptation works reliably. |
| Replacing the OpenAI image provider | Current stack supports the needed target sizes and edit flows; provider replacement is not the observed bottleneck. |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| FMT-01 | Phase 44 | Complete |
| FMT-02 | Phase 44 | Complete |
| FMT-03 | Phase 44 | Complete |
| FMT-04 | Phase 44 | Complete |
| FMT-05 | Phase 44 | Complete |
| CNTR-01 | Phase 45 | Complete |
| CNTR-02 | Phase 45 | Complete |
| CNTR-03 | Phase 45 | Complete |
| CNTR-04 | Phase 45 | Complete |
| REST-01 | Phase 45 | Complete |
| REST-02 | Phase 45 | Complete |
| REST-03 | Phase 45 | Complete |
| REST-04 | Phase 45 | Complete |
| QA-01 | Phase 46 | Complete |
| QA-02 | Phase 46 | Complete |
| QA-03 | Phase 46 | Complete |
| QA-04 | Phase 46 | Complete |
| QA-05 | Phase 46 | Complete |
| WUI-01 | Phase 47 | Complete |
| WUI-02 | Phase 47 | Complete |
| WUI-03 | Phase 47 | Complete |
| WUI-04 | Phase 47 | Complete |
| UAT-01 | Phase 48 | Pending |
| UAT-02 | Phase 48 | Pending |
| UAT-03 | Phase 48 | Pending |
| UAT-04 | Phase 48 | Pending |

**Coverage:**
- v11.1 requirements: 26 total
- Mapped to phases: 26
- Unmapped: 0

---
*Requirements defined: 2026-06-01*
*Last updated: 2026-06-01 after v11.1 roadmap creation*
