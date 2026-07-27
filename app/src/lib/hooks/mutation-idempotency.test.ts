import { describe, expect, it, vi } from "vitest";
import { createMutationIdempotency } from "./mutation-idempotency";

describe("createMutationIdempotency", () => {
  it("keeps the key across transport failures and rotates after a response", () => {
    vi.spyOn(crypto, "randomUUID")
      .mockReturnValueOnce("key-a")
      .mockReturnValueOnce("key-b");

    const idempotency = createMutationIdempotency();
    expect(idempotency.current()).toBe("key-a");
    expect(idempotency.current()).toBe("key-a");

    // Transport loss: no rotate — retry reuses key-a.
    expect(idempotency.current()).toBe("key-a");

    // Confirmed HTTP response (2xx or 5xx body): end attempt.
    idempotency.rotateAfterResponse();
    expect(idempotency.current()).toBe("key-b");
  });
});
