import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "./route";

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
import {
  makeTestDeps,
  openTestAccount,
  type TestDeps,
} from "@/server/equipe/module/testing/deps";

const mockRequireAccess = vi.mocked(requireWorkspaceAccess);
const mockCreateDeps = vi.mocked(createEquipeRouteDeps);

const USER_ID = "user-1";
const UNKNOWN_ID = "550e8400-e29b-41d4-a716-446655440099";

function callPost(accountId: string, body: unknown) {
  return POST(
    new Request(`http://localhost/api/equipe/accounts/${accountId}/commands`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ accountId }) },
  );
}

describe("POST /api/equipe/accounts/[accountId]/commands", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function seed(role: "approver" | "member" = "member"): Promise<{
    t: TestDeps;
    workspaceId: string;
    accountId: string;
    personId: string;
  }> {
    const t = makeTestDeps();
    const { workspaceId, accountId } = await openTestAccount(t, {
      people: [
        { name: "Ana", role: "approver", userId: role === "approver" ? USER_ID : "ana-user" },
        { name: "Rui", role: "member", userId: role === "member" ? USER_ID : "rui-user" },
      ],
    });
    mockRequireAccess.mockResolvedValue({
      user: { id: USER_ID },
      workspace: { id: workspaceId },
    } as never);
    mockCreateDeps.mockReturnValue(t.deps);
    const people = await t.deps.uow.repos.people.list({ workspaceId, accountId });
    const personId = people.find((person) => person.userId === USER_ID)!.id;
    return { t, workspaceId, accountId, personId };
  }

  it("builds the actor from the session row and runs the command", async () => {
    const { accountId, personId } = await seed("member");

    const res = await callPost(accountId, { type: "request_support", payload: {} });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.type).toBe("request_support");
    expect(body.accountId).toBe(accountId);
    // The recorded actor is the stored row — person and role from the server.
    expect(body.events[0]).toMatchObject({
      actorType: "client_person",
      actorId: personId,
      actorRole: "member",
    });
  });

  it("rejects a body smuggling actor keys — the actor never comes from the body", async () => {
    const { accountId } = await seed("approver");

    const res = await callPost(accountId, {
      type: "request_support",
      payload: {},
      actor: { kind: "client_person", role: "approver", personId: "forged" },
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("invalidInput");
  });

  it("rejects a body smuggling workspaceId/accountId keys", async () => {
    const { accountId } = await seed("approver");

    const res = await callPost(accountId, {
      type: "request_support",
      payload: {},
      workspaceId: "550e8400-e29b-41d4-a716-446655440001",
      accountId,
    });

    expect(res.status).toBe(400);
  });

  it("returns 403 for a workspace member with no account row (reads stay open)", async () => {
    const t = makeTestDeps();
    const { workspaceId, accountId } = await openTestAccount(t);
    mockRequireAccess.mockResolvedValue({
      user: { id: "stranger" },
      workspace: { id: workspaceId },
    } as never);
    mockCreateDeps.mockReturnValue(t.deps);

    const res = await callPost(accountId, { type: "request_support", payload: {} });

    expect(res.status).toBe(403);
  });

  it("maps a module forbidden_actor to 403", async () => {
    const { accountId } = await seed("member");

    const res = await callPost(accountId, {
      type: "approve_item",
      payload: { itemId: UNKNOWN_ID, expectedVersionHash: "seen" },
    });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe("forbidden_actor");
  });

  it("maps an unknown command type to 400", async () => {
    const { accountId } = await seed("member");

    const res = await callPost(accountId, { type: "no_such_command", payload: {} });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("invalid_command");
  });

  it("maps a domain transition error to 409", async () => {
    const { accountId } = await seed("approver");

    const res = await callPost(accountId, {
      type: "approve_context_section",
      payload: { section: "negocio", expectedVersionHash: "seen" },
    });

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("invalid_transition");
  });

  it("returns 400 when the payload is missing", async () => {
    const { accountId } = await seed("member");

    const res = await callPost(accountId, { type: "request_support" });

    expect(res.status).toBe(400);
  });

  it("returns 404 for an unknown account", async () => {
    await seed("member");

    const res = await callPost(UNKNOWN_ID, { type: "request_support", payload: {} });

    expect(res.status).toBe(404);
  });

  it("returns 404 without revealing the feature when the workspace is off the pilot", async () => {
    const { t, accountId } = await seed("member");
    t.deps.isEnabledForWorkspace = () => false;

    const res = await callPost(accountId, { type: "request_support", payload: {} });

    expect(res.status).toBe(404);
  });

  it("returns 401 without a session", async () => {
    const { accountId } = await seed("member");
    mockRequireAccess.mockRejectedValue(
      new WorkspaceAuthError(AUTH_ERROR_CODES.unauthorized, "Unauthorized"),
    );

    const res = await callPost(accountId, { type: "request_support", payload: {} });

    expect(res.status).toBe(401);
  });
});
