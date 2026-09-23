import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";

const dbMock = vi.hoisted(() => {
  const state = { selects: [] as unknown[][], inserts: [] as unknown[][] };
  const reset = () => {
    state.selects.length = 0;
    state.inserts.length = 0;
  };
  const terminal = (queue: unknown[][]) => ({
    then: (resolve: (value: unknown) => void) => Promise.resolve(queue.shift() ?? []).then(resolve),
  });
  const selectChain = () => {
    const chain: Record<string, unknown> = {};
    chain.from = vi.fn(() => chain);
    chain.where = vi.fn(() => chain);
    chain.orderBy = vi.fn(() => chain);
    chain.limit = vi.fn(() => terminal(state.selects));
    chain.then = (resolve: (value: unknown) => void) =>
      Promise.resolve(state.selects.shift() ?? []).then(resolve);
    return chain;
  };
  const setFn = vi.fn(() => ({ where: vi.fn(() => ({})) }));
  const valuesFn = vi.fn(() => ({ returning: vi.fn(() => terminal(state.inserts)) }));
  const executeFn = vi.fn(async () => []);
  const tx = {
    select: vi.fn(() => selectChain()),
    insert: vi.fn(() => ({ values: valuesFn })),
    update: vi.fn(() => ({ set: setFn })),
    execute: executeFn,
  };
  return {
    state,
    reset,
    setFn,
    valuesFn,
    executeFn,
    db: {
      select: vi.fn(() => selectChain()),
      insert: vi.fn(() => ({ values: valuesFn })),
      update: vi.fn(() => ({ set: setFn })),
      execute: executeFn,
      transaction: vi.fn(async (callback: (inner: unknown) => Promise<unknown>) => callback(tx)),
    },
  };
});

vi.mock("../db", () => ({ db: dbMock.db }));

import { brandKnowledgeEvidenceKey } from "../brand-knowledge/contracts";
import { compileBrandKnowledgeVersion } from "../brand-knowledge/version-compiler";
import { canonicalJsonStringify } from "../creative-work/canonical-json";
import {
  BrandKnowledgeCalibrationError,
  BrandKnowledgeConflictError,
  BrandKnowledgeEvidenceError,
  buildRepertoireReviewedCandidate,
  publishBrandKnowledgeVersion,
  resolveEvidenceHashes,
  reviewRepertoireCollection,
} from "./brand-knowledge";

describe("brand knowledge persistence invariants", () => {
  it("checks human evidence membership once for the whole claim set", async () => {
    dbMock.reset();
    dbMock.db.select.mockClear();
    dbMock.state.selects.push(
      [{ id: "profile-1" }],
      [{ userId: "user-1" }, { userId: "user-2" }],
    );
    const claims = [
      { value: "A", evidenceRefs: [{ type: "human", id: "user-1", path: "review", sourceHash: "a".repeat(64) }] },
      { value: "B", evidenceRefs: [{ type: "human", id: "user-2", path: "review", sourceHash: "b".repeat(64) }] },
    ];

    const hashes = await resolveEvidenceHashes(dbMock.db as never, "workspace-1", "profile-1", claims as never);

    expect(hashes.size).toBe(2);
    expect(dbMock.db.select).toHaveBeenCalledTimes(2); // profile + members
  });

  it("rejects a human reference outside the workspace after one batch lookup", async () => {
    dbMock.reset();
    dbMock.db.select.mockClear();
    dbMock.state.selects.push([{ id: "profile-1" }], [{ userId: "user-1" }]);

    await expect(resolveEvidenceHashes(dbMock.db as never, "workspace-1", "profile-1", [
      { value: "A", evidenceRefs: [{ type: "human", id: "user-1", path: "review", sourceHash: "a".repeat(64) }] },
      { value: "B", evidenceRefs: [{ type: "human", id: "foreign", path: "review", sourceHash: "b".repeat(64) }] },
    ] as never)).rejects.toThrow("Human evidence foreign is outside this workspace");

    expect(dbMock.db.select).toHaveBeenCalledTimes(2);
  });

  it("keys evidence by type, owner and path so one profile field cannot mask another", () => {
    expect(brandKnowledgeEvidenceKey({ type: "brand_kit_field", id: "profile-1", path: "brandColors" }))
      .not.toBe(brandKnowledgeEvidenceKey({ type: "brand_kit_field", id: "profile-1", path: "brandFonts" }));
  });

  it("keeps publication output immutable from later candidate edits", () => {
    const claim = {
      id: "claim-1",
      workspaceId: "workspace-1",
      clientProfileId: "profile-1",
      claimKey: "palette.colors" as const,
      kind: "fact" as const,
      value: ["#D71F2B"],
      scope: { level: "global" as const },
      authority: "explicit" as const,
      confidence: "high" as const,
      status: "approved" as const,
      evidenceRefs: [{ type: "brand_guide" as const, id: "guide-1", path: "colors", sourceHash: "a".repeat(64) }],
      extractorVersion: "v1",
      sourceHash: "a".repeat(64),
      reviewedAt: new Date("2026-08-13T12:00:00.000Z"),
      reviewedByUserId: "user-1",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const evidence = new Map([[brandKnowledgeEvidenceKey(claim.evidenceRefs[0]), "a".repeat(64)]]);
    const published = compileBrandKnowledgeVersion({ profileId: "profile-1", claims: [claim], evidenceHashes: evidence });
    claim.value = ["#000000"];
    expect(published.snapshot.claims[0]?.value).toEqual(["#D71F2B"]);
  });
});

const WORKSPACE_ID = "workspace-1";
const PROFILE_ID = "profile-1";
const SESSION_ID = "session-1";
const CANDIDATE_HASH = "c".repeat(64);

function publishedClaim(sourceHash: string) {
  return {
    id: "claim-1",
    claimKey: "palette.colors",
    kind: "fact",
    value: ["#D71F2B"],
    scope: { level: "global" },
    authority: "explicit",
    confidence: "high",
    evidenceRefs: [{ type: "brand_kit_field", id: PROFILE_ID, path: "brandColors", sourceHash }],
    reviewedAt: "2026-09-13T12:00:00.000Z",
    reviewedByUserId: "user-1",
  };
}

function candidate() {
  const kitHash = createHash("sha256").update(canonicalJsonStringify(["#D71F2B"])).digest("hex");
  return {
    hash: CANDIDATE_HASH,
    knowledge: {
      schemaVersion: 1,
      profileId: PROFILE_ID,
      compiledAt: "2026-09-13T12:00:00.000Z",
      claims: [publishedClaim(kitHash)],
      excluded: [],
    },
    identity: {
      clientProfileId: PROFILE_ID,
      confirmedAt: "2026-09-13T12:00:00.000Z",
      assets: [],
      brandKit: {
        colors: ["#D71F2B"],
        fonts: [],
        toneOfVoice: null,
        prohibitedElements: null,
        requiredElements: null,
      },
    },
    evidenceHashes: {},
  };
}

function sessionWithRound(overrides: Record<string, unknown> = {}) {
  const roundCandidate = candidate();
  return {
    id: SESSION_ID,
    workspaceId: WORKSPACE_ID,
    clientProfileId: PROFILE_ID,
    baseVersionId: null,
    revision: 5,
    status: "calibrating",
    rounds: [
      {
        number: 1,
        candidate: roundCandidate,
        quoteCredits: 8,
        confirmedBy: "user-1",
        confirmedAt: "2026-09-13T12:00:00.000Z",
        coverage: ["palette.colors"],
        slots: [0, 1, 2, 3].map((index) => ({
          index,
          workItemId: `work-${index}`,
          outputId: `out-${index}`,
          feedback: {
            rating: "good",
            note: "",
            dimensions: [],
            actorId: "user-1",
            at: "2026-09-13T12:00:00.000Z",
          },
        })),
      },
    ],
    extensionCount: 0,
    activatedVersionId: null,
    ...overrides,
  };
}

function completedOutputs() {
  return [0, 1, 2, 3].map((index) => ({
    id: `out-${index}`,
    workItemId: `work-${index}`,
    status: "completed",
    quality: { schemaVersion: 1, objectiveVerdict: "pass" },
  }));
}

describe("publishBrandKnowledgeVersion with calibration proof (plan 01, T4)", () => {
  beforeEach(() => {
    dbMock.reset();
    vi.clearAllMocks();
  });

  const proof = { workspaceId: WORKSPACE_ID, clientProfileId: PROFILE_ID, userId: "user-1", sessionId: SESSION_ID, expectedRevision: 5, candidateHash: CANDIDATE_HASH };

  it("não permite que uma aprovação valide outra candidata", async () => {
    dbMock.state.selects.push(
      [{ id: PROFILE_ID, workspaceId: WORKSPACE_ID, brandColors: ["#D71F2B"] }],
      [sessionWithRound()],
    );
    const error = await publishBrandKnowledgeVersion({ ...proof, candidateHash: "e".repeat(64) }).catch(
      (cause: unknown) => cause,
    );
    expect(error).toBeInstanceOf(BrandKnowledgeCalibrationError);
    expect((error as BrandKnowledgeCalibrationError).code).toBe("calibration_stale");
    expect(dbMock.valuesFn).not.toHaveBeenCalled();
  });

  it("rejeita publish sem prova e mantém a ativa", async () => {
    dbMock.state.selects.push(
      [{ id: PROFILE_ID, workspaceId: WORKSPACE_ID, brandColors: ["#D71F2B"] }],
      [],
    );
    const error = await publishBrandKnowledgeVersion(proof).catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(BrandKnowledgeCalibrationError);
    expect((error as BrandKnowledgeCalibrationError).code).toBe("calibration_required");
    expect(dbMock.valuesFn).not.toHaveBeenCalled();
    expect(dbMock.setFn).not.toHaveBeenCalled();
  });

  it("rejeita rodada incompleta ou reprovada", async () => {
    const session = sessionWithRound();
    (session.rounds[0]!.slots[3]!.feedback as { rating: string }).rating = "bad";
    dbMock.state.selects.push(
      [{ id: PROFILE_ID, workspaceId: WORKSPACE_ID, brandColors: ["#D71F2B"] }],
      [session],
      [],
      completedOutputs(),
    );
    const error = await publishBrandKnowledgeVersion(proof).catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(BrandKnowledgeCalibrationError);
    expect((error as BrandKnowledgeCalibrationError).code).toBe("calibration_required");
    expect(dbMock.valuesFn).not.toHaveBeenCalled();
  });

  it("publica o hash validado como v2 e ativa a sessão atomicamente", async () => {
    const profile = { id: PROFILE_ID, workspaceId: WORKSPACE_ID, brandColors: ["#D71F2B"] };
    dbMock.state.selects.push([profile], [sessionWithRound()], [], completedOutputs(), [profile], [], [{ value: 2 }]);
    const published = {
      id: "version-3",
      workspaceId: WORKSPACE_ID,
      clientProfileId: PROFILE_ID,
      versionNumber: 3,
      hash: CANDIDATE_HASH,
      status: "active",
    };
    dbMock.state.inserts.push([published]);
    const result = await publishBrandKnowledgeVersion(proof);
    expect(result).toBe(published);
    const inserted = dbMock.valuesFn.mock.calls[0]?.[0] as {
      hash: string;
      versionNumber: number;
      status: string;
      snapshot: { schemaVersion: number; calibration: { sessionId: string; round: number; candidateHash: string } };
    };
    expect(inserted.hash).toBe(CANDIDATE_HASH);
    expect(inserted.versionNumber).toBe(3);
    expect(inserted.status).toBe("active");
    expect(inserted.snapshot.schemaVersion).toBe(2);
    expect(inserted.snapshot.calibration).toEqual({ sessionId: SESSION_ID, round: 1, candidateHash: CANDIDATE_HASH });
    const sessionWrite = dbMock.setFn.mock.calls.find((call) =>
      (call[0] as { status?: string }).status === "activated",
    )?.[0] as { activatedVersionId: string; revision: number };
    expect(sessionWrite.activatedVersionId).toBe("version-3");
    expect(sessionWrite.revision).toBe(6);
  });

  it("retorna a versão ativada em reentrada da mesma sessão", async () => {
    const activated = { id: "version-9", status: "active", hash: CANDIDATE_HASH };
    dbMock.state.selects.push(
      [{ id: PROFILE_ID, workspaceId: WORKSPACE_ID }],
      [sessionWithRound({ status: "activated", activatedVersionId: "version-9" })],
      [activated],
    );
    await expect(publishBrandKnowledgeVersion(proof)).resolves.toBe(activated);
    expect(dbMock.valuesFn).not.toHaveBeenCalled();
  });

  it("não sobrescreve silenciosamente quando outra sessão ativou primeiro", async () => {
    dbMock.state.selects.push(
      [{ id: PROFILE_ID, workspaceId: WORKSPACE_ID, brandColors: ["#D71F2B"] }],
      [sessionWithRound()],
      [{ id: "version-other", status: "active" }],
    );
    const error = await publishBrandKnowledgeVersion(proof).catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(BrandKnowledgeCalibrationError);
    expect((error as BrandKnowledgeCalibrationError).code).toBe("calibration_stale");
    expect(dbMock.valuesFn).not.toHaveBeenCalled();
  });
});

const REVIEWED_REPERTOIRE = {
  version: 1,
  common: [{
    id: "11111111-1111-4111-8111-111111111111",
    dimension: "hierarchy",
    observation: "Título domina a leitura",
    application: "Dar ao título escala superior ao texto de apoio",
    avoid: "Competição de dois focos",
    evidenceIds: ["ref-1"],
    confidence: "high",
  }],
  languages: [],
};

function reviewCandidate() {
  const base = candidate();
  return {
    ...base,
    knowledge: {
      ...base.knowledge,
      claims: [
        ...base.knowledge.claims,
        {
          id: "claim-old-repertoire",
          claimKey: "visual.repertoire",
          kind: "rule",
          value: { version: 1, common: [], languages: [] },
          scope: { level: "global" },
          authority: "inferred",
          confidence: "medium",
          evidenceRefs: [{ type: "training_asset", id: "ref-old", path: "repertoire.evidence", sourceHash: "b".repeat(64) }],
          reviewedAt: "2026-09-13T12:00:00.000Z",
          reviewedByUserId: "user-1",
        },
      ],
    },
    evidenceHashes: {
      "training_asset:ref-old:repertoire.evidence": "b".repeat(64),
      "asset:workspaces/ws/logo.png": "c".repeat(64),
    },
  };
}

function reviewSession(overrides: Record<string, unknown> = {}) {
  return {
    id: SESSION_ID,
    workspaceId: WORKSPACE_ID,
    clientProfileId: PROFILE_ID,
    baseVersionId: null,
    revision: 5,
    status: "review",
    candidate: reviewCandidate(),
    rounds: [],
    extensionCount: 0,
    activatedVersionId: null,
    ...overrides,
  };
}

describe("buildRepertoireReviewedCandidate (plan 02, T2)", () => {
  it("substitui a coleção aprovada, poda evidência órfã e recongela o hash", () => {
    const next = buildRepertoireReviewedCandidate({
      candidate: reviewCandidate() as never,
      claim: {
        id: "claim-new",
        value: REVIEWED_REPERTOIRE as never,
        evidenceRefs: [{
          type: "training_asset",
          id: "ref-1",
          path: "repertoire.evidence",
          sourceHash: "a".repeat(64),
        }],
      },
      reviewedByUserId: "user-1",
      reviewedAt: "2026-09-14T12:00:00.000Z",
    });
    const keys = next.knowledge.claims.map((claim) => `${claim.claimKey}:${claim.id}`);
    expect(keys).toContain("palette.colors:claim-1");
    expect(keys).toContain("visual.repertoire:claim-new");
    expect(keys).not.toContain("visual.repertoire:claim-old-repertoire");
    expect(next.evidenceHashes["training_asset:ref-1:repertoire.evidence"]).toBe("a".repeat(64));
    expect(next.evidenceHashes["training_asset:ref-old:repertoire.evidence"]).toBeUndefined();
    expect(next.evidenceHashes["asset:workspaces/ws/logo.png"]).toBe("c".repeat(64));
    expect(next.hash).not.toBe(reviewCandidate().hash);
  });
});

describe("reviewRepertoireCollection (plan 02, T2)", () => {
  beforeEach(() => {
    dbMock.reset();
    vi.clearAllMocks();
  });

  const command = {
    workspaceId: WORKSPACE_ID,
    clientProfileId: PROFILE_ID,
    sessionId: SESSION_ID,
    expectedRevision: 5,
    value: REVIEWED_REPERTOIRE,
    userId: "user-1",
  };
  const profile = { id: PROFILE_ID, workspaceId: WORKSPACE_ID, brandColors: ["#D71F2B"] };
  const reference = { id: "ref-1", assetKey: "assets/r1.png", reviewStatus: "approved" };
  const asset = { key: "assets/r1.png", metadata: { sha256: "a".repeat(64) } };
  const paletteApproval = {
    id: "claim-palette",
    claimKey: "palette.colors",
    value: ["#D71F2B"],
    scope: { level: "global" },
    authority: "explicit",
    confidence: "high",
    status: "approved",
    evidenceRefs: [],
  };
  const oldRepertoireApproval = {
    id: "claim-old",
    claimKey: "visual.repertoire",
    value: { version: 1, common: [], languages: [] },
    scope: { level: "global" },
    authority: "inferred",
    confidence: "medium",
    status: "approved",
    evidenceRefs: [],
  };

  it("aprova a coleção, supera a anterior e substitui a candidata em uma transação", async () => {
    dbMock.state.selects.push(
      [profile],
      [reviewSession()],
      [profile],
      [reference],
      [asset],
      [paletteApproval, oldRepertoireApproval],
    );
    const inserted = { id: "claim-new", claimKey: "visual.repertoire", status: "approved" };
    dbMock.state.inserts.push([inserted]);

    const result = await reviewRepertoireCollection(command);

    expect(result.claim).toBe(inserted);
    expect(result.revision).toBe(6);
    expect(dbMock.valuesFn).toHaveBeenCalledWith(expect.objectContaining({
      claimKey: "visual.repertoire",
      kind: "rule",
      status: "approved",
      authority: "human",
      reviewedByUserId: "user-1",
    }));
    const sessionWrite = dbMock.setFn.mock.calls.map((call) => call[0]).find(
      (write: unknown) => (write as { revision?: number }).revision === 6,
    ) as { candidate: { knowledge: { claims: Array<{ claimKey: string; id: string }> }; rounds?: unknown } };
    expect(sessionWrite.candidate.knowledge.claims).toContainEqual(
      expect.objectContaining({ claimKey: "visual.repertoire", id: "claim-new" }),
    );
    expect(sessionWrite.candidate.knowledge.claims.map((claim) => claim.id))
      .not.toContain("claim-old-repertoire");
    expect(sessionWrite).not.toHaveProperty("rounds");
  });

  it("conflito 409 não salva metade do conjunto", async () => {
    dbMock.state.selects.push(
      [profile],
      [reviewSession()],
      [profile],
      [reference],
      [asset],
      [
        { ...paletteApproval, id: "claim-a" },
        { ...paletteApproval, id: "claim-b", value: ["#00FF00"] },
        oldRepertoireApproval,
      ],
    );
    const error = await reviewRepertoireCollection(command).catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(BrandKnowledgeConflictError);
    expect(dbMock.valuesFn).not.toHaveBeenCalled();
    expect(dbMock.setFn).not.toHaveBeenCalled();
  });

  it("revisão obsoleta ou rodada em curso não tocam no conjunto", async () => {
    dbMock.state.selects.push([profile], [reviewSession({ revision: 4 })]);
    const stale = await reviewRepertoireCollection(command).catch((cause: unknown) => cause);
    expect(stale).toBeInstanceOf(BrandKnowledgeCalibrationError);
    expect((stale as { code: string }).code).toBe("calibration_stale");
    expect(dbMock.valuesFn).not.toHaveBeenCalled();

    dbMock.reset();
    dbMock.state.selects.push([profile], [reviewSession({ status: "calibrating" })]);
    const running = await reviewRepertoireCollection(command).catch((cause: unknown) => cause);
    expect(running).toBeInstanceOf(BrandKnowledgeCalibrationError);
    expect(dbMock.valuesFn).not.toHaveBeenCalled();
    expect(dbMock.setFn).not.toHaveBeenCalled();
  });

  it("rejeita valor inválido e evidência não aprovada antes de escrever", async () => {
    const invalid = await reviewRepertoireCollection({
      ...command,
      value: { version: 1, common: [], languages: [{ id: "not-a-uuid" }] },
    }).catch((cause: unknown) => cause);
    expect(invalid).toBeInstanceOf(Error);
    expect((invalid as Error).name).toBe("ZodError");
    expect(dbMock.db.transaction).not.toHaveBeenCalled();

    dbMock.reset();
    const empty = await reviewRepertoireCollection({
      ...command,
      value: { version: 1, common: [], languages: [] },
    }).catch((cause: unknown) => cause);
    expect(empty).toBeInstanceOf(BrandKnowledgeEvidenceError);
    expect(dbMock.db.transaction).not.toHaveBeenCalled();

    dbMock.reset();
    dbMock.state.selects.push(
      [profile],
      [reviewSession()],
      [profile],
      [{ ...reference, reviewStatus: "pending_approval" }],
      [asset],
    );
    const stale = await reviewRepertoireCollection(command).catch((cause: unknown) => cause);
    expect(stale).toBeInstanceOf(BrandKnowledgeEvidenceError);
    expect(dbMock.valuesFn).not.toHaveBeenCalled();
    expect(dbMock.setFn).not.toHaveBeenCalled();
  });
});
