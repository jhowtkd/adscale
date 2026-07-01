import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { POST } from "./route";

vi.mock("@/server/db", () => ({
  db: {
    select: vi.fn(),
  },
}));

vi.mock("@/server/auth/workspace", () => ({
  requireWorkspaceAccess: vi.fn(() =>
    Promise.resolve({
      user: { id: "user-1" },
      workspace: { id: "workspace-1" },
    })
  ),
}));

vi.mock("@/server/repositories/user", () => ({
  getUserLocale: vi.fn(() => Promise.resolve("pt-BR")),
}));

vi.mock("@/server/repositories/campaign", () => ({
  getCampaignById: vi.fn(),
  refreshCampaignStatus: vi.fn(),
  updateCampaign: vi.fn(),
}));

vi.mock("@/server/repositories/plan", () => ({
  getPlanByCampaign: vi.fn(() => Promise.resolve(null)),
}));

vi.mock("@/server/repositories/derivation", () => ({
  createDerivation: vi.fn(),
  failStaleActiveDerivations: vi.fn(),
  getDerivationsByCampaign: vi.fn(),
  updateDerivationStatus: vi.fn(),
}));

vi.mock("@/server/repositories/asset", () => ({
  getAssetsByCampaign: vi.fn(),
}));

vi.mock("@/server/jobs/client", () => ({
  inngest: { send: vi.fn() },
}));

vi.mock("@/server/billing/paywall", () => ({
  spendOrApiError: vi.fn(() => Promise.resolve(null)),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

import { db } from "@/server/db";
import {
  getCampaignById,
  updateCampaign,
} from "@/server/repositories/campaign";
import {
  createDerivation,
  failStaleActiveDerivations,
} from "@/server/repositories/derivation";
import { getAssetsByCampaign } from "@/server/repositories/asset";
import { inngest } from "@/server/jobs/client";

const mockDbSelect = vi.mocked(db.select);
const mockGetCampaignById = vi.mocked(getCampaignById);
const mockUpdateCampaign = vi.mocked(updateCampaign);
const mockCreateDerivation = vi.mocked(createDerivation);
const mockFailStaleActiveDerivations = vi.mocked(failStaleActiveDerivations);
const mockGetAssetsByCampaign = vi.mocked(getAssetsByCampaign);
const mockInngestSend = vi.mocked(inngest.send);

const validOutputLearningApplication = {
  schemaVersion: 1 as const,
  applied: true,
  resolution: "recorded" as const,
  traceId: "ol-trace-batch",
  recommendationId: "rec-batch",
  primaryVariableKey: "cta_tone",
  algorithmVersion: "1.0.0",
  safetyVersion: "1.0.0",
  learningsSource: "postgres" as const,
};

function makeParams(id: string) {
  return Promise.resolve({ id });
}

function postRequest(body: unknown): Request {
  return new Request("http://localhost/api/campaigns/camp-1/derivations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function mockDbNoQueued() {
  mockDbSelect.mockReturnValue({
    from: () => ({
      where: () => ({
        limit: () => Promise.resolve([]),
      }),
    }),
  } as unknown as ReturnType<typeof db.select>);
}

describe("POST /api/campaigns/[id]/derivations outputLearningApplication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDbNoQueued();
    mockFailStaleActiveDerivations.mockResolvedValue([]);
    mockGetCampaignById.mockResolvedValue({
      id: "camp-1",
      generationMode: "art_variation",
      ctaVariants: ["Buy now", "Shop today"],
      creativeLevel: "balanced",
    } as Awaited<ReturnType<typeof getCampaignById>>);
    mockGetAssetsByCampaign.mockResolvedValue([
      {
        id: "asset-1",
        width: 1024,
        height: 1024,
      },
    ] as Awaited<ReturnType<typeof getAssetsByCampaign>>);
    let derivationCounter = 0;
    mockCreateDerivation.mockImplementation(async () => {
      derivationCounter += 1;
      return {
        id: `derivation-${derivationCounter}`,
        campaignId: "camp-1",
        workspaceId: "workspace-1",
        status: "queued",
      } as Awaited<ReturnType<typeof createDerivation>>;
    });
    mockInngestSend.mockResolvedValue({ ids: ["event-id"] });
    mockUpdateCampaign.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("persists identical outputLearningApplication on every batch job", async () => {
    const res = await POST(postRequest({ outputLearningApplication: validOutputLearningApplication }), {
      params: makeParams("camp-1"),
    });

    expect(res.status).toBe(201);
    expect(mockCreateDerivation).toHaveBeenCalledTimes(2);
    for (const call of mockCreateDerivation.mock.calls) {
      expect(call[0].outputLearningApplication).toEqual(validOutputLearningApplication);
    }
  });

  it("stores null outputLearningApplication when field is omitted", async () => {
    const res = await POST(postRequest({}), { params: makeParams("camp-1") });

    expect(res.status).toBe(201);
    expect(mockCreateDerivation).toHaveBeenCalled();
    expect(mockCreateDerivation.mock.calls[0][0].outputLearningApplication).toBeNull();
  });

  it("returns 400 for invalid outputLearningApplication body", async () => {
    const res = await POST(
      postRequest({
        outputLearningApplication: {
          ...validOutputLearningApplication,
          traceId: "invalid-trace",
        },
      }),
      { params: makeParams("camp-1") }
    );

    expect(res.status).toBe(400);
    expect(mockCreateDerivation).not.toHaveBeenCalled();
  });

  it("rejects learningsSource other than postgres", async () => {
    const res = await POST(
      postRequest({
        outputLearningApplication: {
          ...validOutputLearningApplication,
          learningsSource: "mem0",
        },
      }),
      { params: makeParams("camp-1") }
    );

    expect(res.status).toBe(400);
    expect(mockCreateDerivation).not.toHaveBeenCalled();
  });
});
