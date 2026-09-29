import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "./route";

vi.mock("@/server/auth/workspace", () => ({
  requireWorkspaceAccess: vi.fn(),
}));

vi.mock("@/server/equipe/http/deps", () => ({
  createEquipeRouteDeps: vi.fn(),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { createEquipeRouteDeps } from "@/server/equipe/http/deps";
import { AUTH_ERROR_CODES, WorkspaceAuthError } from "@/server/auth/errors";
import { executeCommand } from "@/server/equipe/module/commands";
import { makeTestDeps, openTestAccount } from "@/server/equipe/module/testing/deps";

const mockRequireAccess = vi.mocked(requireWorkspaceAccess);
const mockCreateDeps = vi.mocked(createEquipeRouteDeps);

const USER_ID = "user-1";
const UNKNOWN_ID = "550e8400-e29b-41d4-a716-446655440099";

function callGet(accountId: string) {
  return GET(
    new Request(`http://localhost/api/equipe/accounts/${accountId}/goals`),
    { params: Promise.resolve({ accountId }) },
  );
}

describe("GET /api/equipe/accounts/[accountId]/goals", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function seed(person?: { role: "approver" | "substitute" | "member"; active?: boolean }) {
    const t = makeTestDeps();
    const account = await openTestAccount(t, {
      people: person
        ? [
            { name: "Ana", role: "approver", userId: person.role === "approver" ? USER_ID : undefined },
            { name: "Carla", role: "substitute", userId: person.role === "substitute" ? USER_ID : undefined },
            { name: "Cid", role: "custodian" },
            { name: "Rui", role: "member", userId: person.role === "member" ? USER_ID : undefined },
          ]
        : undefined,
    });
    if (person?.active === false) {
      const row = [...t.store.people.rows.values()].find((candidate) => candidate.userId === USER_ID);
      if (row) t.store.people.rows.set(row.id, { ...row, active: false });
    }
    mockRequireAccess.mockResolvedValue({
      user: { id: USER_ID },
      workspace: { id: account.workspaceId },
    } as never);
    mockCreateDeps.mockReturnValue(t.deps);
    return { t, account };
  }

  it("returns plan, mandates and onboarding for a workspace member with no account row", async () => {
    const { account } = await seed();

    const res = await callGet(account.accountId);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.workspaceId).toBe(account.workspaceId);
    expect(body.accountId).toBe(account.accountId);
    expect(body.plan).toBeNull();
    expect(body.mandates).toEqual([]);
    expect(body.onboarding).toHaveLength(7);
    expect(body.decisions).toMatchObject({
      scope: { confirmed: false, digest: null, note: null },
      materials: [],
      contextSections: [],
      conflicts: [],
      plan: null,
      mandates: [],
      brandVoice: { approved: false, versionHash: null },
      connection: { verified: false, manualAgreed: false },
    });
  });

  it("carries the open plan proposal with the hash approve_plan verifies", async () => {
    const { t, account } = await seed();
    const content = { goals: ["go"], fronts: ["social_instagram"], rhythm: "weekly" };
    const proposed = await executeCommand(
      t.deps,
      { actor: account.actors.agent, workspaceId: account.workspaceId, accountId: account.accountId },
      { type: "propose_plan", payload: { content } },
    );
    expect(proposed.ok).toBe(true);

    const res = await callGet(account.accountId);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.decisions.plan).toMatchObject({ version: 1 });
    expect(body.decisions.plan.id).toBe(body.plan.id);
    expect(body.decisions.plan.versionHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it.each([
    ["approver", true, true],
    ["substitute", true, true],
    ["member", true, false],
    ["approver", false, false],
  ] as const)("sets canApprove for %s (active: %s) to %s", async (role, active, expected) => {
    const { account } = await seed({ role, active });
    const res = await callGet(account.accountId);
    expect(res.status).toBe(200);
    expect((await res.json()).decisions.publication.canApprove).toBe(expected);
  });

  it("returns 400 for a malformed account id", async () => {
    await seed();

    const res = await callGet("not-a-uuid");

    expect(res.status).toBe(400);
  });

  it("returns 404 for an unknown account", async () => {
    await seed();

    const res = await callGet(UNKNOWN_ID);

    expect(res.status).toBe(404);
  });

  it("returns 404 without revealing the feature when the workspace is off the pilot", async () => {
    const { t, account } = await seed();
    t.deps.isEnabledForWorkspace = () => false;

    const res = await callGet(account.accountId);

    expect(res.status).toBe(404);
  });

  it("returns 401 without a session", async () => {
    const { account } = await seed();
    mockRequireAccess.mockRejectedValue(
      new WorkspaceAuthError(AUTH_ERROR_CODES.unauthorized, "Unauthorized"),
    );

    const res = await callGet(account.accountId);

    expect(res.status).toBe(401);
  });
});
