import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { POST } from "./route";

const freePlan = vi.hoisted(() => ({ find: vi.fn(async (): Promise<{ accountId: string } | null> => null) }));
vi.mock("@/server/equipe/module/free-plan", () => ({
  findFreePlanAccount: (...args: unknown[]) => (freePlan.find as (...a: unknown[]) => unknown)(...args),
}));

// Records each rate-limit call and delegates to the real implementation (the other tests rely on it).
const rateLimit = vi.hoisted(() => ({ calls: [] as unknown[][] }));
vi.mock("@/lib/with-rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/with-rate-limit")>();
  return {
    ...actual,
    checkRateLimit: (...args: Parameters<typeof actual.checkRateLimit>) => {
      rateLimit.calls.push(args);
      return actual.checkRateLimit(...args);
    },
  };
});

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
    } as unknown);
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
    } as unknown);

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
    } as unknown);

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
    } as unknown);

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

describe("POST /api/campaigns/[id]/suggest-ctas on the free plan (ticket 11, part 2)", () => {
  const post = (body: unknown) =>
    POST(
      new Request("http://localhost/api/campaigns/camp-1/suggest-ctas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: typeof body === "string" ? body : JSON.stringify(body),
      }),
      { params: Promise.resolve({ id: "camp-1" }) }
    );

  beforeEach(() => {
    vi.clearAllMocks();
    rateLimit.calls.length = 0;
    freePlan.find.mockReset();
    freePlan.find.mockResolvedValue(null);
    mockGetCampaign.mockReset();
    mockUpdateCampaign.mockReset();
    mockCreate.mockReset();
    mockGetOpenAI.mockReturnValue({ chat: { completions: { create: mockCreate } } } as never);
  });

  afterEach(() => {
    freePlan.find.mockReset();
    freePlan.find.mockResolvedValue(null);
  });

  it.each([
    ["a valid body", { campaignContext: { product: "Shoes" } }],
    ["an invalid body", { campaignContext: { platforms: "not-an-array" } }],
    ["a body that is not JSON", "{not json"],
  ])("refuses with 402 free_plan, before the rate limit and any work, with %s", async (_label, body) => {
    freePlan.find.mockResolvedValue({ accountId: "acc-free" });

    const res = await post(body);
    const json = await res.json();

    expect(res.status).toBe(402);
    expect(json.code).toBe("free_plan");
    expect(json.details).toMatchObject({ recommendedAction: "plan_request", reason: "free_plan", accountId: "acc-free" });
    expect(freePlan.find).toHaveBeenCalledTimes(1);
    expect(freePlan.find).toHaveBeenCalledWith("workspace-1");
    expect(rateLimit.calls).toHaveLength(0);
    expect(mockGetCampaign).not.toHaveBeenCalled();
    expect(mockGetOpenAI).not.toHaveBeenCalled();
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockUpdateCampaign).not.toHaveBeenCalled();
  });

  it("does not refuse outside the free plan: asks the rule with the workspace id and goes on to the work", async () => {
    mockGetCampaign.mockResolvedValue({
      id: "camp-1",
      workspaceId: "workspace-1",
      platformSpecificNotes: null,
    } as Awaited<ReturnType<typeof getCampaignById>>);
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({ suggestions: [{ value: "Compre Agora", confidence: "high" }] }) } }],
    } as unknown);

    const res = await post({ campaignContext: { product: "Shoes" } });

    expect(res.status).toBe(200);
    expect(freePlan.find).toHaveBeenCalledTimes(1);
    expect(freePlan.find).toHaveBeenCalledWith("workspace-1");
    expect(rateLimit.calls).toHaveLength(1);
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockUpdateCampaign).toHaveBeenCalledTimes(1);
  });
});
