import { cp, access, readdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const appRoot = join(__dirname, "..");
const standaloneRoot = join(appRoot, ".next", "standalone");
const staticSrc = join(appRoot, ".next", "static");
const staticDst = join(standaloneRoot, ".next", "static");
const publicSrc = join(appRoot, "public");
const publicDst = join(standaloneRoot, "public");

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function copyDir(label, src, dst) {
  if (!(await exists(src))) {
    return { label, copied: false, reason: "source-missing", src };
  }
  await cp(src, dst, { recursive: true, force: true });
  const entries = await readdir(dst, { recursive: true });
  return { label, copied: true, src, dst, fileCount: entries.length };
}

async function main() {
  const standaloneServer = join(standaloneRoot, "server.js");
  if (!(await exists(standaloneServer))) {
    console.log("[prepare-standalone] no standalone build; skipping");
    return;
  }

  const results = await Promise.all([
    copyDir("static", staticSrc, staticDst),
    copyDir("public", publicSrc, publicDst),
  ]);

  for (const result of results) {
    if (result.copied) {
      console.log(
        `[prepare-standalone] copied ${result.label}: ${result.fileCount} files -> ${result.dst}`
      );
    } else {
      console.warn(`[prepare-standalone] skipped ${result.label}: ${result.reason}`);
    }
  }
}

main().catch((error) => {
  console.error("[prepare-standalone] failed", error);
  process.exit(1);
});
