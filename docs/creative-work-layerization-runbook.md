# Runbook de separação do Trabalho em camadas

Esta capacidade é exclusiva do **Dono da plataforma** e só opera sobre a Peça canônica
selecionada após aprovação. Ela cria camadas PNG privadas e um PSD; o ZIP de
diagnóstico é materializado somente quando solicitado. A saída original do Trabalho nunca é substituída e nenhum crédito
ou lançamento de geração do ADScale é criado.

## Configuration

- `ATLASCLOUD_API_KEY` is optional and server-only. If absent, the action is disabled.
- The adapter uses the fixed model id
  `bytedance/seedream-v5.0-pro/layer-decomposition` through Atlas Cloud's
  asynchronous image API. It submits `image`, `size: "1K"`, and PNG output,
  then polls `/api/v1/model/prediction/{id}`. Do not add a fallback model or
  SDK without reopening #227.
- The queue endpoint is
  `https://api.atlascloud.ai/api/v1/model/generateImage`; authentication uses
  `Authorization: Bearer ...`. The result is returned under `data`, with
  aligned `outputs` and `layers` arrays. The adapter accepts only the
  documented `z_index`, `bounding_box`, name, description, and PNG URL contract.
- The source URL sent to Atlas is signed for 2h15, covering the two-hour
  reconciliation deadline plus margin. Layer responses stream through bounded
  temporary files into private object storage; the job does not retain every
  compressed PNG.
- The provisional estimate is $0.1575 per request, from the 2026-08-17 paid
  smoke invoice. The catalog list price of $0.022 per image was stale. Recheck
  the Atlas invoice immediately before another paid smoke.
- Apply migration `0083_creative_work_layerization.sql` before enabling the
  action.
- `IMAGE_JOB_TARGET=web` runs the existing job factory in the web process;
  `IMAGE_JOB_TARGET=worker` routes the same factory to the existing image
  worker. No new worker service is required for this feature.

## Preflight

1. Confirm the deploy has the migration, `ATLASCLOUD_API_KEY` only in the server secret
   store, and `APP_URL`/`BETTER_AUTH_URL` points at the callback origin.
2. Confirm the Dono da plataforma account is in `PLATFORM_OWNER_EMAILS` (or the existing
   development allowlist).
3. Run `npm run typecheck`, the layerization unit tests, `npm test`, and
   `npm run convergence:gate` plus `graphify update .` from the repository
   root. Keep the gate report separate from dirty unrelated worktree changes.
4. Verify the Inngest function list includes `layerize-creative-work-output`
   in web mode or its `-v2` worker counterpart. Do not paste keys, callback
   tokens, signed URLs, or provider responses into evidence.

## Recovery

- Recovery is read-triggered: a detail read by the Dono da plataforma asks the canonical application service to claim expired callback attempts or a stale five-minute `finalizing` lease.
- An attempt without a persisted provider request id becomes `submission_unknown`; it is never submitted again automatically.
- A known provider request keeps reconciling after the callback deadline until fal returns an explicit terminal failure or a valid result. A stale `finalizing` lease returns to `reconciling` and rewrites only deterministic private artifact keys.
- If recovery event dispatch fails, a compare-and-set releases only that attempt's five-minute lease. The next authorized detail read can retry immediately; duplicate events cannot create another paid submission because the provider request id is already durable.

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
   in-memory/private object storage, no real Atlas credential or external network, and only a fake `ATLASCLOUD_API_KEY` value to enable the guarded action in-process.
2. **Authenticated acceptance smoke:** deployed Dono da plataforma and ordinary-user requests using
   only synthetic or owned assets; verify authorization, state transitions,
   private PSD/ZIP downloads, and original-output immutability. Record build,
   deploy, and auth evidence separately.
3. **Paid provider smoke:** only after partner schema/price/retention approval,
   with a synthetic or owned asset and explicit economic evidence. This is a
   manual human gate and was not run in this implementation (#235 remains
   `ready-for-human`).

## Current provider gate

The [Atlas Seedream model page](https://www.atlascloud.ai/models/seedream-5.0-pro) and [Atlas Predictions API](https://www.atlascloud.ai/docs/en/predictions) are the source of truth for the current layer and polling contract. Use only synthetic or ADScale-owned assets until the provider review explicitly approves real client brand assets. Do not run a paid smoke without that approval and explicit authorization for the cost. Record build, deploy, authentication, paid-generation, and human-approval evidence separately.

## Local validation evidence — 2026-08-12

The retained command output, exit codes, and tested revision are recorded in
[`docs/evidence/creative-work-layerization-local-validation-2026-08-12.md`](evidence/creative-work-layerization-local-validation-2026-08-12.md).
The tracer keeps HTTP authorization, application services, repositories,
Postgres, the job handler wiring, private storage, PSD readback, ZIP
materialization, callback/polling race, terminal-claim concurrency, recovery
dispatch lease, and `finalizing` resumption real. Only fal HTTP, authentication,
the Inngest event transport, and object storage are boundary fakes; the job
handler is invoked in-process. This does not prove deployment, paid generation,
production authentication, partner approval, or semantic layer quality.
