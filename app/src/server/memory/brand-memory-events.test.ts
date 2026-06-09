import { describe, expect, it } from "vitest";
import {
  buildBrandMemorySearchQuery,
  prepareBrandMemoryEvent,
  sanitizeBrandMemoryPayload,
} from "./brand-memory-events";

describe("brand memory events", () => {
  it("sanitizes secret-like fields without removing asset keys", () => {
    expect(
      sanitizeBrandMemoryPayload({
        apiKey: "secret",
        accessToken: "token",
        assetKey: "campaigns/c1/file.png",
        nested: { clientSecret: "secret", outputKey: "outputs/d1.png" },
      })
    ).toEqual({
      assetKey: "campaigns/c1/file.png",
      nested: { outputKey: "outputs/d1.png" },
    });
  });

  it("prepares a bounded JSON memory payload", () => {
    const prepared = prepareBrandMemoryEvent(
      {
        type: "creative_approved",
        workspaceId: "workspace-1",
        clientProfileId: "profile-1",
        campaignId: "campaign-1",
        derivationId: "derivation-1",
        occurredAt: new Date("2026-05-26T10:00:00.000Z"),
        summary: "Approved a high-contrast offer creative.",
        payload: { ctaText: "Comprar agora", apiKey: "secret" },
      },
      "adscale_workspace_workspace-1"
    );

    expect(prepared).toMatchObject({
      userId: "adscale_workspace_workspace-1",
      createdAt: "2026-05-26T10:00:00.000Z",
      sourceDescription: "ADScale creative_approved",
      metadata: {
        eventType: "creative_approved",
        workspaceId: "workspace-1",
        clientProfileId: "profile-1",
        campaignId: "campaign-1",
        derivationId: "derivation-1",
      },
    });
    expect(prepared.content).toContain("Approved a high-contrast offer creative.");
    expect(prepared.content).not.toContain("secret");
  });

  it("builds a campaign-aware search query", () => {
    const query = buildBrandMemorySearchQuery({
      clientProfileName: "Acme",
      offer: "20% off",
      ctaText: "Buy now",
      targetFormat: "4:5",
    });

    expect(query).toContain("brand profile: Acme");
    expect(query).toContain("offer: 20% off");
    expect(query).toContain("CTA: Buy now");
    expect(query).toContain("target format: 4:5");
  });
});

