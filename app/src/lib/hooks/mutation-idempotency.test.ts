import { describe, expect, it, vi } from "vitest";
import { createMutationIdempotency } from "./mutation-idempotency";

describe("createMutationIdempotency", () => {
  it("reuses the same key until success", () => {
    vi.spyOn(crypto, "randomUUID")
      .mockReturnValueOnce("key-a")
      .mockReturnValueOnce("key-b");

    const idempotency = createMutationIdempotency();
    expect(idempotency.current()).toBe("key-a");
    expect(idempotency.current()).toBe("key-a");

    // Error/retry path keeps the key (no rotate).
    expect(idempotency.current()).toBe("key-a");

    idempotency.rotateAfterSuccess();
    expect(idempotency.current()).toBe("key-b");
  });
});
