import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function renderYaml(): string {
  return readFileSync(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../render.yaml"),
    "utf8",
  );
}

function serviceBlock(yaml: string, serviceName: string): string {
  const blocks = yaml.split(/\n  - type:/).slice(1);
  const block = blocks.find((candidate) =>
    new RegExp(`name:\\s+${serviceName}\\b`).test(candidate),
  );
  if (!block) throw new Error(`render.yaml missing service ${serviceName}`);
  return block;
}

function autoDeployTrigger(block: string): string | undefined {
  return block.match(/autoDeployTrigger:\s+(\S+)/)?.[1];
}

describe("render.yaml deploy checks", () => {
  const yaml = renderYaml();
  const web = serviceBlock(yaml, "adscale-app");
  const worker = serviceBlock(yaml, "adscale-image-worker");

  it("publishes web and worker only after GitHub checks pass", () => {
    expect(autoDeployTrigger(web)).toBe("checksPass");
    expect(autoDeployTrigger(worker)).toBe("checksPass");
  });

  it("keeps constructed intelligence flags off until rollout evidence exists", () => {
    expect(web).toMatch(/CREATIVE_WORK_QUALITY_RECOVERY_ENABLED\n\s+value: "false"/);
    expect(web).toMatch(/BRAND_CORTEX_SINGLE_PIECE_ENABLED\n\s+value: "false"/);
  });

  it("documents intelligence rollback without enabling the flags", () => {
    const runbook = readFileSync(
      path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../docs/runbooks/intelligence-rollout.md"),
      "utf8",
    );
    expect(runbook).toMatch(/Set the env back to `"false"`/);
    expect(runbook).toMatch(/Do not turn a flag on because the implementation exists/);
  });

  it("sets web IMAGE_JOB_TARGET=worker as the event suffix, not in-process image execution", () => {
    expect(web).toMatch(/Controls the event suffix emitted by API inngest.send/);
    expect(web).toMatch(/IMAGE_JOB_TARGET\n\s+value: worker/);
    expect(worker).toMatch(/IMAGE_JOB_TARGET\n\s+value: worker/);
  });
});
