import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/repositories/assistant-goal", () => ({
  getGoalRunScoped: vi.fn(),
  listAnnotationsForVersion: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/server/repositories/artifact-version", () => ({
  listArtifactLineages: vi.fn().mockResolvedValue([]),
  listArtifactVersions: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/server/repositories/derivation", () => ({
  getDerivationsByCampaign: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/server/storage", () => ({
  objectStorage: {
    publicUrl: vi.fn((key: string) => `https://cdn.test/${key}`),
  },
}));

import { getGoalRunScoped } from "@/server/repositories/assistant-goal";
import { getDerivationsByCampaign } from "@/server/repositories/derivation";
import {
  listArtifactLineages,
  listArtifactVersions,
} from "@/server/repositories/artifact-version";
import { buildGoalProjection } from "./projection";

const mockGetGoal = vi.mocked(getGoalRunScoped);
const mockGetDerivations = vi.mocked(getDerivationsByCampaign);
const mockListLineages = vi.mocked(listArtifactLineages);
const mockListVersions = vi.mocked(listArtifactVersions);

const baseGoal = {
  id: "00000000-0000-4000-8000-000000000001",
  workspaceId: "ws-1",
  clientProfileId: "client-1",
  threadId: "thread-1",
  campaignId: "campaign-1",
  objective: "Vender mais",
  stage: "choosing_base",
  brief: {
    productOffer: "Camiseta",
    audience: "Jovens",
    constraints: "Nenhuma restrição adicional",
    objective: "Vender mais",
    cta: "Compre",
    referenceIds: [],
    baseAssetId: null,
  },
  plan: { strategy: "S", angles: [], hooks: [], ctas: [] },
  assumptions: [],
  blockers: [],
  revision: 3,
  selectedBaseVersionId: null,
};

function makeDerivation(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "00000000-0000-4000-8000-000000000011",
    campaignId: "campaign-1",
    creativeLevel: "balanced",
    format: "1:1",
    status: "completed",
    outputKey: "outputs/img.png",
    generationMode: "art_variation",
    ctaText: null,
    styleAssetId: null,
    isPreview: false,
    ...overrides,
  };
}

describe("buildGoalProjection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListLineages.mockResolvedValue([]);
    mockListVersions.mockResolvedValue([]);
  });
  it("returns null when the thread has no goal run", async () => {
    mockGetGoal.mockResolvedValue(null);

    const projection = await buildGoalProjection({
      workspaceId: "ws-1",
      clientProfileId: "client-1",
      threadId: "thread-1",
    });

    expect(projection).toBeNull();
  });

  it("returns goal state without prompt, outputKey, provider payload, or signed URL persistence", async () => {
    mockGetGoal.mockResolvedValue(baseGoal as never);
    mockGetDerivations.mockResolvedValue([
      makeDerivation({
        id: "00000000-0000-4000-8000-000000000011",
        creativeLevel: "conservative",
      }),
      makeDerivation({
        id: "00000000-0000-4000-8000-000000000012",
        creativeLevel: "balanced",
      }),
      makeDerivation({
        id: "00000000-0000-4000-8000-000000000013",
        creativeLevel: "bold",
      }),
    ] as never);

    const projection = await buildGoalProjection({
      workspaceId: "ws-1",
      clientProfileId: "client-1",
      threadId: "thread-1",
    });

    expect(projection).not.toBeNull();
    const serialized = JSON.stringify(projection);
    expect(serialized).not.toContain("outputKey");
    expect(serialized).not.toContain("prompt");
    expect(serialized).not.toContain("providerPayload");
    // previewUrl is allowed but it is a CDN url, not a signed url field name.
    expect(projection!.requiredFormatCount).toBe(4);
  });

  it("renders three candidates in fixed conservative/balanced/bold order", async () => {
    mockGetGoal.mockResolvedValue(baseGoal as never);
    mockGetDerivations.mockResolvedValue([
      makeDerivation({
        id: "00000000-0000-4000-8000-000000000013",
        creativeLevel: "bold",
      }),
      makeDerivation({
        id: "00000000-0000-4000-8000-000000000011",
        creativeLevel: "conservative",
      }),
      makeDerivation({
        id: "00000000-0000-4000-8000-000000000012",
        creativeLevel: "balanced",
      }),
    ] as never);

    const projection = await buildGoalProjection({
      workspaceId: "ws-1",
      clientProfileId: "client-1",
      threadId: "thread-1",
    });

    const levels = projection!.candidates.map((c) => c.creativeLevel);
    expect(levels).toEqual(["conservative", "balanced", "bold"]);
  });

  it("exposes the artifact version id separately from its derivation id", async () => {
    const derivationId = "00000000-0000-4000-8000-000000000011";
    const versionId = "00000000-0000-4000-8000-000000000099";
    mockGetGoal.mockResolvedValue(baseGoal as never);
    mockGetDerivations.mockResolvedValue([
      makeDerivation({ derivationId, id: derivationId }),
    ] as never);
    mockListLineages.mockResolvedValue([
      {
        id: "00000000-0000-4000-8000-000000000088",
        artifactType: "creative",
        originalArtifactId: derivationId,
      },
    ] as never);
    mockListVersions.mockResolvedValue([{ id: versionId }] as never);

    const projection = await buildGoalProjection({
      workspaceId: "ws-1",
      clientProfileId: "client-1",
      threadId: "thread-1",
    });

    expect(projection!.candidates[0]).toMatchObject({
      versionId,
      derivationId,
    });
  });

  it("uses the selected base as the 1:1 package item", async () => {
    const conservativeId = "00000000-0000-4000-8000-000000000011";
    const balancedId = "00000000-0000-4000-8000-000000000012";
    const conservativeVersionId = "00000000-0000-4000-8000-000000000091";
    const balancedVersionId = "00000000-0000-4000-8000-000000000092";
    mockGetGoal.mockResolvedValue({
      ...baseGoal,
      stage: "reviewing_package",
      selectedBaseVersionId: balancedVersionId,
    } as never);
    mockGetDerivations.mockResolvedValue([
      makeDerivation({ id: conservativeId, creativeLevel: "conservative" }),
      makeDerivation({ id: balancedId, creativeLevel: "balanced" }),
    ] as never);
    mockListLineages.mockResolvedValue([
      { id: "lineage-1", artifactType: "creative", originalArtifactId: conservativeId },
      { id: "lineage-2", artifactType: "creative", originalArtifactId: balancedId },
    ] as never);
    mockListVersions
      .mockResolvedValueOnce([{ id: conservativeVersionId }] as never)
      .mockResolvedValueOnce([{ id: balancedVersionId }] as never);

    const projection = await buildGoalProjection({
      workspaceId: "ws-1",
      clientProfileId: "client-1",
      threadId: "thread-1",
    });

    expect(projection!.packageItems.find((item) => item.format === "1:1")).toMatchObject({
      versionId: balancedVersionId,
      previewUrl: "https://cdn.test/outputs/img.png",
    });
  });

  it("shows a failed slot after a final retry failure", async () => {
    mockGetGoal.mockResolvedValue(baseGoal as never);
    mockGetDerivations.mockResolvedValue([
      makeDerivation({
        creativeLevel: "conservative",
        status: "completed",
      }),
      makeDerivation({
        creativeLevel: "balanced",
        status: "failed",
        outputKey: null,
      }),
      makeDerivation({
        creativeLevel: "bold",
        status: "completed",
      }),
    ] as never);

    const projection = await buildGoalProjection({
      workspaceId: "ws-1",
      clientProfileId: "client-1",
      threadId: "thread-1",
    });

    const balanced = projection!.candidates.find((c) => c.creativeLevel === "balanced");
    expect(balanced?.status).toBe("failed");
    expect(balanced?.previewUrl).toBeNull();
  });

  it("emits the four live plan steps", async () => {
    mockGetGoal.mockResolvedValue({ ...baseGoal, stage: "intake" } as never);
    mockGetDerivations.mockResolvedValue([] as never);

    const projection = await buildGoalProjection({
      workspaceId: "ws-1",
      clientProfileId: "client-1",
      threadId: "thread-1",
    });

    expect(projection!.planSteps.map((s) => s.key)).toEqual([
      "understand",
      "plan",
      "create",
      "review",
    ]);
  });
});
