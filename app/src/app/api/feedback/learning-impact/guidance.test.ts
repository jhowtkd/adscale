import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";
import { requireCalibrationAccess } from "@/server/auth/calibration-access";
import { WorkspaceAuthError, AUTH_ERROR_CODES } from "@/server/auth/errors";
import { runLearningImpact } from "@/server/human-quality/impact/service";
import { runGuidanceImpact } from "@/server/human-quality/guidance-impact/service";
import { db } from "@/server/db";
vi.mock("@/server/auth/calibration-access", () => ({ requireCalibrationAccess: vi.fn() }));
vi.mock("@/server/human-quality/impact/service", () => ({ runLearningImpact: vi.fn() }));
vi.mock("@/server/human-quality/guidance-impact/service", () => ({ runGuidanceImpact: vi.fn() }));
vi.mock("@/server/db", () => ({ db: { select: vi.fn() } }));
vi.mock("next-intl/server", () => ({ getTranslations: vi.fn(async () => (key: string) => key) }));
const workspaceId = "550e8400-e29b-41d4-a716-446655440002", clientProfileId = "550e8400-e29b-41d4-a716-446655440003";
function lookup(found = true) {
  vi.mocked(db.select).mockReturnValue({ from: () => ({ where: () => ({ limit: async () => found ? [{ id: clientProfileId, workspaceId }] : [] }) }) } as never);
}
const request = (id = clientProfileId, extra = "") => GET(new Request(`http://localhost/api/feedback/learning-impact?mechanism=guidance_revisions&clientProfileId=${id}${extra}`));
describe("brand guidance impact GET", () => {
  beforeEach(() => { vi.clearAllMocks(); lookup(); vi.mocked(requireCalibrationAccess).mockResolvedValue({ user: { id: "owner", email: "owner@example.test" }, scope: "platform-owner" }); vi.mocked(runGuidanceImpact).mockResolvedValue({ schemaVersion: 1, mechanism: "guidance_revisions", capturedAt: "2026-10-15", decisionDenominator: "explicit_human_decision_events", groups: [], status: "insufficient_sample", samplePolicy: { minimumPerArm: 3, unit: "distinct_generations_per_metric" }, comparisons: [] }); });
  it("uses the persisted brand scope and identifies its distinct mechanism", async () => {
    const response = await request();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect((await response.json()).report.mechanism).toBe("guidance_revisions");
    expect(runGuidanceImpact).toHaveBeenCalledWith({ workspaceId, clientProfileId });
    expect(runLearningImpact).not.toHaveBeenCalled();
  });
  it("requires platform ownership before reading the brand or report", async () => {
    vi.mocked(requireCalibrationAccess).mockRejectedValue(new WorkspaceAuthError(AUTH_ERROR_CODES.forbidden, "forbidden"));
    expect((await request()).status).toBe(403);
    expect(db.select).not.toHaveBeenCalled();
    expect(runGuidanceImpact).not.toHaveBeenCalled();
  });
  it("rejects invalid and missing brands", async () => {
    expect((await request("invalid")).status).toBe(400);
    lookup(false);
    expect((await request()).status).toBe(404);
    expect(runGuidanceImpact).not.toHaveBeenCalled();
  });
  it("rejects missing brand scope, mismatched workspace and recommendation cohorts", async () => {
    expect((await GET(new Request("http://localhost/api/feedback/learning-impact?mechanism=guidance_revisions"))).status).toBe(400);
    expect((await request(clientProfileId, "&workspaceId=550e8400-e29b-41d4-a716-446655440099")).status).toBe(404);
    expect((await request(clientProfileId, "&cohort=baseline")).status).toBe(400);
    expect(runGuidanceImpact).not.toHaveBeenCalled();
  });
});
