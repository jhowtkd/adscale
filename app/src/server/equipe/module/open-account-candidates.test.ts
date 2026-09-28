import { describe, expect, it } from "vitest";
import { getOpenAccountCandidate } from "./open-account-candidates";
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

  it("reads only allowlisted workspaces", async () => {
    const pilotId = uuid();
    const outsideId = uuid();
    const t = makeTestDeps({ isEnabledForWorkspace: (id) => id === pilotId });
    seedWorkspace(t, pilotId, "Piloto");
    seedWorkspace(t, outsideId, "Fora");
    t.gateway.addProfile({ id: uuid(), workspaceId: pilotId, name: "A" });
    t.gateway.addProfile({ id: uuid(), workspaceId: outsideId, name: "B" });

    const pilot = await getOpenAccountCandidate(t.deps, {
      workspaceId: pilotId,
      staffRoles: [...OPERATIONS],
    });
    const outside = await getOpenAccountCandidate(t.deps, {
      workspaceId: outsideId,
      staffRoles: [...OPERATIONS],
    });

    expect(pilot?.workspace).toEqual({ id: pilotId, name: "Piloto" });
    expect(pilot?.brands).toHaveLength(1);
    expect(outside).toBeNull();
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
