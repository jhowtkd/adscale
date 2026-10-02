import { describe, expect, it } from "vitest";
import { createMemoryEquipeStore, createMemoryEquipeUnitOfWork } from "./memory";
import { defineEquipeRepositoryContract } from "./repository-contract";
import type { AccountScope } from "./types";

// Contrato contra a implementação em memória: sem banco, roda local e no CI.
defineEquipeRepositoryContract("memória", async () => {
  const store = createMemoryEquipeStore();
  const uow = createMemoryEquipeUnitOfWork(store);
  const createScope = async (): Promise<AccountScope> => {
    const workspaceId = crypto.randomUUID();
    const account = await uow.repos.accounts.create(workspaceId, {
      clientProfileId: crypto.randomUUID(),
    });
    return { workspaceId, accountId: account.id };
  };
  const pinCreatedAt = async (accountIds: string[], at: Date): Promise<void> => {
    for (const id of accountIds) {
      const row = store.accounts.rows.get(id);
      if (row) store.accounts.rows.set(id, { ...row, createdAt: at });
    }
  };
  const scope = await createScope();
  const otherScope = await createScope();
  return { uow, scope, otherScope, createScope, pinCreatedAt };
});

describe("memory accounts: creation stamps", () => {
  it("are strictly increasing, so a millisecond tie never lets the random id decide who was created first", async () => {
    const uow = createMemoryEquipeUnitOfWork(createMemoryEquipeStore());
    const workspaceId = crypto.randomUUID();
    const stamps: number[] = [];
    for (let i = 0; i < 300; i += 1) {
      const account = await uow.repos.accounts.create(workspaceId, { clientProfileId: crypto.randomUUID() });
      stamps.push(account.createdAt.getTime());
    }
    for (let i = 1; i < stamps.length; i += 1) expect(stamps[i]).toBeGreaterThan(stamps[i - 1]!);
  });
});

describe("memory unit of work concurrency", () => {
  function gate() {
    let release!: () => void;
    let entered!: () => void;
    const waiting = new Promise<void>((resolve) => { entered = resolve; });
    const released = new Promise<void>((resolve) => { release = resolve; });
    return { waiting, released, enter: entered, release };
  }

  async function sharedUnits() {
    const store = createMemoryEquipeStore();
    const first = createMemoryEquipeUnitOfWork(store);
    const second = createMemoryEquipeUnitOfWork(store);
    const account = await first.repos.accounts.create(crypto.randomUUID(), {
      clientProfileId: crypto.randomUUID(),
    });
    return { first, second, workspaceId: account.workspaceId, accountId: account.id };
  }

  it("serializes separate unit-of-work instances over one store", async () => {
    const fixture = await sharedUnits();
    const barrier = gate();
    const one = fixture.first.run(async (repos) => {
      await repos.accounts.update(fixture.workspaceId, fixture.accountId, { notes: "first" });
      barrier.enter();
      await barrier.released;
    });
    await barrier.waiting;
    let secondEntered = false;
    const two = fixture.second.run(async (repos) => {
      secondEntered = true;
      await repos.accounts.update(fixture.workspaceId, fixture.accountId, { notes: "second" });
    });
    await Promise.resolve();
    expect(secondEntered).toBe(false);
    barrier.release();
    await Promise.all([one, two]);
    expect((await fixture.first.repos.accounts.get(fixture.workspaceId, fixture.accountId))?.notes)
      .toBe("second");
  });

  it("releases the store queue after rollback", async () => {
    const fixture = await sharedUnits();
    const barrier = gate();
    const failed = fixture.first.run(async (repos) => {
      await repos.accounts.update(fixture.workspaceId, fixture.accountId, { notes: "rolled back" });
      barrier.enter();
      await barrier.released;
      throw new Error("rollback");
    });
    await barrier.waiting;
    const committed = fixture.second.run(async (repos) => {
      await repos.accounts.update(fixture.workspaceId, fixture.accountId, { notes: "committed" });
    });
    barrier.release();
    await expect(failed).rejects.toThrow("rollback");
    await committed;
    expect((await fixture.first.repos.accounts.get(fixture.workspaceId, fixture.accountId))?.notes)
      .toBe("committed");
  });
});
