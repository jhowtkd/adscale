import { RasterRetryError } from "@/server/equipe/handoff/raster-image";
import { describe, expect, it, vi } from "vitest";

const analyzeCreativeWorkSource = vi.hoisted(() => vi.fn());
vi.mock("@/server/application/analyze-creative-work-source", () => ({ analyzeCreativeWorkSource, SOURCE_ANALYSIS_MAX_ATTEMPTS: 3 }));

import { Inngest } from "inngest";
import { createCreativeWorkSourceAnalyzeJobV2, creativeWorkSourceAnalyzeJob, runCreativeWorkSourceAnalysis } from "./creative-work-source";

describe("creative work source job", () => {
  it("passes only scoped identifiers to the application command", async () => {
    analyzeCreativeWorkSource.mockResolvedValue({ status: "ready" });
    await runCreativeWorkSourceAnalysis({ workspaceId: "ws-1", workItemId: "work-1", sourceId: "source-1" });
    expect(analyzeCreativeWorkSource).toHaveBeenCalledWith({ workspaceId: "ws-1", workItemId: "work-1", sourceId: "source-1" });
  });

  it.each(["capacity", "wait_timeout", "unavailable"] as const)("propagates %s unchanged when no execution is given", async reason => {
    const error = new RasterRetryError(reason);
    analyzeCreativeWorkSource.mockRejectedValueOnce(error);
    await expect(runCreativeWorkSourceAnalysis({ workspaceId: "ws-1", workItemId: "work-1", sourceId: "source-1" })).rejects.toBe(error);
  });

  it("registers the durable source-analysis trigger", () => {
    const opts = (creativeWorkSourceAnalyzeJob as unknown as {
      opts: { id?: string; retries?: number; triggers?: Array<{ event?: string }> };
    }).opts;
    expect(opts.id).toBe("analyze-creative-work-source");
    expect(opts.retries).toBe(2);
    expect(opts.triggers).toEqual([{ event: "creative-work.source.analyze" }]);
  });

  it("registers the v2 trigger with the same two retries", () => {
    const opts = (createCreativeWorkSourceAnalyzeJobV2(new Inngest({ id: "test" })) as unknown as {
      opts: { id?: string; retries?: number; triggers?: Array<{ event?: string }> };
    }).opts;
    expect(opts).toMatchObject({ id: "analyze-creative-work-source-v2", retries: 2, triggers: [{ event: "creative-work.source.analyze.v2" }] });
  });

  it("forwards the executor's attempt and step.run to the application, for v1 and v2", async () => {
    const data = { workspaceId: "ws-1", workItemId: "work-1", sourceId: "source-1" };
    const stepRun = vi.fn(async (_id: string, action: () => Promise<unknown>) => action());
    for (const job of [creativeWorkSourceAnalyzeJob, createCreativeWorkSourceAnalyzeJobV2(new Inngest({ id: "test" }))]) {
      analyzeCreativeWorkSource.mockReset();
      analyzeCreativeWorkSource.mockImplementation(async (_data, execution) => execution.run("probe", async () => `attempt-${execution.attempt}`));
      const fn = (job as unknown as { fn: (ctx: unknown) => Promise<unknown> }).fn;
      await expect(fn({ event: { data }, step: { run: stepRun }, attempt: 2 })).resolves.toBe("attempt-2");
      expect(analyzeCreativeWorkSource).toHaveBeenCalledWith(data, { attempt: 2, run: expect.any(Function) });
    }
    expect(stepRun).toHaveBeenCalledTimes(2);
    expect(stepRun).toHaveBeenCalledWith("probe", expect.any(Function));
  });
});
