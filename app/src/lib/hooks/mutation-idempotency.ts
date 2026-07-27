/**
 * Stable Idempotency-Key for one logical mutate attempt.
 *
 * - Transport failure (no Response): keep key so retry is the same settlement.
 * - Any confirmed Response (2xx or error body): rotate so the next click is new.
 */
export function createMutationIdempotency() {
  let key: string | null = null;
  return {
    /** Key for the current attempt; created on first use. */
    current(): string {
      key ??= crypto.randomUUID();
      return key;
    },
    /**
     * Call after apiFetch returns a Response (success or HTTP error).
     * Do not call when fetch rejects without a response.
     */
    rotateAfterResponse(): void {
      key = null;
    },
  };
}
