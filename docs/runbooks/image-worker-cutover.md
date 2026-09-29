# Image jobs: production on web, optional worker cutover

## Current production topology (confirmed 2026-09-29)

Render production is managed in the **dashboard**, without blueprint sync.
`render.yaml` is a reference; changing or merging it does not update production.
The service `adscale-image-worker` **does not exist** in production.
`IMAGE_JOB_TARGET` is unset on `adscale-app`, so `getImageJobTarget()` defaults
to `web`: unsuffixed image events run through `/api/inngest` on the web service.

The worker definition and `IMAGE_JOB_TARGET=worker` in `render.yaml` describe
an optional split topology. They remain as a reference for explicitly
provisioned staging/cutover environments, not as evidence of a running worker.
Do not set the production web target to `worker` before provisioning and
verifying its consumer: `.v2` events have no web consumer.

## Release smoke in isolated staging

`app/scripts/reliability-release-smoke.ts` defaults to the web topology when
`IMAGE_JOB_TARGET` is unset (or `web`). It checks schema/health, correlation,
redelivery/ack and reuse without requiring worker signals or restart hooks.
The report explicitly records **restart não exercitado (sem instrumentação no
web)**; a passing web smoke is not evidence of process restart recovery.

The existing `.github/workflows/reliability-release-smoke.yml` is specifically
for an on-demand **split-worker staging** environment and sets
`IMAGE_JOB_TARGET=worker` explicitly. In that mode the smoke still requires the
worker's own fresh signal, all eight v2 functions, and a new connection ID
after restart. `/api/health` alone never proves worker readiness.

Run only against isolated staging with synthetic data. Real provider calls
retain the smoke's explicit owner-authorization requirement. Neither mode
changes the dashboard-managed production environment.

## Optional cutover to a worker

Only after a separately authorized worker deployment:

1. Provision `adscale-image-worker` in Render and deploy the same commit as web.
2. Confirm worker logs contain `image_worker_connected` after the latest deploy.
3. In Inngest, confirm app `adscale-image-worker` has the eight v2 functions
   from `buildImageWorkerConnectOptions` synced.
4. Set `adscale-app` `IMAGE_JOB_TARGET=worker` in the **dashboard** and deploy.
   This makes API processes emit `*.v2` events consumed by the Connect worker.
5. Generate a synthetic Peça in staging with the controlled provider. In
   Inngest, verify `generate-creative-work-output-v2` runs on
   `adscale-image-worker`; check web and worker CPU/RAM separately.
6. Exercise a carousel and watch rate limits and queue depth. Peça v2
   (`limit: 2`, key `"openai"`) and carousel v2 (`limit: 1`, key
   `"creative-work-image"`) use separate concurrency keys, capped by worker
   `maxWorkerConcurrency: 2`.

If readiness fails, keep the web target unset or `web` in the dashboard.

## Rollback after an actual cutover

Set `adscale-app` `IMAGE_JOB_TARGET` back to `web` (or unset it) in the Render
dashboard and deploy. New sends use unsuffixed events consumed by
`/api/inngest`. In-flight `.v2` runs finish on the worker; keep that service
until they drain. Production already uses web today, so it needs no rollback.
