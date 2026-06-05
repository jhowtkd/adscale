import { execSync } from "node:child_process";

const attempts = Number(process.env.DB_MIGRATE_ATTEMPTS ?? 5);
const delayMs = Number(process.env.DB_MIGRATE_DELAY_MS ?? 8000);

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function logDbTarget() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set");
    return;
  }
  try {
    const parsed = new URL(url);
    console.log(`DATABASE_URL host=${parsed.hostname} db=${parsed.pathname.replace("/", "")}`);
  } catch {
    console.log("DATABASE_URL is set (unparseable URL)");
  }
}

logDbTarget();

for (let attempt = 1; attempt <= attempts; attempt += 1) {
  console.log(`[db:migrate] attempt ${attempt}/${attempts}`);
  try {
    const result = execSync("npx drizzle-kit migrate", {
      encoding: "utf8",
      env: process.env,
      stdio: ["inherit", "pipe", "pipe"],
    });
    if (result) {
      console.log(result);
    }
    console.log("[db:migrate] success");
    process.exit(0);
  } catch (error) {
    const execError = /** @type {NodeJS.ErrnoException & { stdout?: string; stderr?: string }} */ (error);
    if (execError.stdout) {
      console.log(execError.stdout);
    }
    if (execError.stderr) {
      console.error(execError.stderr);
    }
    console.error(`[db:migrate] attempt ${attempt} failed`, execError.message ?? execError);
    if (attempt === attempts) {
      process.exit(1);
    }
    console.log(`[db:migrate] retrying in ${delayMs}ms`);
    sleep(delayMs);
  }
}
