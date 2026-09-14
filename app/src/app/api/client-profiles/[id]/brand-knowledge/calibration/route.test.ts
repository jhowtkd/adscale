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
  getWork: vi.fn(),
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
vi.mock("@/server/repositories/creative-work", () => ({
  getCreativeWork: (...args: unknown[]) => mocks.getWork(...args),
}));
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
  });

  it("reads the session with live example assessments from persisted outputs", async () => {
    mocks.getSession.mockResolvedValue(testSession());
    mocks.getWork.mockImplementation(async (_workspace: string, workItemId: string) => ({
      work: { id: workItemId },
      outputs: [
        {
          id: `out-${workItemId.slice(-1)}`,
          status: "completed",
          quality: { schemaVersion: 1, objectiveVerdict: "pass" },
        },
      ],
      sources: [],
    }));

    const response = await GET(
      new Request("http://localhost/api/client-profiles/profile-1/brand-knowledge/calibration"),
      { params: Promise.resolve({ id: "profile-1" }) },
    );

    expect(response.status).toBe(200);
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
  });

  it("returns an empty review when no session is open", async () => {
    const response = await GET(
      new Request("http://localhost/api/client-profiles/profile-1/brand-knowledge/calibration"),
      { params: Promise.resolve({ id: "profile-1" }) },
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ session: null, examples: [] });
    expect(mocks.getWork).not.toHaveBeenCalled();
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

  it("resumes the open session on create and rejects a moved active version", async () => {
    const existing = testSession({ rounds: [], status: "review" });
    const versionId = "99999999-9999-4999-8999-999999999999";
    mocks.getSession.mockResolvedValue(existing);
    mocks.getActiveVersion.mockResolvedValue({ id: versionId });

    const resumed = await post({ action: "create", expectedActiveVersionId: versionId });
    expect(resumed.status).toBe(200);
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
