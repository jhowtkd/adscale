import { beforeEach, describe, expect, it, vi } from "vitest";

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

import { assertImageWorkerEnv, buildImageWorkerConnectOptions } from "./image-worker";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

describe("image-worker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("registers exactly five heavy v2 jobs with concurrency 2", () => {
    const options = buildImageWorkerConnectOptions();
    expect(options.appId).toBe("adscale-image-worker");
    expect(options.maxWorkerConcurrency).toBe(2);
    expect(options.functionCount).toBe(5);
    expect(options.functionIds).toEqual([
      "generate-creative-work-output-v2",
      "generate-derivation-v2",
      "analyze-creative-work-source-v2",
      "analyze-workspace-asset-v2",
      "analyze-brand-training-asset-v2",
    ]);
  });

  it("requires core env vars", () => {
    expect(() => assertImageWorkerEnv({})).toThrow(/missing required env/);
  });

  it("does not import next/navigation or session in the worker entrypoint source", () => {
    const source = readFileSync(
      path.join(path.dirname(fileURLToPath(import.meta.url)), "image-worker.ts"),
      "utf8"
    );
    expect(source).not.toMatch(/next\/navigation/);
    expect(source).not.toMatch(/auth\/session/);
  });
});
