/** Only waiting and read timeouts; a timeout never authorizes compensation. */
export function settlementDeadline(input: { maxAttempts: number; maxMs: number }) {
  const expiresAt = performance.now() + input.maxMs;
  const remaining = () => Math.max(0, expiresAt - performance.now());
  let delayMs = 25;
  return {
    shouldContinue: (attempt: number) => attempt < input.maxAttempts && remaining() > 0,
    pause: () => new Promise<void>((resolve) => {
      const waitMs = Math.min(delayMs, remaining());
      delayMs = Math.min(delayMs * 2, 250);
      setTimeout(resolve, waitMs);
    }),
    async read<T>(operation: () => Promise<T>): Promise<T> {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        if (remaining() <= 0) throw new Error("settlement_read_timeout");
        // ponytail: bounds the caller, not the underlying DB read; use driver cancellation if abandoned reads accumulate.
        return await Promise.race([
          operation(),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new Error("settlement_read_timeout")), remaining());
          }),
        ]);
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
