import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "./route";

vi.mock("@/server/auth/workspace", () => ({
  requireWorkspaceAccess: vi.fn(),
}));

vi.mock("@/server/auth/session", () => ({
  getSessionFromHeaders: vi.fn(),
}));

vi.mock("@/server/auth/require-platform-owner", () => ({
  requirePlatformOwner: vi.fn(),
}));

vi.mock("@/server/equipe/http/deps", () => ({
  createEquipeRouteDeps: vi.fn(),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

import { getSessionFromHeaders } from "@/server/auth/session";
import { requirePlatformOwner } from "@/server/auth/require-platform-owner";
import { createEquipeRouteDeps } from "@/server/equipe/http/deps";
import { AUTH_ERROR_CODES, WorkspaceAuthError } from "@/server/auth/errors";
import {
  makeTestDeps,
  openTestAccount,
  type TestDeps,
} from "@/server/equipe/module/testing/deps";

const mockGetSession = vi.mocked(getSessionFromHeaders);
const mockRequireOwner = vi.mocked(requirePlatformOwner);
const mockCreateDeps = vi.mocked(createEquipeRouteDeps);

const USER_ID = "user-1";

function callGet(query = "") {
  return GET(new Request(`http://localhost/api/equipe/staff/quality${query}`));
}

describe("GET /api/equipe/staff/quality", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireOwner.mockRejectedValue(
      new WorkspaceAuthError(AUTH_ERROR_CODES.forbidden, "Forbidden"),
    );
  });

  async function seed(role: "quality" | "support"): Promise<{ t: TestDeps; staffId: string }> {
    const t = makeTestDeps();
    await openTestAccount(t);
    const row = await t.deps.uow.internal.staff.create({
      role,
      displayName: "Staffer",
      userId: USER_ID,
      active: true,
    });
    mockGetSession.mockResolvedValue({ user: { id: USER_ID, email: "staff@test.com" } } as never);
    mockCreateDeps.mockReturnValue(t.deps);
    return { t, staffId: row.id };
  }

  it("returns the quality pipeline for an active quality staffer", async () => {
    const { staffId } = await seed("quality");

    const res = await callGet();

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.staffId).toBe(staffId);
    expect(body.open).toEqual([]);
    expect(body.recentlyClosed).toEqual([]);
  });

  it("labels open rounds with brand and workspace names", async () => {
    const t = makeTestDeps();
    const { workspaceId, accountId } = await openTestAccount(t, {
      labels: { brandName: "Café Aurora", workspaceName: "Agência Sul" },
    });
    const row = await t.deps.uow.internal.staff.create({
      role: "quality",
      displayName: "Quality",
      userId: USER_ID,
      active: true,
    });
    mockGetSession.mockResolvedValue({ user: { id: USER_ID, email: "q@test.com" } } as never);
    mockCreateDeps.mockReturnValue(t.deps);
    const scope = { workspaceId, accountId };
    const fronts = await t.deps.uow.repos.fronts.list(scope);
    const batch = await t.deps.uow.repos.batches.create(scope, { title: "Lote 1" });
    const round = await t.deps.uow.repos.calibrationRounds.create(scope, {
      frontId: fronts[0]!.id,
      batchId: batch.id,
      weekKey: "2026-W40",
      sequence: 1,
    });

    const res = await callGet();

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.staffId).toBe(row.id);
    expect(body.open).toHaveLength(1);
    expect(body.open[0]).toMatchObject({
      roundId: round.id,
      accountId,
      brandName: "Café Aurora",
      workspaceName: "Agência Sul",
      frontKey: "social_instagram",
    });
  });

  it("returns 403 for staff without the quality role", async () => {
    await seed("support");

    const res = await callGet();

    expect(res.status).toBe(403);
  });

  it("returns 400 for an invalid closedLimit", async () => {
    await seed("quality");

    expect((await callGet("?closedLimit=nope")).status).toBe(400);
    expect((await callGet("?closedLimit=0")).status).toBe(400);
    expect((await callGet("?closedLimit=201")).status).toBe(400);
    expect((await callGet("?closedLimit=10")).status).toBe(200);
  });

  it("returns 403 for a session user with no staff row who is not an owner", async () => {
    const t = makeTestDeps();
    await openTestAccount(t);
    mockGetSession.mockResolvedValue({ user: { id: "random", email: "random@test.com" } } as never);
    mockCreateDeps.mockReturnValue(t.deps);

    const res = await callGet();

    expect(res.status).toBe(403);
  });

  it("returns 401 without a session", async () => {
    await seed("quality");
    mockGetSession.mockResolvedValue(null);

    const res = await callGet();

    expect(res.status).toBe(401);
  });
});
