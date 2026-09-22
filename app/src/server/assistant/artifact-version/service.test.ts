import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/repositories/assistant-thread", () => ({
  getAssistantThreadById: vi.fn(),
}));
vi.mock("@/server/repositories/plan", () => ({ getPlanById: vi.fn() }));
vi.mock("@/server/repositories/campaign", () => ({ getCampaignById: vi.fn() }));
vi.mock("@/server/repositories/derivation", () => ({
  getDerivationById: vi.fn(),
  getDerivationsByIds: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/server/repositories/artifact-version", async (original) => {
  const actual = await original<typeof import("@/server/repositories/artifact-version")>();
  return {
    ...actual,
    createAdoptedArtifact: vi.fn(),
    findArtifactLineageOwner: vi.fn(),
    getArtifactHeads: vi.fn(),
    getArtifactVersionsByIds: vi.fn(),
    listArtifactLineages: vi.fn(),
    listArtifactProposalsForLineages: vi.fn(),
    listArtifactVersionsForLineages: vi.fn(),
    listPreviouslyApprovedVersionIdsForLineages: vi.fn(),
  };
});

import { getAssistantThreadById } from "@/server/repositories/assistant-thread";
import { getPlanById } from "@/server/repositories/plan";
import { getCampaignById } from "@/server/repositories/campaign";
import { getDerivationsByIds } from "@/server/repositories/derivation";
import {
  createAdoptedArtifact,
  findArtifactLineageOwner,
  getArtifactHeads,
  getArtifactVersionsByIds,
  listArtifactLineages,
  listArtifactProposalsForLineages,
  listArtifactVersionsForLineages,
  listPreviouslyApprovedVersionIdsForLineages,
} from "@/server/repositories/artifact-version";
import {
  ArtifactLineageOwnershipError,
  adoptArtifactForThread,
  getThreadArtifactVersionState,
} from "./service";

const id = (suffix: string) => `00000000-0000-4000-8000-${suffix.padStart(12, "0")}`;
const thread = {
  id: id("1"),
  workspaceId: id("2"),
  clientProfileId: id("3"),
  campaignId: id("4"),
};

describe("artifact version service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAssistantThreadById).mockResolvedValue(thread as never);
    vi.mocked(findArtifactLineageOwner).mockResolvedValue(null);
    vi.mocked(listArtifactProposalsForLineages).mockResolvedValue([]);
    vi.mocked(listPreviouslyApprovedVersionIdsForLineages).mockResolvedValue([]);
    vi.mocked(getArtifactVersionsByIds).mockResolvedValue([]);
    vi.mocked(getDerivationsByIds).mockResolvedValue([]);
  });

  it("adopts an approved legacy plan as v1 and mirrors approval", async () => {
    vi.mocked(getPlanById).mockResolvedValue({
      id: id("5"), campaignId: thread.campaignId, workspaceId: thread.workspaceId,
      strategy: "Proof", angles: [], hooks: [], ctas: [], status: "approved",
    } as never);
    vi.mocked(getCampaignById).mockResolvedValue({ constraints: "No claims" } as never);
    vi.mocked(createAdoptedArtifact).mockResolvedValue({
      lineage: { id: id("6"), artifactType: "plan", originalArtifactId: id("5") },
    } as never);
    const version = {
      id: id("7"), lineageId: id("6"), versionNumber: 1, sourceVersionId: null,
      status: "approved", snapshot: { type: "plan", strategy: "Proof", angles: [], hooks: [], ctas: [], constraints: "No claims" },
      provenance: { origin: "legacy_import", originalArtifactId: id("5"), sourceVersionId: null, messageId: null, actionId: null, planVersionId: null, format: null, generationMode: null },
      feedback: null, createdAt: new Date(),
    };
    vi.mocked(listArtifactVersionsForLineages).mockResolvedValue([version] as never);
    vi.mocked(getArtifactHeads).mockResolvedValue([{
      lineageId: id("6"), approvedCurrentVersionId: id("7"), workingVersionId: id("7"), revision: 0,
    }] as never);

    const result = await adoptArtifactForThread({
      workspaceId: thread.workspaceId,
      threadId: thread.id,
      artifactType: "plan",
      artifactId: id("5"),
    });

    expect(createAdoptedArtifact).toHaveBeenCalledWith(expect.objectContaining({ approved: true }));
    expect(result.approvedCurrent?.id).toBe(id("7"));
    expect(result.working?.id).toBe(id("7"));
  });

  it("rejects a lineage owned by another thread", async () => {
    vi.mocked(findArtifactLineageOwner).mockResolvedValue({
      id: id("6"), workspaceId: thread.workspaceId, threadId: id("99"),
    });
    await expect(adoptArtifactForThread({
      workspaceId: thread.workspaceId,
      threadId: thread.id,
      artifactType: "plan",
      artifactId: id("5"),
    })).rejects.toBeInstanceOf(ArtifactLineageOwnershipError);
  });

  it("returns approved and working versions independently on reload", async () => {
    vi.mocked(listArtifactLineages).mockResolvedValue([{
      id: id("6"), artifactType: "plan", originalArtifactId: id("5"),
    }] as never);
    const versions = [1, 2].map((versionNumber) => ({
      id: id(String(6 + versionNumber)), lineageId: id("6"), versionNumber,
      sourceVersionId: versionNumber === 1 ? null : id("7"), status: "ready",
      snapshot: { type: "plan", strategy: null, angles: [], hooks: [], ctas: [], constraints: null },
      provenance: { origin: versionNumber === 1 ? "legacy_import" : "revision", originalArtifactId: id("5"), sourceVersionId: versionNumber === 1 ? null : id("7"), messageId: null, actionId: null, planVersionId: null, format: null, generationMode: null },
      feedback: null, createdAt: new Date(),
    }));
    vi.mocked(listArtifactVersionsForLineages).mockResolvedValue(versions as never);
    vi.mocked(getArtifactHeads).mockResolvedValue([{
      lineageId: id("6"), approvedCurrentVersionId: id("7"), workingVersionId: id("8"), revision: 1,
    }] as never);
    vi.mocked(listPreviouslyApprovedVersionIdsForLineages).mockResolvedValue([
      { lineageId: id("6"), versionId: id("8") },
    ]);

    const state = await getThreadArtifactVersionState(thread.workspaceId, thread.id);
    expect(state.lineages[0]?.approvedCurrent?.id).toBe(id("7"));
    expect(state.lineages[0]?.working?.id).toBe(id("8"));
    expect(state.lineages[0]?.working?.previouslyApproved).toBe(true);
  });

  it("keeps head versions visible when they fall outside the history page", async () => {
    const lineageId = id("6");
    const approvedId = id("7");
    const workingId = id("8");
    const makeVersion = (versionId: string, versionNumber: number) => ({
      id: versionId,
      lineageId,
      versionNumber,
      sourceVersionId: null,
      status: "ready",
      snapshot: { type: "plan" as const, strategy: null, angles: [], hooks: [], ctas: [], constraints: null },
      provenance: { origin: "revision" as const, originalArtifactId: id("5"), sourceVersionId: null, messageId: null, actionId: null, planVersionId: null, format: null, generationMode: null },
      feedback: null,
      createdAt: new Date(),
    });
    vi.mocked(listArtifactLineages).mockResolvedValue([{
      id: lineageId, artifactType: "plan", originalArtifactId: id("5"),
    }] as never);
    vi.mocked(listArtifactVersionsForLineages).mockResolvedValue([
      makeVersion(id("99"), 99),
    ] as never);
    vi.mocked(getArtifactHeads).mockResolvedValue([{
      lineageId, approvedCurrentVersionId: approvedId, workingVersionId: workingId, revision: 3,
    }] as never);
    vi.mocked(getArtifactVersionsByIds).mockResolvedValue([
      makeVersion(approvedId, 1),
      makeVersion(workingId, 2),
    ] as never);

    const state = await getThreadArtifactVersionState(thread.workspaceId, thread.id);

    expect(getArtifactVersionsByIds).toHaveBeenCalledWith(
      expect.anything(),
      expect.arrayContaining([approvedId, workingId])
    );
    expect(listArtifactVersionsForLineages).toHaveBeenCalledTimes(1);

    expect(state.lineages[0]?.approvedCurrent?.id).toBe(approvedId);
    expect(state.lineages[0]?.working?.id).toBe(workingId);
    expect(state.lineages[0]?.versions.map((version) => version.id)).toEqual([
      id("99"), approvedId, workingId,
    ]);
  });
});
