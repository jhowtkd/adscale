# Runbook de separação do Trabalho em camadas

Esta capacidade é exclusiva do owner e só opera sobre a Peça canônica
selecionada após aprovação. Ela cria camadas PNG privadas e um PSD; o ZIP de
diagnóstico é materializado somente quando solicitado. A saída original do Trabalho nunca é substituída e nenhum crédito
ou lançamento de geração do ADScale é criado.

## Configuration

- `FAL_KEY` is optional and server-only. If absent, the action is disabled.
- The adapter uses the fixed model id
  `bytedance/seedream/v5/pro/layerize`, native fal queue REST, safety enabled,
  provider retry disabled, fallback disabled, and a one-hour provider object
  lifecycle. Do not add a fallback model or SDK without reopening #227.
- The queue endpoint is
  `https://queue.fal.run/bytedance/seedream/v5/pro/layerize`; the request uses
  singular `image_url`, and the result is fetched from
  `/requests/{request_id}`. The adapter accepts only the documented `layers`,
  `z_index`, and `bounding_box` contract.
- The source URL sent to fal is signed for 2h15, covering the two-hour callback
  deadline plus margin; `X-Fal-Request-Timeout: 7200` prevents a queued request
  from starting after that deadline. Layer responses stream through bounded temporary files
  into private object storage; the job does not retain every compressed PNG.
- On 2026-08-12 the public page listed $0.03375 per generated layer when the
  generated base area is at most 1536x1536 pixels, and $0.0675 per layer above
  that threshold. Recheck the model page immediately before a paid smoke.
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

- one selected Peça claims one attempt under two concurrent requests;
- a provider response with two or more ordered layers produces a readable PSD;
- requesting the diagnostic ZIP materializes it on demand and it contains only original/layer PNGs, recomposed preview, and a
  secret-free manifest;
- an invalid token, replayed callback, provider error, unsafe URL, clipped
  bbox, or failed fidelity gate changes no unrelated output and cannot cause
  another provider submission.

The persisted latency, dimensions, layer count, MAE/RMSE/PSNR values and provisional gate are operational diagnostics only; they
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

As of 2026-08-12, the [public Seedream Layerize page](https://fal.ai/models/bytedance/seedream/v5/pro/layerize/api) publishes the layer and bounding-box contract implemented by the adapter. The endpoint is still marked `Partner`: use only synthetic or ADScale-owned assets until the contractual review explicitly approves real client brand assets. Do not run a paid smoke without that approval and explicit authorization for the cost. The [fal queue protocol](https://fal.ai/docs/documentation/model-apis/inference/queue) and [platform headers](https://fal.ai/docs/documentation/model-apis/common-parameters) remain the source of truth. Record build, deploy, authentication, paid-generation, and human-approval evidence separately.

## Local validation log — 2026-08-12

- `npm run test:db:setup`: PostgreSQL 16 test container started and all
  migrations, including `0083_creative_work_layerization.sql`, applied.
- `DATABASE_URL=postgres://test:test@localhost:5433/adscale_test TEST_DATABASE_URL=postgres://test:test@localhost:5433/adscale_test npm test -- --run tests/integration/creative-work-layerization-journey.test.ts`:
  1 file and 1 test passed. The tracer covered idempotent PATCH, callback replay
  and callback/reconciliation race, real repository persistence, expired
  recovery with and without provider request id, private PSD readback, and
  on-demand ZIP contents.
- This was synthetic, local evidence. No fal request, paid generation, deploy,
  push, authenticated production acceptance, or partner approval occurred.
