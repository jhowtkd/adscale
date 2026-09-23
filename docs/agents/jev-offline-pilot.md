# Jev offline pilot: explicit authorization

The fixture command stays local and controlled: `cd app && pnpm jev:offline`.
`pnpm jev:offline --mode hash` prints the SHA-256 for the built-in synthetic corpus. An external corpus can be supplied with `--input corpus.json`, containing `{ "origin": "synthetic", "cases": [...] }`.

The Jev mode requires a separate approval record, a TypeSafe API key for calls, an explicit call cap, an authorized `DATABASE_URL` for the existing diagnostic journal, and a new private manifest directory:

```sh
TYPESAFE_API_KEY=... pnpm jev:offline --mode jev \
  --authorization approval.json --max-calls 1 --manifest-dir /private/path/new-run
```

The approval JSON must contain a resolvable HTTPS `reference` to the recorded human approval, `authorizedBy`, ISO `approvedAt` and `expiresAt` (at most 14 days apart), `provider: "typesafe"`, `purpose: "offline_jev_semantic_review"`, `corpusSha256` matching `--mode hash`, `syntheticOnly: true`, `spendApproved: true`, and `maxCalls` from 1 to 100. The command refuses an absent key while calls can still be sent, or a mismatched approval. The operator must verify that the linked approval actually names this corpus, purpose, provider and spend ceiling; URL syntax alone cannot prove a human decision. No real call is part of CI.

After interruption, use the same arguments with `--resume`. An attempt with no terminal record becomes `outcome_unknown` and consumes its call slot; it is never resent. A resume does not require the TypeSafe key when approval has expired, every call slot is consumed, or no unstarted eligible case remains. No further calls are sent in those cases. A leftover `.lock` after a process crash requires the operator to verify that no run is active before removing only that lock file. The manifest contains hashes, timestamps, decisions, usage if returned, and status, but no source text, raw provider response or credential. The CLI report includes calibration and holdout agreement and confusion matrices for completed provider decisions; the denominators show how many cases were evaluated in each split.

Each authorized call emits `operation.*` and `model.call.*` metadata to the existing journal with `operationKind=semantic_review`, synthetic origin, and no stage or text. The CLI flushes the journal on exit; diagnostic delivery remains best effort and never changes the manifest result.

## API contract checked 2026-09-22

[TypeSafe OpenAPI](https://api.typesafe.ai/openapi.json) defines `POST /v1/systemone` with Bearer auth and `{ state, model, questions }`. A choice question has `type`, `criteria`, and optional `instructions`; a choice answer has `choice`, `confidence`, `probabilities`, and `type`. The response has `model`, `answers`, and `usage` with integer input/output token counts. The published schema marks `usage` required; the adapter preserves an absent field as `null` rather than inventing zero. The public schema does not list account-specific model availability: authenticated `GET /v1/models` would be needed to confirm `jev-1.13.0` for this account before any real run. The adapter pins that exact version and rejects another returned model.
