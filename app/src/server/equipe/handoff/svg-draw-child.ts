import { spawn } from "node:child_process";
import { logger } from "@/lib/logger";
import { SvgLogoError } from "./svg-sanitize";

/**
 * Draws a sanitized SVG as a PNG in a DISPOSABLE PROCESS, not in the server's (ticket 15 B, fix 01).
 *
 * The renderer is native (librsvg, inside sharp) and runs on a thread nobody can interrupt: a deadline in the server process only stops WAITING for it, a file that
 * overflows its stack kills the process by a signal that no `try/catch` sees, and one that is merely slow keeps the one place of the queue until it ends. A process of its
 * own makes all three cheap: it is killed at the deadline (SIGKILL, from outside, whatever it is doing), a crash of it is an exit code, and it watches its own memory.
 * The sanitizer (`svg-sanitize.ts`) is the first line and keeps what it has always kept out; this is for what it did not foresee.
 *
 * One process per drawing, started and gone in about a tenth of a second. The SVG goes in by stdin, the PNG comes out by stdout, and the child gets a short list of
 * environment variables: none of the server's secrets. The worker is a string run with `node -e`, so it does not depend on a file being traced into the build (the Next
 * production build, the standalone image, a test): it needs only `node` (the running one) and `sharp`, which its own `require` finds from the working directory of the server
 * (the app's root, or `.next/standalone`, where the build copies it). The parent does not look for it: a `require.resolve` here would be replaced by webpack, in the build, with
 * a module id of its own that means nothing to another process.
 *
 * `process.exit()` cannot end a process that is in the middle of a native drawing (it waits for the thread), so everything that must end the child NOW ends it with SIGKILL:
 * the parent's deadline, and the child's own watches (memory, its own deadline, a parent that is gone), which leave one letter on stderr first to say why.
 */

/**
 * The most memory (resident set) the drawing may take before it is killed: the process starts at about 60 MB, a real logo adds 20 MB, and each surface the renderer holds at
 * full size (a layer with opacity, a mask) adds 4 MB. The server's own instance is small (512 MB), and this is on top of the server.
 */
export const DRAW_MAX_RSS_MB = 160;
/** A PNG of 1024 px is a few hundred KB; past this it is not a drawing worth keeping. */
const MAX_PNG_BYTES = 8 * 1024 * 1024;
/** Exit codes of the worker, besides "drawn" (0): the renderer failed, nothing was drawn, the input was too long, `sharp` could not be loaded. A signal (a crash, a kill) is a drawing that failed. */
const EXIT_FAILED = 10, EXIT_EMPTY = 11, EXIT_INPUT = 13;
/** The worker could not load `sharp`: the drawing is not available at all (a build that does not carry it), which is not a file that cannot be drawn and is said in the log. */
export const DRAW_UNAVAILABLE_EXIT_CODE = 14;
/** What the child writes on stderr before it ends itself with SIGKILL, to say why. */
const WHY_MEMORY = "M", WHY_TIMEOUT = "T", WHY_ORPHAN = "O";
/** How long past the parent's deadline the child waits before it ends itself (the parent kills it first, unless the parent is gone). */
const SELF_DEADLINE_MARGIN_MS = 2_000;
/** The pixels the renderer is allowed to produce (the PNG is at most 1024 on its longest side). */
const MAX_RENDER_PIXELS = 1_100_000;

/**
 * Runs in the child. Reads the SVG from stdin, draws it with sharp, writes the PNG to stdout. Timers on its own event loop (the drawing itself runs on a pool thread) end it
 * when its memory passes the limit, when it outlives its deadline by a margin and when its parent is gone.
 */
export const DRAW_WORKER_SOURCE = String.raw`
const fs = require("fs");
const die = why => { try { fs.writeSync(2, why); } catch {} process.kill(process.pid, "SIGKILL"); };
const limit = Number(process.env.SVG_DRAW_MAX_RSS_MB) * 1048576;
const parent = process.ppid;
setInterval(() => { if (process.memoryUsage.rss() > limit) die("${WHY_MEMORY}"); if (process.ppid !== parent) die("${WHY_ORPHAN}"); }, 10);
setTimeout(() => die("${WHY_TIMEOUT}"), Number(process.env.SVG_DRAW_TIMEOUT_MS));
let sharp;
try { sharp = require("sharp"); sharp.cache(false); sharp.concurrency(1); } catch { process.exit(${DRAW_UNAVAILABLE_EXIT_CODE}); }
const chunks = []; let size = 0;
process.stdin.on("data", chunk => { size += chunk.length; if (size > 4194304) process.exit(${EXIT_INPUT}); chunks.push(chunk); });
process.stdin.on("end", async () => {
  try {
    const { data, info } = await sharp(Buffer.concat(chunks), { density: 72, limitInputPixels: ${MAX_RENDER_PIXELS}, failOn: "error" }).png({ compressionLevel: 9 }).toBuffer({ resolveWithObject: true });
    const alpha = (await sharp(data).stats()).channels[3];
    if (info.channels === 4 && alpha && alpha.max === 0) process.exit(${EXIT_EMPTY});
    process.stdout.write(data, () => process.exit(0));
  } catch { process.exit(${EXIT_FAILED}); }
});
`;

/** What the child may know of the server's environment: where to find programs, temporary files and fonts. Not a secret, not a key. */
const ENVIRONMENT_ALLOWED = ["PATH", "HOME", "TMPDIR", "TMP", "TEMP", "LANG", "LC_ALL", "FONTCONFIG_FILE", "FONTCONFIG_PATH", "XDG_CACHE_HOME", "XDG_CONFIG_HOME", "XDG_DATA_HOME",
  "XDG_DATA_DIRS", "LD_LIBRARY_PATH", "DYLD_LIBRARY_PATH", "SHARP_IGNORE_GLOBAL_LIBVIPS", "SHARP_FORCE_GLOBAL_LIBVIPS"];

export type DrawOptions = {
  /** Milliseconds the drawing is given from the moment it starts; past it the process is killed (`svg_timeout`). */
  timeoutMs: number;
  /** Aborting it kills the process and rejects with the signal's reason. */
  signal?: AbortSignal;
  maxRssMb?: number;
  /** The program the child runs instead of the real worker. For tests of the isolation (a hang, a crash, a flood of output); never set in the app. */
  workerSource?: string;
  /** Transport limit; raster workers return bounded metadata or pixel copies. */
  maxOutputBytes?: number;
};

/**
 * Runs the bounded image worker with input on stdin and output on stdout. Rejects with `SvgLogoError`: `svg_timeout` (killed at the deadline), `svg_empty` (nothing was drawn), `svg_too_complex` (it took
 * more memory than the limit), `svg_render_failed` (the renderer failed or the process died, by an exit code or by a signal), or with the abort reason of `signal`.
 */
export function runImageChild(input: string | Uint8Array, options: DrawOptions): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const inherited: Record<string, string> = {};
    for (const name of ENVIRONMENT_ALLOWED) if (process.env[name] !== undefined) inherited[name] = process.env[name]!;
    const env = { ...inherited, NODE_ENV: "production" as const, SVG_DRAW_MAX_RSS_MB: String(options.maxRssMb ?? DRAW_MAX_RSS_MB),
      SVG_DRAW_TIMEOUT_MS: String(options.timeoutMs + SELF_DEADLINE_MARGIN_MS), UV_THREADPOOL_SIZE: "2", MALLOC_ARENA_MAX: "2" };
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(process.execPath, ["--max-old-space-size=48", "--max-semi-space-size=1", "-e", options.workerSource ?? DRAW_WORKER_SOURCE],
        { stdio: ["pipe", "pipe", "pipe"], env, cwd: process.cwd(), windowsHide: true });
    } catch { return reject(new SvgLogoError("svg_render_failed")); }

    const action = typeof input === "string" ? "drawing" : "decoding";
    const label = typeof input === "string" ? "svg drawing" : "raster decoding";
    let settled = false;
    let stopped: unknown;
    const output: Buffer[] = [];
    let bytes = 0, why = "";
    const kill = () => { try { child.kill("SIGKILL"); } catch { /* Already gone. */ } };
    const finish = (settle: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", onAbort);
      settle();
    };
    const onAbort = () => { stopped = options.signal?.reason ?? new SvgLogoError("svg_timeout"); kill(); };
    const timer = setTimeout(() => { stopped = new SvgLogoError("svg_timeout"); kill(); }, options.timeoutMs);
    options.signal?.addEventListener("abort", onAbort, { once: true });
    if (options.signal?.aborted) onAbort();

    child.stdout!.on("data", (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > (options.maxOutputBytes ?? MAX_PNG_BYTES)) { stopped = new SvgLogoError("svg_render_failed"); kill(); return; }
      output.push(chunk);
    });
    child.stderr!.on("data", (chunk: Buffer) => { if (why.length < 4) why += chunk.toString("latin1").slice(0, 4); }); // Only the letter the worker leaves; nothing else is kept.
    for (const stream of [child.stdin!, child.stdout!, child.stderr!]) stream.on("error", () => { /* The child ended before it was done with them: how it ended says why. */ });
    child.on("error", () => finish(() => reject(new SvgLogoError("svg_render_failed")))); // It could not be started.
    child.on("close", (code, signal) => finish(() => {
      if (stopped !== undefined) return reject(stopped);
      if (code === 0) return output.length ? resolve(Buffer.concat(output)) : reject(new SvgLogoError("svg_render_failed")); // "Drawn" with nothing drawn is not drawn.
      if (code === DRAW_UNAVAILABLE_EXIT_CODE) logger.error(`[equipe-handoff] ${label} is unavailable: the ${action} process could not load sharp`); // Every SVG logo fails until this is fixed.
      else if (signal && signal !== "SIGKILL") logger.warn(`[equipe-handoff] ${label} process crashed`, { signal }); // The renderer fell: a file did what the sanitizer did not foresee. (Our own kills are SIGKILL.)
      reject(new SvgLogoError(
        why.startsWith(WHY_MEMORY) ? "svg_too_complex" : why.startsWith(WHY_TIMEOUT) ? "svg_timeout" : code === EXIT_EMPTY ? "svg_empty" : "svg_render_failed"));
    }));
    child.stdin!.end(typeof input === "string" ? Buffer.from(input, "utf8") : input);
  });
}

export function drawInChild(svg: string, options: DrawOptions): Promise<Buffer> {
  return runImageChild(svg, options);
}
