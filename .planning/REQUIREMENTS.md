# Requirements: ADScale v11.0

**Defined:** 2026-06-01
**Core Value:** Users can go from a single base creative and a brief to multiple platform-ready ad variations in minutes, with full creative control and review.

## v11.0 Requirements

### Variação artística (mesmo formato)

- [ ] **DRV-01**: User selecting "Criar novas variações" opens a configuration step (creativity profile + CTA fields) before generation is queued — not immediate generation
- [ ] **DRV-02**: User configuring manual art variation can set creativity level (conservative, balanced, bold) and up to 3 CTAs, then confirm to start generation
- [ ] **DRV-03**: User selecting "Gerar novas variações" sees AI-suggested CTAs and creativity profile pre-filled from campaign/visual analysis
- [ ] **DRV-04**: User in the auto art-variation flow can edit AI suggestions before confirming generation

### Adaptação de formato (outros tamanhos)

- [ ] **DRV-05**: User selecting "Variar tamanhos" chooses exactly one target format (1:1, 4:5, or 9:16) before generation starts
- [ ] **DRV-06**: User selecting "Criar derivações de tamanhos" chooses multiple target formats (default: 1:1, 4:5, 9:16) before batch generation starts

### Coerência de fluxo e qualidade

- [ ] **DRV-07**: No Derivar modal option skips configuration/confirmation and fires generation with hardcoded defaults
- [ ] **DRV-08**: Derivar modal copy and descriptions match actual behavior in PT-BR and EN (including typo fixes)
- [ ] **DRV-09**: Automated tests cover all four Derivar entry paths (payload sent to campaign update + derivations queue)
- [ ] **DRV-10**: Estilizar workflow remains independent; Derivar changes do not alter restyling entry or behavior

## Future Requirements

### v11.1+ (Deferred)

- **DRV-11**: Credit cost preview on confirmation step before queueing derivations
- **DRV-12**: Remember last-used derivation settings per workspace
- **DRV-13**: Smart format recommendations based on campaign platforms field

## Out of Scope

| Feature | Reason |
|---------|--------|
| New generation modes beyond art_variation / format_adaptation | Already shipped in v3/v5; this milestone wires UI only |
| Cross-combination CTA × format matrix | Explicitly out of scope since v3 |
| Replacing Estilizar with Derivar options | Separate workflows by design |
| Plan generation gate before derivations | Existing skip-plan flow unchanged |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| DRV-07 | Phase 40 | Pending |
| DRV-08 | Phase 40 | Pending |
| DRV-01 | Phase 41 | Pending |
| DRV-02 | Phase 41 | Pending |
| DRV-03 | Phase 41 | Pending |
| DRV-04 | Phase 41 | Pending |
| DRV-05 | Phase 42 | Pending |
| DRV-06 | Phase 42 | Pending |
| DRV-09 | Phase 43 | Pending |
| DRV-10 | Phase 43 | Pending |

**Coverage:**
- v11.0 requirements: 10 total
- Mapped to phases: 10
- Unmapped: 0 ✓

---
*Requirements defined: 2026-06-01*
*Last updated: 2026-06-01 after v11.0 milestone planning*
