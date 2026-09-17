/**
 * Worker entrypoint (trace-388).
 *
 * Boots AI-tracing instrumentation BEFORE dynamically importing the image
 * worker, so modules that require early init (Sentry, Inngest clients,
 * providers) load after observability is ready. The worker module itself
 * is untouched: Inngest app id (`adscale-image-worker`), function IDs,
 * concurrency and env contract stay exactly as they were.
 *
 * This file is the worker startCommand (render.yaml). It constructs no
 * Inngest client of its own. A telemetry bootstrap failure degrades to a
 * one-line stderr note and the worker boots anyway.
 */

async function bootObservability(): Promise<void> {
  try {
    const { initializeObservability } = await import(
      "../diagnostics/observability"
    );
    await initializeObservability("worker");
  } catch {
    console.error(
      "[image-worker-entry] observability bootstrap skipped; worker unaffected",
    );
  }
}

async function main(): Promise<void> {
  await bootObservability();
  const { startImageWorker } = await import("./image-worker");
  await startImageWorker();
}

main().catch((error: unknown) => {
  console.error("[image-worker-entry] fatal", error);
  process.exit(1);
});
