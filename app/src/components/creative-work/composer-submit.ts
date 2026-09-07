export type ConfirmGenerationDecision = "confirm" | "revise" | "skip";

export function confirmGenerationDecision(input: {
  workId: string | null;
  preparedRevision: string | undefined;
  preparedSignature: string | null | undefined;
  currentSignature: string;
  status: string | undefined;
  outputCount: number;
}): ConfirmGenerationDecision {
  if (!input.workId || !input.preparedRevision) return "revise";
  if (
    input.preparedSignature?.startsWith("stale:")
    || (input.preparedSignature != null && input.preparedSignature !== input.currentSignature)
  ) {
    return "revise";
  }
  if (input.status && input.status !== "draft" && !(input.status === "ready" && input.outputCount === 0)) {
    return "skip";
  }
  return "confirm";
}

export function generationLooksAccepted(input: {
  status?: string;
  outputCount: number;
  carouselSlideCount: number;
}): boolean {
  return input.status === "generating" || input.outputCount > 0 || input.carouselSlideCount > 0;
}

export async function runGuardedSubmit<T>(
  guard: { current: boolean },
  blocked: boolean,
  action: () => Promise<T>,
): Promise<T | undefined> {
  if (blocked) return undefined;
  guard.current = true;
  try {
    return await action();
  } finally {
    guard.current = false;
  }
}
