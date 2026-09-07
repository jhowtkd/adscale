import { isApiRequestUncertain } from "@/lib/api-client";

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
