import { analyzeCreativeWorkSource } from "@/server/application/analyze-creative-work-source";
import { inngest } from "./client";

export type CreativeWorkSourceAnalyzeEvent = { workspaceId: string; workItemId: string; sourceId: string };

export function runCreativeWorkSourceAnalysis(data: CreativeWorkSourceAnalyzeEvent) {
  return analyzeCreativeWorkSource(data);
}

export const creativeWorkSourceAnalyzeJob = inngest.createFunction(
  { id: "analyze-creative-work-source", retries: 2, triggers: [{ event: "creative-work.source.analyze" }] },
  async ({ event, step }) => step.run("analyze-source", () => runCreativeWorkSourceAnalysis(event.data as CreativeWorkSourceAnalyzeEvent)),
);
