import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getConsent: vi.fn(),
  select: vi.fn(() => { throw new Error("Local authorization must not query corpus consent"); }),
}));
vi.mock("@/server/db", () => ({ db: { select: mocks.select } }));
vi.mock("@/server/repositories/assistant-goal", () => ({ getCorpusConsent: mocks.getConsent }));
vi.mock("@/server/repositories/client-reference", () => ({
  getClientProfile: vi.fn(),
}));

import { getClientProfile } from "@/server/repositories/client-reference";
import { authorizeLocalLearning } from "./local-learning-authorization";

const scope = {
  workspaceId: "770e8400-e29b-41d4-a716-446655440001",
  clientProfileId: "770e8400-e29b-41d4-a716-446655440002",
};

describe("local learning authorization", () => {
  beforeEach(() => vi.resetAllMocks());
  afterEach(() => vi.unstubAllEnvs());

  it("authorizes a brand belonging to the workspace without a corpus grant", async () => {
    vi.mocked(getClientProfile).mockResolvedValue({
      id: scope.clientProfileId,
      workspaceId: scope.workspaceId,
    } as NonNullable<Awaited<ReturnType<typeof getClientProfile>>>);

    expect(await authorizeLocalLearning(scope)).toEqual({ allowed: true });
    expect(getClientProfile).toHaveBeenCalledWith(scope.workspaceId, scope.clientProfileId);
  });

  it.each([null, "", "   "])("refuses a missing brand (%s) before looking it up", async (clientProfileId) => {
    expect(await authorizeLocalLearning({ ...scope, clientProfileId })).toEqual({
      allowed: false,
      reason: "missing_brand",
    });
    expect(getClientProfile).not.toHaveBeenCalled();
  });

  it("refuses a foreign or nonexistent brand with a stable domain reason", async () => {
    vi.mocked(getClientProfile).mockResolvedValue(null);

    expect(await authorizeLocalLearning(scope)).toEqual({
      allowed: false,
      reason: "brand_out_of_scope",
    });
  });

  it.each([
    { ...scope, workspaceId: "invalid" },
    { ...scope, clientProfileId: "invalid" },
  ])("refuses malformed workspace or brand without a repository call", async (input) => {
    expect(await authorizeLocalLearning(input)).toEqual({ allowed: false, reason: "brand_out_of_scope" });
    expect(getClientProfile).not.toHaveBeenCalled();
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it("authorizes the own brand without consulting a revoked corpus consent", async () => {
    mocks.getConsent.mockResolvedValue({ ...scope, status: "revoked" });
    vi.mocked(getClientProfile).mockResolvedValue({
      id: scope.clientProfileId, workspaceId: scope.workspaceId,
    } as NonNullable<Awaited<ReturnType<typeof getClientProfile>>>);

    expect(await authorizeLocalLearning(scope)).toEqual({ allowed: true });
    expect(getClientProfile).toHaveBeenCalledOnce();
    expect(mocks.getConsent).not.toHaveBeenCalled();
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it.each([
    ["owner", "synthetic_fixture"],
    ["admin", "operator_imported"],
    ["member", "real_customer"],
  ])("ignores role %s and provenance %s in production", async (role, sourceLabel) => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CREATIVE_WORK_QUALITY_RECOVERY_ENABLED", "false");
    vi.mocked(getClientProfile).mockResolvedValue({
      id: scope.clientProfileId, workspaceId: scope.workspaceId,
    } as NonNullable<Awaited<ReturnType<typeof getClientProfile>>>);
    const request = { ...scope, role, sourceLabel };

    expect(await authorizeLocalLearning(request)).toEqual({ allowed: true });
    vi.stubEnv("CREATIVE_WORK_QUALITY_RECOVERY_ENABLED", "true");
    expect(await authorizeLocalLearning(request)).toEqual({ allowed: true });
    vi.mocked(getClientProfile).mockResolvedValue(null);
    expect(await authorizeLocalLearning(request)).toEqual({ allowed: false, reason: "brand_out_of_scope" });
  });
});
