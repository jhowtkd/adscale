import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const processes = [];
let shuttingDown = false;

function resolveCommand(cmd) {
  // Prefer local node_modules bin
  const localBin = join(__dirname, "..", "node_modules", ".bin", cmd);
  return localBin;
}

function start(name, command, args) {
  const resolvedCmd = resolveCommand(command);
  const child = spawn(resolvedCmd, args, {
    env: process.env,
    shell: false,
    stdio: "inherit",
  });

  processes.push(child);

  child.on("exit", (code, signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    for (const proc of processes) {
      if (proc !== child && !proc.killed) proc.kill("SIGTERM");
    }
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 0);
  });

  child.on("error", (error) => {
    console.error(`[${name}] failed to start`, error);
    if (!shuttingDown) {
      shuttingDown = true;
      process.exit(1);
    }
  });
}

function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of processes) {
    if (!child.killed) child.kill(signal);
  }
  setTimeout(() => process.exit(0), 500).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

start("next", "next", [
  "dev",
  "--webpack",
  "--hostname",
  "0.0.0.0",
  "--port",
  "3000",
]);
start("inngest", "inngest-cli", ["dev", "-u", "http://localhost:3000/api/inngest"]);
