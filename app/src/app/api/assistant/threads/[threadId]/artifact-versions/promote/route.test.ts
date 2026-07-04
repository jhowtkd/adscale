import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import {
  ArtifactHeadConflictError,
  ArtifactVersionValidationError,
} from "@/server/repositories/artifact-version";

vi.mock("@/server/auth/workspace", () => ({
  requireWorkspaceAccess: vi.fn(() => Promise.resolve({ workspace: { id: "ws-1" } })),
}));
vi.mock("@/server/repositories/assistant-thread", () => ({
  getAssistantThreadById: vi.fn(),
}));
vi.mock("@/server/assistant/artifact-version/promotion", () => ({
  promoteThreadArtifactVersion: vi.fn(),
  syncGoalRunFromArtifacts: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/server/assistant/artifact-version/service", () => ({
  getThreadArtifactVersionState: vi.fn(),
}));
vi.mock("@/server/assistant/artifact-iteration-telemetry", () => ({
  emitArtifactIterationTelemetry: vi.fn(),
}));
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

import { getAssistantThreadById } from "@/server/repositories/assistant-thread";
import { emitArtifactIterationTelemetry } from "@/server/assistant/artifact-iteration-telemetry";
import { promoteThreadArtifactVersion } from "@/server/assistant/artifact-version/promotion";
import { getThreadArtifactVersionState } from "@/server/assistant/artifact-version/service";

const mockEmitTelemetry = vi.mocked(emitArtifactIterationTelemetry);

const oldId = "00000000-0000-4000-8000-000000000001";
const targetId = "00000000-0000-4000-8000-000000000002";
const lineageId = "00000000-0000-4000-8000-000000000003";
const command = {
  type: "plan" as const,
  operationId: "00000000-0000-4000-8000-000000000004",
  lineageId,
  targetVersionId: targetId,
  expectedOfficialVersionId: oldId,
  expectedRevision: 0,
};
const version = (id: string, versionNumber: number, status: string) => ({
  id,
  lineageId,
  versionNumber,
  sourceVersionId: null,
  status,
  snapshot: {
    type: "plan" as const,
    strategy: null,
    angles: [],
    hooks: [],
    ctas: [],
    constraints: null,
  },
  provenance: {
    origin: "native" as const,
    originalArtifactId: "00000000-0000-4000-8000-000000000005",
    sourceVersionId: null,
    messageId: null,
    actionId: null,
    planVersionId: null,
    format: null,
    generationMode: null,
  },
  feedback: null,
  createdAt: new Date("2026-06-28T00:00:00Z"),
});
const oldVersion = version(oldId, 1, "approved");
const targetVersion = version(targetId, 2, "ready");
const state = {
  lineages: [{
    lineageId,
    artifactType: "plan",
    approvedCurrent: targetVersion,
    working: targetVersion,
    versions: [oldVersion, targetVersion],
    pendingProposals: [],
    generationStatus: null,
  }],
};

describe("promotion route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAssistantThreadById).mockResolvedValue({
      id: "thread-1",
      clientProfileId: "client-1",
      campaignId: "campaign-1",
    } as never);
  });

  it("delegates exactly once and returns a zero-credit safe result", async () => {
    vi.mocked(promoteThreadArtifactVersion).mockResolvedValue({
      effect: {
        transitions: [{ artifactType: "plan", fromVersion: "v1", toVersion: "v2" }],
        canonicalWrites: ["Plano e restrições"],
        staleProposalCount: 0,
        creditImpact: 0,
      },
      state: state.lineages,
    });
    const response = await POST(new Request("http://localhost/api", { method: "POST", body: JSON.stringify(command) }), { params: Promise.resolve({ threadId: "thread-1" }) });
    expect(response.status).toBe(200);
    expect((await response.json()).effect.creditImpact).toBe(0);
    expect(promoteThreadArtifactVersion).toHaveBeenCalledTimes(1);
  });

  it("returns one sanitized 409 recovery response without retrying", async () => {
    vi.mocked(promoteThreadArtifactVersion).mockRejectedValue(new ArtifactHeadConflictError("conflict", null));
    vi.mocked(getThreadArtifactVersionState).mockResolvedValue(state as never);
    const response = await POST(new Request("http://localhost/api", { method: "POST", body: JSON.stringify(command) }), { params: Promise.resolve({ threadId: "thread-1" }) });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: "revisionConflict",
      previousOfficialLabel: "v1",
      currentOfficialLabel: "v2",
    });
    expect(mockEmitTelemetry).toHaveBeenCalledWith(
      expect.objectContaining({
        eventKey: "promotion_conflict",
        reasonCode: "concurrent_head_change",
        metadata: expect.objectContaining({
          artifactType: "plan",
          lineageId,
          headRevision: 0,
        }),
      })
    );
    expect(promoteThreadArtifactVersion).toHaveBeenCalledTimes(1);
  });

  it("rejects caller-selected scope before promotion", async () => {
    const response = await POST(new Request("http://localhost/api", {
      method: "POST",
      body: JSON.stringify({ ...command, workspaceId: "other", threadId: "other" }),
    }), { params: Promise.resolve({ threadId: "thread-1" }) });
    expect(response.status).toBe(400);
    expect(promoteThreadArtifactVersion).not.toHaveBeenCalled();
  });

  it("maps ineligible and forged commands to 400 without retry", async () => {
    vi.mocked(promoteThreadArtifactVersion).mockRejectedValue(
      new ArtifactVersionValidationError("not eligible")
    );
    const response = await POST(new Request("http://localhost/api", {
      method: "POST",
      body: JSON.stringify(command),
    }), { params: Promise.resolve({ threadId: "thread-1" }) });
    expect(response.status).toBe(400);
    expect(promoteThreadArtifactVersion).toHaveBeenCalledTimes(1);
  });
});
