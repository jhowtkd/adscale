# Guest import measurement

Short-lived note for the public-studio-home rollout (#445, plan Tarefa 8).
Public guest events stay on the `onEvent` callback until an approved collector
with consent exists; nothing public is sent to `/api/analytics/events`.

## No reliable visitor denominator (yet)

Without a public collector there is no trustworthy count of visitors. Do NOT
publish visitor→sale percentages inferred from local clicks or callback
invocations. The allowlisted public payload (intent, catalog exampleId,
referenceCount 0–3, preview flag) deliberately excludes request text, file
names/bytes, emails, and URLs.

## What to measure initially

- Verified imports: `guest_draft_imported` rows (authenticated channel,
  emitted only after `verified`, server-validated work ownership).
- Failures and retries: blocked/partial outcomes by code (client-side, from
  support reports until a collector exists).
- Progression of imported works: canonical Studio events for works whose
  `draftKey` matches a guest draft UUID.

## Counting rule

Count conversion by distinct `creativeWorkId`, never by event deliveries:
retries and reloads may repeat the `guest_draft_imported` delivery (plus the
client's 5s dedupe), but they never create another work. The `recovered` flag
marks deliveries that resumed a previous attempt rather than a fresh creation.
