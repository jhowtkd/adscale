import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/repositories/template", () => ({
  getTemplateById: vi.fn(),
}));

vi.mock("@/server/repositories/campaign", () => ({
  createCampaign: vi.fn(),
}));

import { getTemplateById } from "@/server/repositories/template";
import { createCampaign } from "@/server/repositories/campaign";
import {
  buildCampaignInputFromTemplate,
  materializeTemplateAsCampaign,
} from "./materialize-template-as-campaign";

const mockGetTemplate = vi.mocked(getTemplateById);
const mockCreate = vi.mocked(createCampaign);

const WS = "11111111-1111-4111-8111-111111111111";
const TEMPLATE_ID = "22222222-2222-4222-8222-222222222222";
const CAMPAIGN_ID = "33333333-3333-4333-8333-333333333333";
const USER_ID = "44444444-4444-4444-8444-444444444444";

const templateFixture = {
  id: TEMPLATE_ID,
  workspaceId: WS,
  name: "Black Friday Pack",
  description: "Seasonal",
  client: "Template Client (ignored)",
  product: "Course X",
  objective: "Leads",
  audience: "Founders",
  platforms: ["meta_feed", "tiktok"],
  tone: "direct",
  offer: "20% off",
  constraints: "No fake claims",
  notes: "Q3 push",
  generationMode: "art_variation",
  creativeLevel: "balanced",
  styleIntensity: "medium",
  ctaVariants: ["Buy now"],
  targetFormats: ["1:1", "4:5"],
  createdAt: new Date("2026-07-01T00:00:00.000Z"),
  updatedAt: new Date("2026-07-01T00:00:00.000Z"),
};

describe("buildCampaignInputFromTemplate", () => {
  it("maps briefing fields and never brand/refs", () => {
    const input = buildCampaignInputFromTemplate(templateFixture as never, {
      name: "BF Campaign",
      client: "Acme",
    });
    expect(input).toMatchObject({
      name: "BF Campaign",
      client: "Acme",
      product: "Course X",
      objective: "Leads",
      audience: "Founders",
      platforms: ["meta_feed", "tiktok"],
      tone: "direct",
      offer: "20% off",
      constraints: "No fake claims",
      notes: "Q3 push",
      generationMode: "art_variation",
      creativeLevel: "balanced",
      styleIntensity: "medium",
      ctaVariants: ["Buy now"],
      targetFormats: ["1:1", "4:5"],
      clientProfileId: null,
      selectedReferenceIds: null,
      status: "draft",
    });
  });
});

describe("materializeTemplateAsCampaign", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns template_not_found without creating", async () => {
    mockGetTemplate.mockResolvedValue(null);
    const result = await materializeTemplateAsCampaign({
      workspaceId: WS,
      userId: USER_ID,
      templateId: TEMPLATE_ID,
      name: "X",
      client: "Y",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("template_not_found");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("creates campaign from template with campaign intent and formatHint", async () => {
    mockGetTemplate.mockResolvedValue(templateFixture as never);
    mockCreate.mockResolvedValue({
      id: CAMPAIGN_ID,
      workspaceId: WS,
      name: "BF Campaign",
      client: "Acme",
      product: "Course X",
      objective: "Leads",
      audience: "Founders",
      platforms: ["meta_feed", "tiktok"],
      tone: "direct",
      offer: "20% off",
      constraints: "No fake claims",
      notes: "Q3 push",
      platformSpecificNotes: null,
      clientProfileId: null,
      selectedReferenceIds: null,
      generationMode: "art_variation",
      ctaVariants: ["Buy now"],
      targetFormats: ["1:1", "4:5"],
      status: "draft",
      creativeLevel: "balanced",
      styleIntensity: "medium",
      creativeDiagnosisStatus: "pending",
      creativeDiagnosis: null,
      creativeDiagnosisSource: null,
      creativeDiagnosisUpdatedAt: null,
      campaignMemory: null,
      createdAt: new Date("2026-07-13T12:00:00.000Z"),
      updatedAt: new Date("2026-07-13T12:00:00.000Z"),
    } as never);

    const result = await materializeTemplateAsCampaign({
      workspaceId: WS,
      userId: USER_ID,
      templateId: TEMPLATE_ID,
      name: "BF Campaign",
      client: "Acme",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(mockGetTemplate).toHaveBeenCalledWith(TEMPLATE_ID, WS);
    expect(mockCreate).toHaveBeenCalledWith(
      WS,
      expect.objectContaining({
        name: "BF Campaign",
        client: "Acme",
        product: "Course X",
        objective: "Leads",
        targetFormats: ["1:1", "4:5"],
        clientProfileId: null,
        selectedReferenceIds: null,
      })
    );
    // Must not copy brand/refs from template path.
    const createArg = mockCreate.mock.calls[0][1];
    expect(createArg.clientProfileId).toBeNull();
    expect(createArg.selectedReferenceIds).toBeNull();

    const { campaign, canonical } = result.value;
    expect(campaign.id).toBe(CAMPAIGN_ID);
    expect(canonical.id).toBe(`campaign:${CAMPAIGN_ID}`);
    expect(canonical.originKind).toBe("campaign");
    expect(canonical.intent).toEqual({
      kind: "campaign",
      objective: "Leads",
      formatHint: "1:1",
      platforms: ["meta_feed", "tiktok"],
    });
    expect(canonical.briefing).toEqual(
      expect.objectContaining({
        product: "Course X",
        client: "Acme",
        audience: "Founders",
        offer: "20% off",
        tone: "direct",
        constraints: "No fake claims",
        notes: "Q3 push",
      })
    );
    expect(canonical.resumeHref).toBe(`/campaigns/${CAMPAIGN_ID}`);
  });

  it("sets formatHint null when template has no targetFormats", async () => {
    mockGetTemplate.mockResolvedValue({
      ...templateFixture,
      targetFormats: null,
    } as never);
    mockCreate.mockResolvedValue({
      id: CAMPAIGN_ID,
      workspaceId: WS,
      name: "No Format",
      client: "Acme",
      product: null,
      objective: "Leads",
      audience: null,
      platforms: [],
      tone: null,
      offer: null,
      constraints: null,
      notes: null,
      platformSpecificNotes: null,
      clientProfileId: null,
      selectedReferenceIds: null,
      generationMode: "art_variation",
      ctaVariants: null,
      targetFormats: null,
      status: "draft",
      creativeLevel: "balanced",
      styleIntensity: "medium",
      creativeDiagnosisStatus: "pending",
      creativeDiagnosis: null,
      creativeDiagnosisSource: null,
      creativeDiagnosisUpdatedAt: null,
      campaignMemory: null,
      createdAt: new Date("2026-07-13T12:00:00.000Z"),
      updatedAt: new Date("2026-07-13T12:00:00.000Z"),
    } as never);

    const result = await materializeTemplateAsCampaign({
      workspaceId: WS,
      userId: USER_ID,
      templateId: TEMPLATE_ID,
      name: "No Format",
      client: "Acme",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.canonical.intent.formatHint).toBeNull();
  });
});
