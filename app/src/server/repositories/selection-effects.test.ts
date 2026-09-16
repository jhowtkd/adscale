import { describe, expect, it } from "vitest";
import { selectionEffectIdempotencyKey } from "./selection-effects";

describe("selectionEffectIdempotencyKey", () => {
  const input = {
    workspaceId: "ws-1",
    outputId: "out-1",
    kind: "value_event" as const,
    effectVersion: 1,
  };

  it("is deterministic for the same obligation", () => {
    expect(selectionEffectIdempotencyKey(input)).toBe(selectionEffectIdempotencyKey(input));
  });

  it("differs per piece, kind and effect version", () => {
    const base = selectionEffectIdempotencyKey(input);
    expect(selectionEffectIdempotencyKey({ ...input, outputId: "out-2" })).not.toBe(base);
    expect(selectionEffectIdempotencyKey({ ...input, kind: "library" })).not.toBe(base);
    expect(selectionEffectIdempotencyKey({ ...input, effectVersion: 2 })).not.toBe(base);
  });
});
