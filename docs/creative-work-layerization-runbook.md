# Creative Work layerization runbook

This capability is an owner-only, post-approval operation on the selected
canonical Piece. It creates private PNG layers, a PSD, and a diagnostic ZIP;
the original Creative Work output is never replaced and no ADScale credit or
generation ledger entry is created.

## Configuration

- `FAL_KEY` is optional and server-only. If absent, the action is disabled.
- The adapter uses the fixed model id
  `bytedance/seedream/v5/pro/edit`, native fal queue REST, safety enabled,
  provider retry disabled, fallback disabled, and a one-hour provider object
  lifecycle. Do not add a fallback model or SDK without reopening #227.
- The queue endpoint is `https://queue.fal.run/bytedance/seedream/v5/pro/edit`;
  the official model page and queue/header documentation are the source of
  truth for schema, price, and headers. On 2026-08-12 the public page listed
  $0.0675 for the base edit request up to 1536 px (plus input-image pricing),
  but did not publish the required layer/bbox response contract.
- Apply migration `0083_creative_work_layerization.sql` before enabling the
  action.
- `IMAGE_JOB_TARGET=web` runs the existing job factory in the web process;
  `IMAGE_JOB_TARGET=worker` routes the same factory to the existing image
  worker. No new worker service is required for this feature.

## Preflight

1. Confirm the deploy has the migration, `FAL_KEY` only in the server secret
   store, and `APP_URL`/`BETTER_AUTH_URL` points at the callback origin.
2. Confirm the owner account is in `PLATFORM_OWNER_EMAILS` (or the existing
   development-owner allowlist).
3. Run `npm run typecheck`, the layerization unit tests, `npm test`, and
   `npm run convergence:gate` plus `graphify update .` from the repository
   root. Keep the gate report separate from dirty unrelated worktree changes.
4. Verify the Inngest function list includes `layerize-creative-work-output`
   in web mode or its `-v2` worker counterpart. Do not paste keys, callback
   tokens, signed URLs, or provider responses into evidence.

## Synthetic smoke

Use fake fal HTTP and an in-memory object store. The smoke must prove:

- one selected Piece claims one attempt under two concurrent requests;
- a provider response with two or more ordered layers produces a readable PSD;
- the ZIP contains only original/layer PNGs, recomposed preview, and a
  secret-free manifest;
- an invalid token, replayed callback, provider error, unsafe URL, clipped
  bbox, or failed fidelity gate changes no unrelated output and cannot cause
  another provider submission.

The MAE/RMSE/PSNR values and provisional gate are pixel diagnostics only; they
are not evidence of semantic quality, typography correctness, or editable
structure. Those claims require separate human/partner validation.

This is synthetic evidence only. It does not prove authenticated acceptance,
production deployment, partner contract approval, or paid generation.

## Three smoke formats

1. **Synthetic contract smoke:** fake provider HTTP, deterministic PNG layers,
   in-memory/private object storage, and no network, credits, or `FAL_KEY`.
2. **Authenticated acceptance smoke:** deployed owner/non-owner requests using
   only synthetic or owned assets; verify authorization, state transitions,
   private PSD/ZIP downloads, and original-output immutability. Record build,
   deploy, and auth evidence separately.
3. **Paid provider smoke:** only after partner schema/price/retention approval,
   with a synthetic or owned asset and explicit economic evidence. This is a
   manual human gate and was not run in this implementation (#235 remains
   `ready-for-human`).

## Current provider gate

As of 2026-08-12, the [public Seedream Pro edit page](https://fal.ai/models/bytedance/seedream/v5/pro/edit) documents image output, not a PSD/layer/bbox response. The adapter therefore rejects that response as `invalid_provider_response`; do not set `FAL_KEY` or run a paid smoke until the partner supplies and approves the exact layer schema, price, headers, and retention terms. The [fal queue protocol](https://fal.ai/docs/documentation/model-apis/inference/queue) and [common request headers](https://fal.ai/docs/documentation/model-apis/common-parameters) are recorded for that review. Record the outcome separately as build, deploy, auth, and paid-generation evidence.
