import { access, readdir } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { isBrandMemoryEnabled } from "@/server/memory/mem0-client";

async function pathExists(path: string) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function getStaticAssetDiagnostics() {
  const cwd = process.cwd();
  const staticDir = join(cwd, ".next", "static");
  const publicDir = join(cwd, "public");
  const staticExists = await pathExists(staticDir);
  const publicExists = await pathExists(publicDir);
  let chunkCount = 0;
  let logoExists = false;

  if (staticExists) {
    try {
      const chunks = await readdir(join(staticDir, "chunks"));
      chunkCount = chunks.length;
    } catch {
      chunkCount = 0;
    }
  }

  if (publicExists) {
    logoExists = await pathExists(join(publicDir, "images", "logo.svg"));
  }

  return {
    cwd,
    staticExists,
    publicExists,
    chunkCount,
    logoExists,
  };
}

export async function GET() {
  const staticAssets = await getStaticAssetDiagnostics();

  // #region agent log
  fetch("http://127.0.0.1:7899/ingest/cfdc6907-57c9-49e8-855d-2427aa77ea62", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "b15b40" },
    body: JSON.stringify({
      sessionId: "b15b40",
      runId: "pre-fix",
      hypothesisId: "H1",
      location: "health/route.ts:GET",
      message: "health static asset diagnostics",
      data: staticAssets,
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion

  return NextResponse.json({
    ok: true,
    service: "adscale-app",
    timestamp: new Date().toISOString(),
    brandMemory: {
      enabled: isBrandMemoryEnabled(),
    },
    staticAssets,
  });
}
