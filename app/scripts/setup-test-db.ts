import { exec, spawn } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

const CONTAINER_NAME = "adscale-test-postgres";
const PORT = "5433";
const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgres://test:test@localhost:5433/adscale_test";

async function isDockerRunning(): Promise<boolean> {
  try {
    await execAsync("docker info");
    return true;
  } catch {
    return false;
  }
}

async function containerExists(): Promise<boolean> {
  try {
    const { stdout } = await execAsync(
      `docker ps -aq -f name=^${CONTAINER_NAME}$`
    );
    return stdout.trim().length > 0;
  } catch {
    return false;
  }
}

async function containerIsRunning(): Promise<boolean> {
  try {
    const { stdout } = await execAsync(
      `docker ps -q -f name=^${CONTAINER_NAME}$`
    );
    return stdout.trim().length > 0;
  } catch {
    return false;
  }
}

async function startContainer(): Promise<void> {
  console.log(`Starting ${CONTAINER_NAME} container...`);
  await execAsync(
    `docker run --name ${CONTAINER_NAME} ` +
      `-e POSTGRES_USER=test ` +
      `-e POSTGRES_PASSWORD=test ` +
      `-e POSTGRES_DB=adscale_test ` +
      `-p ${PORT}:5432 ` +
      `-d postgres:16-alpine`
  );
}

async function waitForPostgres(attempts = 30, delayMs = 1000): Promise<void> {
  console.log("Waiting for Postgres to be ready...");
  for (let i = 0; i < attempts; i++) {
    try {
      await execAsync(
        `docker exec ${CONTAINER_NAME} pg_isready -U test -d adscale_test`
      );
      console.log("Postgres is ready.");
      return;
    } catch {
      await new Promise((res) => setTimeout(res, delayMs));
    }
  }
  throw new Error(
    `Postgres did not become ready after ${attempts} attempts.`
  );
}

async function runMigrations(): Promise<void> {
  console.log("Running drizzle-kit migrate...");
  return new Promise((resolve, reject) => {
    const proc = spawn("npx", ["drizzle-kit", "migrate"], {
      stdio: "inherit",
      env: {
        ...process.env,
        DATABASE_URL: TEST_DATABASE_URL,
      },
    });
    proc.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`drizzle-kit migrate exited with code ${code}`));
      }
    });
    proc.on("error", reject);
  });
}

async function main() {
  if (!(await isDockerRunning())) {
    console.error("❌ Docker is not running. Please start Docker and try again.");
    process.exit(1);
  }

  const exists = await containerExists();
  const running = await containerIsRunning();

  if (exists && !running) {
    console.log(`Removing stopped ${CONTAINER_NAME} container...`);
    await execAsync(`docker rm ${CONTAINER_NAME}`);
  }

  if (!running) {
    await startContainer();
  } else {
    console.log(`Container ${CONTAINER_NAME} is already running.`);
  }

  await waitForPostgres();
  await runMigrations();

  console.log("✅ Test database setup complete.");
  console.log(`   URL: ${TEST_DATABASE_URL}`);
}

main().catch((err) => {
  console.error("❌ Setup failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
