# Source of truth for agents

Do not treat every markdown file in this repository as the live product.

| Class | Meaning | Use |
| --- | --- | --- |
| **canonical** | Current product, glossary, and accepted trade-offs | Implement against these |
| **historical** | Once true or still shipped as frozen/legacy adapters | Read to understand leftovers; do not expand |
| **proposal** | Plans, ICE, research, phase folders | Execute only after CONTEXT or an ADR absorbs the change |

## Canonical

- `CONTEXT.md` — product vocabulary (Trabalho, Peça, Protocolo, Estúdio)
- `docs/adr/` — accepted decisions, including [0013](../adr/0013-trabalho-criativo-first.md) (Trabalho-first; Campaign is optional grouping)
- `docs/agents/` — how agents use GitHub, labels, and this file
- `docs/decisions/allowed-primary-destinations.json` — freeze of primary surfaces (Gate 8 close does not lift it)
- `docs/decisions/2026-09-12-funnel-read-gate8-holds.md` — `campaign.completed` is not go-evidence; exceptions need a Trabalho-scoped funnel
- `docs/decisions/2026-09-12-estudio-atual-nao-observado.md` — Gate 8's one completed human journey is Create Post (2026-07-16), not current Estúdio
- `app/src/server/ai/FROZEN.md` — Landing Page and Persona Simulation stay frozen

## Historical (do not implement as if this were the spine)

- Root `README.md` and `docs/ARCHITECTURE.md` still describe a **campaign / briefing / creative plan / cockpit** journey as a **legacy adapter**. README now leads with Estúdio; Campaign is optional grouping. The live operator surface is the **Estúdio** (`creative_work`).
- Plans under `docs/plans/2026-05-23-persona-simulator*` and any issue that asks to unfreeze Persona Simulation or Landing Page.
- Copy that names **Quick Tools / Criar Post** as a separate product. Studio is the name; `quick_tool` is a historical origin alias.
- Phase 8 human corpus (P01/P02, including `N01-after-attempt-2`) is a diagnostic of the July 2026 campaign / Criar Post journey. It does not validate current Estúdio. Agent smoke, E2E, and client cases are not human journeys.

## Proposal

- `docs/plans/`, `docs/superpowers/plans/`, `.planning/`, ICE spreadsheets, canvases.
- A checked box in a plan is not proof the code shipped. Prefer tests, `render.yaml`, and GitHub checks.

## GitHub issues

Issues are a queue, not the domain glossary. If an issue contradicts CONTEXT or an ADR, follow the canonical docs and label the issue `needs-triage` or close it as stale.

Open queue classified on 6 Sep 2026 (`OPEN_ISSUE_RECONCILIATION`):

| Issue | Class | Note |
| --- | --- | --- |
| [171](https://github.com/jhowtkd/adscale/issues/171) | canonical | Wayfinder map for brand-recognizable Peça Única |
| [174](https://github.com/jhowtkd/adscale/issues/174) | proposal | PreceptorIA baseline; do not treat as live spine |
| [177](https://github.com/jhowtkd/adscale/issues/177) | proposal | Deterministic measurement slice |
| [183](https://github.com/jhowtkd/adscale/issues/183) | proposal | Vision layer over 177 |
| [193](https://github.com/jhowtkd/adscale/issues/193) | canonical | Inferred briefing spec; children 194–199 closed; remaining is evidence |
| [227](https://github.com/jhowtkd/adscale/issues/227) | proposal | PSD export — feature, not ICE M01–M10 |

Closed campaign-settlement tickets (86, 91, 93, 126) are historical adapters. They do not restore Campaign as the primary destination.

Machine-readable classifier: `app/src/server/docs/document-class.ts`.
