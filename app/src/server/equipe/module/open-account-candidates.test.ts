import { describe, expect, it, vi } from "vitest";
import { getOpenAccountCandidate, listWorkspaceIdsForOpening, OPEN_ACCOUNT_WORKSPACE_PAGE_SIZE } from "./open-account-candidates";
import { makeTestDeps, uuid } from "./testing/deps";

const OPERATIONS = ["operations"] as const;

function seedWorkspace(
  t: ReturnType<typeof makeTestDeps>,
  workspaceId: string,
  name: string,
): void {
  t.gateway.addWorkspace({ id: workspaceId, name });
}

describe("getOpenAccountCandidate", () => {
  it("returns the workspace with brands still missing an account and its members", async () => {
    const t = makeTestDeps();
    const workspaceId = uuid();
    const otherWorkspaceId = uuid();
    seedWorkspace(t, workspaceId, "Espaço piloto");
    const freeProfileId = uuid();
    const takenProfileId = uuid();
    const foreignProfileId = uuid();
    t.gateway.addProfile({ id: freeProfileId, workspaceId, name: "Marca livre" });
    t.gateway.addProfile({ id: takenProfileId, workspaceId, name: "Marca com conta" });
    t.gateway.addProfile({ id: foreignProfileId, workspaceId: otherWorkspaceId, name: "Outra" });
    await t.deps.uow.repos.accounts.create(workspaceId, { clientProfileId: takenProfileId });
    t.gateway.addMember(workspaceId, { userId: "user-ana", name: "Ana", email: "ana@x.com" });
    t.gateway.addMember(workspaceId, { userId: "user-rui", name: null, email: null });
    t.gateway.addMember(otherWorkspaceId, { userId: "user-out", name: "Out", email: null });

    const candidate = await getOpenAccountCandidate(t.deps, {
      workspaceId,
      staffRoles: [...OPERATIONS],
    });

    expect(candidate).toEqual({
      workspace: { id: workspaceId, name: "Espaço piloto" },
      brands: [{ id: freeProfileId, name: "Marca livre" }],
      members: [
        { userId: "user-ana", name: "Ana", email: "ana@x.com" },
        { userId: "user-rui", name: null, email: null },
      ],
    });
  });

  it("reads only for operations staff", async () => {
    const t = makeTestDeps();
    const workspaceId = uuid();
    seedWorkspace(t, workspaceId, "Piloto");
    t.gateway.addProfile({ id: uuid(), workspaceId, name: "A" });

    for (const staffRoles of [[], ["support"], ["quality"], ["support", "quality"]] as const) {
      const candidate = await getOpenAccountCandidate(t.deps, {
        workspaceId,
        staffRoles: [...staffRoles],
      });
      expect(candidate).toBeNull();
    }
    const operations = await getOpenAccountCandidate(t.deps, {
      workspaceId,
      staffRoles: ["support", "operations"],
    });
    expect(operations?.workspace.id).toBe(workspaceId);
  });

  it("reads nothing for an unknown workspace", async () => {
    const t = makeTestDeps();
    const candidate = await getOpenAccountCandidate(t.deps, {
      workspaceId: uuid(),
      staffRoles: [...OPERATIONS],
    });
    expect(candidate).toBeNull();
  });

  it("keeps the same user as a member of several workspaces", async () => {
    const t = makeTestDeps();
    const firstId = uuid();
    const secondId = uuid();
    seedWorkspace(t, firstId, "Primeiro");
    seedWorkspace(t, secondId, "Segundo");
    t.gateway.addProfile({ id: uuid(), workspaceId: firstId, name: "A" });
    t.gateway.addProfile({ id: uuid(), workspaceId: secondId, name: "B" });
    t.gateway.addMember(firstId, { userId: "user-ana", name: "Ana", email: null });
    t.gateway.addMember(secondId, { userId: "user-ana", name: "Ana", email: null });

    const first = await getOpenAccountCandidate(t.deps, {
      workspaceId: firstId,
      staffRoles: [...OPERATIONS],
    });
    const second = await getOpenAccountCandidate(t.deps, {
      workspaceId: secondId,
      staffRoles: [...OPERATIONS],
    });

    expect(first?.members).toEqual([{ userId: "user-ana", name: "Ana", email: null }]);
    expect(second?.members).toEqual([{ userId: "user-ana", name: "Ana", email: null }]);
  });

  it("is not a candidate when its only brand already has an account, whatever the status, and reads no members", async () => {
    for (const status of ["free", "active", "closed"] as const) {
      const t = makeTestDeps();
      const workspaceId = uuid();
      const profileId = uuid();
      seedWorkspace(t, workspaceId, "Piloto");
      t.gateway.addProfile({ id: profileId, workspaceId, name: "Marca" });
      t.gateway.addMember(workspaceId, { userId: "user-ana", name: "Ana", email: null });
      const account = await t.deps.uow.repos.accounts.create(workspaceId, { clientProfileId: profileId });
      await t.deps.uow.repos.accounts.update(workspaceId, account.id, { status });
      const members = vi.spyOn(t.gateway, "listWorkspaceMembers");

      const candidate = await getOpenAccountCandidate(t.deps, { workspaceId, staffRoles: [...OPERATIONS] });

      expect(candidate, `status ${status}`).toBeNull();
      expect(members, `status ${status}`).not.toHaveBeenCalled();
    }
  });

  it("returns the workspace and reads its members when a brand is still free", async () => {
    const t = makeTestDeps();
    const workspaceId = uuid();
    const takenId = uuid();
    const freeId = uuid();
    seedWorkspace(t, workspaceId, "Piloto");
    t.gateway.addProfile({ id: takenId, workspaceId, name: "Com conta" });
    t.gateway.addProfile({ id: freeId, workspaceId, name: "Livre" });
    await t.deps.uow.repos.accounts.create(workspaceId, { clientProfileId: takenId });
    const members = vi.spyOn(t.gateway, "listWorkspaceMembers");

    const candidate = await getOpenAccountCandidate(t.deps, { workspaceId, staffRoles: [...OPERATIONS] });

    expect(candidate?.brands).toEqual([{ id: freeId, name: "Livre" }]);
    expect(members).toHaveBeenCalledTimes(1);
  });

  it("is read-only: no accounts or events appear", async () => {
    const t = makeTestDeps();
    const workspaceId = uuid();
    seedWorkspace(t, workspaceId, "Piloto");
    t.gateway.addProfile({ id: uuid(), workspaceId, name: "A" });
    t.gateway.addMember(workspaceId, { userId: "user-ana", name: "Ana", email: null });

    await getOpenAccountCandidate(t.deps, { workspaceId, staffRoles: [...OPERATIONS] });

    expect(await t.deps.uow.repos.accounts.list(workspaceId)).toHaveLength(0);
    expect(t.notifier.sends).toHaveLength(0);
  });
});

describe("listWorkspaceIdsForOpening", () => {
  const page = () => Array.from({ length: OPEN_ACCOUNT_WORKSPACE_PAGE_SIZE + 1 }, () => uuid());

  it("asks for one page plus the sentinel that tells the form there is a next one", async () => {
    const ids = page();
    const listWorkspaceIds = vi.fn().mockResolvedValue(ids);
    expect(await listWorkspaceIdsForOpening({ listWorkspaceIds })).toEqual(ids);
    expect(listWorkspaceIds).toHaveBeenCalledExactlyOnceWith({ after: undefined, limit: OPEN_ACCOUNT_WORKSPACE_PAGE_SIZE + 1 });
  });

  it("continues after the cursor", async () => {
    const listWorkspaceIds = vi.fn().mockResolvedValue([]);
    const after = uuid();
    await listWorkspaceIdsForOpening({ listWorkspaceIds }, after);
    expect(listWorkspaceIds).toHaveBeenCalledExactlyOnceWith({ after, limit: OPEN_ACCOUNT_WORKSPACE_PAGE_SIZE + 1 });
  });

  it("reads nothing for a cursor that is not a workspace id", async () => {
    const listWorkspaceIds = vi.fn().mockResolvedValue(page());
    expect(await listWorkspaceIdsForOpening({ listWorkspaceIds }, "not-a-uuid")).toEqual([]);
    expect(listWorkspaceIds).not.toHaveBeenCalled();
  });
});
