import { describe, it, expect, vi, beforeEach } from "vitest";

const sharpOperations = vi.hoisted(() => [] as Array<{ method: string; args: unknown[] }>);

vi.mock("sharp", () => ({
  default: vi.fn((input: unknown) => {
    sharpOperations.push({ method: "sharp", args: [input] });
    const chain = {
      resize: vi.fn((...args: unknown[]) => {
        sharpOperations.push({ method: "resize", args });
        return chain;
      }),
      blur: vi.fn((...args: unknown[]) => {
        sharpOperations.push({ method: "blur", args });
        return chain;
      }),
      modulate: vi.fn((...args: unknown[]) => {
        sharpOperations.push({ method: "modulate", args });
        return chain;
      }),
      composite: vi.fn((...args: unknown[]) => {
        sharpOperations.push({ method: "composite", args });
        return chain;
      }),
      png: vi.fn(() => chain),
      toBuffer: vi.fn(() => Promise.resolve(Buffer.from("normalized"))),
    };
    return chain;
  }),
}));

// Expose the OpenAI images mock so tests can assert request parameters (e.g. size).
const mockOpenAIImages = vi.hoisted(() => ({
  edit: vi.fn(() =>
    Promise.resolve({
      data: [{ b64_json: "bW9ja2ltYWdl", revised_prompt: "revised" }],
    })
  ),
  generate: vi.fn(() =>
    Promise.resolve({
      data: [{ b64_json: "bW9ja2ltYWdl", revised_prompt: "revised" }],
    })
  ),
}));

vi.mock("openai", () => ({
  default: class MockOpenAI {
    images = mockOpenAIImages;
  },
  toFile: vi.fn((buffer: Buffer, name: string, opts: { type: string }) => ({
    buffer,
    name,
    type: opts.type,
  })),
}));

vi.mock("@/server/storage", () => ({
  objectStorage: {
    put: vi.fn(() => Promise.resolve()),
    get: vi.fn(() => Promise.resolve(Buffer.from("mock-image"))),
  },}));

vi.mock("../repositories/campaign", () => ({
  getCampaignById: vi.fn(),
  refreshCampaignStatus: vi.fn(),
}));

vi.mock("../repositories/asset", () => ({
  getAssetsByCampaign: vi.fn(),
}));

vi.mock("../repositories/plan", () => ({
  getPlanByCampaign: vi.fn(),
}));

vi.mock("../repositories/brand-kit", () => ({
  getBrandKit: vi.fn(),
}));

vi.mock("../repositories/competitor-analysis", () => ({
  getCompetitorAnalysesByCampaign: vi.fn(),
}));

const mockShouldSendToUser = vi.hoisted(() => vi.fn(() =>
  Promise.resolve({ send: false, email: null })
));
const mockSendDerivationCompleteEmail = vi.hoisted(() => vi.fn(() => Promise.resolve()));

vi.mock("@/server/services/notifications", () => ({
  shouldSendToUser: mockShouldSendToUser,
  getUserLocale: vi.fn(() => Promise.resolve("pt-BR")),
  sendDerivationCompleteEmail: mockSendDerivationCompleteEmail,
  sendDerivationFailedEmail: vi.fn(() => Promise.resolve()),
}));

const mockUpdateDerivationPromptProvenance = vi.hoisted(() => vi.fn(() => Promise.resolve({})));
const mockCompleteDerivation = vi.hoisted(() => vi.fn(() => Promise.resolve({})));
const mockFailDerivation = vi.hoisted(() => vi.fn(() => Promise.resolve({})));

vi.mock("../repositories/derivation", () => ({
  getDerivationById: vi.fn(),
  updateDerivationScore: vi.fn(),
  updateDerivationPromptProvenance: mockUpdateDerivationPromptProvenance,
  updateDerivationGenerationLog: vi.fn(() => Promise.resolve({})),
  setDerivationProcessing: vi.fn(() => Promise.resolve({})),
  completeDerivation: mockCompleteDerivation,
  failDerivation: mockFailDerivation,
}));

vi.mock("../ai/creative-quality-gate", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../ai/creative-quality-gate")>();
  return {
    ...actual,
    runCompletedDerivationQualityGate: vi.fn(() => Promise.resolve()),
  };
});

vi.mock("../repositories/client-reference", () => ({
  getApprovedTrainingReferences: vi.fn(() => Promise.resolve([])),
  getClientReferencesByIdsForProfile: vi.fn(() => Promise.resolve([])),
  getClientProfile: vi.fn(() => Promise.resolve(null)),
  resolveCampaignClientProfileId: vi.fn(() => Promise.resolve(null)),
}));

vi.mock("@/server/memory/brand-memory-context", () => ({
  getBrandMemoryContext: vi.fn(() => Promise.resolve({ items: [], block: "" })),
}));

vi.mock("../brand-taste/prompt-calibration-loader", () => ({
  loadPromptCalibrationContext: vi.fn(() =>
    Promise.resolve({ brandTasteSection: null, corpusQualitySection: null }),
  ),
}));

vi.mock("@/server/memory/campaign-memory-context", () => ({
  getCampaignMemoryPromptBlock: vi.fn(() => Promise.resolve("")),
  recordCampaignMemoryEntry: vi.fn(() => Promise.resolve({ schemaVersion: 1, entries: [] })),
}));

vi.mock("../ai/derivation-auto-retry", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../ai/derivation-auto-retry")>();
  return {
    ...actual,
    runDerivationAutoRetry: vi.fn(() =>
      Promise.resolve({ outputKey: "derivations/derivation-id/retry.png", revisedPrompt: "retry" })
    ),
  };
});

vi.mock("../repositories/usage", () => ({
  trackUsage: vi.fn(),
}));

const mockSyncAssistantActionFromJob = vi.hoisted(() => vi.fn(() => Promise.resolve(null)));

vi.mock("../repositories/assistant-job-sync", () => ({
  syncAssistantActionFromJob: mockSyncAssistantActionFromJob,
}));

const mockGetAssistantActionById = vi.hoisted(() => vi.fn(() => Promise.resolve(null)));
const mockGetAssistantThreadById = vi.hoisted(() => vi.fn(() => Promise.resolve(null)));

vi.mock("../repositories/assistant-action", () => ({
  getAssistantActionById: mockGetAssistantActionById,
}));

vi.mock("../repositories/assistant-thread", () => ({
  getAssistantThreadById: mockGetAssistantThreadById,
}));

const mockRefundCredits = vi.hoisted(() => vi.fn(() => Promise.resolve({ status: "refunded" as const })));

vi.mock("../billing/credits", () => ({
  refundCredits: mockRefundCredits,
}));

const mockCreateArtifactVersion = vi.hoisted(() => vi.fn(() => Promise.resolve({
  id: "version-new-1",
  lineageId: "lineage-1",
  versionNumber: 2,
  sourceVersionId: "version-source-1",
  status: "ready",
  snapshot: { type: "creative", derivationId: "derivation-id", outputKey: "derivations/derivation-id/output.png", format: "1:1", generationMode: "creative_revision", ctaText: null, planVersionId: "plan-version-1" },
  provenance: { origin: "revision", originalArtifactId: "00000000-0000-4000-8000-000000000501", sourceVersionId: "version-source-1", messageId: null, actionId: "action-1", planVersionId: "plan-version-1", format: "1:1", generationMode: "creative_revision" },
  feedback: null,
  createdAt: new Date(),
})));
const mockGetArtifactLineage = vi.hoisted(() => vi.fn(() => Promise.resolve(null)));
const mockGetArtifactHead = vi.hoisted(() => vi.fn(() => Promise.resolve(null)));
const mockListArtifactVersions = vi.hoisted(() => vi.fn(() => Promise.resolve([])));
const mockUpdateArtifactHead = vi.hoisted(() => vi.fn(() => Promise.resolve({
  lineageId: "lineage-1",
  approvedCurrentVersionId: "version-source-1",
  workingVersionId: "version-new-1",
  revision: 1,
})));

vi.mock("../repositories/artifact-version", () => ({
  createArtifactVersion: mockCreateArtifactVersion,
  getArtifactLineage: mockGetArtifactLineage,
  getArtifactHead: mockGetArtifactHead,
  listArtifactVersions: mockListArtifactVersions,
  updateArtifactHead: mockUpdateArtifactHead,
}));

vi.mock("./client", () => ({
  inngest: {
    createFunction: vi.fn((opts: unknown, handler: unknown) => ({
      opts,
      fn: handler,
    })),
    realtime: {
      publish: vi.fn(() => Promise.resolve()),
    },
  },
}));

vi.mock("@/server/ai/creative-score", () => ({
  scoreDerivationHeuristic: vi.fn(() => ({
    qualityScore: 75,
    scoreStatus: "heuristic",
    scoreBreakdown: null,
    scoreIssues: null,
    regenerationSuggestion: null,
  })),
  analyzeDerivationCreative: vi.fn(() =>
    Promise.resolve({
      qualityScore: 80,
      scoreStatus: "analyzed",
      scoreBreakdown: null,
      scoreIssues: null,
      regenerationSuggestion: null,
    })
  ),
}));

vi.mock("@/server/ai/creative-diagnosis", () => ({
  normalizeCreativeDiagnosis: vi.fn(() => null),
}));

vi.mock("../validation/env", () => ({
  env: {
    OPENAI_API_KEY: "test-key",
    OPENAI_IMAGE_MODEL: "gpt-image-1",
    DATABASE_URL: "postgres://test",
    BETTER_AUTH_SECRET: "secret",
    BETTER_AUTH_URL: "http://localhost",
    R2_ACCOUNT_ID: "test",
    R2_ACCESS_KEY_ID: "test",
    R2_SECRET_ACCESS_KEY: "test",
    R2_BUCKET: "test",
    R2_PUBLIC_BASE_URL: "http://localhost",
    INNGEST_EVENT_KEY: "test",
    INNGEST_SIGNING_KEY: "test",
    APP_URL: "http://localhost",
  },
}));

const mockLimit = vi.fn(() => Promise.resolve([]));
const mockOrderBy = vi.fn(() => ({
  limit: mockLimit,
}));

vi.mock("../repositories/notification", () => ({
  createNotification: vi.fn(() => Promise.resolve()),
}));

vi.mock("../db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: mockLimit,
          orderBy: mockOrderBy,
        })),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve()),
        returning: vi.fn(() => Promise.resolve([{ status: "processing" }])),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn(() => Promise.resolve([{ id: "notification-1" }])),
      })),
    })),
  },
}));

import { runCompletedDerivationQualityGate } from "../ai/creative-quality-gate";
import {
  assertParentFactualLineage,
  parentHasContamination,
} from "../ai/factual-visual-separation";
import { derivationJob, normalizeGeneratedImage } from "./derivation";
import { runDerivationAutoRetry } from "../ai/derivation-auto-retry";
import { getDerivationById } from "../repositories/derivation";
import { getCampaignById } from "../repositories/campaign";
import { getAssetsByCampaign } from "../repositories/asset";
import { getPlanByCampaign } from "../repositories/plan";
import { getBrandKit } from "../repositories/brand-kit";
import { getCompetitorAnalysesByCampaign } from "../repositories/competitor-analysis";
import { getClientReferencesByIdsForProfile, resolveCampaignClientProfileId } from "../repositories/client-reference";
import { objectStorage } from "@/server/storage";
import { getBrandMemoryContext } from "@/server/memory/brand-memory-context";
import { env } from "../validation/env";

const mockGetDerivationById = vi.mocked(getDerivationById);
const mockGetCampaignById = vi.mocked(getCampaignById);
const mockGetAssetsByCampaign = vi.mocked(getAssetsByCampaign);
const mockGetPlanByCampaign = vi.mocked(getPlanByCampaign);
const mockGetBrandKit = vi.mocked(getBrandKit);
const mockGetCompetitorAnalysesByCampaign = vi.mocked(getCompetitorAnalysesByCampaign);
const mockGetClientReferencesByIds = vi.mocked(getClientReferencesByIdsForProfile);
const mockResolveCampaignClientProfileId = vi.mocked(resolveCampaignClientProfileId);
const mockDownloadBuffer = vi.mocked(objectStorage.get);
const mockGetBrandMemoryContext = vi.mocked(getBrandMemoryContext);
const mockRunCompletedDerivationQualityGate = vi.mocked(runCompletedDerivationQualityGate);
const mockRunDerivationAutoRetry = vi.mocked(runDerivationAutoRetry);

async function runDerivationJob(eventData: Record<string, unknown>) {
  const event = { data: eventData } as unknown;
  const stepNames: string[] = [];
  const step = {
    run: vi.fn(async (name: string, fn: () => Promise<unknown>) => {
      stepNames.push(name);
      if (name === "check-idempotency") {
        return { outputKey: null, status: "queued" };
      }
      return fn();
    }),
    realtime: {
      publish: vi.fn(() => Promise.resolve()),
    },
  } as unknown;

  const result = await (derivationJob as unknown as { fn: (args: { event: unknown; step: unknown }) => Promise<unknown> }).fn({ event, step });
  return { result, stepNames };
}

describe("derivationJob", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateDerivationPromptProvenance.mockResolvedValue({});
    sharpOperations.length = 0;
    mockOpenAIImages.edit.mockResolvedValue({
      data: [{ b64_json: "bW9ja2ltYWdl", revised_prompt: "revised" }],
    });
    mockOpenAIImages.generate.mockResolvedValue({
      data: [{ b64_json: "bW9ja2ltYWdl", revised_prompt: "revised" }],
    });
    mockGetBrandKit.mockResolvedValue(null as never);
    mockResolveCampaignClientProfileId.mockResolvedValue(null);
    mockGetCompetitorAnalysesByCampaign.mockResolvedValue([]);
    mockGetBrandMemoryContext.mockResolvedValue({ items: [], block: "" });
    mockShouldSendToUser.mockResolvedValue({ send: false, email: null });
    mockSendDerivationCompleteEmail.mockResolvedValue(undefined);
  });

  it("normalizes generated images with an attention-aware crop and no synthetic padding", async () => {
    const output = await normalizeGeneratedImage(
      Buffer.from("wide-generated-image"),
      { width: 1080, height: 1920 },
      "art_variation"
    );

    expect(output).toEqual(Buffer.from("normalized"));
    expect(sharpOperations).toContainEqual({
      method: "resize",
      args: [
        1080,
        1920,
        expect.objectContaining({ fit: "cover", position: "attention" }),
      ],
    });
    expect(sharpOperations.some((op) => op.method === "blur")).toBe(false);
    expect(sharpOperations.some((op) => op.method === "composite")).toBe(false);
    expect(
      sharpOperations.some(
        (op) =>
          op.method === "resize" &&
          typeof op.args[2] === "object" &&
          op.args[2] !== null &&
          "fit" in op.args[2] &&
          op.args[2].fit === "contain"
      )
    ).toBe(false);
  });

  it("normalizes format adaptations without blurred padding or letterboxing", async () => {
    sharpOperations.length = 0;

    const output = await normalizeGeneratedImage(
      Buffer.from("portrait-generated-image"),
      { width: 1080, height: 1920 },
      "format_adaptation"
    );

    expect(output).toEqual(Buffer.from("normalized"));
    expect(sharpOperations).toContainEqual({
      method: "resize",
      args: [
        1080,
        1920,
        expect.objectContaining({ fit: "cover", position: "attention" }),
      ],
    });
    expect(sharpOperations.some((op) => op.method === "blur")).toBe(false);
    expect(sharpOperations.some((op) => op.method === "composite")).toBe(false);
    expect(
      sharpOperations.some(
        (op) =>
          op.method === "resize" &&
          typeof op.args[2] === "object" &&
          op.args[2] !== null &&
          "fit" in op.args[2] &&
          op.args[2].fit === "contain"
      )
    ).toBe(false);
  });

  describe("assistant action sync", () => {
    async function setupMinimalDerivationJob() {
      mockGetDerivationById.mockResolvedValue({
        id: "derivation-id",
        campaignId: "campaign-id",
        workspaceId: "workspace-1",
        parentId: null,
        status: "queued",
        generationMode: "art_variation",
        format: "1:1",
        ctaText: "Shop Now",
        variantIndex: 0,
        feedback: null,
        prompt: null,
        qualityScore: null,
        scoreStatus: "pending",
      } as Awaited<ReturnType<typeof getDerivationById>>);

      mockGetCampaignById.mockResolvedValue({
        id: "campaign-id",
        workspaceId: "workspace-1",
        name: "Test Campaign",
        client: "Acme",
        product: "Widget",
        objective: null,
        audience: null,
        platforms: null,
        tone: null,
        offer: "20% off",
        constraints: null,
        notes: null,
        status: "generating",
        generationMode: "art_variation",
        creativeLevel: "balanced",
        styleIntensity: "medium",
        creativeDiagnosisStatus: "pending",
        creativeDiagnosis: null,
        creativeDiagnosisSource: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as Awaited<ReturnType<typeof getCampaignById>>);

      mockGetAssetsByCampaign.mockResolvedValue([
        {
          id: "asset-1",
          campaignId: "campaign-id",
          workspaceId: "workspace-1",
          key: "assets/campaign.png",
          type: "image/png",
          size: 1000,
          width: 1080,
          height: 1080,
          role: "base",
          metadata: null,
          analysisStatus: null,
          analyzedAt: null,
          createdAt: new Date(),
        },
      ]);
      mockGetPlanByCampaign.mockResolvedValue(null as never);
    }

    it("syncs assistant action when assistantActionId is provided", async () => {
      await setupMinimalDerivationJob();

      await runDerivationJob({
        derivationId: "derivation-id",
        campaignId: "campaign-id",
        workspaceId: "workspace-1",
        assistantActionId: "action-1",
        locale: "en",
        generationMode: "art_variation",
        variantIndex: 0,
        ctaText: "Shop Now",
        format: "1:1",
      });

      expect(mockSyncAssistantActionFromJob).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: "workspace-1",
          actionId: "action-1",
          status: "processing",
          jobRef: { kind: "derivation", id: "derivation-id" },
        })
      );
      expect(mockSyncAssistantActionFromJob).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "completed",
        })
      );
    });

    it("does not sync assistant action when assistantActionId is absent", async () => {
      await setupMinimalDerivationJob();
      mockSyncAssistantActionFromJob.mockClear();

      await runDerivationJob({
        derivationId: "derivation-id",
        campaignId: "campaign-id",
        workspaceId: "workspace-1",
        locale: "en",
        generationMode: "art_variation",
        variantIndex: 0,
        ctaText: "Shop Now",
        format: "1:1",
      });

      expect(mockSyncAssistantActionFromJob).not.toHaveBeenCalled();
    });

    it("keeps a completed derivation successful when completion email fails", async () => {
      await setupMinimalDerivationJob();
      mockShouldSendToUser.mockResolvedValue({
        send: true,
        email: "owner@example.com",
      });
      mockSendDerivationCompleteEmail.mockRejectedValue(
        new Error("RESEND unavailable")
      );

      await expect(runDerivationJob({
        derivationId: "derivation-id",
        campaignId: "campaign-id",
        workspaceId: "workspace-1",
        triggeredByUserId: "user-1",
        locale: "pt-BR",
        generationMode: "art_variation",
        variantIndex: 0,
        ctaText: "Saiba mais",
        format: "1:1",
      })).resolves.toBeDefined();

      expect(mockCompleteDerivation).toHaveBeenCalledOnce();
      expect(mockFailDerivation).not.toHaveBeenCalled();
      expect(mockSendDerivationCompleteEmail).toHaveBeenCalledOnce();
    });

    it("generates campaign art from scratch when there is no base asset", async () => {
      await setupMinimalDerivationJob();
      mockGetAssetsByCampaign.mockResolvedValue([]);

      await runDerivationJob({
        derivationId: "derivation-id",
        campaignId: "campaign-id",
        workspaceId: "workspace-1",
        locale: "pt-BR",
        generationMode: "art_variation",
        variantIndex: 0,
        ctaText: "Saiba mais",
        format: "1:1",
      });

      expect(mockDownloadBuffer).not.toHaveBeenCalledWith("assets/campaign.png");
      expect(mockOpenAIImages.generate).toHaveBeenCalled();
      expect(mockOpenAIImages.edit).not.toHaveBeenCalled();
      expect(mockUpdateDerivationPromptProvenance).toHaveBeenCalledWith(
        "derivation-id",
        "workspace-1",
        expect.objectContaining({
          creativeContract: expect.objectContaining({ baseAssetId: null }),
          promptProvenance: expect.objectContaining({
            sourcePackage: "campaign_asset",
            imageOperation: "generate",
          }),
        }),
      );
    });
  });

  it("persists contract and provenance for campaign-asset art variation", async () => {
    mockGetDerivationById.mockResolvedValue({
      id: "derivation-id",
      campaignId: "campaign-id",
      workspaceId: "workspace-1",
      parentId: null,
      status: "queued",
      generationMode: "art_variation",
      format: "1:1",
      ctaText: "Shop Now",
      variantIndex: 0,
      feedback: null,
      prompt: null,
      qualityScore: null,
      scoreStatus: "pending",
    } as Awaited<ReturnType<typeof getDerivationById>>);

    mockGetCampaignById.mockResolvedValue({
      id: "campaign-id",
      workspaceId: "workspace-1",
      name: "Test Campaign",
      client: "Acme",
      product: "Widget",
      objective: null,
      audience: null,
      platforms: null,
      tone: null,
      offer: "20% off",
      constraints: null,
      notes: null,
      status: "generating",
      generationMode: "art_variation",
      creativeLevel: "balanced",
      styleIntensity: "medium",
      creativeDiagnosisStatus: "pending",
      creativeDiagnosis: null,
      creativeDiagnosisSource: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as Awaited<ReturnType<typeof getCampaignById>>);

    mockGetAssetsByCampaign.mockResolvedValue([
      {
        id: "asset-1",
        campaignId: "campaign-id",
        workspaceId: "workspace-1",
        key: "assets/campaign.png",
        type: "image/png",
        size: 1000,
        width: 1080,
        height: 1080,
        role: "base",
        metadata: null,
        analysisStatus: null,
        analyzedAt: null,
        createdAt: new Date(),
      },
    ]);
    mockGetPlanByCampaign.mockResolvedValue(null as never);

    await runDerivationJob({
      derivationId: "derivation-id",
      campaignId: "campaign-id",
      workspaceId: "workspace-1",
      locale: "en",
      generationMode: "art_variation",
      variantIndex: 0,
      ctaText: "Shop Now",
      format: "1:1",
    });

    expect(mockUpdateDerivationPromptProvenance).toHaveBeenCalled();
    const finalCall = mockUpdateDerivationPromptProvenance.mock.calls.at(-1);
    expect(finalCall?.[0]).toBe("derivation-id");
    expect(finalCall?.[1]).toBe("workspace-1");
    expect(finalCall?.[2]).toEqual(
      expect.objectContaining({
        creativeContract: expect.objectContaining({
          generationMode: "art_variation",
          targetFormat: "1:1",
          ctaSemantics: { kind: "explicit", text: "Shop Now" },
          baseAssetId: "asset-1",
          sourcePackage: "campaign_asset",
          client: "Acme",
          product: "Widget",
          offer: "20% off",
          canonicalCreative: expect.objectContaining({
            dominantIdea: expect.any(String),
            hook: expect.any(String),
            proofZone: expect.any(String),
            invariantIdentity: expect.objectContaining({
              campaign: "Test Campaign",
              brand: "Acme",
              product: "Widget",
            }),
            tiers: expect.objectContaining({
              mandatory: expect.any(Array),
              condensable: expect.any(Array),
              decorative: expect.any(Array),
            }),
          }),
        }),
        promptProvenance: expect.objectContaining({
          schemaVersion: 1,
          sourcePackage: "campaign_asset",
          source: expect.objectContaining({
            kind: "campaign_asset",
            assetId: "asset-1",
            assetKey: "assets/campaign.png",
          }),
          generationMode: "art_variation",
          targetFormat: "1:1",
          model: "gpt-image-1",
          imageOperation: "edit",
          revisedPrompt: "revised",
          outputKey: expect.stringContaining("derivations/derivation-id/"),
        }),
        prompt: "revised",
      })
    );
  });

  describe("input classification", () => {
    it("persists inputSourceClassification with all role categories when brand kit and client refs present", async () => {
      mockGetDerivationById.mockResolvedValue({
        id: "derivation-id",
        campaignId: "campaign-id",
        workspaceId: "workspace-1",
        parentId: null,
        status: "queued",
        generationMode: "art_variation",
        format: "1:1",
        ctaText: "Shop Now",
        variantIndex: 0,
        feedback: null,
        prompt: null,
        qualityScore: null,
        scoreStatus: "pending",
      } as Awaited<ReturnType<typeof getDerivationById>>);

      mockGetCampaignById.mockResolvedValue({
        id: "campaign-id",
        workspaceId: "workspace-1",
        name: "Test Campaign",
        client: "Acme",
        product: "Widget",
        objective: null,
        audience: null,
        platforms: null,
        tone: null,
        offer: "20% off",
        constraints: null,
        notes: null,
        status: "generating",
        generationMode: "art_variation",
        creativeLevel: "balanced",
        styleIntensity: "medium",
        creativeDiagnosisStatus: "pending",
        creativeDiagnosis: null,
        creativeDiagnosisSource: null,
        clientProfileId: "profile-1",
        selectedReferenceIds: ["ref-1", "ref-2"],
        createdAt: new Date(),
        updatedAt: new Date(),
      } as Awaited<ReturnType<typeof getCampaignById>>);

      mockGetAssetsByCampaign.mockResolvedValue([
        {
          id: "asset-1",
          campaignId: "campaign-id",
          workspaceId: "workspace-1",
          key: "assets/campaign.png",
          type: "image/png",
          size: 1000,
          width: 1080,
          height: 1080,
          role: "base",
          metadata: null,
          analysisStatus: null,
          analyzedAt: null,
          createdAt: new Date(),
        },
      ]);
      mockGetPlanByCampaign.mockResolvedValue(null as never);

      mockResolveCampaignClientProfileId.mockResolvedValue("brand-kit-1");
      mockGetBrandKit.mockResolvedValue({
        id: "brand-kit-1",
        workspaceId: "workspace-1",
        name: "Acme Brand",
        description: "Primary brand kit",
        visualNotes: null,
        toneNotes: null,
        constraints: null,
        brandColors: ["#000000"],
        brandFonts: ["Inter"],
        logoAssetKey: null,
        toneOfVoice: null,
        prohibitedElements: null,
        requiredElements: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as never);

      mockGetClientReferencesByIds.mockResolvedValue([
        {
          id: "ref-1",
          workspaceId: "workspace-1",
          clientProfileId: "profile-1",
          kind: "layout",
          label: "Layout ref",
          notes: null,
          assetKey: "refs/layout.png",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: "ref-2",
          workspaceId: "workspace-1",
          clientProfileId: "profile-1",
          kind: "style",
          label: "Style ref",
          notes: null,
          assetKey: "refs/style.png",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ] as never);

      await runDerivationJob({
        derivationId: "derivation-id",
        campaignId: "campaign-id",
        workspaceId: "workspace-1",
        locale: "en",
        generationMode: "art_variation",
        variantIndex: 0,
        ctaText: "Shop Now",
        format: "1:1",
      });

      const finalCall = mockUpdateDerivationPromptProvenance.mock.calls.at(-1);
      const persistedContract = finalCall?.[2]?.creativeContract;

      expect(persistedContract?.inputSourceClassification).toEqual(
        expect.objectContaining({
          factualBase: expect.objectContaining({ role: "factual_base" }),
          visualReference: null,
          brandKit: expect.objectContaining({ role: "brand_kit" }),
          auxiliaryReferences: expect.objectContaining({
            role: "auxiliary_reference",
            count: 2,
          }),
        })
      );
    });
  });

  describe("contaminated parent", () => {
    it("parentHasContamination returns false for null parent", () => {
      expect(parentHasContamination(null)).toBe(false);
      expect(parentHasContamination(undefined as never)).toBe(false);
    });

    it("assertParentFactualLineage does not throw for null parent", () => {
      expect(() => assertParentFactualLineage(null)).not.toThrow();
    });

    it("throws when parent qualityVerdict is invalid", () => {
      const parent = { qualityVerdict: "invalid", hardFailures: [] };
      expect(parentHasContamination(parent)).toBe(true);
      expect(() => assertParentFactualLineage(parent)).toThrow(/factual integrity/i);
    });

    it("throws when parent hardFailures include copied_style_reference_facts", () => {
      const parent = {
        qualityVerdict: "acceptable",
        hardFailures: [{ code: "copied_style_reference_facts" }],
      };
      expect(parentHasContamination(parent)).toBe(true);
      expect(() => assertParentFactualLineage(parent)).toThrow(
        "Parent derivation failed factual integrity checks and cannot be used for format adaptation."
      );
    });

    it("throws when parent hardFailures include wrong_brand", () => {
      const parent = {
        qualityVerdict: "acceptable",
        hardFailures: [{ code: "wrong_brand" }],
      };
      expect(parentHasContamination(parent)).toBe(true);
      expect(() => assertParentFactualLineage(parent)).toThrow(/factual integrity/i);
    });

    it("does not throw for clean parent with acceptable qualityVerdict", () => {
      const parent = {
        qualityVerdict: "acceptable",
        hardFailures: [{ code: "cta_drift" }],
      };
      expect(parentHasContamination(parent)).toBe(false);
      expect(() => assertParentFactualLineage(parent)).not.toThrow();
    });

    it("format_adaptation job throws before downloading contaminated parent output", async () => {
      mockGetDerivationById.mockImplementation(async (id: string) => {
        if (id === "parent-id") {
          return {
            id: "parent-id",
            campaignId: "campaign-id",
            workspaceId: "workspace-1",
            outputKey: "derivations/parent/output.png",
            status: "approved",
            generationMode: "art_variation",
            format: "1:1",
            parentId: null,
            ctaText: null,
            variantIndex: null,
            feedback: null,
            prompt: null,
            qualityScore: null,
            scoreStatus: "pending",
            qualityVerdict: "acceptable",
            hardFailures: [
              {
                code: "copied_style_reference_facts",
                message: "Style reference facts copied",
              },
            ],
          } as Awaited<ReturnType<typeof getDerivationById>>;
        }
        return {
          id: "child-id",
          campaignId: "campaign-id",
          workspaceId: "workspace-1",
          parentId: "parent-id",
          status: "queued",
          generationMode: "format_adaptation",
          format: "9:16",
          ctaText: "Comprar agora",
          variantIndex: 0,
          feedback: null,
          prompt: null,
          qualityScore: null,
          scoreStatus: "pending",
        } as Awaited<ReturnType<typeof getDerivationById>>;
      });

      mockGetCampaignById.mockResolvedValue({
        id: "campaign-id",
        workspaceId: "workspace-1",
        name: "Test Campaign",
        client: "Test",
        product: null,
        objective: null,
        audience: null,
        platforms: null,
        tone: null,
        offer: null,
        constraints: null,
        notes: null,
        status: "generating",
        generationMode: "art_variation",
        creativeLevel: "balanced",
        styleIntensity: "medium",
        creativeDiagnosisStatus: "pending",
        creativeDiagnosis: null,
        creativeDiagnosisSource: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as Awaited<ReturnType<typeof getCampaignById>>);

      mockGetAssetsByCampaign.mockResolvedValue([]);
      mockGetPlanByCampaign.mockResolvedValue(null as never);
      mockDownloadBuffer.mockClear();

      await expect(
        runDerivationJob({
          derivationId: "child-id",
          campaignId: "campaign-id",
          workspaceId: "workspace-1",
          locale: "pt-BR",
          generationMode: "format_adaptation",
          variantIndex: 0,
          ctaText: "Comprar agora",
          format: "9:16",
        })
      ).rejects.toThrow(/factual integrity/i);

      expect(mockDownloadBuffer).not.toHaveBeenCalledWith("derivations/parent/output.png");
    });
  });

  it("uses parent outputKey as reference image for package format adaptation", async () => {
    mockGetDerivationById.mockImplementation(async (id: string) => {
      if (id === "parent-id") {
        return {
          id: "parent-id",
          campaignId: "campaign-id",
          workspaceId: "workspace-1",
          outputKey: "derivations/parent/output.png",
          status: "approved",
          generationMode: "art_variation",
          format: "1:1",
          parentId: null,
          ctaText: null,
          variantIndex: null,
          feedback: null,
          prompt: null,
          qualityScore: null,
          scoreStatus: "pending",
          qualityVerdict: "acceptable",
          hardFailures: [],
        } as Awaited<ReturnType<typeof getDerivationById>>;
      }
      return {
        id: "child-id",
        campaignId: "campaign-id",
        workspaceId: "workspace-1",
        parentId: "parent-id",
        status: "queued",
        generationMode: "format_adaptation",
        format: "9:16",
        ctaText: "Comprar agora",
        variantIndex: 0,
        feedback: null,
        prompt: null,
        qualityScore: null,
        scoreStatus: "pending",
      } as Awaited<ReturnType<typeof getDerivationById>>;
    });

    mockGetCampaignById.mockResolvedValue({
      id: "campaign-id",
      workspaceId: "workspace-1",
      name: "Test Campaign",
      client: "Test",
      product: null,
      objective: null,
      audience: null,
      platforms: null,
      tone: null,
      offer: null,
      constraints: null,
      notes: null,
      status: "generating",
      generationMode: "art_variation",
      creativeLevel: "balanced",
      styleIntensity: "medium",
      creativeDiagnosisStatus: "pending",
      creativeDiagnosis: null,
      creativeDiagnosisSource: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as Awaited<ReturnType<typeof getCampaignById>>);

    mockGetAssetsByCampaign.mockResolvedValue([]);
    mockGetPlanByCampaign.mockResolvedValue(null as never);

    const { stepNames } = await runDerivationJob({
      derivationId: "child-id",
      campaignId: "campaign-id",
      workspaceId: "workspace-1",
      locale: "pt-BR",
      generationMode: "format_adaptation",
      variantIndex: 0,
      ctaText: "Comprar agora",
      format: "9:16",
    });

    expect(mockDownloadBuffer).toHaveBeenCalledWith("derivations/parent/output.png");
    expect(stepNames).toContain("quality-gate");
    expect(mockRunCompletedDerivationQualityGate).toHaveBeenCalledWith(
      expect.objectContaining({
        derivationId: "child-id",
        workspaceId: "workspace-1",
        contract: expect.objectContaining({ generationMode: "format_adaptation" }),
      })
    );

    const finalProvenanceCall = mockUpdateDerivationPromptProvenance.mock.calls.at(-1);
    expect(finalProvenanceCall?.[2]).toEqual(
      expect.objectContaining({
        creativeContract: expect.objectContaining({
          generationMode: "format_adaptation",
          targetFormat: "9:16",
          ctaSemantics: { kind: "explicit", text: "Comprar agora" },
          baseAssetId: null,
          sourcePackage: "approved_derivation",
        }),
        promptProvenance: expect.objectContaining({
          sourcePackage: "approved_derivation",
          source: expect.objectContaining({
            kind: "approved_derivation",
            derivationId: "parent-id",
            outputKey: "derivations/parent/output.png",
          }),
          generationMode: "format_adaptation",
          targetFormat: "9:16",
          imageOperation: "edit",
          revisedPrompt: "revised",
        }),
      })
    );
  });

  it("restyling retry uses base asset key not generated output key", async () => {
    const contaminatedOutputKey = "derivations/derivation-id/contaminated-output.png";

    mockGetDerivationById.mockResolvedValue({
      id: "derivation-id",
      campaignId: "campaign-id",
      workspaceId: "workspace-1",
      parentId: null,
      status: "queued",
      generationMode: "restyling",
      format: "1:1",
      styleAssetId: "style-asset-id",
      ctaText: null,
      variantIndex: 0,
      feedback: null,
      prompt: null,
      qualityScore: 40,
      scoreStatus: "analyzed",
      hardFailures: [
        { code: "style_reference_contamination", message: "Style facts copied into output" },
      ],
      regenerationSuggestion: "Correction: keep factual content from base only",
      generationLog: { autoRetryAttempted: false },
    } as Awaited<ReturnType<typeof getDerivationById>>);

    mockGetCampaignById.mockResolvedValue({
      id: "campaign-id",
      workspaceId: "workspace-1",
      name: "Restyling Campaign",
      client: "Acme",
      product: "Widget",
      objective: null,
      audience: null,
      platforms: null,
      tone: null,
      offer: null,
      constraints: null,
      notes: null,
      status: "generating",
      generationMode: "restyling",
      creativeLevel: "balanced",
      styleIntensity: "medium",
      creativeDiagnosisStatus: "pending",
      creativeDiagnosis: null,
      creativeDiagnosisSource: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as Awaited<ReturnType<typeof getCampaignById>>);

    mockGetAssetsByCampaign.mockResolvedValue([
      {
        id: "base-asset-id",
        campaignId: "campaign-id",
        workspaceId: "workspace-1",
        key: "assets/base-factual.png",
        type: "image/png",
        size: 1000,
        width: 1080,
        height: 1080,
        role: "base",
        metadata: null,
        analysisStatus: null,
        analyzedAt: null,
        createdAt: new Date(),
      },
      {
        id: "style-asset-id",
        campaignId: "campaign-id",
        workspaceId: "workspace-1",
        key: "assets/style-reference.png",
        type: "image/png",
        size: 1000,
        width: 1080,
        height: 1080,
        role: "style_reference",
        metadata: null,
        analysisStatus: null,
        analyzedAt: null,
        createdAt: new Date(),
      },
    ]);
    mockGetPlanByCampaign.mockResolvedValue(null as never);

    const { stepNames } = await runDerivationJob({
      derivationId: "derivation-id",
      campaignId: "campaign-id",
      workspaceId: "workspace-1",
      locale: "en",
      generationMode: "restyling",
      styleAssetId: "style-asset-id",
      variantIndex: 0,
      format: "1:1",
    });

    expect(stepNames).toContain("auto-retry-on-text-failure");
    expect(mockRunDerivationAutoRetry).toHaveBeenCalledWith(
      expect.objectContaining({
        generationMode: "restyling",
        referenceKey: "assets/base-factual.png",
        styleReferenceKey: "assets/style-reference.png",
        styleReferenceMimeType: "image/png",
      })
    );
    expect(mockRunDerivationAutoRetry).not.toHaveBeenCalledWith(
      expect.objectContaining({ referenceKey: contaminatedOutputKey })
    );
    expect(mockRunDerivationAutoRetry).not.toHaveBeenCalledWith(
      expect.objectContaining({ referenceKey: expect.stringContaining("derivations/derivation-id/") })
    );
  });

  it("uses the factual base asset for restyling prompt provenance when style reference is newest", async () => {
    mockGetDerivationById.mockResolvedValue({
      id: "derivation-id",
      campaignId: "campaign-id",
      workspaceId: "workspace-1",
      parentId: null,
      status: "queued",
      generationMode: "restyling",
      format: "1:1",
      styleAssetId: "style-asset-id",
      ctaText: null,
      variantIndex: 0,
      feedback: null,
      prompt: null,
      hardFailures: [],
      generationLog: { autoRetryAttempted: false },
    } as Awaited<ReturnType<typeof getDerivationById>>);

    mockGetCampaignById.mockResolvedValue({
      id: "campaign-id",
      workspaceId: "workspace-1",
      name: "Restyling Campaign",
      client: "Acme",
      product: "Widget",
      objective: null,
      audience: null,
      platforms: null,
      tone: null,
      offer: null,
      constraints: null,
      notes: null,
      status: "generating",
      generationMode: "restyling",
      creativeLevel: "balanced",
      styleIntensity: "medium",
      creativeDiagnosisStatus: "pending",
      creativeDiagnosis: null,
      creativeDiagnosisSource: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as Awaited<ReturnType<typeof getCampaignById>>);

    mockGetAssetsByCampaign.mockResolvedValue([
      {
        id: "style-asset-id",
        campaignId: "campaign-id",
        workspaceId: "workspace-1",
        key: "assets/style-reference.png",
        type: "image/png",
        size: 1000,
        width: 1080,
        height: 1080,
        role: "style_reference",
        metadata: null,
        analysisStatus: null,
        analyzedAt: null,
        createdAt: new Date("2026-06-22T10:00:00Z"),
      },
      {
        id: "base-asset-id",
        campaignId: "campaign-id",
        workspaceId: "workspace-1",
        key: "assets/base-factual.png",
        type: "image/png",
        size: 1000,
        width: 1080,
        height: 1080,
        role: "base",
        metadata: null,
        analysisStatus: null,
        analyzedAt: null,
        createdAt: new Date("2026-06-22T09:00:00Z"),
      },
    ]);
    mockGetPlanByCampaign.mockResolvedValue(null as never);

    await runDerivationJob({
      derivationId: "derivation-id",
      campaignId: "campaign-id",
      workspaceId: "workspace-1",
      locale: "en",
      generationMode: "restyling",
      styleAssetId: "style-asset-id",
      variantIndex: 0,
      format: "1:1",
      isPreview: true,
    });

    const promptWrite = mockUpdateDerivationPromptProvenance.mock.calls.at(-1)?.[2];
    expect(promptWrite?.inputPrompt).toContain("Reference Asset Key: assets/base-factual.png");
    expect(promptWrite?.inputPrompt).not.toContain("Reference Asset Key: assets/style-reference.png");
    expect(promptWrite?.promptProvenance).toEqual(
      expect.objectContaining({
        source: expect.objectContaining({
          kind: "campaign_asset",
          assetId: "base-asset-id",
          assetKey: "assets/base-factual.png",
        }),
      })
    );
    expect(mockOpenAIImages.edit).toHaveBeenCalledWith(
      expect.objectContaining({
        image: [
          expect.objectContaining({ name: "base-image" }),
          expect.objectContaining({ name: "style-reference" }),
        ],
      })
    );
  });

  it("inherits parent creativeContract fields for regeneration children", async () => {
    const inheritedContract = {
      generationMode: "art_variation" as const,
      targetFormat: "4:5",
      ctaSemantics: { kind: "explicit" as const, text: "Shop Now" },
      baseAssetId: "base-asset",
      styleAssetId: null,
      client: "Acme Corp",
      product: "Premium Widget",
      offer: "20% off",
      constraints: "Keep logo visible",
      sourcePackage: "campaign_asset" as const,
    };

    mockGetDerivationById.mockResolvedValue({
      id: "child-regen-id",
      campaignId: "campaign-id",
      workspaceId: "workspace-1",
      parentId: "parent-id",
      status: "queued",
      generationMode: "art_variation",
      format: "4:5",
      ctaText: "Shop Now",
      variantIndex: 0,
      feedback: "Hard failures:\n- cta_drift: fix CTA",
      creativeContract: inheritedContract,
      prompt: null,
      qualityScore: null,
      scoreStatus: "pending",
    } as Awaited<ReturnType<typeof getDerivationById>>);

    mockGetCampaignById.mockResolvedValue({
      id: "campaign-id",
      workspaceId: "workspace-1",
      name: "Test Campaign",
      client: "Campaign Client Only",
      product: "Campaign Product",
      objective: null,
      audience: null,
      platforms: null,
      tone: null,
      offer: "Campaign offer",
      constraints: null,
      notes: null,
      status: "generating",
      generationMode: "art_variation",
      creativeLevel: "balanced",
      styleIntensity: "medium",
      creativeDiagnosisStatus: "pending",
      creativeDiagnosis: null,
      creativeDiagnosisSource: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as Awaited<ReturnType<typeof getCampaignById>>);

    mockGetAssetsByCampaign.mockResolvedValue([
      {
        id: "asset-1",
        campaignId: "campaign-id",
        workspaceId: "workspace-1",
        key: "assets/campaign.png",
        type: "image/png",
        size: 1000,
        width: 1080,
        height: 1350,
        role: "base",
        metadata: null,
        analysisStatus: null,
        analyzedAt: null,
        createdAt: new Date(),
      },
    ]);
    mockGetPlanByCampaign.mockResolvedValue(null as never);

    await runDerivationJob({
      derivationId: "child-regen-id",
      campaignId: "campaign-id",
      workspaceId: "workspace-1",
      locale: "en",
      generationMode: "art_variation",
      variantIndex: 0,
      ctaText: "Shop Now",
      format: "4:5",
    });

    const finalProvenanceCall = mockUpdateDerivationPromptProvenance.mock.calls.at(-1);
    expect(finalProvenanceCall?.[2]).toEqual(
      expect.objectContaining({
        creativeContract: expect.objectContaining({
          client: "Acme Corp",
          product: "Premium Widget",
          offer: "20% off",
          constraints: "Keep logo visible",
          generationMode: "art_variation",
          targetFormat: "4:5",
        }),
      })
    );
  });

  it("throws when parent derivation has no outputKey for package format adaptation", async () => {
    mockGetDerivationById.mockImplementation(async (id: string) => {
      if (id === "parent-id") {
        return {
          id: "parent-id",
          campaignId: "campaign-id",
          workspaceId: "workspace-1",
          outputKey: null,
          status: "approved",
          generationMode: "art_variation",
          format: "1:1",
          parentId: null,
          ctaText: null,
          variantIndex: null,
          feedback: null,
          prompt: null,
          qualityScore: null,
          scoreStatus: "pending",
        } as Awaited<ReturnType<typeof getDerivationById>>;
      }
      return {
        id: "child-id",
        campaignId: "campaign-id",
        workspaceId: "workspace-1",
        parentId: "parent-id",
        status: "queued",
        generationMode: "format_adaptation",
        format: "9:16",
        ctaText: "Comprar agora",
        variantIndex: 0,
        feedback: null,
        prompt: null,
        qualityScore: null,
        scoreStatus: "pending",
      } as Awaited<ReturnType<typeof getDerivationById>>;
    });

    mockGetCampaignById.mockResolvedValue({
      id: "campaign-id",
      workspaceId: "workspace-1",
      name: "Test Campaign",
      client: "Test",
      product: null,
      objective: null,
      audience: null,
      platforms: null,
      tone: null,
      offer: null,
      constraints: null,
      notes: null,
      status: "generating",
      generationMode: "art_variation",
      creativeLevel: "balanced",
      styleIntensity: "medium",
      creativeDiagnosisStatus: "pending",
      creativeDiagnosis: null,
      creativeDiagnosisSource: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as Awaited<ReturnType<typeof getCampaignById>>);

    mockGetAssetsByCampaign.mockResolvedValue([
      {
        id: "asset-1",
        campaignId: "campaign-id",
        workspaceId: "workspace-1",
        key: "assets/campaign.png",
        type: "image/png",
        size: 1000,
        width: 1080,
        height: 1080,
        role: "base",
        metadata: null,
        analysisStatus: null,
        analyzedAt: null,
        createdAt: new Date(),
      },
    ]);
    mockGetPlanByCampaign.mockResolvedValue(null as never);

    await expect(
      runDerivationJob({
        derivationId: "child-id",
        campaignId: "campaign-id",
        workspaceId: "workspace-1",
        locale: "pt-BR",
        generationMode: "format_adaptation",
        variantIndex: 0,
        ctaText: "Comprar agora",
        format: "9:16",
      })
    ).rejects.toThrow("Parent derivation output is missing");
  });

  it("uses campaign asset for manual format_adaptation without parent", async () => {
    mockGetDerivationById.mockResolvedValue({
      id: "derivation-id",
      campaignId: "campaign-id",
      workspaceId: "workspace-1",
      parentId: null,
      status: "queued",
      generationMode: "format_adaptation",
      format: "4:5",
      ctaText: "Shop Now",
      variantIndex: 0,
      feedback: null,
      prompt: null,
      qualityScore: null,
      scoreStatus: "pending",
    } as Awaited<ReturnType<typeof getDerivationById>>);

    mockGetCampaignById.mockResolvedValue({
      id: "campaign-id",
      workspaceId: "workspace-1",
      name: "Test Campaign",
      client: "Test",
      product: null,
      objective: null,
      audience: null,
      platforms: null,
      tone: null,
      offer: null,
      constraints: null,
      notes: null,
      status: "generating",
      generationMode: "format_adaptation",
      creativeLevel: "balanced",
      styleIntensity: "medium",
      creativeDiagnosisStatus: "pending",
      creativeDiagnosis: null,
      creativeDiagnosisSource: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as Awaited<ReturnType<typeof getCampaignById>>);

    mockGetAssetsByCampaign.mockResolvedValue([
      {
        id: "asset-1",
        campaignId: "campaign-id",
        workspaceId: "workspace-1",
        key: "assets/campaign.png",
        type: "image/png",
        size: 1000,
        width: 1080,
        height: 1080,
        role: "base",
        metadata: null,
        analysisStatus: null,
        analyzedAt: null,
        createdAt: new Date(),
      },
    ]);
    mockGetPlanByCampaign.mockResolvedValue(null as never);

    await runDerivationJob({
      derivationId: "derivation-id",
      campaignId: "campaign-id",
      workspaceId: "workspace-1",
      locale: "en",
      generationMode: "format_adaptation",
      variantIndex: 0,
      ctaText: "Shop Now",
      format: "4:5",
    });

    expect(mockDownloadBuffer).toHaveBeenCalledWith("assets/campaign.png");
  });
});

// ---------------------------------------------------------------------------
// Target-aspect generation size assertions for format_adaptation (gpt-image-2)
// ---------------------------------------------------------------------------

function buildFormatAdaptationJob(format: string, isPreview?: boolean) {
  return {
    derivationId: "size-test-id",
    campaignId: "campaign-id",
    workspaceId: "workspace-1",
    locale: "en",
    generationMode: "format_adaptation",
    variantIndex: 0,
    ctaText: "Buy Now",
    format,
    isPreview,
  };
}

describe("derivationJob — format adaptation generation sizes (gpt-image-2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sharpOperations.length = 0;

    // Override model to gpt-image-2 for this suite
    (env as unknown as Record<string, string>).OPENAI_IMAGE_MODEL = "gpt-image-2";

    mockOpenAIImages.edit.mockResolvedValue({
      data: [{ b64_json: "bW9ja2ltYWdl", revised_prompt: "revised" }],
    });
    mockOpenAIImages.generate.mockResolvedValue({
      data: [{ b64_json: "bW9ja2ltYWdl", revised_prompt: "revised" }],
    });
    mockGetBrandKit.mockResolvedValue(null as never);
    mockGetCompetitorAnalysesByCampaign.mockResolvedValue([]);
    mockGetBrandMemoryContext.mockResolvedValue({ items: [], block: "" });

    mockGetDerivationById.mockResolvedValue({
      id: "size-test-id",
      campaignId: "campaign-id",
      workspaceId: "workspace-1",
      parentId: null,
      status: "queued",
      generationMode: "format_adaptation",
      format: "4:5",
      ctaText: "Buy Now",
      variantIndex: 0,
      feedback: null,
      prompt: null,
      qualityScore: null,
      scoreStatus: "pending",
    } as Awaited<ReturnType<typeof getDerivationById>>);

    mockGetCampaignById.mockResolvedValue({
      id: "campaign-id",
      workspaceId: "workspace-1",
      name: "Test Campaign",
      client: "Test",
      product: null,
      objective: null,
      audience: null,
      platforms: null,
      tone: null,
      offer: null,
      constraints: null,
      notes: null,
      status: "generating",
      generationMode: "format_adaptation",
      creativeLevel: "balanced",
      styleIntensity: "medium",
      creativeDiagnosisStatus: "pending",
      creativeDiagnosis: null,
      creativeDiagnosisSource: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as Awaited<ReturnType<typeof getCampaignById>>);

    mockGetAssetsByCampaign.mockResolvedValue([
      {
        id: "asset-1",
        campaignId: "campaign-id",
        workspaceId: "workspace-1",
        key: "assets/campaign.png",
        type: "image/png",
        size: 1000,
        width: 1080,
        height: 1080,
        role: "base",
        metadata: null,
        analysisStatus: null,
        analyzedAt: null,
        createdAt: new Date(),
      },
    ]);
    mockGetPlanByCampaign.mockResolvedValue(null as never);
  });

  afterEach(() => {
    (env as unknown as Record<string, string>).OPENAI_IMAGE_MODEL = "gpt-image-1";
  });

  it("4:5 format adaptation edit request receives target-aspect size 1024x1280", async () => {
    mockGetDerivationById.mockResolvedValue({
      id: "size-test-id",
      campaignId: "campaign-id",
      workspaceId: "workspace-1",
      parentId: null,
      status: "queued",
      generationMode: "format_adaptation",
      format: "4:5",
      ctaText: "Buy Now",
      variantIndex: 0,
      feedback: null,
      prompt: null,
      qualityScore: null,
      scoreStatus: "pending",
    } as Awaited<ReturnType<typeof getDerivationById>>);

    await runDerivationJob(buildFormatAdaptationJob("4:5"));

    expect(mockOpenAIImages.edit).toHaveBeenCalledWith(
      expect.objectContaining({ size: "1024x1280" })
    );
    expect(mockOpenAIImages.edit).not.toHaveBeenCalledWith(
      expect.objectContaining({ size: "1024x1024" })
    );
  });

  it("9:16 format adaptation edit request receives target-aspect size 1152x2048", async () => {
    mockGetDerivationById.mockResolvedValue({
      id: "size-test-id",
      campaignId: "campaign-id",
      workspaceId: "workspace-1",
      parentId: null,
      status: "queued",
      generationMode: "format_adaptation",
      format: "9:16",
      ctaText: "Buy Now",
      variantIndex: 0,
      feedback: null,
      prompt: null,
      qualityScore: null,
      scoreStatus: "pending",
    } as Awaited<ReturnType<typeof getDerivationById>>);

    await runDerivationJob(buildFormatAdaptationJob("9:16"));

    expect(mockOpenAIImages.edit).toHaveBeenCalledWith(
      expect.objectContaining({ size: "1152x2048" })
    );
    expect(mockOpenAIImages.edit).not.toHaveBeenCalledWith(
      expect.objectContaining({ size: "1024x1024" })
    );
  });

  it("4:5 preview format adaptation does NOT send square 1024x1024 to OpenAI", async () => {
    mockGetDerivationById.mockResolvedValue({
      id: "size-test-id",
      campaignId: "campaign-id",
      workspaceId: "workspace-1",
      parentId: null,
      status: "queued",
      generationMode: "format_adaptation",
      format: "4:5",
      ctaText: "Buy Now",
      variantIndex: 0,
      feedback: null,
      prompt: null,
      qualityScore: null,
      scoreStatus: "pending",
    } as Awaited<ReturnType<typeof getDerivationById>>);

    await runDerivationJob(buildFormatAdaptationJob("4:5", true));

    expect(mockOpenAIImages.edit).not.toHaveBeenCalledWith(
      expect.objectContaining({ size: "1024x1024" })
    );
    expect(mockOpenAIImages.edit).toHaveBeenCalledWith(
      expect.objectContaining({ size: "1024x1280" })
    );
  });

  it("9:16 preview format adaptation does NOT send square 1024x1024 to OpenAI", async () => {
    mockGetDerivationById.mockResolvedValue({
      id: "size-test-id",
      campaignId: "campaign-id",
      workspaceId: "workspace-1",
      parentId: null,
      status: "queued",
      generationMode: "format_adaptation",
      format: "9:16",
      ctaText: "Buy Now",
      variantIndex: 0,
      feedback: null,
      prompt: null,
      qualityScore: null,
      scoreStatus: "pending",
    } as Awaited<ReturnType<typeof getDerivationById>>);

    await runDerivationJob(buildFormatAdaptationJob("9:16", true));

    expect(mockOpenAIImages.edit).not.toHaveBeenCalledWith(
      expect.objectContaining({ size: "1024x1024" })
    );
    expect(mockOpenAIImages.edit).toHaveBeenCalledWith(
      expect.objectContaining({ size: "1152x2048" })
    );
  });

  it("normalizeGeneratedImage for format_adaptation never uses blur, composite, or fit:contain", async () => {
    sharpOperations.length = 0;

    await normalizeGeneratedImage(
      Buffer.from("portrait-generated"),
      { width: 1080, height: 1350 },
      "format_adaptation"
    );

    expect(sharpOperations.some((op) => op.method === "blur")).toBe(false);
    expect(sharpOperations.some((op) => op.method === "composite")).toBe(false);
    expect(
      sharpOperations.some(
        (op) =>
          op.method === "resize" &&
          typeof op.args[2] === "object" &&
          op.args[2] !== null &&
          "fit" in op.args[2] &&
          (op.args[2] as { fit: string }).fit === "contain"
      )
    ).toBe(false);
    expect(sharpOperations).toContainEqual(
      expect.objectContaining({
        method: "resize",
        args: [1080, 1350, expect.objectContaining({ fit: "cover" })],
      })
    );
  });
});

// ---------------------------------------------------------------------------
// Creative revision callbacks (Phase 205 — Plan 03)
// ---------------------------------------------------------------------------

const CREATIVE_LINEAGE_ID = "00000000-0000-4000-8000-000000000101";
const CREATIVE_SOURCE_VERSION_ID = "00000000-0000-4000-8000-000000000201";
const CREATIVE_PLAN_VERSION_ID = "00000000-0000-4000-8000-000000000401";
const CREATIVE_ORIGINAL_ID = "00000000-0000-4000-8000-000000000501";
const CREATIVE_THREAD_ID = "thread-creative-1";
const CREATIVE_CAMPAIGN_ID = "campaign-creative-1";

function buildCreativeRevisionActionRecord(overrides: Partial<{
  status: string;
  inputSnapshot: Record<string, unknown>;
  jobRefs: unknown[];
}> = {}) {
  return {
    id: "action-creative-1",
    workspaceId: "workspace-1",
    threadId: CREATIVE_THREAD_ID,
    messageId: "message-creative-1",
    status: overrides.status ?? "completed",
    inputSnapshot: overrides.inputSnapshot ?? {
      proposalId: "00000000-0000-4000-8000-000000000301",
      lineageId: CREATIVE_LINEAGE_ID,
      sourceVersionId: CREATIVE_SOURCE_VERSION_ID,
      payloadDigest: "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
      planVersionId: CREATIVE_PLAN_VERSION_ID,
    },
    jobRefs: overrides.jobRefs ?? [],
  };
}

function buildCreativeRevisionThread() {
  return {
    id: CREATIVE_THREAD_ID,
    workspaceId: "workspace-1",
    clientProfileId: "client-1",
    campaignId: CREATIVE_CAMPAIGN_ID,
  };
}

function buildCreativeLineage() {
  return {
    id: CREATIVE_LINEAGE_ID,
    workspaceId: "workspace-1",
    clientProfileId: "client-1",
    campaignId: CREATIVE_CAMPAIGN_ID,
    threadId: CREATIVE_THREAD_ID,
    artifactType: "creative",
    originalArtifactId: CREATIVE_ORIGINAL_ID,
    origin: "legacy_import",
    formatKey: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function buildCreativeHead(revision = 0) {
  return {
    lineageId: CREATIVE_LINEAGE_ID,
    approvedCurrentVersionId: CREATIVE_SOURCE_VERSION_ID,
    workingVersionId: CREATIVE_SOURCE_VERSION_ID,
    revision,
    updatedAt: new Date(),
  };
}

async function setupCreativeRevisionJob(overrides: {
  actionStatus?: string;
  inputSnapshot?: Record<string, unknown>;
  derivationStatus?: string;
  outputKey?: string;
  format?: string;
  generationMode?: string;
  ctaText?: string;
} = {}) {
  mockGetDerivationById.mockResolvedValue({
    id: "derivation-id",
    campaignId: CREATIVE_CAMPAIGN_ID,
    workspaceId: "workspace-1",
    parentId: null,
    status: overrides.derivationStatus ?? "queued",
    generationMode: "creative_revision",
    format: overrides.format ?? "1:1",
    ctaText: overrides.ctaText ?? null,
    variantIndex: 0,
    feedback: null,
    prompt: null,
    qualityScore: null,
    scoreStatus: "pending",
  } as Awaited<ReturnType<typeof getDerivationById>>);

  mockGetCampaignById.mockResolvedValue({
    id: CREATIVE_CAMPAIGN_ID,
    workspaceId: "workspace-1",
    name: "Creative Campaign",
    client: "Acme",
    product: "Widget",
    objective: null,
    audience: null,
    platforms: null,
    tone: null,
    offer: "20% off",
    constraints: null,
    notes: null,
    status: "generating",
    generationMode: "creative_revision",
    creativeLevel: "balanced",
    styleIntensity: "medium",
    creativeDiagnosisStatus: "pending",
    creativeDiagnosis: null,
    creativeDiagnosisSource: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as Awaited<ReturnType<typeof getCampaignById>>);

  mockGetAssetsByCampaign.mockResolvedValue([]);
  mockGetPlanByCampaign.mockResolvedValue(null as never);

  mockGetAssistantActionById.mockResolvedValue(
    buildCreativeRevisionActionRecord({
      status: overrides.actionStatus ?? "completed",
      inputSnapshot: overrides.inputSnapshot,
    })
  );
  mockGetAssistantThreadById.mockResolvedValue(buildCreativeRevisionThread());

  mockGetArtifactLineage.mockResolvedValue(buildCreativeLineage() as never);
  mockGetArtifactHead.mockResolvedValue(buildCreativeHead(0) as never);
  mockListArtifactVersions.mockResolvedValue([] as never);
  mockCreateArtifactVersion.mockResolvedValue({
    id: "version-new-1",
    lineageId: CREATIVE_LINEAGE_ID,
    versionNumber: 2,
    sourceVersionId: CREATIVE_SOURCE_VERSION_ID,
    status: "ready",
    snapshot: {
      type: "creative",
      derivationId: "derivation-id",
      outputKey: overrides.outputKey ?? "derivations/derivation-id/output.png",
      format: overrides.format ?? "1:1",
      generationMode: "creative_revision",
      ctaText: overrides.ctaText ?? null,
      planVersionId: CREATIVE_PLAN_VERSION_ID,
    },
    provenance: {
      origin: "revision",
      originalArtifactId: CREATIVE_ORIGINAL_ID,
      sourceVersionId: CREATIVE_SOURCE_VERSION_ID,
      messageId: null,
      actionId: "action-creative-1",
      planVersionId: CREATIVE_PLAN_VERSION_ID,
      format: overrides.format ?? "1:1",
      generationMode: "creative_revision",
    },
    feedback: null,
    createdAt: new Date(),
  } as never);
  mockUpdateArtifactHead.mockResolvedValue(buildCreativeHead(1) as never);
}

describe("creative revision callback (success path)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateDerivationPromptProvenance.mockResolvedValue({});
    sharpOperations.length = 0;
    mockOpenAIImages.edit.mockResolvedValue({
      data: [{ b64_json: "bW9ja2ltYWdl", revised_prompt: "revised" }],
    });
    mockOpenAIImages.generate.mockResolvedValue({
      data: [{ b64_json: "bW9ja2ltYWdl", revised_prompt: "revised" }],
    });
    mockGetBrandKit.mockResolvedValue(null as never);
    mockResolveCampaignClientProfileId.mockResolvedValue(null);
    mockGetCompetitorAnalysesByCampaign.mockResolvedValue([]);
    mockGetBrandMemoryContext.mockResolvedValue({ items: [], block: "" });
    mockGetAssistantActionById.mockReset();
    mockGetAssistantThreadById.mockReset();
    mockGetArtifactLineage.mockReset();
    mockGetArtifactHead.mockReset();
    mockListArtifactVersions.mockReset();
    mockCreateArtifactVersion.mockReset();
    mockUpdateArtifactHead.mockReset();
    mockSyncAssistantActionFromJob.mockClear();
    mockRefundCredits.mockClear();
  });

  it("creates a creative version linked to the source and updates working head", async () => {
    await setupCreativeRevisionJob({ actionStatus: "completed" });

    await runDerivationJob({
      derivationId: "derivation-id",
      campaignId: CREATIVE_CAMPAIGN_ID,
      workspaceId: "workspace-1",
      triggeredByUserId: "user-1",
      locale: "pt-BR",
      generationMode: "creative_revision",
      variantIndex: 0,
      ctaText: "Comprar agora",
      format: "1:1",
      assistantActionId: "action-creative-1",
      planVersionId: CREATIVE_PLAN_VERSION_ID,
    });

    expect(mockCreateArtifactVersion).toHaveBeenCalledTimes(1);
    expect(mockCreateArtifactVersion).toHaveBeenCalledWith(
      expect.objectContaining({
        lineageId: CREATIVE_LINEAGE_ID,
        sourceVersionId: CREATIVE_SOURCE_VERSION_ID,
        status: "ready",
        snapshot: expect.objectContaining({
          type: "creative",
          derivationId: "derivation-id",
          outputKey: expect.stringMatching(/^derivations\/derivation-id\/.+\.png$/),
          format: "1:1",
          generationMode: "creative_revision",
          planVersionId: CREATIVE_PLAN_VERSION_ID,
        }),
        provenance: expect.objectContaining({
          origin: "revision",
          actionId: "action-creative-1",
          planVersionId: CREATIVE_PLAN_VERSION_ID,
        }),
      })
    );
    expect(mockUpdateArtifactHead).toHaveBeenCalledWith(
      expect.objectContaining({
        lineageId: CREATIVE_LINEAGE_ID,
        expectedRevision: 0,
        workingVersionId: "version-new-1",
      })
    );
  });

  it("does NOT create creative version when action is canceled", async () => {
    await setupCreativeRevisionJob({ actionStatus: "canceled" });

    await runDerivationJob({
      derivationId: "derivation-id",
      campaignId: CREATIVE_CAMPAIGN_ID,
      workspaceId: "workspace-1",
      triggeredByUserId: "user-1",
      locale: "pt-BR",
      generationMode: "creative_revision",
      variantIndex: 0,
      ctaText: null,
      format: "1:1",
      assistantActionId: "action-creative-1",
      planVersionId: CREATIVE_PLAN_VERSION_ID,
    });

    expect(mockCreateArtifactVersion).not.toHaveBeenCalled();
    expect(mockUpdateArtifactHead).not.toHaveBeenCalled();
  });

  it("does NOT create creative version when action is failed", async () => {
    await setupCreativeRevisionJob({ actionStatus: "failed" });

    await runDerivationJob({
      derivationId: "derivation-id",
      campaignId: CREATIVE_CAMPAIGN_ID,
      workspaceId: "workspace-1",
      triggeredByUserId: "user-1",
      locale: "pt-BR",
      generationMode: "creative_revision",
      variantIndex: 0,
      ctaText: null,
      format: "1:1",
      assistantActionId: "action-creative-1",
      planVersionId: CREATIVE_PLAN_VERSION_ID,
    });

    expect(mockCreateArtifactVersion).not.toHaveBeenCalled();
    expect(mockUpdateArtifactHead).not.toHaveBeenCalled();
  });

  it("success callback is idempotent — second callback skips version creation", async () => {
    await setupCreativeRevisionJob({ actionStatus: "completed" });
    mockListArtifactVersions.mockResolvedValue([
      {
        id: "version-existing-1",
        lineageId: CREATIVE_LINEAGE_ID,
        versionNumber: 2,
        sourceVersionId: CREATIVE_SOURCE_VERSION_ID,
        status: "ready",
        snapshot: {
          type: "creative",
          derivationId: "derivation-id",
          outputKey: "derivations/derivation-id/output.png",
          format: "1:1",
          generationMode: "creative_revision",
          ctaText: null,
          planVersionId: CREATIVE_PLAN_VERSION_ID,
        },
        provenance: {
          origin: "revision",
          originalArtifactId: CREATIVE_ORIGINAL_ID,
          sourceVersionId: CREATIVE_SOURCE_VERSION_ID,
          messageId: null,
          actionId: "action-creative-1",
          planVersionId: CREATIVE_PLAN_VERSION_ID,
          format: "1:1",
          generationMode: "creative_revision",
        },
        feedback: null,
        createdAt: new Date(),
      },
    ] as never);

    await runDerivationJob({
      derivationId: "derivation-id",
      campaignId: CREATIVE_CAMPAIGN_ID,
      workspaceId: "workspace-1",
      triggeredByUserId: "user-1",
      locale: "pt-BR",
      generationMode: "creative_revision",
      variantIndex: 0,
      ctaText: null,
      format: "1:1",
      assistantActionId: "action-creative-1",
      planVersionId: CREATIVE_PLAN_VERSION_ID,
    });

    expect(mockCreateArtifactVersion).not.toHaveBeenCalled();
    expect(mockUpdateArtifactHead).not.toHaveBeenCalled();
  });

  it("non-creative-revision derivation does NOT touch artifact version or lineage head", async () => {
    await setupCreativeRevisionJob({ actionStatus: "completed" });

    await runDerivationJob({
      derivationId: "derivation-id",
      campaignId: CREATIVE_CAMPAIGN_ID,
      workspaceId: "workspace-1",
      triggeredByUserId: "user-1",
      locale: "pt-BR",
      generationMode: "art_variation",
      variantIndex: 0,
      ctaText: null,
      format: "1:1",
    });

    expect(mockCreateArtifactVersion).not.toHaveBeenCalled();
    expect(mockUpdateArtifactHead).not.toHaveBeenCalled();
    expect(mockGetAssistantActionById).not.toHaveBeenCalled();
  });

  it("missing lineage/source/planVersionId in inputSnapshot skips version creation safely", async () => {
    await setupCreativeRevisionJob({
      actionStatus: "completed",
      inputSnapshot: {
        proposalId: "00000000-0000-4000-8000-000000000301",
        lineageId: CREATIVE_LINEAGE_ID,
        sourceVersionId: CREATIVE_SOURCE_VERSION_ID,
        payloadDigest: "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
      },
    });

    await runDerivationJob({
      derivationId: "derivation-id",
      campaignId: CREATIVE_CAMPAIGN_ID,
      workspaceId: "workspace-1",
      triggeredByUserId: "user-1",
      locale: "pt-BR",
      generationMode: "creative_revision",
      variantIndex: 0,
      ctaText: null,
      format: "1:1",
      assistantActionId: "action-creative-1",
    });

    expect(mockCreateArtifactVersion).not.toHaveBeenCalled();
    expect(mockUpdateArtifactHead).not.toHaveBeenCalled();
  });
});

describe("creative revision callback (failure path)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAssistantActionById.mockReset();
    mockGetAssistantThreadById.mockReset();
    mockRefundCredits.mockReset();
    mockSyncAssistantActionFromJob.mockClear();
    mockRefundCredits.mockResolvedValue({ status: "refunded" } as never);
  });

  it("onFailure refunds credits when assistantActionId present and mode is creative_revision", async () => {
    const onFailure = (derivationJob as unknown as { opts: { onFailure: (...args: unknown[]) => Promise<unknown> } }).opts.onFailure;
    expect(onFailure).toBeDefined();

    await onFailure({
      event: {
        data: {
          event: {
            data: {
              derivationId: "derivation-id",
              campaignId: CREATIVE_CAMPAIGN_ID,
              workspaceId: "workspace-1",
              triggeredByUserId: "user-1",
              assistantActionId: "action-creative-1",
              generationMode: "creative_revision",
              locale: "pt-BR",
              variantIndex: 0,
              ctaText: null,
              format: "1:1",
            },
          },
        },
      },
      error: new Error("image generation failed"),
      step: {
        run: vi.fn(async (_name: string, fn: () => Promise<unknown>) => fn()),
        realtime: { publish: vi.fn(() => Promise.resolve()) },
      },
    });

    expect(mockRefundCredits).toHaveBeenCalledTimes(1);
    expect(mockRefundCredits).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "workspace-1",
        action: "image_derivation",
        idempotencyKey: "assistant-action:action-creative-1:refund",
        amount: 5,
        metadata: expect.objectContaining({
          actionId: "action-creative-1",
          derivationId: "derivation-id",
          campaignId: CREATIVE_CAMPAIGN_ID,
          mode: "creative_revision",
        }),
        userId: "user-1",
      })
    );
  });

  it("onFailure does NOT refund for non-creative-revision derivations", async () => {
    const onFailure = (derivationJob as unknown as { opts: { onFailure: (...args: unknown[]) => Promise<unknown> } }).opts.onFailure;

    await onFailure({
      event: {
        data: {
          event: {
            data: {
              derivationId: "derivation-id",
              campaignId: CREATIVE_CAMPAIGN_ID,
              workspaceId: "workspace-1",
              triggeredByUserId: "user-1",
              assistantActionId: "action-art-1",
              generationMode: "art_variation",
              locale: "pt-BR",
              variantIndex: 0,
              ctaText: null,
              format: "1:1",
            },
          },
        },
      },
      error: new Error("image generation failed"),
      step: {
        run: vi.fn(async (_name: string, fn: () => Promise<unknown>) => fn()),
        realtime: { publish: vi.fn(() => Promise.resolve()) },
      },
    });

    expect(mockRefundCredits).not.toHaveBeenCalled();
  });

  it("onFailure does NOT refund when assistantActionId is missing", async () => {
    const onFailure = (derivationJob as unknown as { opts: { onFailure: (...args: unknown[]) => Promise<unknown> } }).opts.onFailure;

    await onFailure({
      event: {
        data: {
          event: {
            data: {
              derivationId: "derivation-id",
              campaignId: CREATIVE_CAMPAIGN_ID,
              workspaceId: "workspace-1",
              triggeredByUserId: "user-1",
              generationMode: "creative_revision",
              locale: "pt-BR",
              variantIndex: 0,
              ctaText: null,
              format: "1:1",
            },
          },
        },
      },
      error: new Error("image generation failed"),
      step: {
        run: vi.fn(async (_name: string, fn: () => Promise<unknown>) => fn()),
        realtime: { publish: vi.fn(() => Promise.resolve()) },
      },
    });

    expect(mockRefundCredits).not.toHaveBeenCalled();
  });

  it("onFailure swallows refund errors so failure cleanup is not blocked", async () => {
    mockRefundCredits.mockRejectedValue(new Error("refund db unreachable"));
    const onFailure = (derivationJob as unknown as { opts: { onFailure: (...args: unknown[]) => Promise<unknown> } }).opts.onFailure;

    await expect(
      onFailure({
        event: {
          data: {
            event: {
              data: {
                derivationId: "derivation-id",
                campaignId: CREATIVE_CAMPAIGN_ID,
                workspaceId: "workspace-1",
                triggeredByUserId: "user-1",
                assistantActionId: "action-creative-1",
                generationMode: "creative_revision",
                locale: "pt-BR",
                variantIndex: 0,
                ctaText: null,
                format: "1:1",
              },
            },
          },
        },
        error: new Error("image generation failed"),
        step: {
          run: vi.fn(async (_name: string, fn: () => Promise<unknown>) => fn()),
          realtime: { publish: vi.fn(() => Promise.resolve()) },
        },
      })
    ).resolves.not.toThrow();

    expect(mockRefundCredits).toHaveBeenCalledTimes(1);
  });
});
