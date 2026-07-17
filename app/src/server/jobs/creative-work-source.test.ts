import { describe, expect, it, vi } from "vitest";

const analyzeCreativeWorkSource = vi.hoisted(() => vi.fn());
vi.mock("@/server/application/analyze-creative-work-source", () => ({ analyzeCreativeWorkSource }));

import { creativeWorkSourceAnalyzeJob, runCreativeWorkSourceAnalysis } from "./creative-work-source";

describe("creative work source job", () => {
  it("passes only scoped identifiers to the application command", async () => {
    analyzeCreativeWorkSource.mockResolvedValue({ status: "ready" });
    await runCreativeWorkSourceAnalysis({ workspaceId: "ws-1", workItemId: "work-1", sourceId: "source-1" });
    expect(analyzeCreativeWorkSource).toHaveBeenCalledWith({ workspaceId: "ws-1", workItemId: "work-1", sourceId: "source-1" });
  });

  it("registers the durable source-analysis trigger", () => {
    const opts = (creativeWorkSourceAnalyzeJob as unknown as {
      opts: { id?: string; retries?: number; triggers?: Array<{ event?: string }> };
    }).opts;
    expect(opts.id).toBe("analyze-creative-work-source");
    expect(opts.retries).toBe(0);
    expect(opts.triggers).toEqual([{ event: "creative-work.source.analyze" }]);
  });
});
