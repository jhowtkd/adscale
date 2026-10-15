import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ transaction: vi.fn(), allowed: vi.fn() }));
vi.mock("@/server/db", () => ({ db: { transaction: mocks.transaction } }));
vi.mock("@/server/auth/platform-owner", () => ({ isPlatformOwnerEmail: mocks.allowed }));
import { decideCalibrationRule } from "./guidance-decisions";
import { learningProposalRevision } from "./proposal-review";

const row = { id: "rule", workspaceId: "ws", clientProfileId: "brand", status: "approved", rationale: "Texto aprovado",
  approvedBy: "previous-owner", approvedAt: new Date("2026-10-01T00:00:00Z"), reviewDecision: null };
const input = { workspaceId: "ws", clientProfileId: "brand", ruleId: row.id, reviewerUserId: "owner",
  action: "deprecate" as const, reason: "  Orientação desatualizada  ", expectedRevision: learningProposalRevision("rule", row) };
function fake(current: object | null = row, actor: object | null = { id: "owner", email: "owner@example.test" }) {
  const reads = [actor ? [actor] : [], current ? [current] : [], [{ id: "brand" }]];
  const writes: object[] = [];
  const tx = {
    select: () => { const values = reads.shift(); const query = { from: () => query, where: () => query, for: () => query, limit: async () => values }; return query; },
    update: () => ({ set: (patch: object) => { writes.push(patch); return { where: () => ({ returning: async () => [{ ...current, ...patch }] }) }; } }),
  };
  mocks.transaction.mockImplementation(async callback => callback(tx));
  return writes;
}
beforeEach(() => { vi.clearAllMocks(); mocks.allowed.mockReturnValue(true); });
describe("guidance retirement decisions", () => {
  it("records authenticated depreciation without rewriting approval or text; replay adds no decision", async () => {
    const writes = fake();
    const decided = await decideCalibrationRule(input);
    expect(decided).toMatchObject({ ...row, status: "deprecated", reviewDecision: {
      action: "deprecate", decidedBy: "owner", decidedAt: expect.any(String), reason: "Orientação desatualizada", source: "manual", expectedRevision: input.expectedRevision,
    } });
    expect(writes).toHaveLength(1);
    const replayWrites = fake(decided);
    expect(await decideCalibrationRule(input)).toEqual(decided);
    expect(replayWrites).toEqual([]);
  });
  it.each(["reject", "deprecate"] as const)("refuses stale %s and returns current revision", async action => {
    const writes = fake();
    await expect(decideCalibrationRule({ ...input, action, expectedRevision: "old" })).rejects.toMatchObject({ code: "revision_conflict", current: { expectedRevision: input.expectedRevision } });
    expect(writes).toEqual([]);
  });
  it.each([false, null])("requires a real platform owner (%s)", async actor => {
    mocks.allowed.mockReturnValue(false);
    const writes = fake(row, actor === null ? null : { id: "member", email: "member@example.test" });
    await expect(decideCalibrationRule(input)).rejects.toMatchObject({ code: "forbidden" });
    expect(writes).toEqual([]);
  });
  it.each(["", "  ", "DATABASE_URL=private"])("requires a safe, nonempty reason (%s)", async reason => {
    const writes = fake();
    await expect(decideCalibrationRule({ ...input, reason })).rejects.toMatchObject({ code: "reason_required" });
    expect(writes).toEqual([]);
  });
  it("rejects a candidate with a reason without inventing approval", async () => {
    const candidate = { ...row, status: "candidate", approvedBy: null, approvedAt: null };
    fake(candidate);
    expect(await decideCalibrationRule({ ...input, action: "reject", expectedRevision: learningProposalRevision("rule", candidate) }))
      .toMatchObject({ status: "rejected", approvedBy: null, approvedAt: null, reviewDecision: { action: "reject", reason: "Orientação desatualizada" } });
  });
  it.each(["candidate", "rejected", "deprecated"])("does not deprecate %s guidance", async status => {
    const current = { ...row, status }; const writes = fake(current);
    await expect(decideCalibrationRule({ ...input, expectedRevision: learningProposalRevision("rule", current) })).rejects.toMatchObject({ code: "invalid_state" });
    expect(writes).toEqual([]);
  });
  it("does not decide a rule outside the requested scope", async () => {
    fake(null);
    await expect(decideCalibrationRule(input)).rejects.toMatchObject({ code: "not_found" });
  });
});
