export function isInsufficientCreditsError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return (
    message.includes("insufficientcredits") ||
    message.includes("insufficient credits")
  );
}

export function creditFrictionDiagnostic(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return { creditError: error.message.slice(0, 120), operation: "credit_spend" };
  }
  return { creditError: "unknown", operation: "credit_spend" };
}
