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

function envValue(block: string, key: string): string | undefined {
  const match = block.match(
    new RegExp(`- key: ${key}\\n(?:        (?:sync|generateValue|fromDatabase):[^\\n]+\\n)*        value: ("[^"]+"|\\S+)`),
  );
  if (!match) return undefined;
  return match[1].replace(/^"|"$/g, "");
}

describe("render.yaml image routing", () => {
  const yaml = renderYaml();
  const web = serviceBlock(yaml, "adscale-app");
  const worker = serviceBlock(yaml, "adscale-image-worker");

  it("emits worker-suffixed heavy events from the web API process", () => {
    expect(envValue(web, "IMAGE_JOB_TARGET")).toBe("worker");
    expect(envValue(web, "IMAGE_ROUTE_CONCURRENCY")).toBe("1");
  });

  it("runs v2 jobs on the dedicated worker with route concurrency 2", () => {
    expect(envValue(worker, "IMAGE_JOB_TARGET")).toBe("worker");
    expect(envValue(worker, "IMAGE_ROUTE_CONCURRENCY")).toBe("2");
  });
});
