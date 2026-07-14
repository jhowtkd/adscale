import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";

const script = resolve(dirname(fileURLToPath(import.meta.url)), "check-no-parallel-preview.mjs");

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "adscale-no-preview-"));
  mkdirSync(join(root, "src"), { recursive: true });
  return root;
}

function write(root, path, value) {
  const target = join(root, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, value);
}

function run(root) {
  return spawnSync(process.execPath, [script, "--app-root", root], {
    encoding: "utf8",
  });
}

test("passes without a parallel preview route", () => {
  const root = fixture();
  write(root, "src/components/dashboard/v6/View.tsx", 'export const name = "v6";\n');
  assert.equal(run(root).status, 0);
});

test("rejects files under the retired preview tree", () => {
  const root = fixture();
  write(root, "src/app/(preview)/v6/page.tsx", "export default function Page() {}\n");
  const result = run(root);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /\(preview\)\/v6\/page\.tsx/);
});

test("rejects a literal that recreates a v6 route", () => {
  const root = fixture();
  write(root, "src/components/Nav.tsx", 'export const href = "/v6/campaigns";\n');
  const result = run(root);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /src\/components\/Nav\.tsx/);
});
