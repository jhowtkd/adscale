import { beforeEach, describe, expect, it, vi } from "vitest";
import { spawnSync } from "node:child_process";

const connectMock = vi.hoisted(() => vi.fn(async () => ({ connectionId: "c1", closed: Promise.resolve() })));
type WorkerClient = { createFunction: (options: unknown, handler: unknown) => unknown };

vi.mock("inngest/connect", () => ({ connect: connectMock }));
vi.mock("./worker-client", () => ({
  imageWorkerInngest: {
    id: "adscale-image-worker",
    createFunction: vi.fn((_opts: unknown, _handler: unknown) => ({
      id: () => (_opts as { id: string }).id,
      opts: _opts,
    })),
  },
}));

vi.mock("./creative-work", () => ({
  createCreativeWorkOutputJobV2: (client: WorkerClient) =>
    client.createFunction({ id: "generate-creative-work-output-v2" }, vi.fn()),
}));
vi.mock("./creative-work-carousel", () => ({
  createCreativeWorkCarouselSlideJobV2: (client: WorkerClient) =>
    client.createFunction({ id: "generate-creative-work-carousel-slide-v2" }, vi.fn()),
}));
vi.mock("./derivation", () => ({
  createDerivationJobV2: (client: WorkerClient) =>
    client.createFunction({ id: "generate-derivation-v2" }, vi.fn()),
}));
vi.mock("./creative-work-source", () => ({
  createCreativeWorkSourceAnalyzeJobV2: (client: WorkerClient) =>
    client.createFunction({ id: "analyze-creative-work-source-v2" }, vi.fn()),
}));
vi.mock("./workspace-asset", () => ({
  createWorkspaceAssetAnalyzeJobV2: (client: WorkerClient) =>
    client.createFunction({ id: "analyze-workspace-asset-v2" }, vi.fn()),
}));
vi.mock("./brand-training", () => ({
  createBrandTrainingAnalyzeJobV2: (client: WorkerClient) =>
    client.createFunction({ id: "analyze-brand-training-asset-v2" }, vi.fn()),
}));
vi.mock("./creative-work-layerization", () => ({
  createCreativeWorkLayerizationJobV2: (client: WorkerClient) =>
    client.createFunction({ id: "layerize-creative-work-output-v2" }, vi.fn()),
}));

import { assertImageWorkerEnv, buildImageWorkerConnectOptions, imageWorkerConnectedPayload } from "./image-worker";
import { REQUIRED_V2_FUNCTION_COUNT } from "./heavy-image-isolation";

const offlineEnv = {
  PATH: process.env.PATH,
  NODE_ENV: "production",
  DATABASE_URL: "postgres://test:test@127.0.0.1:1/offline_test",
  BETTER_AUTH_SECRET: "offline-test-secret-32-characters",
  BETTER_AUTH_URL: "http://localhost:3000",
  OPENAI_API_KEY: "sk-offline-test",
  ANTHROPIC_API_KEY: "offline-test",
  META_MODEL_API_KEY: "offline-test",
  R2_ACCOUNT_ID: "offline-test",
  R2_ACCESS_KEY_ID: "offline-test",
  R2_SECRET_ACCESS_KEY: "offline-test",
  R2_BUCKET: "offline-test",
  R2_PUBLIC_BASE_URL: "http://localhost:3000",
  INNGEST_EVENT_KEY: "offline-test",
  INNGEST_SIGNING_KEY: "offline-test",
  RESEND_API_KEY: "re_offline_test",
  EMAIL_FROM: "test@example.com",
  APP_URL: "http://localhost:3000",
  STRIPE_SECRET_KEY: "sk_test_offline",
  STRIPE_WEBHOOK_SECRET: "whsec_offline_test",
  STRIPE_STARTER_PRICE_ID: "price_offline_test",
  STRIPE_GROWTH_PRICE_ID: "price_offline_test",
  STRIPE_SCALE_PRICE_ID: "price_offline_test",
  STRIPE_SUCCESS_URL: "http://localhost:3000",
  STRIPE_CANCEL_URL: "http://localhost:3000",
};

const blockNetwork = `
  import http from 'node:http';
  import https from 'node:https';
  import net from 'node:net';
  import tls from 'node:tls';
  import { syncBuiltinESMExports } from 'node:module';
  const blocked = () => { throw new Error('worker import attempted network I/O'); };
  globalThis.fetch = blocked;
  http.request = http.get = https.request = https.get = blocked;
  net.connect = net.createConnection = net.Socket.prototype.connect = tls.connect = blocked;
  syncBuiltinESMExports();
`;

describe("image-worker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("registers exactly eight heavy v2 jobs with concurrency 2", () => {
    const options = buildImageWorkerConnectOptions();
    expect(options.appId).toBe("adscale-image-worker");
    expect(options.maxWorkerConcurrency).toBe(2);
    expect(options.functionCount).toBe(REQUIRED_V2_FUNCTION_COUNT);
    expect(options.functionIds).toEqual([
      "generate-creative-work-output-v2",
      "generate-creative-work-carousel-slide-v2",
      "generate-derivation-v2",
      "analyze-creative-work-source-v2",
      "analyze-workspace-asset-v2",
      "analyze-brand-training-asset-v2",
      "layerize-creative-work-output-v2",
      "regenerate-creative-work-layer-v2",
    ]);
  });

  it("requires core env vars", () => {
    expect(() => assertImageWorkerEnv({})).toThrow(/missing required env/);
  });

  it("imports the real production worker graph and registers jobs under react-server without network I/O", () => {
    const result = spawnSync(process.execPath, ["--conditions=react-server", "--import=tsx", "--input-type=module", "--eval", `${blockNetwork}
      const { default: worker } = await import('./src/server/jobs/image-worker.ts');
      const options = worker.buildImageWorkerConnectOptions();
      console.log(JSON.stringify({ appId: options.appId, functionCount: options.functionCount, concurrency: options.maxWorkerConcurrency }));
    `], { cwd: process.cwd(), env: offlineEnv, encoding: "utf8", timeout: 30_000 });
    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('"appId":"adscale-image-worker","functionCount":8,"concurrency":2');
  }, 35_000);

  it("boots the real production entrypoint up to env validation without connecting", () => {
    const result = spawnSync(process.execPath, ["--conditions=react-server", "--import=tsx", "--input-type=module", "--eval", `${blockNetwork}
      await import('./src/server/jobs/image-worker-entry.ts');
    `], { cwd: process.cwd(), env: { ...offlineEnv, R2_BUCKET: "" }, encoding: "utf8", timeout: 30_000 });
    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr).toBe(1);
    expect(result.stderr).toContain("image-worker missing required env: R2_BUCKET");
    expect(result.stderr).not.toContain("worker import attempted network I/O");
  }, 35_000);

  it("identifies the executor process on the connected event", () => {
    expect(imageWorkerConnectedPayload("conn-1")).toEqual(expect.objectContaining({
      event: "image_worker_connected",
      connectionId: "conn-1",
      executorPid: process.pid,
      executorAppId: expect.any(String),
      executorInstance: expect.any(String),
    }));
  });
});
