# Client Cases Showcase Implementation Plan

> **For agentic workers:** Execute task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Produce the public commercial kit for three authorized client brands (Nike Pegasus 41, Amazon, Burger King) with zero study/demo framing: 24 screens, 6 real selected pieces, derivatives in 16:9/4:5/9:16/web, legal gate before publication.

**Architecture:** Reuse the proven study-cycle machinery (seed, capture, packaging, validator) parameterized by a client-cases manifest; strip every study marker from account, profiles, and screens; record client authorization per brand; paid generation on the existing lab account (teto 4 dispatches/brand, pick 2).

**Tech Stack:** unchanged (Next.js 16, TypeScript, Drizzle, Zod, Vitest, Playwright, Sharp, R2).

**Spec:** `docs/superpowers/specs/2026-08-29-client-cases-showcase-design.md`

## Global Constraints

- Zero "estudo/demo" markers in anything visible: screens, profile names, workspace, user, overlays.
- Client authorization recorded per brand before Brand Training (manifest `authorization` block).
- Paid ceiling: 4 dispatches per brand, pick 2 pieces. Failures refund; no automatic retry.
- Fail-closed evidence kept: asset sha256, provider evidence per piece, ARTIFACTS.json, validator.
- Legal review blocks publication only; this cycle ends at approved derivates + legal handoff.
- Stage only named paths; never `git add .`; `graphify update .` after TS changes.

---

### Task 1: De-study the account and capture mode

**Files:** Modify `app/scripts/capture-ui-screenshots.ts`; DB updates via one-off script.

- [ ] Rename user display name `ADScale Estudos` → `ADScale`; workspace `ADScale — Estudos Editoriais` → `ADScale`.
- [ ] Delete the three `Estudo editorial — *` client profiles (and their works) from the workspace.
- [ ] Add `--client-cases` mode to the capture script: identical to commercial mode minus the disclaimer footer and minus the context header injection.
- [ ] Unit tests pass; typecheck clean; `graphify update .`; commit.

### Task 2: Client-cases manifest, assets, and seed

**Files:** Create `docs/client-cases/{manifest.json,README.md}`; `app/scripts/seed-client-cases.ts`; new lib `app/scripts/lib/client-cases.ts`.

- [ ] Copy assets from `~/Downloads/{Nike,Amazon,Burguer King}` into `docs/client-cases/originals/{nike,amazon,burger-king}/`; sha256 all; gitignore binaries except README.
- [ ] Manifest: three studies with `authorization` blocks (`authorizedBy: cliente`, `commercialUse: true`), briefs, 24 captures (same stage grid, routeKeys reuse).
- [ ] Seed: profiles `Nike — Pegasus 41`, `Amazon`, `Burger King`; Brand Training fed from the client assets (`usageMode: reference`, `reviewStatus: approved`); one study work each (`toolKind: "single"`, `format: "4:5"`) with derived brief; three controlled-UI works each. Idempotent; fail-closed on missing/ hashes.
- [ ] Run seed twice; verify stable counts; commit.

### Task 3: Controlled rehearsal

- [ ] Capture 24/24 in `--client-cases` mode; verify brand profile active, assets visible, zero overlays.
- [ ] Validator: `real_results_pending`.

### Task 4: Paid batches (per spec-approved budget)

- [ ] Nike, Amazon, Burger King: teto 4 dispatches each via API (`action: "initial"`, page-context fetch), pick 2 per brand by visual review; write selections to resolved manifest.
- [ ] Evidence JSONs per piece from DB.

### Task 5: Final capture and packaging

- [ ] Recapture 24/24; package mode → 6 isolated results + ARTIFACTS.json; validate exit 0.
- [ ] Record visual/editorial review approved; legal `pending_publication`.

### Task 6: Derivatives

- [ ] 16:9 presentation (opening + 5 screens per brand), 4:5 carousels, 9:16 stories, web index page linking cases — from approved base only, no regeneration.
- [ ] Commit; hand off legal summary.

## Final Verification

- [ ] Unit tests, typecheck, `graphify update .`
- [ ] Zero "estudo/demo" markers in all visible surfaces (grep screens' injected text, profile names, workspace, user display)
- [ ] 6 real pieces with provider evidence; 24 screens; derivatives complete
