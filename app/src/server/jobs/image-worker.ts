import { connect } from "inngest/connect";
import { pathToFileURL } from "node:url";
import { imageWorkerInngest } from "./worker-client";
import { createCreativeWorkOutputJobV2 } from "./creative-work";
import { createDerivationJobV2 } from "./derivation";
import { createCreativeWorkSourceAnalyzeJobV2 } from "./creative-work-source";
import { createWorkspaceAssetAnalyzeJobV2 } from "./workspace-asset";
import { createBrandTrainingAnalyzeJobV2 } from "./brand-training";
import { createCreativeWorkLayerizationJobV2 } from "./creative-work-layerization";
import { createCreativeWorkLayerRegenerationJobV2 } from "./creative-work-layer-regeneration";

const REQUIRED_ENV = [
  "DATABASE_URL",
  "OPENAI_API_KEY",
  "INNGEST_EVENT_KEY",
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET",
  "R2_PUBLIC_BASE_URL",
] as const;

export function assertImageWorkerEnv(env: NodeJS.ProcessEnv = process.env): void {
  const missing = REQUIRED_ENV.filter((key) => !env[key]?.trim());
  if (missing.length > 0) {
    throw new Error(`image-worker missing required env: ${missing.join(", ")}`);
  }
}

export function buildImageWorkerConnectOptions() {
  const functions = [
    createCreativeWorkOutputJobV2(imageWorkerInngest),
    createDerivationJobV2(imageWorkerInngest),
    createCreativeWorkSourceAnalyzeJobV2(imageWorkerInngest),
    createWorkspaceAssetAnalyzeJobV2(imageWorkerInngest),
    createBrandTrainingAnalyzeJobV2(imageWorkerInngest),
    createCreativeWorkLayerizationJobV2(imageWorkerInngest),
    createCreativeWorkLayerRegenerationJobV2(imageWorkerInngest),
  ];

  return {
    apps: [{ client: imageWorkerInngest, functions }],
    maxWorkerConcurrency: 2 as const,
    appId: imageWorkerInngest.id,
    functionCount: functions.length,
    functionIds: functions.map((fn) => fn.id()),
  };
}

export async function startImageWorker(): Promise<void> {
  assertImageWorkerEnv();

  if (process.env.SENTRY_DSN) {
    try {
      const Sentry = await import("@sentry/nextjs");
      Sentry.init({
        dsn: process.env.SENTRY_DSN,
        tracesSampleRate: 0.1,
        environment: process.env.NODE_ENV,
      });
    } catch (error) {
      console.warn("[image-worker] Sentry init skipped", error);
    }
  }

  const options = buildImageWorkerConnectOptions();
  console.info(
    JSON.stringify({
      event: "image_worker_starting",
      appId: options.appId,
      maxWorkerConcurrency: options.maxWorkerConcurrency,
      functionIds: options.functionIds,
    })
  );

  const connection = await connect({
    apps: options.apps,
    maxWorkerConcurrency: options.maxWorkerConcurrency,
  });

  console.info(
    JSON.stringify({
      event: "image_worker_connected",
      connectionId: connection.connectionId,
    })
  );

  await connection.closed;
}

function isMainModule(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return import.meta.url === pathToFileURL(entry).href;
  } catch {
    return false;
  }
}

if (isMainModule()) {
  startImageWorker().catch((error) => {
    console.error("[image-worker] fatal", error);
    process.exit(1);
  });
}
