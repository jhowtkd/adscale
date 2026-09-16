import { describe, expect, it } from "vitest";
import {
  createDiagnosticContext,
  getDiagnosticContext,
  withDiagnosticContext,
} from "./context";

const tick = () =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, Math.floor(Math.random() * 3));
  });

describe("diagnostic ambient context (trace-386)", () => {
  it("exposes no context outside a scope", () => {
    expect(getDiagnosticContext()).toBeUndefined();
  });

  it("exposes the context inside the scope and restores the outer scope after", async () => {
    const outer = createDiagnosticContext({
      workspaceId: "ws-outer",
      workItemId: "work-outer",
    });
    const inner = createDiagnosticContext({
      workspaceId: "ws-inner",
      workItemId: "work-inner",
    });

    const seen = await withDiagnosticContext(outer, async () => {
      expect(getDiagnosticContext()).toBe(outer);
      const seenInner = await withDiagnosticContext(inner, async () => {
        await tick();
        return getDiagnosticContext();
      });
      expect(seenInner).toBe(inner);
      return getDiagnosticContext();
    });

    expect(seen).toBe(outer);
    expect(getDiagnosticContext()).toBeUndefined();
  });

  it("propagates rejections without leaking the scope", async () => {
    const context = createDiagnosticContext({
      workspaceId: "ws-1",
      workItemId: "work-1",
    });
    await expect(
      withDiagnosticContext(context, async () => {
        await tick();
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(getDiagnosticContext()).toBeUndefined();
  });

  it("keeps interleaved operations on their own workspace context under concurrency", async () => {
    const workspaces = ["ws-a", "ws-b", "ws-c", "ws-d"];
    const perWorkspace = 8;
    const operations = workspaces.flatMap((workspaceId) =>
      Array.from({ length: perWorkspace }, (_, index) => ({
        workspaceId,
        workItemId: `work-${workspaceId}-${index}`,
      })),
    );

    const results = await Promise.all(
      operations.map(async ({ workspaceId, workItemId }) => {
        const context = createDiagnosticContext({ workspaceId, workItemId });
        return withDiagnosticContext(context, async () => {
          for (let round = 0; round < 6; round += 1) {
            await tick();
            const current = getDiagnosticContext();
            // No workspace's context may ever appear in another operation.
            expect(current?.workspaceId).toBe(workspaceId);
            expect(current?.workItemId).toBe(workItemId);
            expect(current).toBe(context);
          }
          return getDiagnosticContext();
        });
      }),
    );

    expect(results).toHaveLength(operations.length);
    for (const [index, seen] of results.entries()) {
      expect(seen?.workspaceId).toBe(operations[index]!.workspaceId);
      expect(seen?.workItemId).toBe(operations[index]!.workItemId);
    }
    expect(getDiagnosticContext()).toBeUndefined();
  });

  it("never leaks a scoped context into concurrent unscoped work", async () => {
    const scoped = createDiagnosticContext({
      workspaceId: "ws-scoped",
      workItemId: "work-scoped",
    });
    const unscopedSeen: unknown[] = [];
    await Promise.all([
      withDiagnosticContext(scoped, async () => {
        for (let round = 0; round < 6; round += 1) {
          await tick();
          expect(getDiagnosticContext()).toBe(scoped);
        }
      }),
      (async () => {
        for (let round = 0; round < 6; round += 1) {
          await tick();
          unscopedSeen.push(getDiagnosticContext());
        }
      })(),
    ]);
    expect(unscopedSeen).toEqual(
      Array.from({ length: 6 }, () => undefined),
    );
  });
});

describe("createDiagnosticContext (trace-386)", () => {
  it("builds a frozen-shape context from minimal input", () => {
    const context = createDiagnosticContext({
      workspaceId: "ws-1",
      workItemId: "work-1",
    });

    expect(context).toMatchObject({
      schemaVersion: 1,
      workspaceId: "ws-1",
      clientProfileId: null,
      workItemId: "work-1",
      protocol: "single",
      process: "web",
    });
    expect(typeof context.operationId).toBe("string");
    expect(context.operationId.length).toBeGreaterThan(0);
    expect(typeof context.releaseSha).toBe("string");
    expect(typeof context.environment).toBe("string");
  });

  it("mints a distinct operation id per call", () => {
    const first = createDiagnosticContext({
      workspaceId: "ws-1",
      workItemId: "work-1",
    });
    const second = createDiagnosticContext({
      workspaceId: "ws-1",
      workItemId: "work-1",
    });
    expect(first.operationId).not.toBe(second.operationId);
  });

  it("honors explicit identity, release and routing overrides", () => {
    const context = createDiagnosticContext({
      workspaceId: "ws-1",
      workItemId: "work-1",
      clientProfileId: "profile-1",
      operationId: "op-1",
      parentOperationId: "op-parent",
      generationCorrelationId: "generation-1",
      outputId: "output-1",
      inngestRunId: "run-1",
      attemptNumber: 2,
      releaseSha: "abc1234",
      environment: "staging",
      process: "worker",
      dataOrigin: "synthetic",
    });

    expect(context).toEqual({
      schemaVersion: 1,
      workspaceId: "ws-1",
      clientProfileId: "profile-1",
      workItemId: "work-1",
      protocol: "single",
      operationId: "op-1",
      parentOperationId: "op-parent",
      generationCorrelationId: "generation-1",
      outputId: "output-1",
      inngestRunId: "run-1",
      attemptNumber: 2,
      releaseSha: "abc1234",
      environment: "staging",
      process: "worker",
      dataOrigin: "synthetic",
    });
  });

  it("resolves the release from RENDER_GIT_COMMIT with an unknown fallback", () => {
    expect(
      createDiagnosticContext(
        { workspaceId: "ws-1", workItemId: "work-1" },
        { RENDER_GIT_COMMIT: "deadbee" },
      ).releaseSha,
    ).toBe("deadbee");
    expect(
      createDiagnosticContext(
        { workspaceId: "ws-1", workItemId: "work-1" },
        {},
      ).releaseSha,
    ).toBe("unknown");
  });

  it("defaults data origin to test under test runtimes, production otherwise", () => {
    expect(
      createDiagnosticContext(
        { workspaceId: "ws-1", workItemId: "work-1" },
        { NODE_ENV: "test" },
      ).dataOrigin,
    ).toBe("test");
    expect(
      createDiagnosticContext(
        { workspaceId: "ws-1", workItemId: "work-1" },
        { NODE_ENV: "production", VITEST: "true" },
      ).dataOrigin,
    ).toBe("test");
    expect(
      createDiagnosticContext(
        { workspaceId: "ws-1", workItemId: "work-1" },
        { NODE_ENV: "production" },
      ).dataOrigin,
    ).toBe("production");
    expect(
      createDiagnosticContext(
        { workspaceId: "ws-1", workItemId: "work-1", dataOrigin: "staging" },
        { NODE_ENV: "production" },
      ).dataOrigin,
    ).toBe("staging");
  });

  it.each([[-1], [1.5], [Number.NaN]])(
    "rejects non-integer attempt number %o",
    (attemptNumber) => {
      expect(() =>
        createDiagnosticContext({
          workspaceId: "ws-1",
          workItemId: "work-1",
          attemptNumber,
        }),
      ).toThrow(TypeError);
    },
  );

  it.each([
    [{ workspaceId: "", workItemId: "work-1" }, "workspaceId"],
    [{ workspaceId: "ws-1", workItemId: "" }, "workItemId"],
    [{ workspaceId: "ws-1", workItemId: "work-1", operationId: "" }, "operationId"],
  ])("rejects empty server-side identity %o", (input) => {
    expect(() =>
      createDiagnosticContext(
        input as { workspaceId: string; workItemId: string },
      ),
    ).toThrow(TypeError);
  });
});
