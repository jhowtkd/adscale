import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSessionById: vi.fn(),
  appendRound: vi.fn(),
  linkOutputs: vi.fn(),
  getWork: vi.fn(),
  prepare: vi.fn(),
  generate: vi.fn(),
  listClaims: vi.fn(),
  resolveHashes: vi.fn(),
  identitySnapshot: vi.fn(),
  assetRows: [] as Array<{ key: string; metadata: unknown }>,
}));

vi.mock("@/server/repositories/brand-training-sessions", async (original) => ({
  ...(await original<typeof import("@/server/repositories/brand-training-sessions")>()),
  getTrainingSessionById: mocks.getSessionById,
  appendCalibrationRound: mocks.appendRound,
  linkCalibrationRoundOutputs: mocks.linkOutputs,
}));
vi.mock("@/server/repositories/creative-work", () => ({ getCreativeWork: mocks.getWork }));
vi.mock("./prepare-creative-work", () => ({ prepareCreativeWork: mocks.prepare }));
vi.mock("./generate-creative-work", () => ({ generateCreativeWork: mocks.generate }));
vi.mock("@/server/repositories/brand-knowledge", () => ({
  listBrandKnowledgeClaims: mocks.listClaims,
  resolveEvidenceHashes: mocks.resolveHashes,
}));
vi.mock("@/server/creative-work/identity", () => ({
  createIdentitySnapshot: mocks.identitySnapshot,
}));
vi.mock("@/server/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve(mocks.assetRows)),
      })),
    })),
  },
}));

import {
  CALIBRATION_FORMAT,
  calibrationCredits,
  freezeCandidate,
} from "@/server/brand-training/calibration";
import { BrandTrainingSessionError } from "@/server/repositories/brand-training-sessions";
import {
  BrandCalibrationError,
  buildCalibrationCandidate,
  CALIBRATION_NEUTRAL_BRIEFS,
  startBrandCalibration,
} from "./calibrate-brand-training";

const WORKSPACE_ID = "22222222-2222-4222-8222-222222222222";
const PROFILE_ID = "11111111-1111-4111-8111-111111111111";
const SESSION_ID = "33333333-3333-4333-8333-333333333333";

function testCandidate() {
  return freezeCandidate({
    knowledge: {
      schemaVersion: 1 as const,
      profileId: PROFILE_ID,
      compiledAt: "2026-09-13T12:00:00.000Z",
      claims: [],
      excluded: [],
    },
    identity: {
      clientProfileId: PROFILE_ID,
      confirmedAt: "2026-09-13T12:00:00.000Z",
      assets: [],
      brandKit: {
        colors: [],
        fonts: [],
        toneOfVoice: null,
        prohibitedElements: null,
        requiredElements: null,
      },
    },
    evidenceHashes: {},
  });
}

function testSession(overrides: Record<string, unknown> = {}) {
  return {
    id: SESSION_ID,
    workspaceId: WORKSPACE_ID,
    clientProfileId: PROFILE_ID,
    createdByUserId: "user-1",
    baseVersionId: null,
    revision: 1,
    status: "review",
    candidate: testCandidate(),
    rounds: [],
    extensionCount: 0,
    activatedVersionId: null,
    ...overrides,
  };
}

const WORK_IDS = [0, 1, 2, 3].map((index) => `77777777-7777-4777-8777-77777777777${index}`);

function mockDispatch(state: { outputs?: Array<{ id: string }>; preparedRevision?: string } = {}) {
  mocks.getWork.mockResolvedValue({
    work: { id: "work", trainingSessionId: SESSION_ID },
    outputs: state.outputs ?? [],
    sources: [],
  });
  mocks.prepare.mockResolvedValue({
    ok: true,
    value: {
      work: { updatedAt: new Date("2026-09-13T12:00:00.000Z") },
      quote: { credits: 2 },
      preparedPlan: { version: 1 },
    },
  });
  mocks.generate.mockResolvedValue({
    ok: true,
    value: {
      work: { id: "work" },
      outputs: [{ id: "out-1" }],
      billingKey: "k",
      brandTrainingSuggestion: null,
    },
  });
}

describe("calibrate brand training", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.assetRows.length = 0;
  });

  it("cota quatro peças únicas e usa briefs neutros identificados como teste", () => {
    expect(CALIBRATION_NEUTRAL_BRIEFS).toHaveLength(4);
    for (const brief of CALIBRATION_NEUTRAL_BRIEFS) {
      expect(brief.request).toMatch(/\[Texto de teste de calibração\]/);
      expect(brief.request).not.toMatch(/R\$|19 de|desconto|promoção/i);
    }
    expect(calibrationCredits(CALIBRATION_FORMAT)).toBeGreaterThan(0);
  });

  it("despacha os quatro slots com contexto interno e vincula as saídas", async () => {
    const session = testSession();
    const quote = calibrationCredits(CALIBRATION_FORMAT);
    mocks.getSessionById.mockResolvedValue(session);
    mocks.appendRound.mockResolvedValue({ session: { ...session, revision: 2 }, workItemIds: WORK_IDS, resumed: false });
    mockDispatch();
    mocks.linkOutputs.mockResolvedValue({});

    const result = await startBrandCalibration({
      workspaceId: WORKSPACE_ID,
      profileId: PROFILE_ID,
      sessionId: SESSION_ID,
      userId: "user-1",
      expectedRevision: 1,
      acceptedCredits: quote,
    });

    expect(result).toEqual({ sessionId: SESSION_ID, round: 1, workItemIds: WORK_IDS });
    expect(mocks.appendRound).toHaveBeenCalledTimes(1);
    expect(mocks.appendRound.mock.calls[0]?.[0]).toMatchObject({
      roundNumber: 1,
      quoteCredits: quote,
      confirmedBy: "user-1",
    });
    expect(mocks.prepare).toHaveBeenCalledTimes(4);
    expect(mocks.generate).toHaveBeenCalledTimes(4);
    // Cada despacho carrega o contexto interno do próprio slot — sem bypass.
    expect(mocks.prepare.mock.calls[2]?.[0]).toMatchObject({
      workItemId: WORK_IDS[2],
      calibration: { sessionId: SESSION_ID, round: 1, slot: 2 },
    });
    expect(mocks.generate.mock.calls[2]?.[0]).toMatchObject({
      calibration: { sessionId: SESSION_ID, round: 1, slot: 2 },
    });
    expect(mocks.linkOutputs).toHaveBeenCalledTimes(1);
    expect(mocks.linkOutputs.mock.calls[0]?.[0]).toMatchObject({
      expectedRevision: 2,
      round: 1,
      outputIds: { 0: "out-1", 1: "out-1", 2: "out-1", 3: "out-1" },
    });
  });

  it("anexa os casos determinísticos com contexto revisado e cobertura de IDs", async () => {
    const languageId = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
    const personId = "dddddddd-dddd-4ddd-dddd-dddddddddddd";
    const referenceId = "ffffffff-ffff-4fff-ffff-ffffffffffff";
    const candidate = freezeCandidate({
      ...testCandidate(),
      knowledge: {
        schemaVersion: 1 as const,
        profileId: PROFILE_ID,
        compiledAt: "2026-09-13T12:00:00.000Z",
        excluded: [],
        claims: [
          {
            id: "claim-repertoire",
            claimKey: "visual.repertoire",
            kind: "rule",
            value: {
              version: 1,
              common: [{
                id: "00000000-0000-4000-8000-000000000001",
                dimension: "hierarchy",
                observation: "Título domina",
                application: "Priorizar o título",
                avoid: "",
                evidenceIds: [referenceId],
                confidence: "high",
              }],
              languages: [{
                id: languageId,
                name: "Comercial",
                contexts: ["oferta"],
                rules: [{
                  id: "00000000-0000-4000-8000-000000000100",
                  dimension: "composition",
                  observation: "Grade simples",
                  application: "Usar grade simples",
                  avoid: "",
                  evidenceIds: [referenceId],
                  confidence: "high",
                }],
              }],
            },
            scope: { level: "global" },
            authority: "human",
            confidence: "high",
            evidenceRefs: [],
            reviewedAt: "2026-09-13T12:00:00.000Z",
            reviewedByUserId: "user-1",
          },
          {
            id: "claim-catalog",
            claimKey: "people.catalog",
            kind: "fact",
            value: {
              version: 1,
              people: [{
                id: personId,
                name: "Ana",
                aliases: [],
                referenceIds: [referenceId],
                primaryReferenceId: referenceId,
                preserve: [],
                referenceAdequacy: "confirmed",
              }],
            },
            scope: { level: "global" },
            authority: "human",
            confidence: "high",
            evidenceRefs: [],
            reviewedAt: "2026-09-13T12:00:00.000Z",
            reviewedByUserId: "user-1",
          },
        ],
      },
    });
    const session = testSession({ candidate, rounds: [] });
    const quote = calibrationCredits(CALIBRATION_FORMAT);
    mocks.getSessionById.mockResolvedValue(session);
    mocks.appendRound.mockResolvedValue({ session: { ...session, revision: 2 }, workItemIds: WORK_IDS, resumed: false });
    mockDispatch();
    mocks.linkOutputs.mockResolvedValue({});

    await startBrandCalibration({
      workspaceId: WORKSPACE_ID,
      profileId: PROFILE_ID,
      sessionId: SESSION_ID,
      userId: "user-1",
      expectedRevision: 1,
      acceptedCredits: quote,
    });

    const appended = mocks.appendRound.mock.calls[0]?.[0] as {
      coverage: string[];
      works: Array<{ request: string; settings: Record<string, unknown> }>;
    };
    // Neutral copy stays neutral; the reviewed IDs travel in settings.
    expect(appended.works.map((work) => work.settings)).toEqual([
      {},
      { visualLanguageId: languageId },
      { personIds: [personId] },
      {},
    ]);
    for (const work of appended.works) {
      expect(work.request).toMatch(/\[Texto de teste de calibração\]/);
    }
    expect(appended.coverage).toContain(languageId);
    expect(appended.coverage).toContain(personId);
    expect(appended.coverage.every((id) => /^[0-9a-f-]{36}$/.test(id))).toBe(true);
  });

  it("rejeita cotação divergente, revisão obsoleta e perfil alheio", async () => {
    const session = testSession();
    const quote = calibrationCredits(CALIBRATION_FORMAT);
    mocks.getSessionById.mockResolvedValue(session);

    await expect(
      startBrandCalibration({
        workspaceId: WORKSPACE_ID,
        profileId: PROFILE_ID,
        sessionId: SESSION_ID,
        userId: "user-1",
        expectedRevision: 1,
        acceptedCredits: quote + 1,
      }),
    ).rejects.toMatchObject({ code: "quote_changed" });
    expect(mocks.appendRound).not.toHaveBeenCalled();

    await expect(
      startBrandCalibration({
        workspaceId: WORKSPACE_ID,
        profileId: PROFILE_ID,
        sessionId: SESSION_ID,
        userId: "user-1",
        expectedRevision: 0,
        acceptedCredits: quote,
      }),
    ).rejects.toMatchObject({ code: "stale_session" });

    mocks.getSessionById.mockResolvedValue(null);
    await expect(
      startBrandCalibration({
        workspaceId: WORKSPACE_ID,
        profileId: PROFILE_ID,
        sessionId: SESSION_ID,
        userId: "user-1",
        expectedRevision: 1,
        acceptedCredits: quote,
      }),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("retoma slots sem saída e reconcilia os já reservados pela chave canônica", async () => {
    const session = testSession();
    const quote = calibrationCredits(CALIBRATION_FORMAT);
    mocks.getSessionById.mockResolvedValue(session);
    mocks.appendRound.mockResolvedValue({ session: { ...session, revision: 2 }, workItemIds: WORK_IDS, resumed: true });
    // Dois slots já reservaram (reentrada após o segundo despacho).
    mocks.getWork
      .mockResolvedValueOnce({ work: {}, outputs: [{ id: "out-a" }], sources: [] })
      .mockResolvedValueOnce({ work: {}, outputs: [{ id: "out-b" }], sources: [] })
      .mockResolvedValue({ work: {}, outputs: [], sources: [] });
    mocks.prepare.mockResolvedValue({
      ok: true,
      value: { work: { updatedAt: new Date() }, quote: {}, preparedPlan: {} },
    });
    mocks.generate.mockResolvedValue({
      ok: true,
      value: { work: {}, outputs: [{ id: "out-new" }], billingKey: "k", brandTrainingSuggestion: null },
    });
    mocks.linkOutputs.mockResolvedValue({});

    const result = await startBrandCalibration({
      workspaceId: WORKSPACE_ID,
      profileId: PROFILE_ID,
      sessionId: SESSION_ID,
      userId: "user-1",
      expectedRevision: 1,
      acceptedCredits: quote,
    });

    expect(result.workItemIds).toEqual(WORK_IDS);
    expect(mocks.prepare).toHaveBeenCalledTimes(2);
    expect(mocks.generate).toHaveBeenCalledTimes(2);
    expect(mocks.linkOutputs.mock.calls[0]?.[0]).toMatchObject({
      outputIds: { 0: "out-a", 1: "out-b", 2: "out-new", 3: "out-new" },
    });
  });

  it("deixa lote parcial explícito e só falha tudo sem crédito em nenhum slot", async () => {
    const session = testSession();
    const quote = calibrationCredits(CALIBRATION_FORMAT);
    mocks.getSessionById.mockResolvedValue(session);
    mocks.appendRound.mockResolvedValue({ session: { ...session, revision: 2 }, workItemIds: WORK_IDS, resumed: false });
    mocks.getWork.mockResolvedValue({ work: {}, outputs: [], sources: [] });
    mocks.prepare.mockResolvedValue({
      ok: true,
      value: { work: { updatedAt: new Date() }, quote: {}, preparedPlan: {} },
    });
    mocks.generate
      .mockResolvedValueOnce({
        ok: true,
        value: { work: {}, outputs: [{ id: "out-1" }], billingKey: "k", brandTrainingSuggestion: null },
      })
      .mockResolvedValue({ ok: false, error: { code: "credit_blocked" } });
    mocks.linkOutputs.mockResolvedValue({});

    const partial = await startBrandCalibration({
      workspaceId: WORKSPACE_ID,
      profileId: PROFILE_ID,
      sessionId: SESSION_ID,
      userId: "user-1",
      expectedRevision: 1,
      acceptedCredits: quote,
    });
    expect(partial.round).toBe(1);
    expect(mocks.linkOutputs.mock.calls[0]?.[0]).toMatchObject({ outputIds: { 0: "out-1" } });

    mocks.generate.mockResolvedValue({ ok: false, error: { code: "credit_blocked" } });
    await expect(
      startBrandCalibration({
        workspaceId: WORKSPACE_ID,
        profileId: PROFILE_ID,
        sessionId: SESSION_ID,
        userId: "user-1",
        expectedRevision: 1,
        acceptedCredits: quote,
      }),
    ).rejects.toMatchObject({ code: "credit_blocked" });
  });

  it("tenta o vínculo de saídas com revisão fresca após feedback concorrente", async () => {
    const session = testSession();
    const quote = calibrationCredits(CALIBRATION_FORMAT);
    mocks.getSessionById.mockResolvedValue(session);
    mocks.appendRound.mockResolvedValue({ session: { ...session, revision: 2 }, workItemIds: WORK_IDS, resumed: false });
    mockDispatch();
    mocks.linkOutputs
      .mockRejectedValueOnce(new BrandTrainingSessionError("stale_session"))
      .mockResolvedValueOnce({});
    mocks.getSessionById.mockResolvedValueOnce(session).mockResolvedValueOnce(testSession({ revision: 3 }));

    await startBrandCalibration({
      workspaceId: WORKSPACE_ID,
      profileId: PROFILE_ID,
      sessionId: SESSION_ID,
      userId: "user-1",
      expectedRevision: 1,
      acceptedCredits: quote,
    });
    expect(mocks.linkOutputs).toHaveBeenCalledTimes(2);
    expect(mocks.linkOutputs.mock.calls[1]?.[0]).toMatchObject({ expectedRevision: 3 });
  });

  it("congela a candidata de claims revisados, identidade e hashes de assets", async () => {
    const claim = {
      id: "claim-1",
      workspaceId: WORKSPACE_ID,
      clientProfileId: PROFILE_ID,
      claimKey: "palette.colors",
      kind: "fact",
      value: ["#D71F2B"],
      scope: { level: "global" },
      authority: "explicit",
      confidence: "high",
      status: "approved",
      evidenceRefs: [{ type: "brand_kit_field", id: PROFILE_ID, path: "brandColors", sourceHash: "a".repeat(64) }],
      extractorVersion: "v1",
      sourceHash: "a".repeat(64),
      reviewedAt: new Date("2026-09-13T12:00:00.000Z"),
      reviewedByUserId: "user-1",
    };
    mocks.listClaims.mockResolvedValue([claim]);
    mocks.resolveHashes.mockResolvedValue(new Map([[`brand_kit_field:${PROFILE_ID}:brandColors`, "a".repeat(64)]]));
    mocks.identitySnapshot.mockResolvedValue({
      clientProfileId: PROFILE_ID,
      confirmedAt: "2026-09-13T12:00:00.000Z",
      assets: [
        {
          referenceId: "ref-1",
          assetKey: "asset-key-1",
          label: "Logo",
          category: "logo",
          usageMode: "exact",
          analysis: { description: "", visualAttributes: [], rules: [], constraints: [], confidence: 1 },
          mimeType: "image/png",
          hasAlpha: true,
          placement: null,
        },
      ],
      brandKit: { colors: ["#D71F2B"], fonts: [], toneOfVoice: null, prohibitedElements: null, requiredElements: null },
    });
    mocks.assetRows.push({ key: "asset-key-1", metadata: { sha256: "b".repeat(64) } });

    const candidate = await buildCalibrationCandidate({ workspaceId: WORKSPACE_ID, profileId: PROFILE_ID });
    expect(candidate.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(candidate.knowledge.claims).toHaveLength(1);
    expect(candidate.evidenceHashes[`brand_kit_field:${PROFILE_ID}:brandColors`]).toBe("a".repeat(64));
    expect(candidate.evidenceHashes["asset:asset-key-1"]).toBe("b".repeat(64));
    expect(mocks.identitySnapshot).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      clientProfileId: PROFILE_ID,
      selectedReferenceIds: [],
      includePublishedBrandKnowledge: false,
    });
  });

  it("recusa candidata quando um asset da identidade não tem SHA verificável", async () => {
    mocks.listClaims.mockResolvedValue([
      {
        id: "claim-1",
        claimKey: "palette.colors",
        kind: "fact",
        value: ["#D71F2B"],
        scope: { level: "global" },
        authority: "explicit",
        confidence: "high",
        status: "approved",
        evidenceRefs: [{ type: "brand_kit_field", id: PROFILE_ID, path: "brandColors", sourceHash: "a".repeat(64) }],
        reviewedAt: new Date("2026-09-13T12:00:00.000Z"),
        reviewedByUserId: "user-1",
      },
    ]);
    mocks.resolveHashes.mockResolvedValue(new Map([[`brand_kit_field:${PROFILE_ID}:brandColors`, "a".repeat(64)]]));
    mocks.identitySnapshot.mockResolvedValue({
      clientProfileId: PROFILE_ID,
      confirmedAt: "2026-09-13T12:00:00.000Z",
      assets: [
        {
          referenceId: "ref-1",
          assetKey: "asset-key-1",
          label: "Logo",
          category: "logo",
          usageMode: "exact",
          analysis: { description: "", visualAttributes: [], rules: [], constraints: [], confidence: 1 },
          mimeType: "image/png",
          hasAlpha: true,
          placement: null,
        },
      ],
      brandKit: { colors: [], fonts: [], toneOfVoice: null, prohibitedElements: null, requiredElements: null },
    });
    mocks.assetRows.push({ key: "asset-key-1", metadata: {} });
    const error = await buildCalibrationCandidate({ workspaceId: WORKSPACE_ID, profileId: PROFILE_ID }).catch(
      (cause: unknown) => cause,
    );
    expect(error).toBeInstanceOf(BrandCalibrationError);
    expect((error as BrandCalibrationError).code).toBe("invalid_context");
  });
});
