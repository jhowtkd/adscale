// Enum → translated label with a raw-value fallback (#554).
//
// The API owns the vocabularies; when it returns a value this build
// doesn't know yet, the UI shows the raw value instead of a key path.

export function enumLabel(
  translate: (key: string) => string,
  key: string,
): string {
  try {
    const value = translate(key);
    if (typeof value !== "string" || value.length === 0) return key;
    return value;
  } catch {
    return key;
  }
}
