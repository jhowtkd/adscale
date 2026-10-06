// shouldAnalyzeWorkspaceAssets (ticket 11, part 2): the classic analysis job of an upload. The free plan never enqueues
// it (the upload itself goes on); every other workspace keeps the rule it had: no Equipe account or one that is not free
// analyzes, only free accounts do not. The SQL of that rule against real Postgres is in module/handoff.pg.test.ts.
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  findFreePlan: vi.fn(),
  where: vi.fn(),
}));

vi.mock("@/server/equipe/module/free-plan", () => ({ findFreePlanAccount: (...a: unknown[]) => m.findFreePlan(...a) }));
vi.mock("@/server/db", () => ({
  db: { selectDistinct: () => ({ from: () => ({ where: (...a: unknown[]) => m.where(...a) }) }) },
}));
vi.mock("@/server/repositories/workspace-asset", () => ({ createWorkspaceAsset: vi.fn() }));

import { shouldAnalyzeWorkspaceAssets } from "./assets";

describe("shouldAnalyzeWorkspaceAssets", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.findFreePlan.mockResolvedValue(null);
    m.where.mockResolvedValue([]);
  });

  it("on the free plan: false without even reading the accounts (a brand without an Equipe account included)", async () => {
    m.findFreePlan.mockResolvedValue({ accountId: "acc-free" });

    expect(await shouldAnalyzeWorkspaceAssets("workspace-1")).toBe(false);
    expect(await shouldAnalyzeWorkspaceAssets("workspace-1", "profile-1")).toBe(false);

    expect(m.findFreePlan).toHaveBeenCalledWith("workspace-1");
    expect(m.where).not.toHaveBeenCalled();
  });

  it("a sign-up with no account yet (accountId null) is on the free plan too: false, nothing read", async () => {
    m.findFreePlan.mockResolvedValue({ accountId: null });

    expect(await shouldAnalyzeWorkspaceAssets("workspace-1", "profile-1")).toBe(false);
    expect(m.where).not.toHaveBeenCalled();
  });

  it("a workspace with a free brand and a paid brand is not the free plan (the rule says null): the per-brand rule decides again", async () => {
    // Brand A (free only) is not analyzed; brand B (paid) is. The rows are what each brand's own query returns.
    m.where.mockResolvedValueOnce([{ status: "free" }]).mockResolvedValueOnce([{ status: "active" }]);

    expect(await shouldAnalyzeWorkspaceAssets("workspace-1", "profile-a")).toBe(false);
    expect(await shouldAnalyzeWorkspaceAssets("workspace-1", "profile-b")).toBe(true);
    expect(m.findFreePlan).toHaveBeenCalledTimes(2);
  });

  it("not on the free plan: no account at all analyzes (a classic workspace)", async () => {
    m.where.mockResolvedValue([]);

    expect(await shouldAnalyzeWorkspaceAssets("workspace-1", "profile-1")).toBe(true);
    expect(m.where).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["only free accounts", [{ status: "free" }], false],
    ["a paid account", [{ status: "active" }], true],
    ["free and paid together", [{ status: "free" }, { status: "active" }], true],
    ["a deploying account", [{ status: "deploying" }], true],
    ["a closed account", [{ status: "closed" }], true],
  ])("not on the free plan: %s → %s", async (_name, rows, expected) => {
    m.where.mockResolvedValue(rows);

    expect(await shouldAnalyzeWorkspaceAssets("workspace-1")).toBe(expected);
  });

  it("asks the rule for the workspace on every call (nothing is cached across workspaces)", async () => {
    m.findFreePlan.mockImplementation(async (workspaceId: string) => (workspaceId === "ws-free" ? { accountId: "acc" } : null));
    m.where.mockResolvedValue([{ status: "active" }]);

    expect(await shouldAnalyzeWorkspaceAssets("ws-free")).toBe(false);
    expect(await shouldAnalyzeWorkspaceAssets("ws-paid")).toBe(true);
  });
});
