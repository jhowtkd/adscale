export type StudioResultOutput = { status: string };

export type StudioResultSummaryKind = "generating" | "failed" | "partial" | "ready";

export type StudioResultSummary = {
  kind: StudioResultSummaryKind;
  ready: number;
  failed: number;
};

export function summarizeStudioBatch(
  outputs: readonly StudioResultOutput[],
  stage: string,
): StudioResultSummary {
  const ready = outputs.filter((output) => output.status === "completed").length;
  const failed = outputs.filter((output) => output.status === "failed").length;

  if (stage === "generation") {
    return { kind: "generating", ready, failed };
  }
  if (outputs.length > 0 && failed === outputs.length) {
    return { kind: "failed", ready, failed };
  }
  if (failed > 0 && ready > 0) {
    return { kind: "partial", ready, failed };
  }
  return { kind: "ready", ready, failed };
}
