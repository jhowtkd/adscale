import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { POST } from "./route";

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

vi.mock("@/server/auth/workspace", () => ({
  requireWorkspaceAccess: vi.fn(() =>
    Promise.resolve({
      user: { id: "user-1" },
      workspace: { id: "workspace-1" },
    })
  ),
}));

vi.mock("@/server/repositories/campaign", () => ({
  getCampaignById: vi.fn(),
  updateCampaign: vi.fn(),
}));

vi.mock("@/server/ai/utils", () => ({
  getOpenAI: vi.fn(() => ({
    chat: {
      completions: {
        create: vi.fn(),
      },
    },
  })),
}));

import { getCampaignById, updateCampaign } from "@/server/repositories/campaign";
import { getOpenAI } from "@/server/ai/utils";

const mockGetCampaign = vi.mocked(getCampaignById);
const mockUpdateCampaign = vi.mocked(updateCampaign);
const mockGetOpenAI = vi.mocked(getOpenAI);
const mockCreate = vi.fn();

describe("POST /api/campaigns/[id]/suggest-ctas", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCampaign.mockReset();
    mockUpdateCampaign.mockReset();
    mockCreate.mockReset();
    mockGetOpenAI.mockReturnValue({
      chat: {
        completions: {
          create: mockCreate,
        },
      },
    } as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns CTA suggestions from AI", async () => {
    mockGetCampaign.mockResolvedValue({
      id: "camp-1",
      workspaceId: "workspace-1",
      platformSpecificNotes: null,
    } as Awaited<ReturnType<typeof getCampaignById>>);

    mockCreate.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              suggestions: [
                { value: "Compre Agora", confidence: "high" },
                { value: "Aproveite 50% OFF", confidence: "medium" },
                { value: "Saiba Mais", confidence: "medium" },
              ],
            }),
          },
        },
      ],
    } as any);

    const res = await POST(
      new Request("http://localhost/api/campaigns/camp-1/suggest-ctas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignContext: {
            product: "Running Shoes",
            offer: "50% OFF",
          },
        }),
      }),
      { params: Promise.resolve({ id: "camp-1" }) }
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.suggestions).toHaveLength(3);
    expect(body.suggestions[0].value).toBe("Compre Agora");
    expect(body.suggestions[0].confidence).toBe("high");
  });

  it("returns cached suggestions when available", async () => {
    mockGetCampaign.mockResolvedValue({
      id: "camp-1",
      workspaceId: "workspace-1",
      platformSpecificNotes: {
        _ctaSuggestions: [
          { value: "Cached CTA", confidence: "high" },
        ],
      },
    } as Awaited<ReturnType<typeof getCampaignById>>);

    const res = await POST(
      new Request("http://localhost/api/campaigns/camp-1/suggest-ctas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignContext: {},
        }),
      }),
      { params: Promise.resolve({ id: "camp-1" }) }
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.suggestions).toEqual([{ value: "Cached CTA", confidence: "high" }]);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("returns default suggestions when AI fails", async () => {
    mockGetCampaign.mockResolvedValue({
      id: "camp-1",
      workspaceId: "workspace-1",
      platformSpecificNotes: null,
    } as Awaited<ReturnType<typeof getCampaignById>>);

    mockCreate.mockResolvedValue({
      choices: [{ message: { content: null } }],
    } as any);

    const res = await POST(
      new Request("http://localhost/api/campaigns/camp-1/suggest-ctas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignContext: {},
        }),
      }),
      { params: Promise.resolve({ id: "camp-1" }) }
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.suggestions).toHaveLength(3);
    expect(body.suggestions[0].value).toBe("Compre Agora");
  });

  it("returns 400 for invalid input", async () => {
    mockGetCampaign.mockResolvedValue({
      id: "camp-1",
      workspaceId: "workspace-1",
      platformSpecificNotes: null,
    } as Awaited<ReturnType<typeof getCampaignById>>);

    const res = await POST(
      new Request("http://localhost/api/campaigns/camp-1/suggest-ctas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignContext: {
            platforms: "not-an-array",
          },
        }),
      }),
      { params: Promise.resolve({ id: "camp-1" }) }
    );

    expect(res.status).toBe(400);
  });

  it("returns 404 for non-existent campaign", async () => {
    mockGetCampaign.mockResolvedValue(null);

    const res = await POST(
      new Request("http://localhost/api/campaigns/camp-1/suggest-ctas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignContext: {},
        }),
      }),
      { params: Promise.resolve({ id: "camp-1" }) }
    );

    expect(res.status).toBe(404);
  });

  it("generates suggestions with existing CTAs excluded", async () => {
    mockGetCampaign.mockResolvedValue({
      id: "camp-1",
      workspaceId: "workspace-1",
      platformSpecificNotes: null,
    } as Awaited<ReturnType<typeof getCampaignById>>);

    mockCreate.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              suggestions: [
                { value: "Nova Sugestão", confidence: "high" },
              ],
            }),
          },
        },
      ],
    } as any);

    const res = await POST(
      new Request("http://localhost/api/campaigns/camp-1/suggest-ctas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignContext: {
            product: "Shoes",
          },
          existingCtas: ["Compre Agora", "Saiba Mais"],
        }),
      }),
      { params: Promise.resolve({ id: "camp-1" }) }
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.suggestions[0].value).toBe("Nova Sugestão");
    
    // Verify the prompt includes existing CTAs
    const prompt = mockCreate.mock.calls[0][0].messages[1].content;
    expect(prompt).toContain("Compre Agora");
    expect(prompt).toContain("Saiba Mais");
  });
});
