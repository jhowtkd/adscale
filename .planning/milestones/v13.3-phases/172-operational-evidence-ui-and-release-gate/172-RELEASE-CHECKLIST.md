# Phase 172 — v13.3 Release Checklist

Manual smoke steps for milestone sign-off (D-04 / ALERT-04). Record **technical regression** and **operational evidence** status honestly — milestone may pass with `insufficient_sample` operational status when live owner smoke is pending.

**Automated gate:** `cd app && npm run v13-3-release-gate`

**Evidence artifact:** `.planning/phases/172-operational-evidence-ui-and-release-gate/172-EVIDENCE.json`

---

## Pre-flight

- [ ] Run `cd app && npm run v13-3-release-gate` — completes with technical pass; operational status recorded honestly (`tech_debt` or `insufficient_sample` acceptable).
- [ ] Review `172-EVIDENCE.json` — `technicalRegression.status` is `pass` and separate from `operationalEvidence.status`.

| Block | Field | Recorded status | Notes |
|-------|-------|-----------------|-------|
| Technical regression | `technicalRegression.status` | | Automated phase 168–172 tests |
| Operational evidence | `operationalEvidence.status` | | Live smoke + customer-real sample |
| Root milestone | `status` | | Must not be `ok` if operational insufficient |

---

## ALERT-01 — Factual alerts visible in quality UI

### Learning tab (workspace scope)

- [ ] Sign in as **platform owner**.
- [ ] Open `/feedback` → **Learning** tab.
- [ ] Confirm **Factual issue alerts** section appears **above** learning proposals when alert data exists.
- [ ] If no alerts meet thresholds, confirm honest empty state copy (not a silent omission).

### Brand Propostas tab (brand scope)

- [ ] Open `/admin/quality/brands/{clientProfileId}` → **Propostas** tab.
- [ ] Confirm brand-scoped factual alerts render above proposals for the selected brand.

---

## ALERT-02 — Evidence links without prompt/storage leakage

- [ ] From an alert row, confirm **brand link** navigates to `/admin/quality/brands/{clientProfileId}`.
- [ ] Confirm slice stats (count, meanSignedDelta, etc.) are visible.
- [ ] Confirm corpus item ids link to safe destinations — **no** prompts, evaluation notes, `artifactRef`, or storage keys in the UI.

---

## ALERT-03 — Factual vs promptable proposals

- [ ] Confirm factual alerts section has **no** Accept, Reject, Generate, or rule-creation actions.
- [ ] Confirm **Learning proposals** section below still shows Accept/Reject for promptable proposals only.
- [ ] Confirm warning copy states factual guard issues must not become `corpus_quality` rules.

---

## ALERT-04 — Settings persistence (Phase 171)

- [ ] Open **Settings** → **Profile** tab — change display name or avatar → **Save**.
- [ ] Open **Settings** → **Workspace** tab — change workspace name → **Save**.
- [ ] Hard refresh the browser.
- [ ] Confirm profile and workspace values persist after refresh.

---

## Phase surface coverage (automated — reference)

| Phase | Surface | Automated command |
|-------|---------|-------------------|
| 168 | Human decision intake | evaluation route + human-quality-service tests |
| 169 | Source / claim gates | real-quality + operational-quality release evidence tests |
| 170 | Narrative rollout | `marketing/brand/in-app-copy-checklist.md` + product-narrative-copy test |
| 171 | Settings persistence | profile/workspace route + settings-nav tests |
| 172 | Factual alerts UI | FactualAlertsPanel + route + panel integration tests |

---

## Sign-off

| Role | Name | Date | Technical status | Operational status | Approved |
|------|------|------|------------------|--------------------|----------|
| Owner / operator | | | | | |

**Resume signal after smoke:** Type `approved` or describe gaps found.

---

*Phase 172 — operational-evidence-ui-and-release-gate*
*Milestone: v13.3 — Tracao Multi-Cliente*
