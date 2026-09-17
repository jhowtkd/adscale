import { initializeObservability } from "../diagnostics/observability";

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
 * Inngest client of its own.
 */

async function main(): Promise<void> {
  // Never throws: a telemetry failure must not prevent worker boot.
  await initializeObservability("worker");
  const { startImageWorker } = await import("./image-worker");
  await startImageWorker();
}

main().catch((error: unknown) => {
  console.error("[image-worker-entry] fatal", error);
  process.exit(1);
});
