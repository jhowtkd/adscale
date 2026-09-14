import { isApiRequestUncertain } from "@/lib/api-client";
import type { CreativeWorkOutput } from "@/lib/hooks/use-creative-work";

export function classifyLayerizeRequestFailure(cause: unknown): "uncertain" | "terminal" {
  const code = typeof cause === "object" && cause && "code" in cause
    ? (cause as { code?: string }).code
    : null;
  return isApiRequestUncertain(cause) || code === "creativeWorkLayerizationDispatchFailed"
    ? "uncertain"
    : "terminal";
}

export function revisionAttemptKey(input: {
  outputId: string;
  instruction: string;
  attachmentName?: string | null;
  attachmentSize?: number | null;
}): string {
  return `${input.outputId}:${input.instruction.trim()}:${input.attachmentName ?? ""}:${input.attachmentSize ?? 0}`;
}

export function outputSource(output: CreativeWorkOutput) {
  return `/api/creative-work/${output.workItemId}/outputs/${output.id}/download`;
}

export function hasUsableOutput(output: CreativeWorkOutput) {
  return output.status === "completed" && (output.hasOutput ?? Boolean(output.outputKey));
}

/** Chain from an output up to its lineage root, nearest ancestor first. */
export function outputLineage(
  outputs: readonly CreativeWorkOutput[],
  current: CreativeWorkOutput,
): CreativeWorkOutput[] {
  const byId = new Map(outputs.map((output) => [output.id, output]));
  const visited = new Set<string>();
  const lineage: CreativeWorkOutput[] = [];
  let cursor: CreativeWorkOutput | undefined = current;
  while (cursor && !visited.has(cursor.id)) {
    visited.add(cursor.id);
    lineage.push(cursor);
    cursor = cursor.parentOutputId ? byId.get(cursor.parentOutputId) : undefined;
  }
  return lineage;
}

export function lineageRootId(outputs: readonly CreativeWorkOutput[], output: CreativeWorkOutput) {
  const lineage = outputLineage(outputs, output);
  return lineage.at(-1)?.id ?? output.id;
}

/**
 * Human version label position: visual order along the lineage starting at 1
 * from the root, so a format adaptation can be "Versão 2" even when its
 * per-format versionNumber is 1.
 */
export function visualVersionNumber(
  outputs: readonly CreativeWorkOutput[],
  output: CreativeWorkOutput,
): number {
  const lineage = outputLineage(outputs, output);
  const index = lineage.findIndex((entry) => entry.id === output.id);
  return lineage.length - index;
}
