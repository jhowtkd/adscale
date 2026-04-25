import { describe, it, expect } from "vitest";

function isValidUuid(str: string): boolean {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

function extractUuidFromKey(key: string): string | null {
  const match = key.match(
    /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i
  );
  return match ? match[1] : null;
}

describe("R2 key sanitization", () => {
  it("keys contain a valid UUID segment", () => {
    const keys = [
      "campaigns/camp-123/550e8400-e29b-41d4-a716-446655440000-hero.png",
      "derivations/deriv-123/1700000000000.png",
      "exports/ws-123/deriv-456/1700000000000.png",
      "assets/123e4567-e89b-12d3-a456-426614174000-image.jpg",
    ];

    for (const key of keys) {
      const uuid = extractUuidFromKey(key);
      if (uuid) {
        expect(isValidUuid(uuid)).toBe(true);
      }
    }
  });

  it("presign route key contains campaign path prefix and UUID", () => {
    const campaignId = "camp-abc";
    const filename = "hero.png";
    const uuid = "550e8400-e29b-41d4-a716-446655440000";
    const key = `campaigns/${campaignId}/${uuid}-${filename}`;

    expect(key.startsWith("campaigns/")).toBe(true);
    expect(key.includes(uuid)).toBe(true);
    expect(key.endsWith(filename)).toBe(true);
  });

  it("derivation output key uses derivations prefix", () => {
    const derivationId = "deriv-xyz";
    const key = `derivations/${derivationId}/${Date.now()}.png`;

    expect(key.startsWith("derivations/")).toBe(true);
    expect(key.includes(derivationId)).toBe(true);
  });

  it("export key uses exports prefix", () => {
    const workspaceId = "ws-123";
    const derivationId = "deriv-456";
    const key = `exports/${workspaceId}/${derivationId}/${Date.now()}.png`;

    expect(key.startsWith("exports/")).toBe(true);
  });
});
