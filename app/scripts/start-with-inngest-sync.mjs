import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const port = process.env.PORT ?? "3000";
const baseUrl = `http://127.0.0.1:${port}`;
const publicBaseUrl =
  process.env.INNGEST_SERVE_URL ??
  process.env.APP_URL ??
  process.env.BETTER_AUTH_URL ??
  baseUrl;
const inngestSyncUrl = new URL("/api/inngest", publicBaseUrl).toString();

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
  const response = await fetch(inngestSyncUrl, { method: "PUT" });
  const body = await response.text();
  console.log(`[inngest-sync] PUT ${inngestSyncUrl} -> ${response.status} ${body}`);

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

const standaloneServer = join(__dirname, "..", ".next", "standalone", "server.js");
const nextBin = join(__dirname, "..", "node_modules", ".bin", "next");
const useStandalone = await import("node:fs/promises")
  .then((fs) => fs.access(standaloneServer).then(() => true))
  .catch(() => false);

const child = spawn(useStandalone ? process.execPath : nextBin, useStandalone ? [standaloneServer] : ["start"], {
  env: process.env,
  shell: false,
  stdio: "inherit",
  cwd: useStandalone ? join(__dirname, "..", ".next", "standalone") : join(__dirname, ".."),
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
