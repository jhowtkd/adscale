import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * ICE-02A runtime pin. Web and worker must run one approved combination:
 * - Node 22: the worker connects over Inngest Connect (workerThread strategy),
 *   which needs a global WebSocket — absent on Node 20 (the worker dies with
 *   "WebSockets not supported in current environment") and stable on 22. An
 *   --experimental-websocket flag on 20 was rejected: experimental transports
 *   do not belong in production. The reliability smoke workflow already ran 22.
 * - inngest SDK major 4 and inngest-cli major 1, resolved from the lockfile.
 *   inngest-cli declares engines node 24.13.0, but that field is advisory and
 *   the CLI demonstrably runs on 20/22 — keep 22 until a proven failure says
 *   otherwise, and record the change here.
 */
const PINNED_NODE_MAJOR = "22";
const PINNED_INNGEST_MAJOR = "4";
const PINNED_INNGEST_CLI_MAJOR = "1";

const jobsDir = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(jobsDir, "../../..");
const repoDir = path.resolve(jobsDir, "../../../..");

function readAppFile(name: string): string {
  return readFileSync(path.join(appDir, name), "utf8");
}

describe("pinned worker-journey runtime", () => {
  it("pins Node 22 in .nvmrc and package engines", () => {
    expect(readAppFile(".nvmrc").trim().replace(/^v/, "").split(".")[0]).toBe(
      PINNED_NODE_MAJOR,
    );
    const pkg = JSON.parse(readAppFile("package.json")) as {
      engines?: { node?: string };
    };
    expect(pkg.engines?.node?.replace(/[^0-9]/g, "").startsWith(PINNED_NODE_MAJOR)).toBe(true);
  });

  it("runs CI on the pinned Node major and nothing else", () => {
    const yaml = readFileSync(path.join(repoDir, ".github/workflows/ci.yml"), "utf8");
    const pins = [...yaml.matchAll(/node-version:\s*["']?(\d+)/g)].map((m) => m[1]);
    expect(pins.length).toBeGreaterThan(0);
    expect(pins.every((major) => major === PINNED_NODE_MAJOR)).toBe(true);
    const smoke = readFileSync(
      path.join(repoDir, ".github/workflows/reliability-release-smoke.yml"),
      "utf8",
    );
    const smokePin = smoke.match(/NODE_VERSION:\s*"(\d+)"/)?.[1];
    expect(smokePin).toBe(PINNED_NODE_MAJOR);
  });

  it("builds the self-host image on the pinned Node major", () => {
    const dockerfile = readAppFile("Dockerfile");
    const bases = [...dockerfile.matchAll(/FROM node:(\d+)-alpine/g)].map((m) => m[1]);
    expect(bases.length).toBeGreaterThan(0);
    expect(bases.every((major) => major === PINNED_NODE_MAJOR)).toBe(true);
  });

  it("resolves the approved Inngest SDK majors from the lockfile", () => {
    const lock = JSON.parse(readAppFile("package-lock.json")) as {
      packages: Record<string, { version?: string }>;
    };
    expect(lock.packages["node_modules/inngest"]?.version?.split(".")[0]).toBe(
      PINNED_INNGEST_MAJOR,
    );
    expect(lock.packages["node_modules/inngest-cli"]?.version?.split(".")[0]).toBe(
      PINNED_INNGEST_CLI_MAJOR,
    );
  });
});
