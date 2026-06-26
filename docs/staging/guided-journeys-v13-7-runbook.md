# Guided Journeys Staging Runbook (v13.7)

**Environment:** staging only  
**Reviewer:** platform owner or designated operator  
**Paths:** `existing_creative` (Já tenho peça) and `from_zero` (Produzir do zero)

## Preconditions

- Staging workspace with at least one client profile
- Real creative asset available for `existing_creative` path (not fixture placeholder)
- At least 3 visual references available for `from_zero` path
- OpenAI/provider credentials configured in staging

## Checklist A — `existing_creative` with real asset

| Step | Check | Pass criteria |
|------|-------|---------------|
| A1 | Start journey | `/assistant` shows both path cards; selecting **Já tenho peça** creates guided flow at `select_creative` |
| A2 | Asset selection | Upload or select real asset; campaign draft links without re-entering extracted briefing |
| A3 | Live diagnosis | Diagnosis returns structured issues and recommended action (not empty/error loop) |
| A4 | Action proposal | Assistant proposes confirmable improvement action with action card |
| A5 | Confirmation | Confirm action succeeds or records provider/live failure as blocker — do not hide failure |

Record verdict per check via staging evidence API or `192-EVIDENCE.json`.

## Checklist B — `from_zero` with 3+ references

| Step | Check | Pass criteria |
|------|-------|---------------|
| B1 | Brief collection | Minimum strategic brief fields collected without validation loop |
| B2 | References | At least 3 references saved; flow advances to `confirm_plan` |
| B3 | Creative plan | Plan/briefing snapshot is actionable for campaign creation |
| B4 | Approval lifecycle | Campaign approval lifecycle observable (draft → confirm) or recorded as inherited tech debt |

## Provider / live failures

- Record as `verdict: tech_debt` or `fail` with `safeNotes` describing blocker category
- Do **not** mark implementation requirements complete based on staging failure alone

## Evidence artifact fields

- `reviewerUserId`, `environment`, `path`, `threadId`, `campaignId` (optional)
- `checkKey`: `diagnosis` | `briefing` | `creative_plan` | `approval_lifecycle`
- `verdict`: `pass` | `fail` | `tech_debt`
- `safeNotes`: max 256 chars, no prompts or signed URLs

## Minimum milestone coverage (STG-03)

1. One complete `existing_creative` journey with real asset (Checklist A)
2. One complete `from_zero` journey with ≥3 references (Checklist B)
