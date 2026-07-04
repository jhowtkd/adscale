#!/usr/bin/env node

import { execFileSync, spawn, spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const baseUrl = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const playwrightConfig = process.env.E2E_PLAYWRIGHT_CONFIG ?? "playwright.guided.config.ts";
const playwrightSpec = process.env.E2E_PLAYWRIGHT_SPEC;
const forceOwnDevServer = process.env.E2E_FORCE_WEBSERVER === "true";

async function waitForServer(maxAttempts = 90) {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const res = await fetch(`${baseUrl}/login`, { redirect: "manual" });
      if (res.ok || res.status === 307 || res.status === 308) {
        return;
      }
    } catch {
      // retry
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 2_000));
  }
  throw new Error(`Timed out waiting for ${baseUrl}/login`);
}

function seedDevAdmin() {
  try {
    execFileSync(
      "npx",
      [
        "tsx",
        "scripts/seed-dev-admin.ts",
        "--repair",
        "--create",
        "--email=dev-admin@adscale.local",
        "--password=DevAdmin123!",
      ],
      {
        cwd: appDir,
        stdio: "pipe",
        env: {
          ...process.env,
          NODE_OPTIONS: [process.env.NODE_OPTIONS, "--conditions=react-server"]
            .filter(Boolean)
            .join(" "),
          DEV_ADMIN_EMAIL: "dev-admin@adscale.local",
          BETTER_AUTH_URL: baseUrl,
        },
      }
    );
  } catch (error) {
    const stderr =
      error && typeof error === "object" && "stderr" in error
        ? String(error.stderr)
        : "";
    if (!/already exists|User already exists/i.test(stderr)) {
      console.warn("[guided-e2e] seed skipped or failed:", stderr.trim() || error);
    }
  }
}

async function isServerReady() {
  try {
    const res = await fetch(`${baseUrl}/login`, { redirect: "manual" });
    return res.ok || res.status === 307 || res.status === 308;
  } catch {
    return false;
  }
}

let devProcess = null;
const preferOwnDevServer = process.env.E2E_SKIP_WEBSERVER !== "true";

async function main() {
  if (preferOwnDevServer) {
    if (!forceOwnDevServer && (await isServerReady())) {
      console.log(`[guided-e2e] Reusing existing server at ${baseUrl}`);
    } else {
      const port = new URL(baseUrl).port || "3000";
      devProcess = spawn(
        "npx",
        ["next", "dev", "--webpack", "--hostname", "0.0.0.0", "--port", port],
        {
          cwd: appDir,
          stdio: "inherit",
          env: {
            ...process.env,
            APP_URL: baseUrl,
            BETTER_AUTH_URL: baseUrl,
            DEV_ADMIN_EMAIL: "dev-admin@adscale.local",
            E2E_DISABLE_RATE_LIMIT: "true",
            NEXT_PUBLIC_APP_URL: baseUrl,
          },
        }
      );
      await waitForServer();
    }
  }

  seedDevAdmin();

  const result = spawnSync(
    "npx",
    [
      "playwright",
      "test",
      "--config",
      playwrightConfig,
      ...(playwrightSpec ? [playwrightSpec] : []),
    ],
    {
      cwd: appDir,
      stdio: "inherit",
      env: {
        ...process.env,
        E2E_BASE_URL: baseUrl,
        E2E_SKIP_WEBSERVER: "true",
        DEV_ADMIN_EMAIL: "dev-admin@adscale.local",
      },
    }
  );

  if (devProcess) {
    devProcess.kill("SIGTERM");
  }

  process.exit(result.status ?? 1);
}

main().catch((error) => {
  if (devProcess) devProcess.kill("SIGTERM");
  console.error(error);
  process.exit(1);
});
