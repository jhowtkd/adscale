# Phase 138: Olhar Constitution and Cenbrap Voice - Context

**Gathered:** 2026-06-19
**Status:** Ready for planning
**Source:** User direction + v12.7 roadmap + `advisor-redesign-v3.md` + attached Olhar ADScale proposals

<domain>
## Phase Boundary

Phase 138 establishes the creative judgment foundation for v12.7. It must not implement the full dual-verdict storage, approval override flow, or review UI. Those belong to Phases 139-141.

This phase delivers:
- A global `Olhar ADScale` constitution in implementation-facing form.
- A first Cenbrap voice document/overlay.
- A vocabulary inventory and first removal of UI-first creative language from core prompts/rubrics where it drives composition.
- A mapping from existing visual failure reasons to future art-direction verdicts.

The foundation must be strong enough for Phase 139 to build `olharVerdict` and `exportStatus`, and for Phase 140 to rewrite advisor/generation prompts without re-litigating language.
</domain>

<decisions>
## Locked Decisions

### Product Thesis
- ADScale scales creative criterion, not only variation volume.
- Creative quality and export compliance are two separate truths.
- Compliance is necessary, but it is not the heart of creative judgment.
- The first creative pass is `Olhar`: figure, gestalt, voice and invite.
- The second pass is `Exportacao`: brand/source identity, CTA, claims, required text, format and resolution.

### Global Olhar Principles
- Dominant idea is non-negotiable: the eye must know where to land quickly.
- Gestalt comes before modules: judge grouping, axis, scale, figure-ground, rhythm and silence before counting zones.
- Aesthetic opinion matters: generic AI template aesthetics are not polish issues.
- CTA is invite and hierarchy, not a clickable widget.
- Brand is felt through presence, rhythm, tone, typography and color, not only a CRM string.
- Medium is the judge: the creative must work at the scale where it will be consumed.
- Human creative judgment remains the calibration source.

### Phase 138 Scope
- Use `pronta`, `quase`, `sem_opiniao`, `confusa` as future creative verdict language.
- Keep `invalid` as export/compliance language only.
- Do not design the full approval UI in this phase.
- Do not add multi-client voice management UI.
- Do not claim quality improvement from docs or vocabulary changes alone.
- Preserve v12.6 evidence honesty: automated green is not proof of live quality.

### Cenbrap Voice Direction
- Cenbrap is the first client voice.
- The voice must describe what feels like Cenbrap and what is anti-Cenbrap.
- The voice must cover education/authority cues, professors/people, MEC/certification claims, CTA rhythm, density, typography, and what "correct but soulless" looks like.
- The first version can be a productized draft created from real campaign audits, but it must leave an explicit review checkpoint for Jhonatan.

### Out of Scope for Phase 138
- New DB schema for dual verdicts.
- Approval API override implementation.
- Full preflight/QA/score rewrite.
- Review card/modal redesign.
- Live re-evaluation of Cenbrap campaigns.
- Fine-tuning, model replacement, or video.
</decisions>

<specifics>
## Specific Inputs To Preserve

### From User Diagnosis
- The current system feels like it learned interface/UX principles rather than top-tier graphic design and gestalt.
- The advisor blocking or prioritizing "clickable CTA" is a symptom of the wrong mental model.
- Outputs feel square, modular and generic because the product is optimizing organization and compliance before art direction.

### From Unified Proposal
- `Olhar` fields should eventually include `figura`, `gestalt`, `voz`, `convite`.
- `Sem opiniao` is a serious creative failure, not a polish suggestion.
- `Confusa` means no clear figure or broken visual rhythm.
- `CTA prominence` should become `peso do convite`.
- `Prontidao Criativa` should become `Leitura do base`.
- `Aprovar/Rejeitar` should become `Entra/Nao entra/Quase` in later UI work.

### Existing Files The Phase Must Respect
- `app/src/server/ai/prompt-builder.ts`
- `app/src/server/ai/per-mode-prompt-rules.ts`
- `app/src/server/ai/preflight-analysis.ts`
- `app/src/server/ai/observable-rubric.ts`
- `app/src/server/ai/creative-quality-taxonomy.ts`
- `app/src/server/ai/creative-quality-gate.ts`
- `app/src/server/ai/creative-corpus.ts`
- `app/src/server/ai/canonical-creative-contract.ts`
</specifics>

<deferred>
## Deferred Ideas

- Workspace-level taste profile from repeated human decisions.
- Weekly mismatch report comparing system verdict to Jhonatan decisions.
- Client-profile UI for managing voices.
- Performance blending with CTR/CPA/ROAS.
- Review surface redesign and override modal.
- Full export validator and dual-verdict persistence.
</deferred>

---

*Phase: 138-olhar-constitution-and-cenbrap-voice*
*Context gathered: 2026-06-19*
