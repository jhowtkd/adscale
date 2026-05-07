/**
 * Parse and validate style intensity from form data or other raw input.
 * Exported as a pure function for easy testing.
 */
export function parseStyleIntensity(
  raw: FormDataEntryValue | null | undefined
): "soft" | "medium" | "strong" | null {
  if (typeof raw === "string" && ["soft", "medium", "strong"].includes(raw)) {
    return raw as "soft" | "medium" | "strong";
  }
  if (raw == null) {
    return "medium";
  }
  return null;
}
