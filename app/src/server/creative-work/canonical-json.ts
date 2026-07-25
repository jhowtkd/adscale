/**
 * Canonical JSON string used ONLY for equality comparisons — never for
 * persistence. Object keys are sorted recursively so two semantically equal
 * values compare equal even after a PostgreSQL jsonb round trip, which does
 * not preserve key order (R-002 prepare idempotency: without this the
 * snapshot "reuse" branch is dead code and every prepare would regenerate
 * copy, paying an LLM call and risking a spurious invalid_context on an
 * unchanged work).
 */
export function canonicalJsonStringify(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(record)
        .sort()
        .map((key) => [key, canonicalize(record[key])]),
    );
  }
  return value;
}
