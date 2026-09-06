# Cutover: heavy image jobs → adscale-image-worker

Web `IMAGE_JOB_TARGET=worker` makes API processes emit `*.v2` events. The worker Connect app `adscale-image-worker` is the only consumer of those names.

## Pre-merge (required)

1. In Render, service `adscale-image-worker` is live (not suspended).
2. Worker logs contain `image_worker_connected` after the latest deploy.
3. Inngest dashboard: app `adscale-image-worker` shows the eight v2 functions from `buildImageWorkerConnectOptions` as synced.

If any check fails, do not merge the `render.yaml` change. Revert web `IMAGE_JOB_TARGET` to `web`.

## Post-merge

1. Deploy `adscale-app` and `adscale-image-worker` (same commit).
2. Generate one Peça in a non-prod workspace (or the owner workspace if that is the only live tenant).
3. Inngest: the run is `generate-creative-work-output-v2` on app `adscale-image-worker`, not `generate-creative-work-output` on `adscale`.
4. Render metrics: web RAM should not spike for the image call; worker CPU/RAM should.

## Rollback

Set `adscale-app` `IMAGE_JOB_TARGET` back to `web` and deploy. New sends return to unsuffixed names consumed by `/api/inngest`. In-flight `.v2` runs finish on the worker. Do not delete the worker service during rollback.
