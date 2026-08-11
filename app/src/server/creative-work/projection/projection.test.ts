import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  ImpossibleCanonicalStateError,
  getCanonicalWorkNextAction,
  normalizeCampaignState,
  normalizeCreativeWorkState,
  mapDerivationStatusToCanonical,
} from "@/server/creative-work/canonical/status";
import {
  makeCanonicalWorkId,
  parseCanonicalWorkId,
} from "@/server/creative-work/canonical/types";
import { projectAsCanonicalWork } from "@/server/creative-work/projection";
import { projectCampaignAsCanonicalWork } from "@/server/creative-work/projection/from-campaign";
import { projectCreativeWorkAsCanonicalWork } from "@/server/creative-work/projection/from-creative-work";
import { compareProjectionTelemetry } from "@/server/creative-work/telemetry/projection-compare";

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { logger } from "@/lib/logger";

const WS = "11111111-1111-4111-8111-111111111111";
const CAMPAIGN_ID = "22222222-2222-4222-8222-222222222222";
const WORK_ID = "33333333-3333-4333-8333-333333333333";
const OUT_ID = "44444444-4444-4444-8444-444444444444";
const DER_ID = "55555555-5555-4555-8555-555555555555";

function campaignFixture(
  overrides: Partial<Parameters<typeof projectCampaignAsCanonicalWork>[0]> = {}
) {
  return {
    id: CAMPAIGN_ID,
    workspaceId: WS,
    name: "Black Friday",
    client: "Acme",
    product: "Course",
    objective: "Leads",
    audience: "Founders",
    platforms: ["meta_feed"],
    tone: "direct",
    offer: "20% off",
    constraints: null,
    notes: null,
    clientProfileId: null,
    status: "draft",
    creativeDiagnosisStatus: "pending",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
    activeDerivations: 0,
    totalDerivations: 0,
    completedDerivations: 0,
    failedDerivations: 0,
    ...overrides,
  };
}

function creativeWorkFixture(
  overrides: Partial<
    Parameters<typeof projectCreativeWorkAsCanonicalWork>[0]
  > = {}
) {
  return {
    id: WORK_ID,
    workspaceId: WS,
    clientProfileId: "66666666-6666-4666-8666-666666666666",
    title: "Criação de lançamento",
    toolKind: "social_post",
    status: "draft",
    format: "1:1",
    brief: {
      theme: "Lançamento",
      objective: "Engajamento",
      audience: "Founders",
      offer: "Free webinar",
    },
    copy: null,
    identitySnapshot: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
    ...overrides,
  };
}

/** Shared shape assertions — both origins must satisfy the same contract. */
function expectCanonicalShape(
  work: ReturnType<typeof projectCampaignAsCanonicalWork>
) {
  expect(work.id).toMatch(/^(campaign|creative_work):/);
  expect(["campaign", "assistant", "quick_tool"]).toContain(work.origin);
  expect(work.workspaceId).toBe(WS);
  expect(work.name.length).toBeGreaterThan(0);
  expect([
    "intending",
    "briefing",
    "generating",
    "reviewing",
    "approved",
    "delivered",
    "abandoned",
    "failed",
  ]).toContain(work.state);
  expect(work.intent).toEqual(
    expect.objectContaining({
      kind: expect.any(String),
      objective: expect.anything(),
      platforms: expect.any(Array),
    })
  );
  expect(work.briefing).toEqual(
    expect.objectContaining({
      audience: expect.anything(),
      offer: expect.anything(),
    })
  );
  expect(Array.isArray(work.outputs)).toBe(true);
  expect(Array.isArray(work.versions)).toBe(true);
  expect(typeof work.resumable).toBe("boolean");
  expect(work.resumeHref.startsWith("/")).toBe(true);
  if (work.originKind === "creative_work") {
    expect(work.resumeHref).toBe(`/creative-work/${work.originId}`);
  }
  expect(work.createdAt).toMatch(/Z$/);
  expect(work.updatedAt).toMatch(/Z$/);
}

describe("canonical types", () => {
  it("parses and builds stable cross-origin ids", () => {
    expect(makeCanonicalWorkId("campaign", CAMPAIGN_ID)).toBe(
      `campaign:${CAMPAIGN_ID}`
    );
    expect(parseCanonicalWorkId(`creative_work:${WORK_ID}`)).toEqual({
      kind: "creative_work",
      originId: WORK_ID,
    });
    expect(parseCanonicalWorkId("not-an-id")).toBeNull();
  });

  it("derives one next action for every canonical state", () => {
    expect([
      "intending",
      "briefing",
      "generating",
      "reviewing",
      "approved",
      "delivered",
      "abandoned",
      "failed",
    ].map((state) => getCanonicalWorkNextAction(state as never))).toEqual([
      "resume",
      "resume",
      "open",
      "review",
      "review",
      "review",
      "resume",
      "retry",
    ]);
  });
});

describe("normalizeCampaignState", () => {
  it("maps draft → intending and active → briefing", () => {
    expect(normalizeCampaignState({ status: "draft" })).toBe("intending");
    expect(normalizeCampaignState({ status: "active" })).toBe("briefing");
  });

  it("maps generating and approved derivation statuses", () => {
    expect(
      normalizeCampaignState({
        status: "generating",
        derivationStatuses: ["processing"],
      })
    ).toBe("generating");
    expect(
      normalizeCampaignState({
        status: "completed",
        derivationStatuses: ["approved"],
        completedDerivations: 1,
        totalDerivations: 1,
      })
    ).toBe("approved");
  });

  it("rejects draft with derivations and completed with active", () => {
    expect(() =>
      normalizeCampaignState({
        status: "draft",
        totalDerivations: 1,
        derivationStatuses: ["queued"],
      })
    ).toThrow(ImpossibleCanonicalStateError);

    expect(() =>
      normalizeCampaignState({
        status: "completed",
        activeDerivations: 1,
      })
    ).toThrow(/cannot have active derivations/);
  });
});

describe("normalizeCreativeWorkState", () => {
  it("maps draft/ready/completed+selected", () => {
    expect(
      normalizeCreativeWorkState({
        status: "draft",
        hasCopy: false,
        hasIdentitySnapshot: false,
        outputStatuses: [],
        hasSelectedOutput: false,
      })
    ).toBe("intending");

    expect(
      normalizeCreativeWorkState({
        status: "ready",
        hasCopy: true,
        hasIdentitySnapshot: true,
        outputStatuses: [],
        hasSelectedOutput: false,
      })
    ).toBe("briefing");

    expect(
      normalizeCreativeWorkState({
        status: "completed",
        hasCopy: true,
        hasIdentitySnapshot: true,
        outputStatuses: ["completed"],
        hasSelectedOutput: true,
      })
    ).toBe("approved");
  });

  it("rejects ready without identity and generating without outputs", () => {
    expect(() =>
      normalizeCreativeWorkState({
        status: "ready",
        hasCopy: true,
        hasIdentitySnapshot: false,
        outputStatuses: [],
        hasSelectedOutput: false,
      })
    ).toThrow(/ready requires identitySnapshot/);

    expect(() =>
      normalizeCreativeWorkState({
        status: "generating",
        hasCopy: true,
        hasIdentitySnapshot: true,
        outputStatuses: [],
        hasSelectedOutput: false,
      })
    ).toThrow(/generating requires at least one output/);
  });
});

describe("projectCampaignAsCanonicalWork", () => {
  it("projects campaign fixture into the shared contract", () => {
    const safe = projectCampaignAsCanonicalWork(
      campaignFixture({
        status: "completed",
        totalDerivations: 1,
        completedDerivations: 1,
      }),
      [
        {
          id: DER_ID,
          status: "completed",
          format: "1:1",
          creativeLevel: "balanced",
          outputKey: "out/a.png",
          createdAt: "2026-01-03T00:00:00.000Z",
        },
      ]
    );
    expectCanonicalShape(safe);
    expect(safe.originKind).toBe("campaign");
    expect(safe.origin).toBe("campaign");
    expect(safe.state).toBe("reviewing");
    expect(safe.outputs).toHaveLength(1);
    expect(safe.outputs[0].sourceKind).toBe("derivation");
    expect(mapDerivationStatusToCanonical("approved")).toBe("approved");
    expect(safe.briefing.product).toBe("Course");
    expect(safe.resumeHref).toBe(`/campaigns/${CAMPAIGN_ID}`);
  });

  it("sets intent.formatHint from targetFormats[0]", () => {
    const withFormats = projectCampaignAsCanonicalWork(
      campaignFixture({ targetFormats: ["4:5", "9:16"] })
    );
    expect(withFormats.intent.formatHint).toBe("4:5");
    expect(withFormats.intent.kind).toBe("campaign");

    const empty = projectCampaignAsCanonicalWork(
      campaignFixture({ targetFormats: [] })
    );
    expect(empty.intent.formatHint).toBeNull();

    const missing = projectCampaignAsCanonicalWork(campaignFixture());
    expect(missing.intent.formatHint).toBeNull();
  });

  it("keeps the persisted protocol and result count in summary projections", () => {
    const work = projectCampaignAsCanonicalWork(
      campaignFixture({
        generationMode: "format_adaptation",
        status: "completed",
        totalDerivations: 4,
        completedDerivations: 4,
      }),
    );

    expect(work.protocol).toBe("format_adaptation");
    expect(work.resultCount).toBe(4);
  });

  it("counts completed campaign results instead of every derivation", () => {
    const work = projectCampaignAsCanonicalWork(
      campaignFixture({ status: "active", totalDerivations: 4, completedDerivations: 2 }),
    );

    expect(work.resultCount).toBe(2);
  });
});

describe("projectCreativeWorkAsCanonicalWork (Criar Post fixture)", () => {
  it("resumes an unlinked work on its authenticated detail page", () => {
    expect(projectCreativeWorkAsCanonicalWork(creativeWorkFixture()).resumeHref)
      .toBe(`/creative-work/${WORK_ID}`);
  });

  it("resumes a linked work in its campaign without changing the work id", () => {
    const work = projectCreativeWorkAsCanonicalWork(creativeWorkFixture({ campaignId: CAMPAIGN_ID }));
    expect(work.resumeHref).toBe(`/campaigns/${CAMPAIGN_ID}?creativeWork=${WORK_ID}`);
    expect(work.id).toBe(`creative_work:${WORK_ID}`);
  });

  it("uses the persisted work title as the canonical display name", () => {
    const work = projectCreativeWorkAsCanonicalWork(creativeWorkFixture({
      title: "Campanha de matrículas",
      brief: null,
    }));

    expect(work.name).toBe("Campanha de matrículas");
  });

  it("projects create-post fixture into the same contract", () => {
    const work = projectCreativeWorkAsCanonicalWork(
      creativeWorkFixture({
        status: "ready",
        copy: { headline: "H", body: "B", cta: "C" },
        identitySnapshot: { clientProfileId: "x", confirmedAt: "t", assets: [], brandKit: { colors: [], fonts: [], toneOfVoice: null, prohibitedElements: null, requiredElements: null } },
      }),
      []
    );
    expectCanonicalShape(work);
    expect(work.originKind).toBe("creative_work");
    expect(work.origin).toBe("quick_tool");
    expect(work.state).toBe("briefing");
    expect(work.intent.kind).toBe("social_post");
    expect(work.briefing.theme).toBe("Lançamento");
    expect(work.briefing.headline).toBe("H");
  });

  it("projects the versioned briefing and keeps an unknown offer unknown", () => {
    const input = creativeWorkFixture({
      toolKind: "single",
      brief: {
        theme: "Legacy theme",
        objective: "Legacy objective",
        audience: "Legacy audience",
        offer: "Legacy offer",
      },
      inputSnapshot: {
        inferredBriefing: {
          version: 1,
          message: { value: "Algo moderno", state: "sourced" },
          objective: { value: "Gerar interesse", state: "inferred", confidence: "medium" },
          audience: { value: "Professores", state: "inferred", confidence: "low" },
          offer: { value: null, state: "unknown" },
          tone: { value: "Direto", state: "sourced" },
          constraints: { value: null, state: "unknown" },
          readiness: "exploratory",
          confidence: "low",
        },
      },
    });
    const work = projectCreativeWorkAsCanonicalWork(input);

    expect(work.intent.objective).toBe("Gerar interesse");
    expect(work.briefing).toMatchObject({
      theme: "Algo moderno",
      audience: "Professores",
      offer: null,
      tone: "Direto",
      constraints: null,
    });
    expect(projectCreativeWorkAsCanonicalWork({ ...input, toolKind: "variations" }).briefing.offer)
      .toBe("Legacy offer");
  });

  it("marks selected output as approved stage", () => {
    const work = projectCreativeWorkAsCanonicalWork(
      creativeWorkFixture({
        status: "completed",
        copy: { headline: "H", body: "B", cta: "C" },
        identitySnapshot: {},
      }),
      [
        {
          id: OUT_ID,
          status: "completed",
          creativeLevel: "bold",
          outputKey: "out/b.png",
          isSelected: true,
          createdAt: "2026-01-04T00:00:00.000Z",
        },
      ]
    );
    expect(work.state).toBe("approved");
    expect(work.selectedOutputId).toBe(OUT_ID);
    expect(work.versions[0].outputId).toBe(OUT_ID);
  });

  it("projects only the current output per level/format and keeps every ordered version", () => {
    const work = projectCreativeWorkAsCanonicalWork(
      creativeWorkFixture({
        status: "completed",
        copy: { headline: "H", body: "B", cta: "C" },
        identitySnapshot: {},
      }),
      [
        {
          id: "balanced-v2",
          status: "completed",
          creativeLevel: "balanced",
          targetFormat: "4:5",
          versionNumber: 2,
          parentOutputId: "balanced-v1",
          outputKey: "out/v2.png",
          isSelected: false,
          createdAt: "2026-01-05T00:00:00.000Z",
        },
        {
          id: "balanced-v1",
          status: "completed",
          creativeLevel: "balanced",
          targetFormat: "4:5",
          versionNumber: 1,
          parentOutputId: null,
          outputKey: "out/v1.png",
          isSelected: false,
          createdAt: "2026-01-04T00:00:00.000Z",
        },
        {
          id: "bold-v1",
          status: "completed",
          creativeLevel: "bold",
          targetFormat: "1:1",
          versionNumber: 1,
          parentOutputId: null,
          outputKey: "out/bold.png",
          isSelected: false,
          createdAt: "2026-01-03T00:00:00.000Z",
        },
      ],
    );

    expect(work.state).toBe("reviewing");
    expect(work.outputs.map((output) => output.id)).toEqual(["bold-v1", "balanced-v2"]);
    expect(work.versions.map((version) => version.outputId)).toEqual([
      "bold-v1",
      "balanced-v1",
      "balanced-v2",
    ]);
    expect(work.versions.map((version) => version.label)).toEqual([
      "bold 1:1 · v1",
      "balanced 4:5 · v1",
      "balanced 4:5 · v2",
    ]);
    expect(work.resultCount).toBe(2);
  });

  it("keeps the client profile name in the canonical projection", () => {
    const work = projectCreativeWorkAsCanonicalWork(
      creativeWorkFixture({ brandName: "Marca Aurora" }),
    );

    expect(work.brandName).toBe("Marca Aurora");
  });

  it("projects every directional output sharing the same level and format", () => {
    const directionalOutput = (id: string, directionId: string, createdAt: string) => ({
      id,
      status: "completed",
      creativeLevel: "balanced",
      targetFormat: "4:5",
      versionNumber: 1,
      parentOutputId: null,
      directionId,
      outputKey: `out/${id}.png`,
      isSelected: false,
      createdAt,
    });
    const work = projectCreativeWorkAsCanonicalWork(
      creativeWorkFixture({
        status: "completed",
        copy: { headline: "H", body: "B", cta: "C" },
        identitySnapshot: {},
      }),
      [
        directionalOutput("dir-a", "00000000-0000-4000-8000-0000000000d1", "2026-01-03T00:00:00.000Z"),
        directionalOutput("dir-b", "00000000-0000-4000-8000-0000000000d2", "2026-01-04T00:00:00.000Z"),
        directionalOutput("dir-c", "00000000-0000-4000-8000-0000000000d3", "2026-01-05T00:00:00.000Z"),
      ],
    );

    expect(work.outputs.map((output) => output.id)).toEqual(["dir-a", "dir-b", "dir-c"]);
    expect(work.versions.map((version) => version.outputId)).toEqual(["dir-a", "dir-b", "dir-c"]);
  });
});

describe("projectAsCanonicalWork dispatch", () => {
  it("produces equivalent consumable fields from both origins", () => {
    const fromCampaign = projectAsCanonicalWork({
      originKind: "campaign",
      campaign: campaignFixture({ status: "active" }),
      derivations: [],
    });
    const fromPost = projectAsCanonicalWork({
      originKind: "creative_work",
      work: creativeWorkFixture({
        status: "ready",
        copy: { headline: "H", body: "B", cta: "C" },
        identitySnapshot: {},
      }),
      outputs: [],
    });
    expectCanonicalShape(fromCampaign);
    expectCanonicalShape(fromPost);
    // Same interface keys
    expect(Object.keys(fromCampaign).sort()).toEqual(
      Object.keys(fromPost).sort()
    );
  });
});

describe("compareProjectionTelemetry", () => {
  beforeEach(() => {
    vi.mocked(logger.info).mockClear();
  });

  it("derives expected stage from originStatus and flags enrichment divergence", () => {
    // completed + selected projects to approved; naive origin map says reviewing
    const result = compareProjectionTelemetry({
      workspaceId: WS,
      origin: "quick_tool",
      originKind: "creative_work",
      originId: WORK_ID,
      originStatus: "completed",
      canonicalState: "approved",
      outputCount: 1,
    });
    expect(result.expectedStage).toBe("reviewing");
    expect(result.diverged).toBe(true);
    expect(logger.info).toHaveBeenCalledOnce();
    const payload = JSON.parse(String(vi.mocked(logger.info).mock.calls[0][0]));
    expect(payload.type).toBe("canonical_projection_compare");
    expect(payload.diverged).toBe(true);
    expect(payload.expectedStage).toBe("reviewing");
  });

  it("reports no divergence when projection matches naive origin map", () => {
    const result = compareProjectionTelemetry({
      workspaceId: WS,
      origin: "campaign",
      originKind: "campaign",
      originId: CAMPAIGN_ID,
      originStatus: "active",
      canonicalState: "briefing",
      outputCount: 0,
    });
    expect(result.diverged).toBe(false);
    expect(result.expectedStage).toBe("briefing");
  });
});
