import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const port = process.env.PORT ?? "3000";
const baseUrl = `http://127.0.0.1:${port}`;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForHealth(maxAttempts = 90, delayMs = 1000) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) {
        return;
      }
    } catch {
      // Server still booting.
    }
    await sleep(delayMs);
  }
  throw new Error(`Server did not become healthy at ${baseUrl}/api/health`);
}

async function syncInngestFunctions() {
  const response = await fetch(`${baseUrl}/api/inngest`, { method: "PUT" });
  const body = await response.text();
  console.log(`[inngest-sync] PUT /api/inngest -> ${response.status} ${body}`);

  // #region agent log
  fetch("http://127.0.0.1:7899/ingest/cfdc6907-57c9-49e8-855d-2427aa77ea62", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Debug-Session-Id": "021503",
    },
    body: JSON.stringify({
      sessionId: "021503",
      runId: "inngest-sync",
      hypothesisId: "H1",
      location: "scripts/start-with-inngest-sync.mjs",
      message: "inngest sync result",
      data: { status: response.status, body: body.slice(0, 200) },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion

  if (!response.ok) {
    throw new Error(`Inngest sync failed with status ${response.status}`);
  }
}

async function syncInngestWithRetry() {
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      await waitForHealth();
      await syncInngestFunctions();
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[inngest-sync] attempt ${attempt}/5 failed: ${message}`);
      await sleep(attempt * 2000);
    }
  }
  console.error(
    "[inngest-sync] All sync attempts failed. Background jobs may stay queued until a manual PUT /api/inngest."
  );
}

const nextBin = join(__dirname, "..", "node_modules", ".bin", "next");
const child = spawn(nextBin, ["start"], {
  env: process.env,
  shell: false,
  stdio: "inherit",
});

void syncInngestWithRetry();

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});

child.on("error", (error) => {
  console.error("[start-with-inngest-sync] failed to start Next.js", error);
  process.exit(1);
});

process.on("SIGINT", () => child.kill("SIGINT"));
process.on("SIGTERM", () => child.kill("SIGTERM"));
