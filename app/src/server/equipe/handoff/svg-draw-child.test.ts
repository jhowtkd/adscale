import { execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { logger } from "@/lib/logger";
import { DRAW_MAX_RSS_MB, DRAW_UNAVAILABLE_EXIT_CODE, DRAW_WORKER_SOURCE, drawInChild } from "./svg-draw-child";
import { SvgLogoError } from "./svg-sanitize";

/**
 * The drawing process (ticket 15 B, fix 01): real processes, driven with test programs through `workerSource`. What these prove is the isolation: a program that hangs, crashes,
 * floods or leaks is ended, and what the server is told is an error code, never an outage and never a secret.
 */

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const SIMPLE = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="80" viewBox="0 0 240 80"><circle cx="40" cy="40" r="32" fill="#c9573a"/><rect x="86" y="25" width="132" height="11" fill="#2b1a10"/></svg>`;
const slowFile = () => readFileSync(fileURLToPath(new URL("./fixtures/mask-tree-slow.svg", import.meta.url)));

let directory = "";
const markers: string[] = [];
beforeAll(() => { directory = mkdtempSync(join(tmpdir(), "svg-draw-child-")); });
afterAll(() => {
  // Whatever a test left running is ended: nothing with one of this file's markers stays alive.
  for (const pid of processesWith([...markers, directory])) { try { process.kill(pid, "SIGKILL"); } catch { /* Gone. */ } }
  rmSync(directory, { recursive: true, force: true });
});
afterEach(() => vi.restoreAllMocks());

/** Pids of the processes whose command line has one of `words` (the `ps` that asks has none of them). */
function processesWith(words: string[]): number[] {
  if (!words.length) return [];
  return execFileSync("ps", ["-eo", "pid=,command="], { encoding: "utf8" }).split("\n")
    .filter(line => words.some(word => line.includes(word))).map(line => Number(line.trim().split(/\s+/)[0]));
}
const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const gone = (pid: number) => vi.waitFor(() => expect(alive(pid), `pid ${pid} is still alive`).toBe(false), { timeout: 4000, interval: 25 });
const pidFile = () => join(directory, `pid-${randomUUID()}`);
const readPid = async (file: string) => { await vi.waitFor(() => expect(existsSync(file)).toBe(true), { timeout: 5000, interval: 20 }); await vi.waitFor(() => expect(readFileSync(file, "utf8")).toMatch(/^\d+$/)); return Number(readFileSync(file, "utf8")); };
/** A program that writes its pid where the test can find it, then does what `rest` says. */
const worker = (file: string, rest: string) => `require("fs").writeFileSync(${JSON.stringify(file)}, String(process.pid)); ${rest}`;
const HANG = "setInterval(() => {}, 1000);";

async function failure(work: Promise<unknown>) {
  const error = await work.then(() => null, (e: unknown) => e);
  expect(error).toBeInstanceOf(SvgLogoError);
  return error as SvgLogoError;
}

describe("drawInChild: the real worker", () => {
  it("draws a simple logo: PNG bytes, 1024 px wide, quickly", async () => {
    const began = performance.now();
    const png = await drawInChild(SIMPLE, { timeoutMs: 8000 });
    expect(png.subarray(0, 8).equals(PNG_SIGNATURE)).toBe(true);
    expect(png.readUInt32BE(16)).toBe(240); // At the size the SVG says: the sanitizer is what makes it 1024.
    expect(performance.now() - began).toBeLessThan(5000);
  });

  it("draws a transparent background: the first pixel of a PNG of a shape that does not cover the frame has no alpha", async () => {
    const sharp = (await import("sharp")).default;
    const png = await drawInChild(SIMPLE, { timeoutMs: 8000 });
    const { data } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    expect(data[3]).toBe(0);
  });

  it("nothing drawn is svg_empty, not an empty image", async () => {
    const error = await failure(drawInChild(`<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>`, { timeoutMs: 8000 }));
    expect(error).toMatchObject({ code: "svg_empty", message: "svg_empty" });
  });

  it("something the renderer cannot read is svg_render_failed", async () => {
    expect(await failure(drawInChild("this is not an svg", { timeoutMs: 8000 }))).toMatchObject({ code: "svg_render_failed" });
  });

  it("a memory limit under what the process already uses ends it at once: svg_too_complex", async () => {
    const began = performance.now();
    const error = await failure(drawInChild(SIMPLE, { timeoutMs: 8000, maxRssMb: 30 }));
    expect(error).toMatchObject({ code: "svg_too_complex", message: "svg_too_complex" });
    expect(performance.now() - began).toBeLessThan(4000);
  });

  it("the default memory limit leaves room for a real logo", () => {
    expect(DRAW_MAX_RSS_MB).toBe(160);
  });

  it("the review's tree of masks, raw (never sanitized, on purpose: it keeps drawing), is killed at the deadline and its process is gone", async () => {
    const marker = `marker-${randomUUID()}`;
    markers.push(marker);
    const began = performance.now();
    const running = drawInChild(slowFile().toString("utf8"), { timeoutMs: 1000, workerSource: `${DRAW_WORKER_SOURCE}\n// ${marker}` });
    await vi.waitFor(() => expect(processesWith([marker]).length).toBeGreaterThan(0), { timeout: 3000, interval: 20 }); // It is running...
    expect(await failure(running)).toMatchObject({ code: "svg_timeout", message: "svg_timeout" });
    const took = performance.now() - began;
    expect(took).toBeGreaterThan(900);
    expect(took).toBeLessThan(6000); // ...and the 30 seconds it needs were not waited for.
    await vi.waitFor(() => expect(processesWith([marker])).toEqual([]), { timeout: 4000, interval: 25 });
  }, 30_000);
});

describe("drawInChild: a worker that misbehaves", () => {
  it("a program that hangs is killed at the deadline: svg_timeout near the deadline, and its process is gone", async () => {
    const file = pidFile();
    const began = performance.now();
    const running = failure(drawInChild("<svg/>", { timeoutMs: 400, workerSource: worker(file, HANG) }));
    const pid = await readPid(file);
    expect(alive(pid)).toBe(true);
    expect(await running).toMatchObject({ code: "svg_timeout", message: "svg_timeout" });
    const took = performance.now() - began;
    expect(took).toBeGreaterThan(350);
    expect(took).toBeLessThan(4000);
    await gone(pid);
  });

  it("a program that blocks its own loop (a busy loop nothing can interrupt) is killed all the same", async () => {
    const file = pidFile();
    const running = failure(drawInChild("<svg/>", { timeoutMs: 400, workerSource: worker(file, "for (;;) {}") }));
    const pid = await readPid(file);
    expect(await running).toMatchObject({ code: "svg_timeout" });
    await gone(pid);
  });

  it("a crash by a signal (SIGSEGV) is svg_render_failed, not a crash of ours", async () => {
    const error = await failure(drawInChild("<svg/>", { timeoutMs: 4000, workerSource: `process.kill(process.pid, "SIGSEGV"); setInterval(() => {}, 1000);` }));
    expect(error).toMatchObject({ code: "svg_render_failed", message: "svg_render_failed" });
    expect(alive(process.pid)).toBe(true);
  });

  it("exiting 0 with nothing on the output is svg_render_failed (nothing was drawn)", async () => {
    expect(await failure(drawInChild("<svg/>", { timeoutMs: 4000, workerSource: "process.exit(0)" }))).toMatchObject({ code: "svg_render_failed" });
  });

  it.each([[10, "svg_render_failed"], [11, "svg_empty"], [13, "svg_render_failed"], [3, "svg_render_failed"], [1, "svg_render_failed"], [255, "svg_render_failed"]])(
    "exit code %i is %s", async (code, expected) => {
      expect(await failure(drawInChild("<svg/>", { timeoutMs: 4000, workerSource: `process.exit(${code})` }))).toMatchObject({ code: expected });
    });

  it("an exit code with output that is not 0 is a failure: what it wrote is not taken", async () => {
    expect(await failure(drawInChild("<svg/>", { timeoutMs: 4000, workerSource: `process.stdout.write("PNGBYTES", () => process.exit(7));` }))).toMatchObject({ code: "svg_render_failed" });
  });

  it("a flood of output past 8 MiB ends the process and is svg_render_failed", async () => {
    const file = pidFile();
    const flood = worker(file, `const chunk = Buffer.alloc(1 << 20, 1); const write = () => { while (process.stdout.write(chunk)) {} process.stdout.once("drain", write); }; write();`);
    const error = await failure(drawInChild("<svg/>", { timeoutMs: 20_000, workerSource: flood }));
    expect(error).toMatchObject({ code: "svg_render_failed" });
    await gone(await readPid(file));
  });

  it("just under 8 MiB of output is still taken", async () => {
    const png = await drawInChild("<svg/>", { timeoutMs: 20_000, workerSource: `process.stdout.write(Buffer.alloc(7 * 1024 * 1024, 1), () => process.exit(0));` });
    expect(png.length).toBe(7 * 1024 * 1024);
  }, 30_000);

  it.each([["M", "svg_too_complex"], ["T", "svg_timeout"], ["O", "svg_render_failed"], ["X", "svg_render_failed"]])(
    "a worker that ends itself with SIGKILL after writing %s on stderr is %s", async (letter, expected) => {
      const source = `require("fs").writeSync(2, "${letter}"); process.kill(process.pid, "SIGKILL"); setInterval(() => {}, 1000);`;
      expect(await failure(drawInChild("<svg/>", { timeoutMs: 4000, workerSource: source }))).toMatchObject({ code: expected });
    });

  it("what a worker writes on stderr is never carried into the error", async () => {
    const error = await failure(drawInChild("<svg/>", { timeoutMs: 4000, workerSource: `require("fs").writeSync(2, "SECRET-TOKEN-4711 /etc/passwd"); process.exit(9);` }));
    expect(error.message).toBe("svg_render_failed");
    expect(JSON.stringify(error) + String(error.stack)).not.toContain("SECRET-TOKEN-4711");
  });

  it("a worker that does not read its input does not hang the call: stdin closing under it is not an error of ours", async () => {
    const error = await failure(drawInChild("x".repeat(5_000_000), { timeoutMs: 4000, workerSource: "process.exit(5)" }));
    expect(error).toMatchObject({ code: "svg_render_failed" });
  });
});

describe("drawInChild: signal", () => {
  it("aborting in the middle kills the process and rejects with the reason of the signal", async () => {
    const file = pidFile();
    const controller = new AbortController();
    const running = drawInChild("<svg/>", { timeoutMs: 20_000, signal: controller.signal, workerSource: worker(file, HANG) });
    const outcome = running.then(() => null, (e: unknown) => e);
    const pid = await readPid(file);
    const reason = new Error("the reading was cancelled");
    controller.abort(reason);
    expect(await outcome).toBe(reason);
    await gone(pid);
  });

  it("an abort without a reason rejects with an AbortError, and the process is gone", async () => {
    const file = pidFile();
    const controller = new AbortController();
    const outcome = drawInChild("<svg/>", { timeoutMs: 20_000, signal: controller.signal, workerSource: worker(file, HANG) }).then(() => null, (e: unknown) => e);
    const pid = await readPid(file);
    controller.abort();
    expect(await outcome).toMatchObject({ name: "AbortError" });
    await gone(pid);
  });

  it("an already aborted signal rejects with the reason and does not even create the process", async () => {
    const file = pidFile();
    const reason = new Error("already stopped");
    await expect(drawInChild("<svg/>", { timeoutMs: 20_000, signal: AbortSignal.abort(reason), workerSource: worker(file, HANG) })).rejects.toBe(reason);
    await new Promise(resolve => setTimeout(resolve, 400)); // Long enough for a process that was started to have written its pid.
    expect(existsSync(file)).toBe(false);
  });

  it("an abort after the drawing ended changes nothing", async () => {
    const controller = new AbortController();
    const png = await drawInChild(SIMPLE, { timeoutMs: 8000, signal: controller.signal });
    controller.abort(new Error("too late"));
    expect(png.subarray(0, 8).equals(PNG_SIGNATURE)).toBe(true);
  });
});

describe("drawInChild: what the process is given", () => {
  const SECRETS = { SECRET_FOR_TEST_X: "s3cr3t", DATABASE_URL: "postgres://user:pw@host/db", ANTHROPIC_API_KEY: "sk-ant-test", AWS_SECRET_ACCESS_KEY: "aws-test", INNGEST_SIGNING_KEY: "signkey-test" };
  const previous: Record<string, string | undefined> = {};
  beforeAll(() => { for (const [name, value] of Object.entries(SECRETS)) { previous[name] = process.env[name]; process.env[name] = value; } });
  afterAll(() => { for (const [name, value] of Object.entries(previous)) { if (value === undefined) delete process.env[name]; else process.env[name] = value; } });

  const environmentOf = async (options: Partial<Parameters<typeof drawInChild>[1]> = {}) => {
    const bytes = await drawInChild("<svg/>", { timeoutMs: 8000, workerSource: `process.stdout.write(JSON.stringify(process.env), () => process.exit(0));`, ...options });
    return JSON.parse(bytes.toString("utf8")) as Record<string, string>;
  };

  it("none of the server's secrets are in its environment, and PATH is", async () => {
    const env = await environmentOf();
    for (const name of Object.keys(SECRETS)) expect(Object.keys(env), name).not.toContain(name);
    expect(JSON.stringify(env)).not.toMatch(/s3cr3t|postgres:\/\/|sk-ant-test|aws-test|signkey-test/);
    expect(env.PATH).toBe(process.env.PATH);
  });

  it("only a short list of names gets through: no name that looks like a credential, and nothing the test runner added", async () => {
    const env = await environmentOf();
    expect(Object.keys(env).filter(name => /SECRET|TOKEN|KEY|PASSWORD|DATABASE|URL|VITEST|TEST_|NEXT_|AUTH/i.test(name) && !name.startsWith("SVG_DRAW_"))).toEqual([]);
    expect(Object.keys(env).length).toBeLessThan(20);
  });

  it("it is told its own limits: production mode, the memory limit, and its deadline two seconds past the caller's", async () => {
    const env = await environmentOf({ timeoutMs: 5000, maxRssMb: 99 });
    expect(env.NODE_ENV).toBe("production");
    expect(env.SVG_DRAW_MAX_RSS_MB).toBe("99");
    expect(env.SVG_DRAW_TIMEOUT_MS).toBe("7000");
    expect((await environmentOf()).SVG_DRAW_MAX_RSS_MB).toBe(String(DRAW_MAX_RSS_MB));
  });

  it("the parent no longer looks for sharp: nothing in the environment points at it", async () => {
    expect(Object.keys(await environmentOf())).not.toContain("SVG_DRAW_SHARP");
  });

  it("it starts the running node, with a small heap, and the program as -e (not as a file)", async () => {
    const source = `process.stdout.write(JSON.stringify({ exec: process.execPath, argv: process.execArgv, args: process.argv.slice(1) }), () => process.exit(0));`;
    const info = JSON.parse((await drawInChild("<svg/>", { timeoutMs: 8000, workerSource: source })).toString("utf8")) as { exec: string; argv: string[]; args: string[] };
    expect(info.exec).toBe(process.execPath);
    expect(info.argv).toEqual(expect.arrayContaining(["--max-old-space-size=48", "--max-semi-space-size=1"]));
    expect(info.args).toEqual([]);
  });

  it("the svg is delivered on stdin, whole and as it is (including what is not ASCII)", async () => {
    const text = `<svg>${"é☃ 日本語".repeat(1000)}</svg>`;
    const source = `const chunks = []; process.stdin.on("data", c => chunks.push(c)); process.stdin.on("end", () => process.stdout.write(Buffer.concat(chunks), () => process.exit(0)));`;
    expect((await drawInChild(text, { timeoutMs: 8000, workerSource: source })).toString("utf8")).toBe(text);
  });
});

describe("drawInChild: sharp cannot be loaded", () => {
  it("the worker exits with the code that means it, and says so in the log: svg_render_failed, and an error line", async () => {
    const error = vi.spyOn(logger, "error").mockImplementation(() => undefined);
    expect(DRAW_UNAVAILABLE_EXIT_CODE).toBe(14);
    expect(await failure(drawInChild("<svg/>", { timeoutMs: 4000, workerSource: "process.exit(14)" }))).toMatchObject({ code: "svg_render_failed", message: "svg_render_failed" });
    expect(error).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledWith("[equipe-handoff] svg drawing is unavailable: the drawing process could not load sharp");
  });

  it("any other exit code is svg_render_failed with NO error line (a file that cannot be drawn is not an outage)", async () => {
    const error = vi.spyOn(logger, "error").mockImplementation(() => undefined);
    for (const code of [3, 10, 11, 13, 1, 15]) {
      await failure(drawInChild("<svg/>", { timeoutMs: 4000, workerSource: `process.exit(${code})` }));
    }
    await failure(drawInChild("<svg/>", { timeoutMs: 4000, workerSource: `process.kill(process.pid, "SIGKILL"); setInterval(() => {}, 1000);` }));
    expect(error).not.toHaveBeenCalled();
  });

  it("a renderer that falls (SIGSEGV, SIGABRT, SIGILL) is svg_render_failed and is said in the log, by the signal and nothing else", async () => {
    const error = vi.spyOn(logger, "error").mockImplementation(() => undefined);
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => undefined);
    for (const signal of ["SIGSEGV", "SIGABRT", "SIGILL"]) {
      warn.mockClear();
      const failed = await failure(drawInChild("<svg/>", { timeoutMs: 4000, workerSource: `process.kill(process.pid, "${signal}"); setInterval(() => {}, 1000);` }));
      expect(failed, signal).toMatchObject({ code: "svg_render_failed" });
      expect(warn, signal).toHaveBeenCalledTimes(1);
      expect(warn, signal).toHaveBeenCalledWith("[equipe-handoff] svg drawing process crashed", { signal });
    }
    expect(error).not.toHaveBeenCalled();
  });

  it("a process that ends the way we end it (killed at the deadline, aborted, memory, an exit code) says nothing in the log", async () => {
    const error = vi.spyOn(logger, "error").mockImplementation(() => undefined);
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => undefined);
    await failure(drawInChild("<svg/>", { timeoutMs: 300, workerSource: HANG })); // SIGKILL from the parent, at the deadline.
    await failure(drawInChild("<svg/>", { timeoutMs: 4000, workerSource: "process.exit(3)" }));
    await failure(drawInChild("<svg/>", { timeoutMs: 4000, workerSource: `require("fs").writeSync(2, "M"); process.kill(process.pid, "SIGKILL"); setInterval(() => {}, 1000);` })); // Its own watch.
    await failure(drawInChild(SIMPLE, { timeoutMs: 8000, maxRssMb: 30 })); // The real worker's memory watch.
    const controller = new AbortController();
    const aborted = drawInChild("<svg/>", { timeoutMs: 20_000, signal: controller.signal, workerSource: HANG }).then(() => null, (e: unknown) => e);
    await new Promise(resolve => setTimeout(resolve, 300));
    controller.abort(new Error("cancelled"));
    await aborted;
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it("a drawing that works logs nothing", async () => {
    const error = vi.spyOn(logger, "error").mockImplementation(() => undefined);
    await drawInChild(SIMPLE, { timeoutMs: 8000 });
    expect(error).not.toHaveBeenCalled();
  });

  it("the real worker, when sharp is not there, says so by that code: the program carries the check", () => {
    expect(DRAW_WORKER_SOURCE).toContain(`require("sharp")`);
    expect(DRAW_WORKER_SOURCE).toContain(`process.exit(${DRAW_UNAVAILABLE_EXIT_CODE})`);
    expect(DRAW_WORKER_SOURCE).not.toContain("SVG_DRAW_SHARP");
  });
});

describe("drawInChild: a child whose parent is gone ends itself (it is not left drawing)", () => {
  it("kills itself, in the middle of a native drawing too, when the server that started it is killed", async () => {
    const marker = `marker-${randomUUID()}`;
    markers.push(marker);
    const parentProgram = `
      const { spawn } = require("child_process");
      const child = spawn(process.execPath, ["--max-old-space-size=48", "--max-semi-space-size=1", "-e", process.env.WORKER_SOURCE],
        { stdio: ["pipe", "ignore", "ignore"], env: { PATH: process.env.PATH, SVG_DRAW_MAX_RSS_MB: "100000", SVG_DRAW_TIMEOUT_MS: "120000" } });
      child.stdin.end(require("fs").readFileSync(process.env.SVG_FILE));
      console.log(child.pid);
      setInterval(() => {}, 1000);`;
    const server = spawn(process.execPath, ["-e", parentProgram], {
      stdio: ["ignore", "pipe", "ignore"], cwd: process.cwd(),
      env: { PATH: process.env.PATH!, WORKER_SOURCE: `${DRAW_WORKER_SOURCE}\n// ${marker}`, SVG_FILE: fileURLToPath(new URL("./fixtures/mask-tree-slow.svg", import.meta.url)) },
    });
    try {
      const childPid = await new Promise<number>((resolve, reject) => {
        server.stdout!.once("data", chunk => resolve(Number(String(chunk).trim())));
        server.once("error", reject);
        server.once("exit", () => reject(new Error("the stand-in server ended before it started the worker")));
      });
      await vi.waitFor(() => expect(processesWith([marker])).toContain(childPid), { timeout: 3000, interval: 20 });
      await new Promise(resolve => setTimeout(resolve, 600)); // Drawing by now: the native renderer is busy.
      expect(alive(childPid)).toBe(true);

      server.kill("SIGKILL"); // The server dies without a word.
      const killedAt = performance.now();
      await vi.waitFor(() => expect(alive(childPid), "the worker outlived its server").toBe(false), { timeout: 3000, interval: 25 });
      expect(performance.now() - killedAt).toBeLessThan(3000);
      expect(processesWith([marker])).toEqual([]);
    } finally {
      server.kill("SIGKILL");
      for (const pid of processesWith([marker])) { try { process.kill(pid, "SIGKILL"); } catch { /* Gone. */ } }
    }
  }, 30_000);
});
