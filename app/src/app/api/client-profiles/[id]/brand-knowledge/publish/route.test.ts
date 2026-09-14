import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "./route";

const mocks = vi.hoisted(() => ({ requireWorkspaceAccess: vi.fn(), publish: vi.fn() }));
vi.mock("@/server/auth/workspace", () => ({ requireWorkspaceAccess: (...args: unknown[]) => mocks.requireWorkspaceAccess(...args) }));
vi.mock("@/server/repositories/brand-knowledge", async (original) => ({
  ...(await original<typeof import("@/server/repositories/brand-knowledge")>()),
  publishBrandKnowledgeVersion: (...args: unknown[]) => mocks.publish(...args),
}));
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

import { BrandKnowledgeCalibrationError } from "@/server/repositories/brand-knowledge";

const SESSION_ID = "33333333-3333-4333-8333-333333333333";
const CANDIDATE_HASH = "c".repeat(64);

const post = (body: unknown) =>
  POST(
    new Request("http://localhost/api/client-profiles/profile-1/brand-knowledge/publish", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: "profile-1" }) },
  );

describe("POST brand knowledge publication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireWorkspaceAccess.mockResolvedValue({ user: { id: "user-1" }, workspace: { id: "workspace-1" } });
    mocks.publish.mockResolvedValue({ id: "version-1", versionNumber: 1, status: "active", hash: CANDIDATE_HASH });
  });

  it("publishes the validated candidate under the authenticated workspace and actor", async () => {
    const response = await post({ sessionId: SESSION_ID, expectedRevision: 5, candidateHash: CANDIDATE_HASH });
    expect(response.status).toBe(201);
    expect(mocks.publish).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      clientProfileId: "profile-1",
      userId: "user-1",
      sessionId: SESSION_ID,
      expectedRevision: 5,
      candidateHash: CANDIDATE_HASH,
    });
  });

  it("refuses legacy requests without the calibration proof (plan 01, T4)", async () => {
    const empty = await post(undefined);
    expect(empty.status).toBe(409);
    expect(await empty.json()).toMatchObject({ code: "brandCalibrationRequired" });
    expect(mocks.publish).not.toHaveBeenCalled();

    const partial = await post({ sessionId: SESSION_ID });
    expect(partial.status).toBe(409);
    expect(mocks.publish).not.toHaveBeenCalled();
  });

  it("maps calibration conflicts to 409 without publishing", async () => {
    mocks.publish.mockRejectedValueOnce(new BrandKnowledgeCalibrationError("calibration_stale", "stale"));
    const stale = await post({ sessionId: SESSION_ID, expectedRevision: 5, candidateHash: CANDIDATE_HASH });
    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({ code: "brandCalibrationStale" });

    mocks.publish.mockRejectedValueOnce(new BrandKnowledgeCalibrationError("calibration_required", "required"));
    const required = await post({ sessionId: SESSION_ID, expectedRevision: 5, candidateHash: CANDIDATE_HASH });
    expect(required.status).toBe(409);
    expect(await required.json()).toMatchObject({ code: "brandCalibrationRequired" });
  });
});
