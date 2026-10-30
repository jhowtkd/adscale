import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET, POST } from "./route";

const SESSION_ID = "33333333-3333-4333-8333-333333333333";

const mocks = vi.hoisted(() => ({
  requireWorkspaceAccess: vi.fn(),
  getClientProfile: vi.fn(),
  getActiveVersion: vi.fn(),
  getSession: vi.fn(),
  getSessionById: vi.fn(),
  createSession: vi.fn(),
  mutateSession: vi.fn(),
  buildCandidate: vi.fn(),
  startCalibration: vi.fn(),
  loadEvidence: vi.fn(),
}));

vi.mock("@/server/auth/workspace", () => ({
  requireWorkspaceAccess: (...args: unknown[]) => mocks.requireWorkspaceAccess(...args),
}));
vi.mock("@/server/repositories/client-reference", () => ({
  getClientProfile: (...args: unknown[]) => mocks.getClientProfile(...args),
}));
vi.mock("@/server/repositories/brand-knowledge", async (original) => ({
  ...(await original<typeof import("@/server/repositories/brand-knowledge")>()),
  getActiveBrandKnowledgeVersion: (...args: unknown[]) => mocks.getActiveVersion(...args),
}));
vi.mock("@/server/repositories/brand-training-sessions", async (original) => ({
  ...(await original<typeof import("@/server/repositories/brand-training-sessions")>()),
  getTrainingSession: (...args: unknown[]) => mocks.getSession(...args),
  getTrainingSessionById: (...args: unknown[]) => mocks.getSessionById(...args),
  createTrainingSession: (...args: unknown[]) => mocks.createSession(...args),
  mutateTrainingSession: (...args: unknown[]) => mocks.mutateSession(...args),
}));
vi.mock("@/server/application/calibrate-brand-training", async (original) => ({
  ...(await original<typeof import("@/server/application/calibrate-brand-training")>()),
  buildCalibrationCandidate: (...args: unknown[]) => mocks.buildCandidate(...args),
  startBrandCalibration: (...args: unknown[]) => mocks.startCalibration(...args),
}));
vi.mock("@/server/repositories/calibration-scope-evidence", async (original) => ({
  ...(await original<typeof import("@/server/repositories/calibration-scope-evidence")>()),
  loadCalibrationExampleEvidence: (...args: unknown[]) => mocks.loadEvidence(...args),
}));
const freePlan = vi.hoisted(() => ({ find: vi.fn(async (): Promise<{ accountId: string } | null> => null) }));
vi.mock("@/server/equipe/module/free-plan", () => ({ findFreePlanAccount: (...args: unknown[]) => (freePlan.find as (...a: unknown[]) => unknown)(...args) }));
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

import { BrandCalibrationError } from "@/server/application/calibrate-brand-training";
import { BrandTrainingSessionError } from "@/server/repositories/brand-training-sessions";

function testSession(overrides: Record<string, unknown> = {}) {
  return {
    id: SESSION_ID,
    workspaceId: "workspace-1",
    clientProfileId: "profile-1",
    revision: 2,
    status: "calibrating",
    candidate: { hash: "c".repeat(64) },
    rounds: [
      {
        number: 1,
        candidate: { hash: "c".repeat(64) },
        quoteCredits: 200,
        coverage: ["palette.colors"],
        slots: [0, 1, 2, 3].map((index) => ({
          index,
          workItemId: `work-${index}`,
          outputId: `out-${index}`,
          feedback:
            index === 0
              ? { rating: "good", note: "", dimensions: [], actorId: "user-1", at: "2026-09-13T12:00:00.000Z" }
              : null,
        })),
      },
    ],
    extensionCount: 0,
    ...overrides,
  };
}

function evidence(slot: number, overrides: Record<string, unknown> = {}) {
  return {
    round: 1,
    slot,
    generationMode: "single",
    format: "4:5",
    workItemId: `work-${slot}`,
    work: null,
    output: null,
    outputId: `out-${slot}`,
    refinement: null,
    assessment: { status: "completed", objective: "pass", rating: slot === 0 ? "good" : null, needsHumanReview: false },
    approved: slot === 0,
    ...overrides,
  };
}

const read = () => GET(new Request("http://localhost/api/client-profiles/profile-1/brand-knowledge/calibration"), { params: Promise.resolve({ id: "profile-1" }) });

const post = (body: unknown) =>
  POST(
    new Request("http://localhost/api/client-profiles/profile-1/brand-knowledge/calibration", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: "profile-1" }) },
  );

describe("brand knowledge calibration route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireWorkspaceAccess.mockResolvedValue({ user: { id: "user-1" }, workspace: { id: "workspace-1" } });
    mocks.getClientProfile.mockResolvedValue({ id: "profile-1" });
    mocks.getActiveVersion.mockResolvedValue(null);
    mocks.getSession.mockResolvedValue(null);
    mocks.loadEvidence.mockResolvedValue([0, 1, 2, 3].map((slot) => evidence(slot)));
  });

  it("reads the persisted carousel cover and uses its download URL and scope", async () => {
    mocks.getSession.mockResolvedValue(testSession());
    mocks.loadEvidence.mockResolvedValue([evidence(0, { generationMode: "carousel", format: "1:1", outputId: "cover" })]);
    const response = await read();
    expect((await response.json()).examples[0]).toMatchObject({ outputId: "cover", format: "1:1", generationMode: "carousel",
      previewUrl: "/api/creative-work/work-0/carousel/slides/cover/download", assessment: { status: "completed", objective: "pass", rating: "good" } });
  });

  it("reads the session with live example assessments from persisted outputs", async () => {
    mocks.getSession.mockResolvedValue(testSession());

    const response = await read();

    expect(response.status).toBe(200);
    expect(mocks.loadEvidence).toHaveBeenCalledWith({ workspaceId: "workspace-1", sessionId: SESSION_ID, rounds: testSession().rounds, candidateHash: "c".repeat(64) });
    const body = await response.json();
    expect(body.session.id).toBe(SESSION_ID);
    expect(body.activeVersionId).toBeNull();
    expect(body.quoteCredits).toBeGreaterThan(0);
    expect(body.examples).toHaveLength(4);
    expect(body.examples[0]).toMatchObject({
      workItemId: "work-0",
      outputId: "out-0",
      previewUrl: "/api/creative-work/work-0/outputs/out-0/download",
      assessment: { status: "completed", objective: "pass", rating: "good", needsHumanReview: false },
    });
    expect(body.examples[1].assessment.rating).toBeNull();
    expect(body.uncovered).toEqual([]);
    expect(body.pendingProof).toEqual([]);
    expect(body.refinementNextRound).toBe(false);
  });

  describe("refinement scopes", () => {
    const visualGuidance = { sets: [
      { generationMode: "creative_revision", format: "4:5", visualRuleIds: ["rule"] },
      { generationMode: "format_adaptation", format: "9:16", visualRuleIds: ["rule"] },
    ] };
    const candidate = { hash: "c".repeat(64), visualGuidance };
    const base = evidence(0, { output: { outputKey: "base.png", parentOutputId: null } });

    it("says why a scope has no proof and that a next round can still prove it", async () => {
      mocks.getSession.mockResolvedValue(testSession({ candidate }));
      mocks.loadEvidence.mockResolvedValue([base, evidence(1, { approved: true }), evidence(2, { approved: true }), evidence(3, { approved: true })]);
      await expect((await read()).json()).resolves.toMatchObject({
        pendingProof: [
          { generationMode: "creative_revision", format: "4:5", reason: "awaiting_round" },
          { generationMode: "format_adaptation", format: "9:16", reason: "awaiting_round" },
        ],
        refinementNextRound: true,
      });
    });

    it("tells the refinement stays without proof when no earlier example was approved", async () => {
      mocks.getSession.mockResolvedValue(testSession({ candidate }));
      mocks.loadEvidence.mockResolvedValue([evidence(0, { approved: false })]);
      await expect((await read()).json()).resolves.toMatchObject({
        pendingProof: [
          { generationMode: "creative_revision", format: "4:5", reason: "no_base" },
          { generationMode: "format_adaptation", format: "9:16", reason: "no_base" },
        ],
        refinementNextRound: false,
      });
    });

    it("never offers a round beyond the ceiling", async () => {
      const rounds = [1, 2, 3].map((number) => ({ ...testSession().rounds[0], number }));
      mocks.getSession.mockResolvedValue(testSession({ candidate, rounds }));
      mocks.loadEvidence.mockResolvedValue([{ ...base, round: 3 }]);
      await expect((await read()).json()).resolves.toMatchObject({ refinementNextRound: false });
    });

    it("identifies a refinement example and keeps its download URL", async () => {
      const [round] = testSession().rounds;
      const slots = round!.slots.map((slot) => slot.index === 1
        ? { ...slot, refinement: { generationMode: "creative_revision", format: "4:5", baseRound: 1, baseSlot: 0, baseOutputId: "out-0" } } : slot);
      mocks.getSession.mockResolvedValue(testSession({ candidate, rounds: [{ ...round, slots }] }));
      mocks.loadEvidence.mockResolvedValue([evidence(1, { generationMode: "creative_revision", workItemId: "work-0", outputId: "revision" })]);
      const body = await (await read()).json();
      expect(body.examples[0]).toMatchObject({ generationMode: "creative_revision", format: "4:5", previewUrl: "/api/creative-work/work-0/outputs/revision/download" });
    });

    it("does not credit a replaced candidate with the examples still on screen", async () => {
      mocks.getSession.mockResolvedValue(testSession({ candidate: { hash: "d".repeat(64), visualGuidance } }));
      mocks.loadEvidence.mockResolvedValue([base]);
      const body = await (await read()).json();
      expect(body.examples).toHaveLength(1);
      expect(mocks.loadEvidence).toHaveBeenCalledWith(expect.objectContaining({ candidateHash: "c".repeat(64) }));
      expect(body.pendingProof).toEqual([
        { generationMode: "creative_revision", format: "4:5", reason: "no_base" },
        { generationMode: "format_adaptation", format: "9:16", reason: "no_base" },
      ]);
      expect(body.refinementNextRound).toBe(false);
    });
  });

  it("returns an empty review when no session is open", async () => {
    const response = await GET(
      new Request("http://localhost/api/client-profiles/profile-1/brand-knowledge/calibration"),
      { params: Promise.resolve({ id: "profile-1" }) },
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ session: null, examples: [], uncovered: [] });
    expect(mocks.loadEvidence).not.toHaveBeenCalled();
  });

  it("creates the session from a server-side candidate without generating images", async () => {
    const candidate = { hash: "c".repeat(64) };
    const created = testSession({ rounds: [], status: "review" });
    mocks.buildCandidate.mockResolvedValue(candidate);
    mocks.createSession.mockResolvedValue(created);

    const response = await post({ action: "create", expectedActiveVersionId: null });

    expect(response.status).toBe(201);
    expect(mocks.buildCandidate).toHaveBeenCalledWith({ workspaceId: "workspace-1", profileId: "profile-1" });
    expect(mocks.createSession).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      profileId: "profile-1",
      userId: "user-1",
      candidate,
      baseVersionId: null,
    });
    expect(mocks.startCalibration).not.toHaveBeenCalled();
    expect((await response.json()).session).toEqual(created);
  });

  it("rejects creation with an open session or a moved active version", async () => {
    const existing = testSession({ rounds: [], status: "review" });
    const versionId = "99999999-9999-4999-8999-999999999999";
    mocks.getSession.mockResolvedValue(existing);
    mocks.getActiveVersion.mockResolvedValue({ id: versionId });

    const resumed = await post({ action: "create", expectedActiveVersionId: versionId });
    expect(resumed.status).toBe(409);
    expect(mocks.buildCandidate).not.toHaveBeenCalled();

    const stale = await post({ action: "create", expectedActiveVersionId: null });
    expect(stale.status).toBe(409);
  });

  it("rejeita a injeção de snapshot pelo cliente", async () => {
    const response = await post({
      action: "start",
      sessionId: SESSION_ID,
      expectedRevision: 2,
      acceptedCredits: 200,
      candidate: { hash: "fake" },
    });
    expect(response.status).toBe(400);
    expect(mocks.startCalibration).not.toHaveBeenCalled();
  });

  it("starts rounds and maps quote/credit conflicts", async () => {
    const session = testSession();
    mocks.startCalibration.mockResolvedValue({ sessionId: SESSION_ID, round: 1, workItemIds: ["a", "b", "c", "d"] });
    mocks.getSessionById.mockResolvedValue(session);

    const started = await post({ action: "start", sessionId: SESSION_ID, expectedRevision: 2, acceptedCredits: 200 });
    expect(started.status).toBe(202);
    expect(await started.json()).toMatchObject({ round: 1, workItemIds: ["a", "b", "c", "d"] });

    mocks.startCalibration.mockRejectedValueOnce(new BrandCalibrationError("quote_changed"));
    expect(
      (await post({ action: "start", sessionId: SESSION_ID, expectedRevision: 2, acceptedCredits: 1 })).status,
    ).toBe(409);

    mocks.startCalibration.mockRejectedValueOnce(new BrandCalibrationError("credit_blocked"));
    expect(
      (await post({ action: "start", sessionId: SESSION_ID, expectedRevision: 2, acceptedCredits: 200 })).status,
    ).toBe(402);
  });

  it("records feedback with the authenticated actor and maps session conflicts", async () => {
    const updated = testSession({ revision: 3 });
    mocks.mutateSession.mockResolvedValue(updated);

    const response = await post({
      action: "feedback",
      sessionId: SESSION_ID,
      expectedRevision: 2,
      round: 1,
      slot: 0,
      rating: "bad",
      note: "Tom diferente do guia",
      dimensions: ["tom"],
    });
    expect(response.status).toBe(200);
    expect(mocks.mutateSession).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      profileId: "profile-1",
      sessionId: SESSION_ID,
      expectedRevision: 2,
      command: {
        type: "feedback",
        round: 1,
        slot: 0,
        rating: "bad",
        note: "Tom diferente do guia",
        dimensions: ["tom"],
        actorId: "user-1",
      },
    });

    mocks.mutateSession.mockRejectedValueOnce(new BrandTrainingSessionError("stale_session"));
    const conflict = await post({ action: "extend", sessionId: SESSION_ID, expectedRevision: 2 });
    expect(conflict.status).toBe(409);
  });

  it("returns 404 for unknown profiles", async () => {
    mocks.getClientProfile.mockResolvedValue(null);
    const response = await GET(
      new Request("http://localhost/api/client-profiles/profile-1/brand-knowledge/calibration"),
      { params: Promise.resolve({ id: "profile-1" }) },
    );
    expect(response.status).toBe(404);
  });
});

describe("brand knowledge calibration route: the free plan's refusal (ticket 11, part 2)", () => {
  const get = () =>
    GET(new Request("http://localhost/api/client-profiles/profile-1/brand-knowledge/calibration"), {
      params: Promise.resolve({ id: "profile-1" }),
    });
  const start = () => post({ action: "start", sessionId: SESSION_ID, expectedRevision: 2, acceptedCredits: 200 });

  beforeEach(() => {
    vi.clearAllMocks();
    freePlan.find.mockReset();
    freePlan.find.mockResolvedValue(null);
    mocks.requireWorkspaceAccess.mockResolvedValue({ user: { id: "user-1" }, workspace: { id: "workspace-1" } });
    mocks.getClientProfile.mockResolvedValue({ id: "profile-1" });
    mocks.getActiveVersion.mockResolvedValue(null);
    mocks.getSession.mockResolvedValue(null);
    mocks.getSessionById.mockResolvedValue(testSession());
    mocks.startCalibration.mockRejectedValue(new BrandCalibrationError("credit_blocked"));
  });

  it("POST start on the free plan: 402 free_plan with the plan request and the account", async () => {
    freePlan.find.mockResolvedValue({ accountId: "acc-free" });

    const response = await start();

    expect(response.status).toBe(402);
    const body = await response.json();
    expect(body.code).toBe("free_plan");
    expect(body.details).toMatchObject({ reason: "free_plan", recommendedAction: "plan_request", accountId: "acc-free" });
    expect(freePlan.find).toHaveBeenCalledWith("workspace-1");
  });

  it("GET reaches the same answer when the read fails for credit", async () => {
    freePlan.find.mockResolvedValue({ accountId: "acc-free" });
    mocks.getSession.mockRejectedValue(new BrandCalibrationError("credit_blocked"));

    const response = await get();

    expect(response.status).toBe(402);
    expect((await response.json()).code).toBe("free_plan");
  });

  it("paid or classic: POST start is the same 402 insufficientCredits as before", async () => {
    const response = await start();

    expect(response.status).toBe(402);
    const body = await response.json();
    expect(body.code).toBe("insufficientCredits");
    expect(body.details).toBeUndefined();
  });

  it("an error before the workspace is known (no access) never asks the rule", async () => {
    mocks.requireWorkspaceAccess.mockRejectedValue(new BrandCalibrationError("credit_blocked"));
    freePlan.find.mockResolvedValue({ accountId: "acc-free" });

    const response = await start();

    expect(response.status).toBe(402);
    expect((await response.json()).code).toBe("insufficientCredits");
    expect(freePlan.find).not.toHaveBeenCalled();
  });
});
