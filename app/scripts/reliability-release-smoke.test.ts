import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  proofRedeliveryRestartAck,
  proofSchemaAndReadiness,
  readEnv,
} from "./reliability-release-smoke";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function stageEnv() {
  vi.stubEnv("STAGING_DATABASE_URL", "postgres://stage:stage@localhost/stage");
  vi.stubEnv("SMOKE_AUTH_COOKIE", "test-cookie");
  vi.stubEnv("SMOKE_CLIENT_PROFILE_ID", "synthetic-profile");
}

function migrationHashes(): string[] {
  const drizzleDir = path.resolve(scriptDir, "../drizzle");
  const journal = JSON.parse(
    readFileSync(path.join(drizzleDir, "meta/_journal.json"), "utf8"),
  ) as { entries: Array<{ tag: string }> };
  return journal.entries.map(({ tag }) => createHash("sha256")
    .update(readFileSync(path.join(drizzleDir, `${tag}.sql`), "utf8"))
    .digest("hex"));
}

describe("reliability release smoke topology", () => {
  it("web não exige sinais nem restart hooks de worker", () => {
    stageEnv();
    vi.stubEnv("IMAGE_JOB_TARGET", "web");
    expect(readEnv()).toMatchObject({
      imageJobTarget: "web",
      signalCmd: null,
      signalFile: null,
      restartHook: null,
    });
  });

  it("web prova schema e readiness sem consultar sinal do worker", async () => {
    stageEnv();
    vi.stubEnv("IMAGE_JOB_TARGET", "web");
    // If web mode inherited worker instrumentation, this hook would fail.
    vi.stubEnv("SMOKE_WORKER_SIGNAL_CMD", "exit 81");
    vi.stubEnv("SMOKE_WORKER_RESTART_HOOK", "exit 82");
    const env = readEnv();
    const pool = {
      query: vi.fn(async () => ({ rows: migrationHashes().map((hash) => ({ hash })) })),
      end: vi.fn(async () => undefined),
    };
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify({ ok: true, service: "web" }),
      { status: 200, headers: { "content-type": "application/json" } },
    )));

    const result = await proofSchemaAndReadiness(
      { sha: "a".repeat(40), provider: "controlled", webUrl: "http://stage", artifactsDir: "/tmp", timeoutS: 1 },
      env,
      pool,
      Date.now(),
    );
    expect(result.proof.status).toBe("pass");
    expect(result.workerConnectionId).toBeNull();
    expect(result.proof.evidence).not.toHaveProperty("worker");
    expect(pool.query).toHaveBeenCalledTimes(1);
  });

  it("worker continua exigindo sinal próprio de readiness", () => {
    stageEnv();
    vi.stubEnv("IMAGE_JOB_TARGET", "worker");
    const exit = vi.spyOn(process, "exit").mockImplementation((code?: number | string | null) => {
      throw new Error(`exit:${code}`);
    });
    expect(() => readEnv()).toThrow("exit:2");
    expect(exit).toHaveBeenCalledWith(2);
  });

  it("web registra redelivery/ack sem alegar restart nem executar hooks herdados", async () => {
    stageEnv();
    vi.stubEnv("IMAGE_JOB_TARGET", "web");
    vi.stubEnv("SMOKE_WORKER_SIGNAL_CMD", "exit 81");
    vi.stubEnv("SMOKE_WORKER_RESTART_HOOK", "exit 82");
    const env = readEnv();
    const pool = {
      query: vi.fn(async (query: string) => {
        if (query.includes("creative_work_outputs")) return { rows: [{
          id: "output-1", status: "completed", correlationId: "corr-1",
          isSelected: true, hasKey: true, createdAt: "2026-10-05T14:00:00.000Z",
        }] };
        if (query.includes("GROUP BY 1 HAVING COUNT(*) > 1")) return { rows: [] };
        if (query.includes("COUNT(*)::int AS n, COALESCE(SUM(amount)")) return { rows: [{ n: 0, s: 0 }] };
        if (query.includes("COUNT(*)::int AS n")) return { rows: [{ n: 0 }] };
        return { rows: [] };
      }),
      end: vi.fn(async () => undefined),
    };
    const requests: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      requests.push(`${init?.method ?? "GET"} ${url}`);
      const body = url.endsWith("/api/creative-work")
        ? { work: { id: "work-1" } }
        : url.endsWith("/api/creative-work/work-1")
          ? { preparedPlan: { preparedRevision: "2026-10-05T14:00:00.000Z" } }
          : {};
      const status = url.endsWith("/generate") ? 202 : url.endsWith("/api/creative-work") ? 201 : 200;
      return new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      });
    }));
    vi.useFakeTimers();

    const proofPromise = proofRedeliveryRestartAck(
      { sha: "b".repeat(40), provider: "controlled", webUrl: "http://stage", artifactsDir: "/tmp", timeoutS: 120 },
      env,
      pool,
      "2026-10-05T14:00:00.000Z",
      null,
    );
    await vi.runAllTimersAsync();
    const proof = await proofPromise;
    expect(proof.status, JSON.stringify(proof)).toBe("pass");
    expect(proof.evidence).toMatchObject({
      imageJobTarget: "web",
      restartExercised: false,
      restartNote: "restart não exercitado (sem instrumentação no web)",
      redeliveryCoherent: true,
    });
    expect(requests.filter((request) => request.includes("/generate"))).toHaveLength(2);
  });
});
