# Public Studio Home — QA evidence (S8)

Branch `feat/public-studio-home`. Tested SHAs: `b6f3b7dd` (round 1) and
`0a60036b` (round 2: draftKey recovery, ISO attach stamp, batch-2 specs).
Build: `npm run build` + `next start` on :3100 with
`BETTER_AUTH_URL/APP_URL=http://localhost:3100`, `E2E_DISABLE_RATE_LIMIT=true`.
Browsers: Playwright 1.60 Chromium + WebKit 26.4. Flags per phase below.
Identities are synthetic (`visual-foundations@`, `guest-no-brand@`, `lote-*.png`);
no private data in this file.

## Suite totals (production build)

- `guest-home-chromium`: 35 passed (public 10, storage 11, auth 5, import 9).
- `guest-home-webkit`: 19 passed, 2 skipped (CDP quota + persistent profile are Chromium-only).
- Collection proven before execution (`--list`): 35 + 21 collected; `guest-home-flags.spec.ts`
  (4 tests) skips without `GUEST_FLAGS_PHASE` and ran once per flag phase below.
- Unit/integration: guest-home suites, beta-analytics, creative-work route (45),
  login (3), typecheck, eslint on touched files, `convergence:gate`, `convergence:test`.

## Matrix

Legend: E2E = real browser + production build + native storage; UNIT = committed test.

| ID | Result | Evidence |
|----|--------|----------|
| R01 | passed | `HOME=false`: `/hi` 200 + `data-public-home-mode="fallback"`; `/hi/` 308 → `/hi` (no loop); `/manual` `/privacy` `/terms` `/adscale-guest/logo.svg` `/hi/assets/*.css` 200; zero external refs in fallback HTML. |
| R02 | passed | All specs run against interactive `/hi` on the app build (no mocks for UI/storage). |
| R03 | passed | Runtime: `HOME=true IMPORT=false` → `/hi` 500 + `public_studio_import_required`; unit `public-studio-config.test.ts`. |
| R04 | passed | curl 200s above; suites load real `/adscale-guest/*` assets; legacy alias serves local bundle. |
| P01 | passed | E2E public: h1/labels/buttons render; no login wall. |
| P02 | passed | E2E: zero requests to `/api/(client-profiles\|creative-work\|campaigns\|billing)` during visit. |
| P03 | passed | E2E: empty-form example fills without dialog. |
| P04 | passed | E2E: written request → replace-confirm → keep-mine preserves text. |
| P05 | passed | E2E: HTML shown as text, no execution; UNIT `guest-core.test.ts` empty/4000-char limits. |
| P06 | passed | UNIT controller destroy/cleanup; suites navigate/close contexts without double-nav. |
| S01 | passed | E2E: IDB commit read back before navigation; resume restores text + refs. |
| S02 | passed | E2E: CDP quota override → `#ag-dialog-error` honest message + retry button, field preserved, no navigation; `indexedDB=undefined` → page renders, zero pageerrors, no fake success. |
| S03 | passed | E2E: retry keeps UUID and original `expiresAt` (store preserves TTL on re-save). |
| S04 | passed | E2E: edit creates second UUID; both snapshots readable. |
| S05 | passed | E2E: v1 DB (drafts only) → reload upgrades to v2 (`importReceipts` exists), record preserved, resume works. |
| S06 | passed | E2E: second tab same context resumes snapshot. |
| S07 | passed | E2E: fresh profile → banner hidden, `readGuestDraft` null (honest unavailable). |
| S08 | passed | E2E: expired snapshot refused, banner hidden, no renewal. |
| S09 | blocked | `onblocked` message path (`Feche outras abas…`) exists in `guest-store.mjs` but has no browser proof. Blocks A until proven. |
| A01 | passed | E2E: `/hi` → login → entry keeps same `guestDraft`; text visible. |
| A02 | passed | E2E: login → signup link preserves `callbackUrl` with `guestDraft`. |
| A03 | blocked | Signup→verify→entry needs mail delivery infra. Blocks A. |
| A04 | blocked | Unverified-login guidance needs mail infra. Blocks A. |
| A05 | blocked | Magic-link same-device flow needs mail infra. Blocks A. |
| A06 | blocked | Expired-link recovery needs mail infra. Blocks A. |
| A07 | passed | E2E: valid session on `/login?callbackUrl=/hi` → 307 → `/hi`. |
| A08 | passed | E2E: forged cookie → login renders, real login succeeds, no loop. |
| A09 | passed | E2E: `https://evil.test` callback → safe internal destination, never navigates out. |
| W01 | passed | E2E: brandless seed user → no-brand state → real brand creation via dialog → confirm → `workId`; text preserved throughout. |
| W02 | passed | UNIT entry single-brand display; multi-brand E2E covers selection (W03). |
| W03 | passed | E2E: explicit `VF Example Brand Kit` choice required and honored; no auto-pick. |
| W04 | passed | UNIT context-change cancellation (`contextChanged`). |
| W05 | passed | E2E: `guestDraft` + `workId` → conflict screen with both links. |
| W06 | passed | Existing dashboard suites cover plain `/` (no guest params). |
| I01 | passed | E2E: confirm → `workId` navigation; UNIT verified path. |
| I02 | passed | E2E: dblclick → ≤1 create POST; UNIT ref guard single import. |
| I03 | passed | E2E: 500-after-commit → in-attempt draftKey recovery → same `workId`, 1 POST; reload+confirm lands same work. UNIT `import-text` ×3 + hook ×2 + route `draftByKey` ×3. |
| I04 | passed | UNIT `existing_changed` opens committed/current work. |
| I05 | passed | UNIT recovery with diverged brand → `context_mismatch`, never adopts. |
| I06 | passed | UNIT receipt/lease failure containment. |
| I07 | passed | E2E: mount + brand select → zero `/api/creative-work` mutations. |
| I08 | passed | E2E: import fires no `/generate`, `/copy`, `#prepare`, `/checkout`, `/trial`. |
| F01 | passed | E2E: files stay local; zero API POSTs before confirm. |
| F02 | passed | E2E: 4th file rejected, 3 valid kept. |
| F03 | passed | UNIT `hasFileBytes`/type/size validation (`guest-core.test.ts`). |
| F04 | passed | E2E: 3-file batch, 2nd attach 500 → `Faltam 2` + retry → verified; uploads 3, attaches 4 (no repeats). Sandbox note: bytes hop + source rows simulated (no R2/Inngest egress); serial order, checkpoints, partial, resume, counts run natively. |
| F05 | passed | UNIT lost-response re-read without re-attach (`import-references`). |
| F06 | passed | UNIT uncertain-upload explicit retry. |
| F07 | passed | UNIT canonical-review re-read before retry. |
| F08 | passed | UNIT + hook `attachments_disabled`; exercised E2E in D03 (explicit text-only). |
| F09 | passed | Flags phase `off` (persistent profile): frozen banner note, no file input, files + text restored. |
| F10 | passed | E2E: `launchPersistentContext` close/reopen resumes text (Chromium; skipped WebKit). |
| V01 | passed | E2E: 360–1920px, no horizontal overflow, CTA visible. |
| V02 | passed | E2E: Tab/Option+Tab reaches CTA, Enter opens, Escape closes with focus return; 200% zoom + reduced motion keep primary action. |
| V03 | blocked-manual | Automated axe (wcag2a/aa) zero critical/serious on Chromium + WebKit; fixed one real `aria-label`-without-role. Screen-reader manual review still pending (human gate). |
| V04 | passed | E2E: cookie banner dismissed; center-CTA hit-test passes at 390px. |
| V05 | blocked-owner | `asset-manifest.json` (7 records) + `check-public-home-assets` preview pass; release check fails by design until the owner fills `approvedBy`/`approvedAt` (never invented). |
| T01 | passed | UNIT hostile-input payload (S7). |
| T02 | passed | UNIT 401 + route auth test (S7). |
| T03 | passed | E2E: analytics route aborted → import still verifies. |
| T04 | passed | UNIT per-work dedupe + `aggregateGuestImports` distinct count (S7). |
| D01 | passed | Real outputs this session: typecheck, eslint (touched files), vitest suites, `next build`, `convergence:gate`, `convergence:test`. |
| D02 | passed | `--list` before runs (35 + 21); flags spec gated and run per phase. |
| D03 | passed | Flags phase `rollback` (`HOME=false`): fallback on `/hi`; pending draft completes via explicit text-only → `workId`. |
| D04 | passed | Flags phase `contain` (all false): entry shows recovery (copy/discard); zero `/api/creative-work` mutations; nothing deleted. |
| H01 | blocked | Needs Render deploy (S9). |
| H02 | passed | Static: no `MARKETING_UPSTREAM*` in code; no external hosts in guest config/route. |
| H03 | blocked | Render env matrix proof (S9). |
| H04 | passed | `/hi/assets/*` serves the local bundle (curl 200); alias target verified by asset check. |
| H05 | blocked | Production origin + preview Domain Allowlist (S9). |
| H06 | blocked | Production named deploys by SHA (S9); local SHAs recorded above. |
| H07 | blocked | Production log/observability evidence (S9). |
| H08 | blocked | Production activation evidence (S9). |
| H09 | blocked | Production deactivation evidence (S9). |
| H10 | blocked | Production rollback evidence (S9). |

## Fixes found by real E2E (all committed)

- Post-login `router.push` + `router.refresh()` dropped navigation in production → hard
  navigation after sign-in (`LoginContent.tsx`).
- `#ag-files` had `aria-label` without role (axe serious) → `role="group"`.
- Re-save renewed TTL → store preserves original validity (S03).
- Double-click raced past state guard → ref guard in entry.
- Lost-response-after-commit had no recovery → `GET view=draftByKey` + client fallback (I03).
- Attach sent `String(Date)` as `expectedUpdatedAt` → server 400 → ISO stamp.

## Activation impact

- Activation A: blocked by S09, A03–A06, V03-manual, V05-owner, H-series.
- Activation B: additionally gated on production R2/Inngest attach validation (sandbox lacks egress).
