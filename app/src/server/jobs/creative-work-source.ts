import { analyzeCreativeWorkSource } from "@/server/application/analyze-creative-work-source";
import { inngest } from "./client";
import type { Inngest } from "inngest";

export type CreativeWorkSourceAnalyzeEvent = { workspaceId: string; workItemId: string; sourceId: string };

export function runCreativeWorkSourceAnalysis(data: CreativeWorkSourceAnalyzeEvent) {
  return analyzeCreativeWorkSource(data);
}

export const creativeWorkSourceAnalyzeJob = inngest.createFunction(
  { id: "analyze-creative-work-source", retries: 0, triggers: [{ event: "creative-work.source.analyze" }] },
  async ({ event, step }) => step.run("analyze-source", () => runCreativeWorkSourceAnalysis(event.data as CreativeWorkSourceAnalyzeEvent)),
);


export function createCreativeWorkSourceAnalyzeJobV2(client: Inngest) {
  return client.createFunction(
    { id: "analyze-creative-work-source-v2", retries: 0, triggers: [{ event: "creative-work.source.analyze.v2" }] },
    async ({ event, step }) => step.run("analyze-source", () => runCreativeWorkSourceAnalysis(event.data as CreativeWorkSourceAnalyzeEvent)),
  );
}
