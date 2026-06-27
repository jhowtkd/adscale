#!/usr/bin/env node

import { execFileSync, spawn, spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const baseUrl = process.env.E2E_BASE_URL ?? "http://localhost:3000";

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

let devProcess = null;
const startedDevServer = process.env.E2E_SKIP_WEBSERVER !== "true";

async function main() {
  if (startedDevServer) {
    devProcess = spawn("npm", ["run", "dev:next"], {
      cwd: appDir,
      stdio: "inherit",
      env: { ...process.env, E2E_DISABLE_RATE_LIMIT: "true" },
    });
    await waitForServer();
  }

  seedDevAdmin();

  const result = spawnSync(
    "npx",
    ["playwright", "test", "--config", "playwright.guided.config.ts"],
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
