import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/billing/paywall", () => ({
  spendOrApiError: vi.fn(),
  spend: vi.fn(() => Promise.resolve({ ok: true, creditsSpent: 5 })),
}));

vi.mock("@/server/ai/utils", () => ({ getOpenAI: vi.fn() }));
vi.mock("@/server/validation/env", () => ({
  env: { OPENAI_TEXT_MODEL: "test-model" },
}));

const findActiveGenerationMock = vi.hoisted(() => vi.fn(async () => false));
const mockPayload = vi.hoisted(() => ({
  type: "creative_revision" as const,
  schemaVersion: 1 as const,
  summary: "Muda cor",
  intendedChanges: ["Muda cor"],
  format: "1:1",
  referenceIds: [] as string[],
  creditImpact: 5,
  writes: ["Gera nova versão"],
  planVersionId: "00000000-0000-4000-8000-000000000401",
}));

const LINEAGE_ID = "00000000-0000-4000-8000-000000000101";
const SOURCE_VERSION_ID = "00000000-0000-4000-8000-000000000201";
const PROPOSAL_ID = "00000000-0000-4000-8000-000000000301";
const PLAN_VERSION_ID = "00000000-0000-4000-8000-000000000401";

vi.mock("@/server/repositories/artifact-version", () => ({
  ArtifactVersionValidationError: class ArtifactVersionValidationError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "ArtifactVersionValidationError";
    }
  },
  getArtifactProposal: vi.fn(async () => ({
    id: PROPOSAL_ID,
    lineageId: LINEAGE_ID,
    sourceVersionId: SOURCE_VERSION_ID,
    proposalType: "creative_revision",
    status: "pending",
    payload: mockPayload,
    createdAt: new Date(),
    updatedAt: new Date(),
  })),
  getArtifactHead: vi.fn(async () => ({ lineageId: LINEAGE_ID, revision: 1 })),
  getArtifactLineage: vi.fn(async () => ({
    id: LINEAGE_ID,
    artifactType: "creative",
    originalArtifactId: "creative-orig-1",
  })),
  getArtifactVersion: vi.fn(async () => ({
    id: SOURCE_VERSION_ID,
    lineageId: LINEAGE_ID,
    versionNumber: 1,
  })),
  listArtifactVersions: vi.fn(async () => []),
  findActiveGenerationForLineage: findActiveGenerationMock,
  staleSiblingProposals: vi.fn(async () => []),
  transitionArtifactProposal: vi.fn(async () => ({
    id: PROPOSAL_ID,
    status: "confirmed",
  })),
  createArtifactProposal: vi.fn(),
}));

vi.mock("@/server/repositories/derivation", () => ({
  createDerivation: vi.fn(async () => ({
    id: "derivation-1",
    campaignId: "campaign-1",
    workspaceId: "ws-1",
    status: "queued",
    format: "1:1",
    generationMode: "creative_revision",
    variantIndex: 0,
  })),
  updateDerivationStatus: vi.fn(),
  failQueuedDerivation: vi.fn(),
  deleteQueuedDerivation: vi.fn(),
  touchQueuedDerivation: vi.fn(),
}));

vi.mock("@/server/repositories/assistant-thread", () => ({
  getAssistantThreadById: vi.fn(async () => ({
    id: "thread-1",
    clientProfileId: "client-1",
    campaignId: "campaign-1",
  })),
}));

vi.mock("@/server/repositories/assistant-action", () => ({
  getAssistantActionById: vi.fn(async () => ({
    id: "action-1",
    workspaceId: "ws-1",
    threadId: "thread-1",
    messageId: "message-1",
    status: "confirmed",
    inputSnapshot: {},
    jobRefs: [],
  })),
}));

vi.mock("@/server/jobs/client", () => ({
  inngest: { send: vi.fn(async () => ({ ids: ["event-1"] })) },
}));

vi.mock("@/server/repositories/campaign", () => ({
  updateCampaign: vi.fn(async () => ({})),
}));

vi.mock("@/server/repositories/usage", () => ({
  getUsageByIdempotencyKey: vi.fn(async () => null),
  trackUsage: vi.fn(async () => ({ id: "u-1" })),
}));

vi.mock("@/server/billing/credits", () => ({
  refundCredits: vi.fn(),
  CREDIT_COSTS: {
    image_derivation: 5,
    creative_work_output: 5,
    social_post: 5,
    restyling: 5,
    regeneration: 5,
  },
}));

const adapterInputMock = vi.hoisted(() => vi.fn());
const startSettlementMock = vi.hoisted(() => vi.fn());

vi.mock("@/server/generation/settlement-adapters", () => ({
  campaignDerivationUnitSettlementAdapter: adapterInputMock,
}));

vi.mock("@/server/generation/settlement", () => ({
  startGenerationSettlement: startSettlementMock,
}));

import "@/server/assistant/action-contracts/contracts";
import { canonicalProposalPayloadDigest } from "@/server/assistant/creative-iteration/../plan-iteration/digest";
import { executeReviseCreative } from "./revise-creative";

const REAL_DIGEST = canonicalProposalPayloadDigest(mockPayload);

function buildCtx() {
  return {
    workspaceId: "ws-1",
    clientProfileId: "client-1",
    threadId: "thread-1",
    userId: "user-1",
    actionId: "action-1",
    actionType: "revise_creative" as const,
    locale: "pt-BR",
    inputSnapshot: {
      proposalId: PROPOSAL_ID,
      lineageId: LINEAGE_ID,
      sourceVersionId: SOURCE_VERSION_ID,
      payloadDigest: REAL_DIGEST,
      planVersionId: PLAN_VERSION_ID,
    },
  };
}

describe("executeReviseCreative — integration (real validator, mocked repo)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    adapterInputMock.mockReturnValue({ marker: "adapter-input" });
    startSettlementMock.mockResolvedValue({
      ok: true,
      value: {
        derivation: {
          id: "derivation-1",
          campaignId: "campaign-1",
          workspaceId: "ws-1",
          status: "queued",
          format: "1:1",
          generationMode: "creative_revision",
          variantIndex: 0,
        },
      },
    });
  });

  it("does NOT block itself: excludeActionId is passed through to findActiveGenerationForLineage", async () => {
    await executeReviseCreative(buildCtx() as never);

    expect(findActiveGenerationMock).toHaveBeenCalledTimes(1);
    expect(findActiveGenerationMock).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "ws-1" }),
      LINEAGE_ID,
      "action-1"
    );
  });

  it("succeeds when the only running action is itself (findActiveGeneration returns false after exclusion)", async () => {
    findActiveGenerationMock.mockResolvedValue(false);

    const result = await executeReviseCreative(buildCtx() as never);

    expect(result.mode).toBe("async");
    expect(result.jobRef).toEqual({ kind: "derivation", id: "derivation-1" });
  });

  it("blocks when a DIFFERENT action is running (findActiveGeneration returns true even with exclusion)", async () => {
    findActiveGenerationMock.mockResolvedValue(true);

    await expect(
      executeReviseCreative(buildCtx() as never)
    ).rejects.toThrow(/em andamento/);
    expect(startSettlementMock).not.toHaveBeenCalled();
  });
});
