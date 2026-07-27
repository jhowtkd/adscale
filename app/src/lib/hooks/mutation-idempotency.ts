/**
 * Stable Idempotency-Key for one logical mutate attempt.
 * Survives network/error retries until success, then rotates for the next click.
 */
export function createMutationIdempotency() {
  let key: string | null = null;
  return {
    /** Key for the current attempt; created on first use. */
    current(): string {
      key ??= crypto.randomUUID();
      return key;
    },
    /** Call only after a confirmed successful response. */
    rotateAfterSuccess(): void {
      key = null;
    },
  };
}
