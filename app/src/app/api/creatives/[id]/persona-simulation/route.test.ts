import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { POST, GET } from "./route";

vi.mock("@/server/auth/workspace", () => ({
  requireWorkspaceAccess: vi.fn(() =>
    Promise.resolve({
      user: { id: "user-1" },
      workspace: { id: "workspace-1" },
    })
  ),
}));

vi.mock("@/server/repositories/derivation", () => ({
  getDerivationById: vi.fn(),
}));

vi.mock("@/server/repositories/landing-page", () => ({
  getLandingPageById: vi.fn(),
}));

vi.mock("@/server/repositories/campaign", () => ({
  getCampaignById: vi.fn(),
}));

vi.mock("@/server/repositories/persona-simulation", () => ({
  createPersonaSimulation: vi.fn(),
  getPersonaSimulationBySource: vi.fn(),
  isCacheValid: vi.fn(),
  updatePersonaSimulation: vi.fn(),
}));

vi.mock("@/server/ai/persona-simulator", () => ({
  simulatePersonas: vi.fn(),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

import { getDerivationById } from "@/server/repositories/derivation";
import { getCampaignById } from "@/server/repositories/campaign";
import {
  createPersonaSimulation,
  getPersonaSimulationBySource,
  isCacheValid,
  updatePersonaSimulation,
} from "@/server/repositories/persona-simulation";
import { simulatePersonas } from "@/server/ai/persona-simulator";

const mockGetDerivationById = vi.mocked(getDerivationById);
const mockGetCampaignById = vi.mocked(getCampaignById);
const mockGetPersonaSimulationBySource = vi.mocked(getPersonaSimulationBySource);
const mockCreatePersonaSimulation = vi.mocked(createPersonaSimulation);
const mockUpdatePersonaSimulation = vi.mocked(updatePersonaSimulation);
const mockIsCacheValid = vi.mocked(isCacheValid);
const mockSimulatePersonas = vi.mocked(simulatePersonas);

function postRequest(id: string, body: object): Request {
  return new Request(`http://localhost/api/creatives/${id}/persona-simulation`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function getRequest(id: string, sourceType: string): Request {
  return new Request(
    `http://localhost/api/creatives/${id}/persona-simulation?sourceType=${sourceType}`,
    { method: "GET" }
  );
}

function paramsWith(id: string) {
  return Promise.resolve({ id });
}

const mockResult = {
  understands: "The offer is clear and the discount is attractive.",
  rejects: "The brand is unfamiliar and the urgency feels forced.",
  wants: "More social proof and a longer return window.",
  wouldClick: true,
  rationale: "The discount is compelling enough to overcome skepticism.",
};

const mockResults = {
  skeptical_buyer: mockResult,
  warm_lead: { ...mockResult, wouldClick: true, rationale: "Already interested, this pushes me over." },
  financial_decision_maker: { ...mockResult, wouldClick: false, rationale: "ROI is not clearly stated." },
  beginner: { ...mockResult, understands: "I understand there is a sale.", wouldClick: true },
};

const mockCampaign = {
  id: "campaign-id",
  name: "Summer Sale",
  objective: "Conversion",
  audience: "Women 25-34",
  offer: "20% off",
  tone: "Bold",
  constraints: null,
  notes: null,
  ctaVariants: ["Shop Now"],
};

function makeMockSimulation(overrides?: Partial<{
  id: string;
  status: string;
  cacheExpiresAt: Date | null;
  error: string | null;
}>): {
  id: string;
  workspaceId: string;
  campaignId: string;
  sourceType: string;
  sourceId: string;
  status: string;
  results: typeof mockResults;
  cacheExpiresAt: Date | null;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
} {
  return {
    id: "sim-1",
    workspaceId: "workspace-1",
    campaignId: "campaign-id",
    sourceType: "derivation",
    sourceId: "derivation-id",
    status: "completed",
    results: mockResults,
    cacheExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    error: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("POST /api/creatives/[id]/persona-simulation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 409 when derivation is not approved", async () => {
    mockGetDerivationById.mockResolvedValue({
      id: "derivation-id",
      status: "completed",
      outputKey: "derivations/test.png",
      campaignId: "campaign-id",
      workspaceId: "workspace-1",
    } as Awaited<ReturnType<typeof getDerivationById>>);

    const res = await POST(postRequest("derivation-id", { sourceType: "derivation" }), {
      params: paramsWith("derivation-id"),
    });

    expect(res.status).toBe(409);
  });

  it("returns 400 when derivation has no outputKey", async () => {
    mockGetDerivationById.mockResolvedValue({
      id: "derivation-id",
      status: "approved",
      outputKey: null,
      campaignId: "campaign-id",
      workspaceId: "workspace-1",
    } as Awaited<ReturnType<typeof getDerivationById>>);

    const res = await POST(postRequest("derivation-id", { sourceType: "derivation" }), {
      params: paramsWith("derivation-id"),
    });

    expect(res.status).toBe(400);
  });

  it("calls simulatePersonas and returns 200 when no cache exists", async () => {
    mockGetDerivationById.mockResolvedValue({
      id: "derivation-id",
      status: "approved",
      outputKey: "derivations/test.png",
      campaignId: "campaign-id",
      workspaceId: "workspace-1",
    } as Awaited<ReturnType<typeof getDerivationById>>);

    mockGetCampaignById.mockResolvedValue(mockCampaign as Awaited<ReturnType<typeof getCampaignById>>);
    mockGetPersonaSimulationBySource.mockResolvedValue(undefined);
    mockSimulatePersonas.mockResolvedValue(mockResults);
    mockCreatePersonaSimulation.mockResolvedValue(makeMockSimulation());

    const res = await POST(postRequest("derivation-id", { sourceType: "derivation" }), {
      params: paramsWith("derivation-id"),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.cached).toBe(false);
    expect(mockSimulatePersonas).toHaveBeenCalled();
    expect(mockCreatePersonaSimulation).toHaveBeenCalledWith(
      "workspace-1",
      "campaign-id",
      "derivation",
      "derivation-id",
      mockResults
    );
  });

  it("returns cached simulation without calling simulatePersonas when cache is valid", async () => {
    mockGetDerivationById.mockResolvedValue({
      id: "derivation-id",
      status: "approved",
      outputKey: "derivations/test.png",
      campaignId: "campaign-id",
      workspaceId: "workspace-1",
    } as Awaited<ReturnType<typeof getDerivationById>>);

    mockGetCampaignById.mockResolvedValue(mockCampaign as Awaited<ReturnType<typeof getCampaignById>>);

    const cachedSimulation = makeMockSimulation();
    mockGetPersonaSimulationBySource.mockResolvedValue(cachedSimulation);
    mockIsCacheValid.mockReturnValue(true);

    const res = await POST(postRequest("derivation-id", { sourceType: "derivation" }), {
      params: paramsWith("derivation-id"),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.cached).toBe(true);
    expect(body.simulation.id).toBe("sim-1");
    expect(mockSimulatePersonas).not.toHaveBeenCalled();
    expect(mockCreatePersonaSimulation).not.toHaveBeenCalled();
  });

  it("updates stale simulation instead of creating a duplicate", async () => {
    mockGetDerivationById.mockResolvedValue({
      id: "derivation-id",
      status: "approved",
      outputKey: "derivations/test.png",
      campaignId: "campaign-id",
      workspaceId: "workspace-1",
    } as Awaited<ReturnType<typeof getDerivationById>>);

    mockGetCampaignById.mockResolvedValue(mockCampaign as Awaited<ReturnType<typeof getCampaignById>>);

    const staleSimulation = makeMockSimulation({
      cacheExpiresAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
    });
    mockGetPersonaSimulationBySource.mockResolvedValue(staleSimulation);
    mockIsCacheValid.mockReturnValue(false);
    mockSimulatePersonas.mockResolvedValue(mockResults);
    mockUpdatePersonaSimulation.mockResolvedValue(makeMockSimulation());

    const res = await POST(postRequest("derivation-id", { sourceType: "derivation" }), {
      params: paramsWith("derivation-id"),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.cached).toBe(false);
    expect(mockSimulatePersonas).toHaveBeenCalled();
    expect(mockUpdatePersonaSimulation).toHaveBeenCalledWith("sim-1", mockResults);
    expect(mockCreatePersonaSimulation).not.toHaveBeenCalled();
  });
});

describe("GET /api/creatives/[id]/persona-simulation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 200 with existing simulation", async () => {
    const simulation = makeMockSimulation();
    mockGetPersonaSimulationBySource.mockResolvedValue(simulation);
    mockIsCacheValid.mockReturnValue(true);

    const res = await GET(getRequest("derivation-id", "derivation"), {
      params: paramsWith("derivation-id"),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.simulation.id).toBe("sim-1");
    expect(body.stale).toBe(false);
  });

  it("returns 404 when simulation is not found", async () => {
    mockGetPersonaSimulationBySource.mockResolvedValue(undefined);

    const res = await GET(getRequest("derivation-id", "derivation"), {
      params: paramsWith("derivation-id"),
    });

    expect(res.status).toBe(404);
  });

  it("returns stale: true when cache is expired", async () => {
    const simulation = makeMockSimulation({
      cacheExpiresAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
    });
    mockGetPersonaSimulationBySource.mockResolvedValue(simulation);
    mockIsCacheValid.mockReturnValue(false);

    const res = await GET(getRequest("derivation-id", "derivation"), {
      params: paramsWith("derivation-id"),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.stale).toBe(true);
  });
});
