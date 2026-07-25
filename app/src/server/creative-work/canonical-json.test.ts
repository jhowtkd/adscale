import { describe, expect, it } from "vitest";
import { canonicalJsonStringify } from "./canonical-json";

describe("canonicalJsonStringify", () => {
  it("treats semantically equal snapshots with different key order as equal", () => {
    const persisted = {
      request: "Promoção de matrícula para julho",
      settings: { targetFormats: [], formatMode: "auto" },
      factPack: {
        version: 1,
        request: "Promoção de matrícula para julho",
        identity: { clientProfileId: "profile-1", brandName: "Cenbrap" },
        brand: { requiredElements: [], prohibitedElements: ["Clipart"] },
        facts: [{ value: "julho", class: "date", required: true, origin: "request" }],
      },
      sources: [{ sourceId: "s1", usage: "content", content: null, style: null, assetKey: null, mimeType: null, updatedAt: "2026-07-16" }],
    };
    // Same value as a jsonb round trip could return it: every object key
    // reordered, nested levels included.
    const rebuilt = {
      sources: [{ updatedAt: "2026-07-16", mimeType: null, assetKey: null, style: null, content: null, usage: "content", sourceId: "s1" }],
      factPack: {
        facts: [{ origin: "request", required: true, class: "date", value: "julho" }],
        brand: { prohibitedElements: ["Clipart"], requiredElements: [] },
        identity: { brandName: "Cenbrap", clientProfileId: "profile-1" },
        request: "Promoção de matrícula para julho",
        version: 1,
      },
      settings: { formatMode: "auto", targetFormats: [] },
      request: "Promoção de matrícula para julho",
    };

    expect(JSON.stringify(persisted)).not.toBe(JSON.stringify(rebuilt));
    expect(canonicalJsonStringify(persisted)).toBe(canonicalJsonStringify(rebuilt));
  });

  it("still distinguishes semantically different values", () => {
    expect(canonicalJsonStringify({ a: 1, b: [1, 2] })).not.toBe(canonicalJsonStringify({ a: 1, b: [2, 1] }));
    expect(canonicalJsonStringify({ a: 1 })).not.toBe(canonicalJsonStringify({ a: 2 }));
    expect(canonicalJsonStringify({ a: 1 })).not.toBe(canonicalJsonStringify({ a: 1, b: null }));
  });
});
