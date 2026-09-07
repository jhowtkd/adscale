import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function ciYaml(): string {
  return readFileSync(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../.github/workflows/ci.yml"),
    "utf8",
  );
}

function renderYaml(): string {
  return readFileSync(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../render.yaml"),
    "utf8",
  );
}

describe("CI workflow publish evidence", () => {
  const yaml = ciYaml();

  it("enforces the freeze manifest instead of the bootstrap exception", () => {
    expect(yaml).not.toMatch(/PRIMARY_DESTINATIONS_ALLOW_BOOTSTRAP/);
  });

  it("runs the critical studio journey with deterministic doubles before merge", () => {
    expect(yaml).toMatch(/critical-studio-journey\.spec\.ts/);
    expect(yaml).toMatch(/first-studio-piece\.spec\.ts/);
    expect(yaml).toMatch(/E2E_CONTROLLED_PROVIDER:\s+"true"/);
    expect(yaml).toMatch(/IMAGE_JOB_TARGET:\s+web/);
    expect(yaml).toMatch(/INNGEST_BASE_URL:\s+http:\/\/127\.0\.0\.1:8288/);
    expect(yaml).toMatch(/inngest-cli dev/);
    expect(yaml).toMatch(/seed:create-post-e2e/);
    expect(yaml).toMatch(/STUDIO_PROGRESSIVE_ROLLOUT_PERCENT:\s+"100"/);
    expect(yaml).toMatch(/STUDIO_ENTRY_INTERVIEW_ROLLOUT_PERCENT:\s+"0"/);
  });

  it("rejects empty visual evidence and checks studio carousel and edit layout before merge", () => {
    expect(yaml).toMatch(/check-release-gate\.mjs --preflight/);
    expect(yaml).toMatch(/playwright install --with-deps chromium webkit/);
    expect(yaml).toMatch(/playwright\.release\.config\.ts/);
    expect(yaml).toMatch(/SCN-STUDIO-CAROUSEL\|SCN-STUDIO-EDIT/);
  });

  it("serves e2e object bytes on the same origin so CSP img-src self can load them", () => {
    const nextConfig = readFileSync(
      path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../next.config.ts"),
      "utf8",
    );
    const storage = readFileSync(
      path.resolve(
        path.dirname(fileURLToPath(import.meta.url)),
        "../storage/local-directory-object-storage.ts",
      ),
      "utf8",
    );
    expect(nextConfig).toMatch(/img-src 'self' blob: data: https:/);
    expect(nextConfig).not.toMatch(/e2e-storage:/);
    expect(storage).toMatch(/\/api\/e2e-storage\/\$\{kind\}\//);
  });

  it("keeps the deploy manifesto on checksPass with intelligence flags off until an evidence SHA exists", () => {
    const manifest = renderYaml();
    expect(manifest).toMatch(/name:\s+adscale-app[\s\S]*?autoDeployTrigger:\s+checksPass/);
    expect(manifest).toMatch(/name:\s+adscale-image-worker[\s\S]*?autoDeployTrigger:\s+checksPass/);
    expect(manifest).toMatch(/CREATIVE_WORK_QUALITY_RECOVERY_ENABLED\s*\n\s*value:\s+"false"/);
    expect(manifest).toMatch(/BRAND_CORTEX_SINGLE_PIECE_ENABLED\s*\n\s*value:\s+"false"/);
    expect(manifest).not.toMatch(/E2E_CONTROLLED_PROVIDER/);
  });
});
