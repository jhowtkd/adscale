vi.mock("@/server/repositories/guidance-selection", () => ({ getGuidanceSelection: vi.fn(async () => ({ version: 0, refs: [], pinnedBy: null, pinnedAt: null, previousSelection: null })) }));
vi.mock("@/server/brand-taste/guidance-selection", async importOriginal => ({ ...await importOriginal<typeof import("@/server/brand-taste/guidance-selection")>(), pinGuidanceSelection: vi.fn(), revertGuidanceSelection: vi.fn() }));
import { getGuidanceSelection } from "@/server/repositories/guidance-selection";
import { pinGuidanceSelection, revertGuidanceSelection, GuidanceSelectionError } from "@/server/brand-taste/guidance-selection";
vi.mock("@/server/repositories/calibration-rule-history", () => ({ listCalibrationRuleHistory: vi.fn(async () => []) }));
import { listCalibrationRuleHistory } from "@/server/repositories/calibration-rule-history";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GET, PATCH } from "./route";

vi.mock("@/server/auth/require-platform-owner", () => ({
  requirePlatformOwner: vi.fn(),
}));
vi.mock("@/server/auth/session", () => ({ getSessionFromHeaders: vi.fn() }));

vi.mock("@/server/repositories/calibration-rule", () => ({
  listCalibrationRulesForClientProfile: vi.fn(),
}));

vi.mock("@/server/db", () => ({
  db: {
    select: vi.fn(),
    transaction: vi.fn(),
  },
}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

import { requirePlatformOwner } from "@/server/auth/require-platform-owner";
import { getSessionFromHeaders } from "@/server/auth/session";
import { listCalibrationRulesForClientProfile } from "@/server/repositories/calibration-rule";
import { db } from "@/server/db";
import { WorkspaceAuthError, AUTH_ERROR_CODES } from "@/server/auth/errors";
import type { CalibrationRule } from "@/server/db/schema";
import { learningProposalRevision } from "@/server/brand-taste/proposal-review";
import { hashGuidanceContent } from "@/server/brand-taste/learned-guidance";

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
    primaryFailureReason: overrides.primaryFailureReason ?? null,
    supportingEvidenceRefs: [],
    confirmedMetadata: overrides.confirmedMetadata ?? null,
    metadataConfirmedBy: overrides.metadataConfirmedBy ?? null,
    metadataConfirmedAt: overrides.metadataConfirmedAt ?? null,
    supportingSignalIds: overrides.supportingSignalIds ?? ["signal-1"],
    confidence: overrides.confidence ?? "medium",
    caveats: overrides.caveats ?? [],
    mismatchBucket: overrides.mismatchBucket ?? null,
    version: overrides.version ?? 1,
    approvedAt: overrides.approvedAt ?? null,
    approvedBy: overrides.approvedBy ?? null,
    confirmedMetadata: overrides.confirmedMetadata ?? null,
    metadataConfirmedBy: overrides.metadataConfirmedBy ?? null,
    metadataConfirmedAt: overrides.metadataConfirmedAt ?? null,
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

const metadataFor = (row: CalibrationRule) => ({ category: "voice", nature: "text", roles: ["copy"],
  generationModes: ["single"], formats: ["4:5"], contentHash: hashGuidanceContent(row.rationale) });

function mockRuleTransaction(row: CalibrationRule | null) {
  const set = vi.fn(values => ({ where: vi.fn(() => ({ returning: vi.fn(async () => [{ ...row, ...values }]) })) }));
  vi.mocked(db.transaction).mockImplementation(async callback => callback({
    select: () => ({ from: () => ({ where: () => ({ for: async () => row ? [row] : [] }) }) }),
    update: () => ({ set }),
  } as never));
  return set;
}

async function callPatch(body: unknown, clientProfileId = CLIENT_PROFILE_ID) {
  return PATCH(new Request("http://localhost/api/admin/quality/brands/rules", {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  }), { params: Promise.resolve({ clientProfileId }) });
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

  it("returns immutable history including rejected/deprecated observations with the selected brand scope", async () => {
    const history = [{ ruleId: APPROVED_RULE_ID, revisionNumber: 1, status: "approved", text: "Original" },
      { ruleId: APPROVED_RULE_ID, revisionNumber: 2, status: "deprecated", text: "Original" },
      { ruleId: CANDIDATE_RULE_ID, revisionNumber: 1, status: "rejected", text: "Rejected" }];
    vi.mocked(listCalibrationRuleHistory).mockResolvedValueOnce(history as never);
    const response = await callGet(CLIENT_PROFILE_ID);
    expect((await response.json()).history).toEqual(history);
    expect(listCalibrationRuleHistory).toHaveBeenCalledWith({ workspaceId: WORKSPACE_ID, clientProfileId: CLIENT_PROFILE_ID });
  });

  it("returns approved and candidate rules scoped to profile", async () => {
    const res = await callGet(CLIENT_PROFILE_ID);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.clientProfileId).toBe(CLIENT_PROFILE_ID);
    expect(body.workspaceId).toBe(WORKSPACE_ID);
    expect(body.selection).toMatchObject({ version: 0, refs: [], pinnedBy: null });
    expect(getGuidanceSelection).toHaveBeenCalledWith({ workspaceId: WORKSPACE_ID, clientProfileId: CLIENT_PROFILE_ID });
    expect(body.approved).toHaveLength(1);
    expect(body.candidate).toHaveLength(1);
    expect(body.approved[0].id).toBe(APPROVED_RULE_ID);
    expect(body.approved[0].status).toBe("approved");
    expect(body.approved[0]).toMatchObject({ confirmedMetadata: null, metadataConfirmedBy: null,
      metadataConfirmedAt: null, contentHash: hashGuidanceContent("Approved voice rule") });
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

  it("transports confirmed metadata unchanged and explicit null for legacy rules", async () => {
    const confirmedMetadata = { category: "voice" as const, nature: "text" as const,
      roles: ["copy" as const], generationModes: ["single"], formats: ["4:5"], contentHash: "a".repeat(64) };
    mockListRules.mockImplementation(async input => input.status === "approved" ? [
      makeRuleRow({ id: APPROVED_RULE_ID, status: "approved", confirmedMetadata }),
      makeRuleRow({ id: CANDIDATE_RULE_ID, status: "approved" }),
    ] : []);
    const res = await callGet(CLIENT_PROFILE_ID);
    expect(res.status).toBe(200);
    expect((await res.json()).approved.map((rule: { confirmedMetadata: unknown }) => rule.confirmedMetadata))
      .toEqual([confirmedMetadata, null]);
  });

  it.each(["rejected", "deprecated"])("exposes %s guidance scoped to the chosen brand", async status => {
    mockListRules.mockImplementation(async input => input.status === status
      ? [makeRuleRow({ id: CANDIDATE_RULE_ID, status })] : []);
    const res = await GET(new Request(`http://localhost/api/admin/quality/brands/rules?status=${status}`), {
      params: Promise.resolve({ clientProfileId: CLIENT_PROFILE_ID }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body[status]).toHaveLength(1);
    expect(body[status][0].status).toBe(status);
    expect(body.approved).toEqual([]);
    expect(body.candidate).toEqual([]);
    expect(mockListRules).toHaveBeenCalledExactlyOnceWith({ workspaceId: WORKSPACE_ID,
      clientProfileId: CLIENT_PROFILE_ID, status });
  });

  it("rejects unknown guidance states before querying", async () => {
    const res = await GET(new Request("http://localhost/api/admin/quality/brands/rules?status=unknown"), {
      params: Promise.resolve({ clientProfileId: CLIENT_PROFILE_ID }),
    });
    expect(res.status).toBe(400);
    expect(mockListRules).not.toHaveBeenCalled();
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

describe("PATCH /api/admin/quality/brands/[clientProfileId]/rules", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireOwner.mockResolvedValue({ user: { id: "owner-1", email: "owner@test.com" } });
    mockProfileLookup({ id: CLIENT_PROFILE_ID, workspaceId: WORKSPACE_ID });
  });
  afterEach(() => vi.unstubAllEnvs());

  it("reverts the viewed selection with session authorship and returns its persisted receipt", async () => {
    const selection = { version: 4, refs: [], pinnedBy: "owner-1", pinnedAt: "2026-10-15T00:00:00.000Z", previousSelection: null };
    vi.mocked(revertGuidanceSelection).mockResolvedValueOnce(selection);
    const response = await callPatch({ action: "revert_selection", expectedVersion: 3 });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ selection });
    expect(revertGuidanceSelection).toHaveBeenCalledExactlyOnceWith({ workspaceId: WORKSPACE_ID, clientProfileId: CLIENT_PROFILE_ID, reviewerUserId: "owner-1", expectedVersion: 3 });
    expect(pinGuidanceSelection).not.toHaveBeenCalled();
  });
  it.each([["budget_exceeded", 422], ["selection_conflict", 409], ["no_previous_selection", 409], ["forbidden", 403], ["not_found", 404]] as const)("reports reversion %s as %s", async (code, status) => {
    vi.mocked(revertGuidanceSelection).mockRejectedValueOnce(new GuidanceSelectionError(code, "Erro de domínio"));
    const response = await callPatch({ action: "revert_selection", expectedVersion: 0 });
    expect(response.status).toBe(status);
    expect(await response.json()).toMatchObject({ code });
  });
  it.each([
    { expectedVersion: -1 }, { expectedVersion: 1.5 }, { expectedVersion: "1" },
    { expectedVersion: 1, reviewerUserId: "forged" }, { expectedVersion: 1, refs: [] },
  ])("rejects invalid or forged reversion input %j", async body => {
    expect((await callPatch({ action: "revert_selection", ...body })).status).toBe(400);
    expect(revertGuidanceSelection).not.toHaveBeenCalled();
    expect(db.select).not.toHaveBeenCalled();
  });
  it.each(["owner", "admin", "operator", "approver"])("rejects a workspace %s reverting without platform ownership using real authorization", async role => {
    vi.stubEnv("PLATFORM_OWNER_EMAILS", "platform@example.test"); vi.stubEnv("DEV_ADMIN_EMAIL", "");
    const actual = await vi.importActual<typeof import("@/server/auth/require-platform-owner")>("@/server/auth/require-platform-owner");
    mockRequireOwner.mockImplementation(actual.requirePlatformOwner);
    vi.mocked(getSessionFromHeaders).mockResolvedValue({ user: { id: `${role}-1`, email: `${role}@example.test` } } as never);
    expect((await callPatch({ action: "revert_selection", expectedVersion: 1 })).status).toBe(403);
    expect(db.select).not.toHaveBeenCalled(); expect(revertGuidanceSelection).not.toHaveBeenCalled();
  });

  it("pins explicit numeric refs with session authorship and returns the persisted selection", async () => {
    const refs = [{ ruleId: APPROVED_RULE_ID, revision: 2, contentHash: "a".repeat(64) }];
    const selection = { version: 4, refs, pinnedBy: "owner-1", pinnedAt: "2026-10-15T00:00:00.000Z", previousSelection: null };
    vi.mocked(pinGuidanceSelection).mockResolvedValueOnce(selection);
    const response = await callPatch({ action: "pin_selection", refs, expectedVersion: 3 });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ selection });
    expect(pinGuidanceSelection).toHaveBeenCalledWith({ workspaceId: WORKSPACE_ID, clientProfileId: CLIENT_PROFILE_ID, reviewerUserId: "owner-1", refs, expectedVersion: 3 });
  });
  it.each([["budget_exceeded", 422], ["selection_conflict", 409], ["invalid_reference", 422], ["forbidden", 403]] as const)("reports pin %s as %s", async (code, status) => {
    vi.mocked(pinGuidanceSelection).mockRejectedValueOnce(new GuidanceSelectionError(code, "Erro de domínio"));
    const response = await callPatch({ action: "pin_selection", refs: [], expectedVersion: 0 });
    expect(response.status).toBe(status);
    expect(await response.json()).toMatchObject({ code });
  });
  it.each([{ revision: "legacy" }, { revision: 0 }, { revision: 1.5 }, { contentHash: "wrong" }, { reviewerUserId: "forged" }])("rejects malformed pin refs or forged authorship %j", async override => {
    const { reviewerUserId, ...refOverride } = override;
    const response = await callPatch({ action: "pin_selection", expectedVersion: 0,
      refs: [{ ruleId: APPROVED_RULE_ID, revision: 1, contentHash: "a".repeat(64), ...refOverride }], ...(reviewerUserId ? { reviewerUserId } : {}) });
    expect(response.status).toBe(400);
    expect(pinGuidanceSelection).not.toHaveBeenCalled();
  });
  it.each(["owner", "admin", "member", "approver"])("denies workspace %s pinning through real authorization", async role => {
    vi.stubEnv("PLATFORM_OWNER_EMAILS", "platform@example.test"); vi.stubEnv("DEV_ADMIN_EMAIL", "");
    const actual = await vi.importActual<typeof import("@/server/auth/require-platform-owner")>("@/server/auth/require-platform-owner");
    mockRequireOwner.mockImplementation(actual.requirePlatformOwner);
    vi.mocked(getSessionFromHeaders).mockResolvedValue({ user: { id: role, email: `${role}@example.test` } } as never);
    expect((await callPatch({ action: "pin_selection", refs: [], expectedVersion: 0 })).status).toBe(403);
    expect(pinGuidanceSelection).not.toHaveBeenCalled();
  });

  it.each(["deprecate", "reject"])("records %s through the scoped command using session authorship", async action => {
    vi.stubEnv("PLATFORM_OWNER_EMAILS", "owner@test.com");
    const row = makeRuleRow({ id: APPROVED_RULE_ID, status: "approved", approvedBy: "earlier-owner" });
    const reads = [[{ id: "owner-1", email: "owner@test.com" }], [row]];
    const set = vi.fn(values => ({ where: () => ({ returning: async () => [{ ...row, ...values }] }) }));
    vi.mocked(db.transaction).mockImplementation(async callback => callback({
      select: () => { const values = reads.shift(); const q = { from: () => q, where: () => q, for: () => q, limit: async () => values }; return q; },
      update: () => ({ set }),
    } as never));
    const res = await callPatch({ action, ruleId: row.id, expectedRevision: learningProposalRevision("rule", row), reason: "  Mudança de direção  " });
    expect(res.status).toBe(200);
    expect((await res.json()).rule).toMatchObject({ status: action === "reject" ? "rejected" : "deprecated", approvedBy: "earlier-owner",
      reviewDecision: { action, decidedBy: "owner-1", reason: "Mudança de direção", source: "manual" } });
    expect(set).not.toHaveBeenCalledWith(expect.objectContaining({ approvedBy: expect.anything() }));
  });

  it("returns a stale retirement as 409 with current state and no write", async () => {
    vi.stubEnv("PLATFORM_OWNER_EMAILS", "owner@test.com");
    const row = makeRuleRow({ id: APPROVED_RULE_ID, status: "approved" });
    const reads = [[{ id: "owner-1", email: "owner@test.com" }], [row]];
    const update = vi.fn();
    vi.mocked(db.transaction).mockImplementation(async callback => callback({
      select: () => { const values = reads.shift(); const q = { from: () => q, where: () => q, for: () => q, limit: async () => values }; return q; }, update,
    } as never));
    const res = await callPatch({ action: "deprecate", ruleId: row.id, expectedRevision: "0".repeat(64), reason: "Motivo" });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: "revision_conflict", current: { expectedRevision: learningProposalRevision("rule", row) } });
    expect(update).not.toHaveBeenCalled();
  });

  it.each(["deprecate", "reject"])("validates %s reason, revision and forged author before writing", async action => {
    for (const overrides of [{ reason: " " }, { expectedRevision: "old" }, { reviewerUserId: "forged" }, { metadata: {} }]) {
      const res = await callPatch({ action, ruleId: APPROVED_RULE_ID, reason: "Motivo", expectedRevision: "a".repeat(64), ...overrides });
      expect(res.status).toBe(400);
    }
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("confirms the exact approved text with authenticated authorship and date", async () => {
    const row = makeRuleRow({ id: APPROVED_RULE_ID, status: "approved" });
    const metadata = metadataFor(row);
    const set = mockRuleTransaction(row);
    const res = await callPatch({ action: "confirm_metadata", ruleId: row.id, metadata });
    expect(res.status).toBe(200);
    expect(set).toHaveBeenCalledWith(expect.objectContaining({ confirmedMetadata: metadata,
      metadataConfirmedBy: "owner-1", metadataConfirmedAt: expect.any(Date) }));
    expect((await res.json()).rule).toMatchObject({ confirmedMetadata: metadata, metadataConfirmedBy: "owner-1",
      metadataConfirmedAt: expect.any(String), rationale: row.rationale, status: "approved" });
  });

  it.each(["owner", "admin", "operator", "approver"].flatMap(role => ["deprecate", "reject"].map(action => [role, action])))("rejects a %s performing %s without platform ownership using real authorization", async (role, action) => {
    vi.stubEnv("PLATFORM_OWNER_EMAILS", "platform@example.test");
    vi.stubEnv("DEV_ADMIN_EMAIL", "");
    const actual = await vi.importActual<typeof import("@/server/auth/require-platform-owner")>("@/server/auth/require-platform-owner");
    mockRequireOwner.mockImplementation(actual.requirePlatformOwner);
    vi.mocked(getSessionFromHeaders).mockResolvedValue({ user: { id: `${role}-1`, email: `${role}@example.test` } } as never);
    const res = await callPatch({ action, ruleId: APPROVED_RULE_ID, reason: "Motivo", expectedRevision: "a".repeat(64) });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "forbidden" });
    expect(db.select).not.toHaveBeenCalled();
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it.each([
    ["action", { action: "approve" }],
    ["rule id", { ruleId: "unknown" }],
    ["category", { metadata: { category: "fact" } }],
    ["nature", { metadata: { nature: "factual" } }],
    ["role", { metadata: { roles: ["approver"] } }],
    ["empty roles", { metadata: { roles: [] } }],
    ["empty mode", { metadata: { generationModes: [] } }],
    ["empty format", { metadata: { formats: [" "] } }],
    ["forged authorship", { confirmedBy: "other-user" }],
  ])("validates %s before writing", async (_name, override) => {
    const row = makeRuleRow({ id: APPROVED_RULE_ID, status: "approved" });
    const metadata = { ...metadataFor(row), ...override.metadata };
    const res = await callPatch({ action: "confirm_metadata", ruleId: row.id, ...override, metadata });
    expect(res.status).toBe(400);
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it.each([
    ["candidate", {}, "rule_not_approved", 409],
    ["rejected", {}, "rule_not_approved", 409],
    ["deprecated", {}, "rule_not_approved", 409],
    ["approved", { primaryFailureReason: "factual_issue" }, "factual_rule", 400],
    ["approved", { rationale: "factual_issue: Corrigir o preço" }, "factual_rule", 400],
    ["approved", { category: "export_conflict" }, "export_conflict", 400],
  ])("preserves %s rules with %j", async (status, overrides, code, httpStatus) => {
    const row = makeRuleRow({ id: APPROVED_RULE_ID, status, ...overrides });
    const set = mockRuleTransaction(row);
    const res = await callPatch({ action: "confirm_metadata", ruleId: row.id, metadata: metadataFor(row) });
    expect(res.status).toBe(httpStatus);
    expect(await res.json()).toMatchObject({ code });
    expect(set).not.toHaveBeenCalled();
  });

  it("rejects content changed since reading the rule", async () => {
    const row = makeRuleRow({ id: APPROVED_RULE_ID, status: "approved" });
    const set = mockRuleTransaction(row);
    const res = await callPatch({ action: "confirm_metadata", ruleId: row.id,
      metadata: { ...metadataFor(row), contentHash: hashGuidanceContent("Old approved text") } });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: "content_changed" });
    expect(set).not.toHaveBeenCalled();
  });

  it("rejects category and destination mismatches", async () => {
    const row = makeRuleRow({ id: APPROVED_RULE_ID, status: "approved" });
    const set = mockRuleTransaction(row);
    const res = await callPatch({ action: "confirm_metadata", ruleId: row.id,
      metadata: { ...metadataFor(row), category: "figure" } });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "invalid_metadata" });
    expect(set).not.toHaveBeenCalled();
  });

  it("does not send export conflicts to new consumers even under their original category", async () => {
    const row = makeRuleRow({ id: APPROVED_RULE_ID, status: "approved", category: "export_conflict" });
    const set = mockRuleTransaction(row);
    const res = await callPatch({ action: "confirm_metadata", ruleId: row.id,
      metadata: { ...metadataFor(row), category: "export_conflict" } });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "export_conflict" });
    expect(set).not.toHaveBeenCalled();
  });

  it("preserves the export-conflict category when confirming only the legacy destination", async () => {
    const row = makeRuleRow({ id: APPROVED_RULE_ID, status: "approved", category: "export_conflict" });
    const set = mockRuleTransaction(row);
    const metadata = { ...metadataFor(row), category: "export_conflict", roles: ["legacy_derivation"] };
    const res = await callPatch({ action: "confirm_metadata", ruleId: row.id, metadata });
    expect(res.status).toBe(200);
    expect(set).toHaveBeenCalledWith(expect.objectContaining({ confirmedMetadata: metadata }));
    expect((await res.json()).rule).toMatchObject({ category: "export_conflict", rationale: row.rationale });
  });

  it("returns 404 for an unknown brand before starting a confirmation", async () => {
    mockProfileLookup(null);
    const row = makeRuleRow({ id: APPROVED_RULE_ID, status: "approved" });
    expect((await callPatch({ action: "confirm_metadata", ruleId: row.id, metadata: metadataFor(row) })).status).toBe(404);
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("returns 404 for a rule outside the brand scope", async () => {
    const row = makeRuleRow({ id: APPROVED_RULE_ID, status: "approved" });
    const set = mockRuleTransaction(null);
    const res = await callPatch({ action: "confirm_metadata", ruleId: row.id, metadata: metadataFor(row) });
    expect(res.status).toBe(404);
    expect(set).not.toHaveBeenCalled();
  });
});
