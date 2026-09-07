import { hasCreativeWorkProtocolSourceShape } from "@/lib/creative-work-protocol-eligibility";
import type { CreativeWorkSource } from "@/lib/hooks/use-creative-work";
import type { ComposerIntent } from "./composer-state";

export function isComposerPlanStale(input: {
  currentPlanRevision: string | null;
  invalidatedPlanRevision: string | null;
  preparedSignature: string | null;
  currentSignature: string;
}): boolean {
  if (!input.currentPlanRevision) return false;
  return input.invalidatedPlanRevision === input.currentPlanRevision
    || Boolean(input.preparedSignature?.startsWith("stale:"))
    || input.preparedSignature !== input.currentSignature;
}

export function shouldSkipPrepare(input: {
  status: string | undefined;
  outputCount: number;
  planIsStale: boolean;
}): boolean {
  if (!input.status || input.status === "draft") return false;
  const canReopenPreparedRetry = input.status === "ready" && input.outputCount === 0;
  return !(canReopenPreparedRetry && input.planIsStale);
}

export function restylePairMissing(input: {
  intent: ComposerIntent;
  request: string;
  sources: Pick<CreativeWorkSource, "id" | "usage" | "status">[];
}): boolean {
  if (input.intent !== "restyle") return false;
  const readySources = input.sources.filter((source) => source.status === "ready");
  return !hasCreativeWorkProtocolSourceShape({
    intent: "restyle",
    request: input.request,
    sources: readySources.map((source) => ({ sourceId: source.id, usage: source.usage })),
  });
}

export function pendingAnalysisBlocksPrepare(
  sources: Array<{ status: string }>,
): boolean {
  return sources.some((source) => source.status === "uploaded" || source.status === "analyzing");
}
