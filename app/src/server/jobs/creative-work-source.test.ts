import { describe, expect, it, vi } from "vitest";

const analyzeCreativeWorkSource = vi.hoisted(() => vi.fn());
vi.mock("@/server/application/analyze-creative-work-source", () => ({ analyzeCreativeWorkSource }));

import { runCreativeWorkSourceAnalysis } from "./creative-work-source";

describe("creative work source job", () => {
  it("passes only scoped identifiers to the application command", async () => {
    analyzeCreativeWorkSource.mockResolvedValue({ status: "ready" });
    await runCreativeWorkSourceAnalysis({ workspaceId: "ws-1", workItemId: "work-1", sourceId: "source-1" });
    expect(analyzeCreativeWorkSource).toHaveBeenCalledWith({ workspaceId: "ws-1", workItemId: "work-1", sourceId: "source-1" });
  });
});
