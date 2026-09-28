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
const UNKNOWN_ID = "550e8400-e29b-41d4-a716-446655440099";

function callGet(roundId: string, query: string) {
  return GET(
    new Request(`http://localhost/api/equipe/staff/rounds/${roundId}${query}`),
    { params: Promise.resolve({ roundId }) },
  );
}

describe("GET /api/equipe/staff/rounds/[roundId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireOwner.mockRejectedValue(
      new WorkspaceAuthError(AUTH_ERROR_CODES.forbidden, "Forbidden"),
    );
  });

  async function seed(): Promise<{ t: TestDeps; workspaceId: string; accountId: string }> {
    const t = makeTestDeps();
    const { workspaceId, accountId } = await openTestAccount(t);
    await t.deps.uow.internal.staff.create({
      role: "quality",
      displayName: "Quality",
      userId: USER_ID,
      active: true,
    });
    mockGetSession.mockResolvedValue({ user: { id: USER_ID, email: "q@test.com" } } as never);
    mockCreateDeps.mockReturnValue(t.deps);
    return { t, workspaceId, accountId };
  }

  async function seedRound(t: TestDeps, workspaceId: string, accountId: string) {
    const scope = { workspaceId, accountId };
    const fronts = await t.deps.uow.repos.fronts.list(scope);
    const batch = await t.deps.uow.repos.batches.create(scope, { title: "Lote 1" });
    return t.deps.uow.repos.calibrationRounds.create(scope, {
      frontId: fronts[0]!.id,
      batchId: batch.id,
      weekKey: "2026-W40",
      sequence: 1,
    });
  }

  it("returns the round detail for internal staff", async () => {
    const { t, workspaceId, accountId } = await seed();
    const scope = { workspaceId, accountId };
    const fronts = await t.deps.uow.repos.fronts.list(scope);
    const batch = await t.deps.uow.repos.batches.create(scope, { title: "Lote 1" });
    const round = await t.deps.uow.repos.calibrationRounds.create(scope, {
      frontId: fronts[0]!.id,
      batchId: batch.id,
      weekKey: "2026-W40",
      sequence: 1,
    });

    const res = await callGet(round.id, `?workspaceId=${workspaceId}&accountId=${accountId}`);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.workspaceId).toBe(workspaceId);
    expect(body.accountId).toBe(accountId);
    expect(body.brandName).toBe("Marca demo");
    expect(body.workspaceName).toBe("Espaço demo");
    expect(body.round.id).toBe(round.id);
    expect(body.front.id).toBe(fronts[0]!.id);
    expect(body.batch.id).toBe(batch.id);
    expect(body.items).toEqual([]);
  });

  it("resolves the scope from the id alone", async () => {
    const { t, workspaceId, accountId } = await seed();
    const round = await seedRound(t, workspaceId, accountId);

    const res = await callGet(round.id, "");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.workspaceId).toBe(workspaceId);
    expect(body.accountId).toBe(accountId);
    expect(body.round.id).toBe(round.id);
  });

  it("returns 404 when the scope hint does not match the id", async () => {
    const { t, workspaceId, accountId } = await seed();
    const round = await seedRound(t, workspaceId, accountId);

    expect(
      (await callGet(round.id, `?workspaceId=${UNKNOWN_ID}&accountId=${accountId}`)).status,
    ).toBe(404);
    expect(
      (await callGet(round.id, `?workspaceId=${workspaceId}&accountId=${UNKNOWN_ID}`)).status,
    ).toBe(404);
    expect(
      (await callGet(round.id, `?workspaceId=${workspaceId}&accountId=${accountId}`)).status,
    ).toBe(200);
  });

  it("returns 400 for malformed ids", async () => {
    const { workspaceId, accountId } = await seed();

    expect((await callGet("not-a-uuid", `?workspaceId=${workspaceId}&accountId=${accountId}`)).status).toBe(400);
    expect((await callGet(UNKNOWN_ID, "?workspaceId=not-a-uuid")).status).toBe(400);
    expect((await callGet(UNKNOWN_ID, "?accountId=not-a-uuid")).status).toBe(400);
  });

  it("returns 404 for an unknown round, with or without a scope hint", async () => {
    const { workspaceId, accountId } = await seed();

    expect(
      (await callGet(UNKNOWN_ID, `?workspaceId=${workspaceId}&accountId=${accountId}`)).status,
    ).toBe(404);
    expect((await callGet(UNKNOWN_ID, "")).status).toBe(404);
  });

  it("returns 403 for a session user with no staff row who is not an owner", async () => {
    const t = makeTestDeps();
    const { workspaceId, accountId } = await openTestAccount(t);
    mockGetSession.mockResolvedValue({ user: { id: "random", email: "random@test.com" } } as never);
    mockCreateDeps.mockReturnValue(t.deps);

    const res = await callGet(UNKNOWN_ID, `?workspaceId=${workspaceId}&accountId=${accountId}`);

    expect(res.status).toBe(403);
  });

  it("returns 401 without a session", async () => {
    const { workspaceId, accountId } = await seed();
    mockGetSession.mockResolvedValue(null);

    const res = await callGet(UNKNOWN_ID, `?workspaceId=${workspaceId}&accountId=${accountId}`);

    expect(res.status).toBe(401);
  });
});
