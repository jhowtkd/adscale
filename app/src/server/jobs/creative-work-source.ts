import { analyzeCreativeWorkSource, type SourceAnalysisExecution } from "@/server/application/analyze-creative-work-source";
import { inngest } from "./client";
import type { Inngest } from "inngest";

export type CreativeWorkSourceAnalyzeEvent = { workspaceId: string; workItemId: string; sourceId: string };

export function runCreativeWorkSourceAnalysis(data: CreativeWorkSourceAnalyzeEvent, execution?: SourceAnalysisExecution) {
  return execution ? analyzeCreativeWorkSource(data, execution) : analyzeCreativeWorkSource(data);
}

// Three total attempts; the application emits RetryAfterError only before paid calls.
export const creativeWorkSourceAnalyzeJob = inngest.createFunction(
  { id: "analyze-creative-work-source", retries: 2, triggers: [{ event: "creative-work.source.analyze" }] },
  async ({ event, step, attempt }) => runCreativeWorkSourceAnalysis(event.data as CreativeWorkSourceAnalyzeEvent, { attempt, run: (id, action) => step.run(id, action) as Promise<Awaited<ReturnType<typeof action>>> }),
);


export function createCreativeWorkSourceAnalyzeJobV2(client: Inngest) {
  return client.createFunction(
    { id: "analyze-creative-work-source-v2", retries: 2, triggers: [{ event: "creative-work.source.analyze.v2" }] },
    async ({ event, step, attempt }) => runCreativeWorkSourceAnalysis(event.data as CreativeWorkSourceAnalyzeEvent, { attempt, run: (id, action) => step.run(id, action) as Promise<Awaited<ReturnType<typeof action>>> }),
  );
}
