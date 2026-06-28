import { describe, expect, it } from "vitest";
import { artifactVersionComparisonSchema } from "@/lib/assistant/artifact-version";
import { buildPlanSemanticComparison } from "../plan-iteration/diff";

vi.mock("@/server/repositories/assistant-thread", () => ({
  getAssistantThreadById: vi.fn(),
}));
vi.mock("@/server/repositories/artifact-version", async (original) => {
  const actual = await original<typeof import("@/server/repositories/artifact-version")>();
  return {
    ...actual,
    getArtifactHead: vi.fn(),
    getArtifactLineage: vi.fn(),
    getArtifactProposal: vi.fn(),
    getArtifactVersion: vi.fn(),
  };
});
vi.mock("@/server/repositories/assistant-action", () => ({
  getAssistantActionById: vi.fn(),
}));
vi.mock("@/server/storage", () => ({
  objectStorage: { signedDownloadUrl: vi.fn() },
}));

import { beforeEach, vi } from "vitest";
import { getAssistantActionById } from "@/server/repositories/assistant-action";
import { getAssistantThreadById } from "@/server/repositories/assistant-thread";
import {
  ArtifactVersionValidationError,
  getArtifactHead,
  getArtifactLineage,
  getArtifactProposal,
  getArtifactVersion,
} from "@/server/repositories/artifact-version";
import { objectStorage } from "@/server/storage";
import { compareArtifactVersions } from "./comparison";

const plan = {
  type: "plan" as const,
  strategy: "Estratégia",
  angles: ["A", "B", "A"],
  hooks: ["H1"],
  ctas: ["Comprar"],
  constraints: "Sem promessas",
};

describe("artifact version comparison contracts", () => {
  it("keeps canonical field order and can include unchanged fields", () => {
    expect(
      buildPlanSemanticComparison(plan, { ...plan }, true).map(
        (entry) => entry.field
      )
    ).toEqual(["strategy", "angles", "hooks", "ctas", "constraints"]);
    expect(buildPlanSemanticComparison(plan, { ...plan })).toEqual([]);
  });

  it("reports duplicate-safe pure reordering as moves", () => {
    const [angles] = buildPlanSemanticComparison(plan, {
      ...plan,
      angles: ["A", "A", "B"],
    });

    expect(angles?.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "move", before: "B", after: "B", beforeIndex: 1, afterIndex: 2 }),
        expect.objectContaining({ kind: "move", before: "A", after: "A", beforeIndex: 2, afterIndex: 1 }),
      ])
    );
  });

  it("distinguishes add, remove, and edit", () => {
    const before = { ...plan, hooks: ["Keep", "Remove", "Edit me"] };
    const after = { ...plan, hooks: ["Keep", "Edited", "Added"] };
    const [hooks] = buildPlanSemanticComparison(before, after);

    expect(hooks?.changes.map((change) => change.kind)).toEqual([
      "unchanged",
      "edit",
      "edit",
    ]);
    expect(hooks?.changes[1]).toMatchObject({ before: "Remove", after: "Edited" });
    expect(hooks?.changes[2]).toMatchObject({ before: "Edit me", after: "Added" });

    const [added] = buildPlanSemanticComparison(
      { ...plan, hooks: ["Keep"] },
      { ...plan, hooks: ["Keep", "Added"] }
    );
    const [removed] = buildPlanSemanticComparison(
      { ...plan, hooks: ["Keep", "Removed"] },
      { ...plan, hooks: ["Keep"] }
    );
    expect(added?.changes.at(-1)).toMatchObject({ kind: "add", after: "Added" });
    expect(removed?.changes.at(-1)).toMatchObject({ kind: "remove", before: "Removed" });
  });

  it("rejects persisted creative internals from the response DTO", () => {
    const safe = {
      type: "creative" as const,
      headRevision: 3,
      versionA: {
        versionNumber: 1,
        status: "approved",
        createdAt: new Date(),
        feedback: null,
        previewUrl: "https://signed.example/a",
        previewError: null,
        format: "1:1",
        dimensions: { width: 1080, height: 1080 },
        cta: "Comprar",
        boundPlanVersion: "v1",
        intendedChanges: [],
      },
      versionB: {
        versionNumber: 2,
        status: "ready",
        createdAt: new Date(),
        feedback: "Aumentar contraste",
        previewUrl: null,
        previewError: "preview_unavailable",
        format: "1:1",
        dimensions: { width: 1080, height: 1080 },
        cta: "Comprar",
        boundPlanVersion: "v1",
        intendedChanges: ["Aumentar contraste"],
      },
    };

    expect(artifactVersionComparisonSchema.parse(safe)).toMatchObject(safe);
    for (const key of ["outputKey", "derivationId", "provider", "prompt", "provenance"]) {
      expect(() =>
        artifactVersionComparisonSchema.parse({
          ...safe,
          versionA: { ...safe.versionA, [key]: "secret" },
        })
      ).toThrow();
    }
  });
});

const ids = {
  lineage: "00000000-0000-4000-8000-000000000100",
  versionA: "00000000-0000-4000-8000-000000000101",
  versionB: "00000000-0000-4000-8000-000000000102",
  planVersion: "00000000-0000-4000-8000-000000000103",
  derivationA: "00000000-0000-4000-8000-000000000104",
  derivationB: "00000000-0000-4000-8000-000000000105",
  action: "00000000-0000-4000-8000-000000000106",
  proposal: "00000000-0000-4000-8000-000000000107",
};
const thread = {
  id: "thread-1",
  workspaceId: "ws-1",
  clientProfileId: "client-1",
  campaignId: "campaign-1",
};
const version = (id: string, versionNumber: number, snapshot: unknown) => ({
  id,
  lineageId: ids.lineage,
  versionNumber,
  status: versionNumber === 1 ? "approved" : "ready",
  snapshot,
  provenance: {
    origin: "revision",
    originalArtifactId: ids.derivationA,
    sourceVersionId: versionNumber === 1 ? null : ids.versionA,
    messageId: null,
    actionId: versionNumber === 1 ? null : ids.action,
    planVersionId: ids.planVersion,
    format: "1:1",
    generationMode: "art_variation",
  },
  feedback: versionNumber === 1 ? null : "Mais contraste",
  createdAt: new Date(`2026-06-2${versionNumber}T12:00:00Z`),
});

describe("compareArtifactVersions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAssistantThreadById).mockResolvedValue(thread as never);
    vi.mocked(getArtifactHead).mockResolvedValue({ revision: 4 } as never);
    vi.mocked(getArtifactProposal).mockResolvedValue(null);
    vi.mocked(getAssistantActionById).mockResolvedValue(null);
  });

  it("returns a read-only semantic plan comparison", async () => {
    const before = version(ids.versionA, 1, plan);
    const after = version(ids.versionB, 2, { ...plan, angles: ["B", "A", "A"] });
    const head = { revision: 4, approvedCurrentVersionId: ids.versionA, workingVersionId: ids.versionB };
    vi.mocked(getArtifactLineage).mockResolvedValue({ artifactType: "plan" } as never);
    vi.mocked(getArtifactHead).mockResolvedValue(head as never);
    vi.mocked(getArtifactVersion).mockImplementation(async (_scope, id) =>
      id === ids.versionA ? before as never : id === ids.versionB ? after as never : null
    );

    const result = await compareArtifactVersions({
      workspaceId: "ws-1",
      threadId: "thread-1",
      lineageId: ids.lineage,
      versionAId: ids.versionA,
      versionBId: ids.versionB,
    });

    expect(result.type).toBe("plan");
    expect(result.type === "plan" && result.fields[0]?.changes).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: "move" })])
    );
    expect(head).toEqual({ revision: 4, approvedCurrentVersionId: ids.versionA, workingVersionId: ids.versionB });
  });

  it.each([
    [ids.versionA, ids.versionA, "same version"],
    [ids.versionA, ids.versionB, "cross lineage"],
  ])("rejects %s / %s (%s)", async (versionAId, versionBId, reason) => {
    vi.mocked(getArtifactLineage).mockResolvedValue({ artifactType: "plan" } as never);
    vi.mocked(getArtifactVersion).mockResolvedValue(
      reason === "cross lineage"
        ? ({ ...version(ids.versionA, 1, plan), lineageId: "other" } as never)
        : (version(ids.versionA, 1, plan) as never)
    );
    await expect(
      compareArtifactVersions({
        workspaceId: "ws-1",
        threadId: "thread-1",
        lineageId: ids.lineage,
        versionAId,
        versionBId,
      })
    ).rejects.toBeInstanceOf(ArtifactVersionValidationError);
  });

  it("keeps creative metadata when one preview cannot be signed", async () => {
    const creativeA = version(ids.versionA, 1, {
      type: "creative", derivationId: ids.derivationA, outputKey: "a.png", format: "1:1",
      generationMode: "art_variation", ctaText: "Comprar", planVersionId: ids.planVersion,
    });
    const creativeB = version(ids.versionB, 2, {
      type: "creative", derivationId: ids.derivationB, outputKey: "b.png", format: "1:1",
      generationMode: "art_variation", ctaText: "Comprar", planVersionId: ids.planVersion,
    });
    vi.mocked(getArtifactLineage).mockResolvedValue({ artifactType: "creative" } as never);
    vi.mocked(getArtifactVersion).mockImplementation(async (_scope, id) => {
      if (id === ids.versionA) return creativeA as never;
      if (id === ids.versionB) return creativeB as never;
      if (id === ids.planVersion) return { versionNumber: 3 } as never;
      return null;
    });
    vi.mocked(objectStorage.signedDownloadUrl)
      .mockRejectedValueOnce(new Error("storage down"))
      .mockResolvedValueOnce("https://signed.example/b");
    vi.mocked(getAssistantActionById).mockResolvedValue({
      inputSnapshot: { proposalId: ids.proposal },
    } as never);
    vi.mocked(getArtifactProposal).mockResolvedValue({
      status: "confirmed",
      payload: { type: "creative_revision", intendedChanges: ["Aumentar contraste"] },
    } as never);

    const result = await compareArtifactVersions({
      workspaceId: "ws-1", threadId: "thread-1", lineageId: ids.lineage,
      versionAId: ids.versionA, versionBId: ids.versionB,
    });

    expect(result.type).toBe("creative");
    if (result.type !== "creative") return;
    expect(result.versionA).toMatchObject({
      previewUrl: null, previewError: "preview_unavailable", format: "1:1",
      dimensions: { width: 1080, height: 1080 }, boundPlanVersion: "v3",
    });
    expect(result.versionB).toMatchObject({
      previewUrl: "https://signed.example/b", intendedChanges: ["Aumentar contraste"],
    });
  });
});
