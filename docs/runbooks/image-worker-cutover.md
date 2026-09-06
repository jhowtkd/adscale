# Cutover: heavy image jobs → adscale-image-worker

Web `IMAGE_JOB_TARGET=worker` makes API processes emit `*.v2` events. The worker Connect app `adscale-image-worker` is the only consumer of those names.

## Pre-merge (required)

1. In Render, service `adscale-image-worker` is live (not suspended).
2. Worker logs contain `image_worker_connected` after the latest deploy.
3. Inngest dashboard: app `adscale-image-worker` shows the eight v2 functions from `buildImageWorkerConnectOptions` as synced.

If any check fails, do not merge the `render.yaml` change. Revert web `IMAGE_JOB_TARGET` to `web`.

**Env override trap:** A manual Render dashboard env override on `adscale-app` for `IMAGE_JOB_TARGET` shadows the blueprint value in `render.yaml`. If the web process is still emitting unsuffixed events after deploy, check the dashboard env before assuming the worker is broken.

## Post-merge

1. Deploy `adscale-app` and `adscale-image-worker` (same commit).
2. Generate one Peça in a non-prod workspace (or the owner workspace if that is the only live tenant).
3. Inngest: the run is `generate-creative-work-output-v2` on app `adscale-image-worker`, not `generate-creative-work-output` on `adscale`.
4. Render metrics: web RAM should not spike for the image call; worker CPU/RAM should.
5. Generate one carousel and watch OpenAI rate limits and worker saturation. After cutover, Peça v2 (`limit: 2`, key `"openai"`) and carousel v2 (`limit: 1`, key `"creative-work-image"`) no longer share one account-wide serial key. Effective account image concurrency can rise from 1 to 3, capped by worker `maxWorkerConcurrency: 2`. This is expected (the plan forbade changing v2 concurrency) but must be watched on the first carousel run—check for OpenAI 429s and worker queue depth.

## Rollback

Set `adscale-app` `IMAGE_JOB_TARGET` back to `web` and deploy. New sends return to unsuffixed names consumed by `/api/inngest`. In-flight `.v2` runs finish on the worker. Do not delete the worker service during rollback.
