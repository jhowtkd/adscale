import { afterEach, describe, expect, it, vi } from "vitest";
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
  afterEach(() => {
    vi.useRealTimers();
  });

  // The wall clock stands still, so a burst of creations runs ahead of it by exactly one millisecond per account.
  const freezeClock = () => {
    const start = new Date("2026-10-15T12:00:00.000Z");
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(start);
    return start.getTime();
  };
  const createAccount = (repos: ReturnType<typeof createMemoryEquipeUnitOfWork>["repos"], workspaceId = crypto.randomUUID()) =>
    repos.accounts.create(workspaceId, { clientProfileId: crypto.randomUUID() });

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

  it("belong to one store: a new store starts at the wall clock, whatever another store's burst did", async () => {
    const start = freezeClock();
    const busy = createMemoryEquipeUnitOfWork(createMemoryEquipeStore());
    for (let i = 0; i < 300; i += 1) await createAccount(busy.repos);
    const fresh = createMemoryEquipeUnitOfWork(createMemoryEquipeStore());
    expect((await createAccount(fresh.repos)).createdAt.getTime()).toBe(start);
  });

  it("go on inside a transaction, which works on a copy of the store", async () => {
    const start = freezeClock();
    const uow = createMemoryEquipeUnitOfWork(createMemoryEquipeStore());
    const workspaceId = crypto.randomUUID();
    const first = await createAccount(uow.repos, workspaceId);
    const second = await uow.run((repos) => createAccount(repos, workspaceId));
    const third = await uow.run((repos) => createAccount(repos, workspaceId));
    expect([first, second, third].map((account) => account.createdAt.getTime() - start)).toEqual([0, 1, 2]);
  });

  it("never leave an update before its creation, even when the creations ran ahead of the clock", async () => {
    const start = freezeClock();
    const uow = createMemoryEquipeUnitOfWork(createMemoryEquipeStore());
    const workspaceId = crypto.randomUUID();
    let last = await createAccount(uow.repos, workspaceId);
    for (let i = 0; i < 299; i += 1) last = await createAccount(uow.repos, workspaceId);
    expect(last.createdAt.getTime()).toBe(start + 299);

    const ahead = await uow.repos.accounts.update(workspaceId, last.id, { notes: "right after the burst" });
    expect(ahead.updatedAt.getTime()).toBeGreaterThanOrEqual(ahead.createdAt.getTime());

    // Once the clock passes the creation, the update takes the clock.
    vi.setSystemTime(new Date(start + 1_000));
    const later = await uow.repos.accounts.update(workspaceId, last.id, { notes: "a second later" });
    expect(later.updatedAt.getTime()).toBe(start + 1_000);
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
