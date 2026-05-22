import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

const CONTAINER_NAME = "adscale-test-postgres";

async function main() {
  try {
    await execAsync(`docker stop ${CONTAINER_NAME}`);
    console.log(`Stopped ${CONTAINER_NAME} container.`);
  } catch {
    console.log(`Container ${CONTAINER_NAME} was not running.`);
  }

  try {
    await execAsync(`docker rm ${CONTAINER_NAME}`);
    console.log(`Removed ${CONTAINER_NAME} container.`);
  } catch {
    console.log(`Container ${CONTAINER_NAME} did not exist.`);
  }

  console.log("✅ Test database teardown complete.");
}

main().catch((err) => {
  console.error(
    "❌ Teardown failed:",
    err instanceof Error ? err.message : err
  );
  process.exit(1);
});
