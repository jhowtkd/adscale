import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMock = vi.hoisted(() => {
  const state = {
    selects: [] as unknown[][],
    inserts: [] as unknown[][],
    updates: [] as unknown[][],
  };
  const reset = () => {
    state.selects.length = 0;
    state.inserts.length = 0;
    state.updates.length = 0;
  };
  const terminal = (queue: unknown[][]) => ({
    then: (resolve: (value: unknown) => void) =>
      Promise.resolve(queue.shift() ?? []).then(resolve),
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
  const setFn = vi.fn(() => ({
    where: vi.fn(() => ({ returning: vi.fn(() => terminal(state.updates)) })),
  }));
  const valuesFn = vi.fn(() => ({
    returning: vi.fn(() => terminal(state.inserts)),
    onConflictDoNothing: vi.fn(() => Promise.resolve([])),
  }));
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
    tx,
    db: {
      select: vi.fn(() => selectChain()),
      insert: vi.fn(() => ({ values: valuesFn })),
      update: vi.fn(() => ({ set: setFn })),
      execute: executeFn,
      transaction: vi.fn(async (callback: (inner: unknown) => Promise<unknown>) =>
        callback(tx),
      ),
    },
  };
});

vi.mock("../db", () => ({ db: dbMock.db }));

import {
  appendCalibrationRound,
  applySessionCommand,
  BrandTrainingSessionError,
  createTrainingSession,
  getTrainingSession,
  getTrainingSessionById,
  linkCalibrationRoundOutputs,
  loadCalibrationCandidateForWork,
  mutateTrainingSession,
  requireRoundCapacity,
  type TrainingSession,
} from "./brand-training-sessions";
import { freezeCandidate } from "../brand-training/calibration";

const PROFILE_ID = "11111111-1111-4111-8111-111111111111";
const WORKSPACE_ID = "22222222-2222-4222-8222-222222222222";
const SESSION_ID = "33333333-3333-4333-8333-333333333333";
const WORK_ID = "44444444-4444-4344-8344-444444444444";

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

function testSession(overrides: Partial<TrainingSession> = {}): TrainingSession {
  return {
    id: SESSION_ID,
    workspaceId: WORKSPACE_ID,
    clientProfileId: PROFILE_ID,
    createdByUserId: "user-1",
    baseVersionId: null,
    revision: 0,
    status: "review",
    candidate: testCandidate(),
    rounds: [],
    extensionCount: 0,
    activatedVersionId: null,
    createdAt: new Date("2026-09-13T12:00:00.000Z"),
    updatedAt: new Date("2026-09-13T12:00:00.000Z"),
    ...overrides,
  };
}

function roundWithSlots(roundNumber: number) {
  const candidate = testCandidate();
  return {
    number: roundNumber,
    candidate,
    quoteCredits: 8,
    confirmedBy: "user-1",
    confirmedAt: "2026-09-13T12:00:00.000Z",
    coverage: ["palette"],
    slots: [0, 1, 2, 3].map((index) => ({
      index: index as 0 | 1 | 2 | 3,
      workItemId: WORK_ID,
      outputId: null,
      feedback: null,
    })) as TrainingSession["rounds"][number]["slots"],
  };
}

describe("brand training sessions", () => {
  beforeEach(() => {
    dbMock.reset();
    vi.clearAllMocks();
  });

  it("retoma a sessão aberta em vez de duplicar", async () => {
    const existing = testSession();
    dbMock.state.selects.push([{ id: PROFILE_ID }], [existing]);
    const session = await createTrainingSession({
      workspaceId: WORKSPACE_ID,
      profileId: PROFILE_ID,
      userId: "user-1",
      candidate: testCandidate(),
      baseVersionId: null,
    });
    expect(session).toBe(existing);
    expect(dbMock.valuesFn).not.toHaveBeenCalled();
  });

  it("cria a sessão quando não há aberta e rejeita perfil alheio", async () => {
    const created = testSession();
    dbMock.state.selects.push([{ id: PROFILE_ID }], []);
    dbMock.state.inserts.push([created]);
    const session = await createTrainingSession({
      workspaceId: WORKSPACE_ID,
      profileId: PROFILE_ID,
      userId: "user-1",
      candidate: testCandidate(),
      baseVersionId: null,
    });
    expect(session).toBe(created);
    expect(dbMock.executeFn).toHaveBeenCalled();

    dbMock.reset();
    dbMock.state.selects.push([]);
    await expect(
      createTrainingSession({
        workspaceId: WORKSPACE_ID,
        profileId: PROFILE_ID,
        userId: "user-1",
        candidate: testCandidate(),
        baseVersionId: null,
      }),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("retorna null quando não há sessão aberta", async () => {
    dbMock.state.selects.push([]);
    await expect(getTrainingSession(WORKSPACE_ID, PROFILE_ID)).resolves.toBeNull();
  });

  it("rejeita mutação de sessão inexistente ou com revisão obsoleta", async () => {
    dbMock.state.selects.push([]);
    await expect(
      mutateTrainingSession({
        workspaceId: WORKSPACE_ID,
        profileId: PROFILE_ID,
        sessionId: SESSION_ID,
        expectedRevision: 0,
        command: { type: "extend" },
      }),
    ).rejects.toMatchObject({ code: "not_found" });

    dbMock.reset();
    dbMock.state.selects.push([testSession({ revision: 2 })]);
    await expect(
      mutateTrainingSession({
        workspaceId: WORKSPACE_ID,
        profileId: PROFILE_ID,
        sessionId: SESSION_ID,
        expectedRevision: 1,
        command: { type: "extend" },
      }),
    ).rejects.toMatchObject({ code: "stale_session" });
    expect(dbMock.setFn).not.toHaveBeenCalled();
  });

  it("mapeia CAS perdido no UPDATE para stale_session", async () => {
    dbMock.state.selects.push([testSession({ revision: 1 })]);
    dbMock.state.updates.push([]);
    await expect(
      mutateTrainingSession({
        workspaceId: WORKSPACE_ID,
        profileId: PROFILE_ID,
        sessionId: SESSION_ID,
        expectedRevision: 1,
        command: { type: "extend" },
      }),
    ).rejects.toMatchObject({ code: "stale_session" });
  });

  it("grava feedback sem inventar causa e incrementa a revisão", async () => {
    const session = testSession({ rounds: [roundWithSlots(1)], revision: 3 });
    const updated = testSession({ revision: 4 });
    dbMock.state.selects.push([session]);
    dbMock.state.updates.push([updated]);
    const result = await mutateTrainingSession({
      workspaceId: WORKSPACE_ID,
      profileId: PROFILE_ID,
      sessionId: SESSION_ID,
      expectedRevision: 3,
      command: {
        type: "feedback",
        round: 1,
        slot: 2,
        rating: "good",
        note: "",
        dimensions: [],
        actorId: "user-1",
      },
      now: () => new Date("2026-09-13T12:00:00.000Z"),
    });
    expect(result).toBe(updated);
    const written = dbMock.setFn.mock.calls[0]?.[0] as {
      rounds: Array<{ slots: Array<{ feedback: unknown }> }>;
      revision: number;
    };
    expect(written.revision).toBe(4);
    expect(written.rounds[0]?.slots[2]?.feedback).toMatchObject({
      rating: "good",
      actorId: "user-1",
    });
  });

  it("resolve a candidata pelo vínculo persistido, nunca pelo cliente", async () => {
    const candidate = testCandidate();
    dbMock.state.selects.push([
      { clientProfileId: PROFILE_ID, trainingSessionId: SESSION_ID, trainingRound: 2 },
    ]);
    dbMock.state.selects.push([testSession({ rounds: [roundWithSlots(1), { ...roundWithSlots(2), candidate }] })]);
    await expect(loadCalibrationCandidateForWork(WORKSPACE_ID, WORK_ID)).resolves.toMatchObject({
      hash: candidate.hash,
    });

    dbMock.reset();
    dbMock.state.selects.push([
      { clientProfileId: PROFILE_ID, trainingSessionId: null, trainingRound: null },
    ]);
    await expect(loadCalibrationCandidateForWork(WORKSPACE_ID, WORK_ID)).resolves.toBeNull();
  });

  it("valida transições puras: feedback inválido, rodada em curso e teto", () => {
    const session = testSession({ rounds: [roundWithSlots(1)] });
    expect(() =>
      applySessionCommand(
        session,
        { type: "feedback", round: 9, slot: 0, rating: "bad", note: "", dimensions: [], actorId: "user-1" },
        new Date("2026-09-13T12:00:00.000Z"),
      ),
    ).toThrowError(BrandTrainingSessionError);
    try {
      applySessionCommand(
        session,
        { type: "feedback", round: 1, slot: 7, rating: "bad", note: "", dimensions: [], actorId: "user-1" },
        new Date("2026-09-13T12:00:00.000Z"),
      );
      expect.unreachable();
    } catch (error) {
      expect((error as BrandTrainingSessionError).code).toBe("invalid_feedback");
    }
    try {
      applySessionCommand(
        testSession({ status: "calibrating" }),
        { type: "replace_candidate", candidate: testCandidate() },
        new Date("2026-09-13T12:00:00.000Z"),
      );
      expect.unreachable();
    } catch (error) {
      expect((error as BrandTrainingSessionError).code).toBe("round_running");
    }
  });

  it("exige extensão explícita ao atingir o teto e reabre revisão após estender", () => {
    expect(requireRoundCapacity(2, 0)).toBe(3);
    try {
      requireRoundCapacity(3, 0);
      expect.unreachable();
    } catch (error) {
      expect((error as BrandTrainingSessionError).code).toBe("round_limit");
    }
    const extended = applySessionCommand(
      testSession({ status: "pending", extensionCount: 0 }),
      { type: "extend" },
      new Date("2026-09-13T12:00:00.000Z"),
    );
    expect(extended.extensionCount).toBe(1);
    expect(extended.status).toBe("review");
  });

  it("busca a sessão por id dentro do escopo", async () => {
    const session = testSession();
    dbMock.state.selects.push([session]);
    await expect(getTrainingSessionById(WORKSPACE_ID, PROFILE_ID, SESSION_ID)).resolves.toBe(session);
    dbMock.reset();
    dbMock.state.selects.push([]);
    await expect(getTrainingSessionById(WORKSPACE_ID, PROFILE_ID, SESSION_ID)).resolves.toBeNull();
  });

  it("anexa a rodada com quatro vínculos e retoma sem duplicar", async () => {
    const drafts = [0, 1, 2, 3].map((index) => ({
      id: `55555555-5555-4555-8555-55555555555${index}`,
      draftKey: `brand-calibration:${SESSION_ID}:1:${index}`,
      title: `Calibração — exemplo ${index + 1}`,
      request: "[Texto de teste de calibração] Peça neutra.",
    })) as [
      { id: string; draftKey: string; title: string; request: string },
      { id: string; draftKey: string; title: string; request: string },
      { id: string; draftKey: string; title: string; request: string },
      { id: string; draftKey: string; title: string; request: string },
    ];
    const candidate = testCandidate();
    dbMock.state.selects.push(
      [testSession({ revision: 1 })],
      drafts.map((draft) => ({ id: draft.id, draftKey: draft.draftKey })),
    );
    const updated = testSession({ revision: 2 });
    dbMock.state.updates.push([updated]);
    const result = await appendCalibrationRound({
      workspaceId: WORKSPACE_ID,
      profileId: PROFILE_ID,
      sessionId: SESSION_ID,
      expectedRevision: 1,
      roundNumber: 1,
      candidate,
      quoteCredits: 8,
      coverage: ["palette.colors"],
      confirmedBy: "user-1",
      works: drafts,
      now: () => new Date("2026-09-13T12:00:00.000Z"),
    });
    expect(result.session).toBe(updated);
    expect(result.resumed).toBe(false);
    expect(result.workItemIds).toEqual(drafts.map((draft) => draft.id));
    const written = dbMock.setFn.mock.calls[0]?.[0] as {
      rounds: Array<{ number: number; candidate: { hash: string }; slots: Array<{ workItemId: string; outputId: null }> }>;
      status: string;
      revision: number;
    };
    expect(written.status).toBe("calibrating");
    expect(written.revision).toBe(2);
    expect(written.rounds).toHaveLength(1);
    expect(written.rounds[0]?.candidate.hash).toBe(candidate.hash);
    expect(written.rounds[0]?.slots.map((slot) => slot.workItemId)).toEqual(
      drafts.map((draft) => draft.id),
    );
    const inserted = dbMock.valuesFn.mock.calls[0]?.[0] as Array<{ trainingSlot: number; draftKey: string }>;
    expect(inserted).toHaveLength(4);
    expect(inserted.map((row) => row.trainingSlot)).toEqual([0, 1, 2, 3]);

    // Repetição encontra a rodada existente: nenhum insert, mesmos UUIDs.
    dbMock.reset();
    vi.clearAllMocks();
    const resumedRound = {
      ...roundWithSlots(1),
      slots: drafts.map((draft, index) => ({
        index: index as 0 | 1 | 2 | 3,
        workItemId: draft.id,
        outputId: null,
        feedback: null,
      })) as TrainingSession["rounds"][number]["slots"],
    };
    dbMock.state.selects.push([testSession({ revision: 2, rounds: [resumedRound], status: "calibrating" })]);
    const resumed = await appendCalibrationRound({
      workspaceId: WORKSPACE_ID,
      profileId: PROFILE_ID,
      sessionId: SESSION_ID,
      expectedRevision: 2,
      roundNumber: 1,
      candidate,
      quoteCredits: 8,
      coverage: ["palette.colors"],
      confirmedBy: "user-1",
      works: drafts,
    });
    expect(resumed.resumed).toBe(true);
    expect(resumed.workItemIds).toEqual(drafts.map((draft) => draft.id));
    expect(dbMock.valuesFn).not.toHaveBeenCalled();
    expect(dbMock.setFn).not.toHaveBeenCalled();
  });

  it("não abre rodada seguinte com slot em processamento", async () => {
    dbMock.state.selects.push(
      [testSession({ revision: 2, rounds: [roundWithSlots(1)], status: "calibrating" })],
      [{ status: "completed" }, { status: "processing" }],
    );
    await expect(
      appendCalibrationRound({
        workspaceId: WORKSPACE_ID,
        profileId: PROFILE_ID,
        sessionId: SESSION_ID,
        expectedRevision: 2,
        roundNumber: 2,
        candidate: testCandidate(),
        quoteCredits: 8,
        coverage: [],
        confirmedBy: "user-1",
        works: [0, 1, 2, 3].map((index) => ({
          id: `66666666-6666-4666-8666-66666666666${index}`,
          draftKey: `brand-calibration:${SESSION_ID}:2:${index}`,
          title: "t",
          request: "r",
        })) as Parameters<typeof appendCalibrationRound>[0]["works"],
      }),
    ).rejects.toMatchObject({ code: "round_running" });
    expect(dbMock.valuesFn).not.toHaveBeenCalled();
  });

  it("vincula saídas despachadas sem apagar vínculo nem feedback", async () => {
    const round = roundWithSlots(1);
    const session = testSession({ revision: 5, rounds: [round], status: "calibrating" });
    const updated = testSession({ revision: 6 });
    dbMock.state.selects.push([session]);
    dbMock.state.updates.push([updated]);
    const result = await linkCalibrationRoundOutputs({
      workspaceId: WORKSPACE_ID,
      profileId: PROFILE_ID,
      sessionId: SESSION_ID,
      expectedRevision: 5,
      round: 1,
      outputIds: { 0: "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa", 2: "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb" },
    });
    expect(result).toBe(updated);
    const written = dbMock.setFn.mock.calls[0]?.[0] as {
      rounds: Array<{ slots: Array<{ outputId: string | null }> }>;
    };
    expect(written.rounds[0]?.slots.map((slot) => slot.outputId)).toEqual([
      "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa",
      null,
      "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb",
      null,
    ]);

    dbMock.reset();
    dbMock.state.selects.push([testSession({ revision: 6, rounds: [roundWithSlots(1)] })]);
    await expect(
      linkCalibrationRoundOutputs({
        workspaceId: WORKSPACE_ID,
        profileId: PROFILE_ID,
        sessionId: SESSION_ID,
        expectedRevision: 6,
        round: 9,
        outputIds: {},
      }),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("impede comandos em sessão encerrada", () => {
    for (const status of ["activated", "archived"] as const) {
      try {
        applySessionCommand(
          testSession({ status }),
          { type: "extend" },
          new Date("2026-09-13T12:00:00.000Z"),
        );
        expect.unreachable();
      } catch (error) {
        expect((error as BrandTrainingSessionError).code).toBe("session_closed");
      }
    }
    const archived = applySessionCommand(
      testSession({ status: "review" }),
      { type: "archive" },
      new Date("2026-09-13T12:00:00.000Z"),
    );
    expect(archived.status).toBe("archived");
  });
});
