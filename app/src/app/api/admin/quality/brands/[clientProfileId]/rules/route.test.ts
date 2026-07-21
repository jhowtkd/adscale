import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "./route";

vi.mock("@/server/auth/require-platform-owner", () => ({
  requirePlatformOwner: vi.fn(),
}));

vi.mock("@/server/repositories/calibration-rule", () => ({
  listCalibrationRulesForClientProfile: vi.fn(),
}));

vi.mock("@/server/db", () => ({
  db: {
    select: vi.fn(),
  },
}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

import { requirePlatformOwner } from "@/server/auth/require-platform-owner";
import { listCalibrationRulesForClientProfile } from "@/server/repositories/calibration-rule";
import { db } from "@/server/db";
import { WorkspaceAuthError, AUTH_ERROR_CODES } from "@/server/auth/errors";
import type { CalibrationRule } from "@/server/db/schema";

const WORKSPACE_ID = "550e8400-e29b-41d4-a716-446655440002";
const CLIENT_PROFILE_ID = "550e8400-e29b-41d4-a716-446655440003";
const UNKNOWN_PROFILE_ID = "550e8400-e29b-41d4-a716-446655440099";
const APPROVED_RULE_ID = "550e8400-e29b-41d4-a716-446655440010";
const CANDIDATE_RULE_ID = "550e8400-e29b-41d4-a716-446655440011";

const mockRequireOwner = vi.mocked(requirePlatformOwner);
const mockListRules = vi.mocked(listCalibrationRulesForClientProfile);
const mockDbSelect = vi.mocked(db.select);

function makeRuleRow(
  overrides: Partial<CalibrationRule> & { id: string; status: string }
): CalibrationRule {
  return {
    id: overrides.id,
    workspaceId: WORKSPACE_ID,
    clientProfileId: CLIENT_PROFILE_ID,
    category: overrides.category ?? "voice",
    status: overrides.status,
    rationale: overrides.rationale ?? "Rule rationale",
    supportingSignalIds: overrides.supportingSignalIds ?? ["signal-1"],
    confidence: overrides.confidence ?? "medium",
    caveats: overrides.caveats ?? [],
    mismatchBucket: overrides.mismatchBucket ?? null,
    version: overrides.version ?? 1,
    approvedAt: overrides.approvedAt ?? null,
    approvedBy: overrides.approvedBy ?? null,
    createdAt: overrides.createdAt ?? new Date("2026-06-24T00:00:00.000Z"),
    updatedAt: overrides.updatedAt ?? new Date("2026-06-24T00:00:00.000Z"),
  };
}

function mockProfileLookup(profile: { id: string; workspaceId: string } | null) {
  const limitMock = vi.fn().mockResolvedValue(profile ? [profile] : []);
  const whereMock = vi.fn(() => ({ limit: limitMock }));
  const fromMock = vi.fn(() => ({ where: whereMock }));
  mockDbSelect.mockReturnValue({ from: fromMock } as never);
}

function mockRulesByStatus() {
  mockListRules.mockImplementation(async (input) => {
    if (input.status === "approved") {
      return [
        makeRuleRow({
          id: APPROVED_RULE_ID,
          status: "approved",
          rationale: "Approved voice rule",
          approvedAt: new Date("2026-06-23T00:00:00.000Z"),
        }),
      ];
    }
    if (input.status === "candidate") {
      return [
        makeRuleRow({
          id: CANDIDATE_RULE_ID,
          status: "candidate",
          rationale: "Pending voice rule",
        }),
      ];
    }
    return [];
  });
}

async function callGet(clientProfileId: string) {
  return GET(new Request("http://localhost/api/admin/quality/brands/rules"), {
    params: Promise.resolve({ clientProfileId }),
  });
}

describe("GET /api/admin/quality/brands/[clientProfileId]/rules", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireOwner.mockResolvedValue({
      user: { id: "owner-1", email: "owner@test.com" },
    });
    mockProfileLookup({ id: CLIENT_PROFILE_ID, workspaceId: WORKSPACE_ID });
    mockRulesByStatus();
  });

  it("returns approved and candidate rules scoped to profile", async () => {
    const res = await callGet(CLIENT_PROFILE_ID);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.clientProfileId).toBe(CLIENT_PROFILE_ID);
    expect(body.workspaceId).toBe(WORKSPACE_ID);
    expect(body.approved).toHaveLength(1);
    expect(body.candidate).toHaveLength(1);
    expect(body.approved[0].id).toBe(APPROVED_RULE_ID);
    expect(body.approved[0].status).toBe("approved");
    expect(body.candidate[0].id).toBe(CANDIDATE_RULE_ID);
    expect(body.candidate[0].status).toBe("candidate");
    expect(mockListRules).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      clientProfileId: CLIENT_PROFILE_ID,
      status: "approved",
    });
    expect(mockListRules).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      clientProfileId: CLIENT_PROFILE_ID,
      status: "candidate",
    });
  });

  it("keeps approved and candidate arrays disjoint by status", async () => {
    const res = await callGet(CLIENT_PROFILE_ID);

    const body = await res.json();
    const approvedIds = body.approved.map((rule: { id: string }) => rule.id);
    const candidateIds = body.candidate.map((rule: { id: string }) => rule.id);
    const overlap = approvedIds.filter((id: string) => candidateIds.includes(id));
    expect(overlap).toEqual([]);
  });

  it("returns 403 when not platform owner", async () => {
    mockRequireOwner.mockRejectedValue(
      new WorkspaceAuthError(AUTH_ERROR_CODES.forbidden, "Forbidden")
    );

    const res = await callGet(CLIENT_PROFILE_ID);

    expect(res.status).toBe(403);
    expect(mockListRules).not.toHaveBeenCalled();
  });

  it("returns 404 for unknown clientProfileId", async () => {
    mockProfileLookup(null);

    const res = await callGet(UNKNOWN_PROFILE_ID);

    expect(res.status).toBe(404);
    expect(mockListRules).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid clientProfileId", async () => {
    const res = await callGet("not-a-uuid");

    expect(res.status).toBe(400);
    expect(mockListRules).not.toHaveBeenCalled();
  });
});
