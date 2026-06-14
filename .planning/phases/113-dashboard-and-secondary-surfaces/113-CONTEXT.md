# Phase 113 Context

**Goal:** Align dashboard, library, templates, restyling, and feedback with Phase 111 primitives and i18n/a11y contracts.

**Routes:** `/`, `/library`, `/templates`, `/restyling`, `/quick-tools/restyling`, `/feedback`

**Requirements:** SURF-06, RESP-06, RESP-08, RESP-09, A11Y-06–09

## Changes

- `PageHeader` + `Panel` on secondary routes
- Dashboard widgets use `Panel`, i18n, locale-aware dates
- Library dropzone keyboard accessible + i18n
- Feedback triage filters with `aria-label` + i18n namespace
- CreditPanel low-balance text + progressbar (not color-only)
