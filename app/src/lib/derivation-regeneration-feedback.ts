export function buildRegenerationFeedback(input: {
  regenerationSuggestion?: string | null;
  hardFailures?: Array<{ code: string; message: string }> | null;
}): string {
  const suggestion = input.regenerationSuggestion?.trim();
  if (suggestion) {
    return suggestion;
  }

  const failures = input.hardFailures ?? [];
  if (failures.length === 0) {
    return "";
  }

  return failures
    .map((failure) => `${failure.code}: ${failure.message}`)
    .join("\n");
}
