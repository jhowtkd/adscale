// The free plan's single rule (ticket 11, part 2), over the in-memory Equipe store: the pilot gate, the entry account
// (oldest by created_at, then id) and what each answer means. The SQL reader has its own suite (free-plan.pg.test.ts).
import { describe, expect, it, vi } from "vitest";
import { createMemoryEquipeStore, createMemoryEquipeUnitOfWork, type EquipeAccount } from "../data";
import { entryAccountFromRepository, findFreePlanAccount, type EntryAccountReader } from "./free-plan";

vi.mock("../../db", () => ({ db: {} }));

const PILOT_ON = { enabledRaw: "true", allowlistRaw: "*" } as const;
const WORKSPACE = "11111111-1111-4111-8111-111111111111";
const OTHER_WORKSPACE = "22222222-2222-4222-8222-222222222222";

function fixture() {
  const store = createMemoryEquipeStore();
  const { repos } = createMemoryEquipeUnitOfWork(store);
  const read = entryAccountFromRepository(repos.accounts);
  const open = (workspaceId: string, status: EquipeAccount["status"]) =>
    repos.accounts.create(workspaceId, { clientProfileId: crypto.randomUUID(), status: status as never });
  return { repos, read, open };
}

describe("findFreePlanAccount", () => {
  it("answers null WITHOUT calling the reader while the pilot is off (no query for a classic workspace)", async () => {
    const reader = vi.fn<EntryAccountReader>(async () => ({ id: "acc", status: "free" }));

    expect(await findFreePlanAccount(WORKSPACE, reader, { enabledRaw: "false", allowlistRaw: "*" })).toBeNull();
    expect(await findFreePlanAccount(WORKSPACE, reader, { enabledRaw: undefined, allowlistRaw: "*" })).toBeNull();
    // Pilot on, but not for this workspace.
    expect(await findFreePlanAccount(WORKSPACE, reader, { enabledRaw: "true", allowlistRaw: OTHER_WORKSPACE })).toBeNull();
    expect(await findFreePlanAccount(WORKSPACE, reader, { enabledRaw: "true", allowlistRaw: "" })).toBeNull();
    expect(reader).not.toHaveBeenCalled();
  });

  it("asks the reader once, with the workspace, when the pilot is on", async () => {
    const reader = vi.fn<EntryAccountReader>(async () => ({ id: "acc-1", status: "free" }));

    expect(await findFreePlanAccount(WORKSPACE, reader, { enabledRaw: "true", allowlistRaw: WORKSPACE })).toEqual({ accountId: "acc-1" });
    expect(reader).toHaveBeenCalledTimes(1);
    expect(reader).toHaveBeenCalledWith(WORKSPACE);
  });

  it("a workspace without any account is classic: null", async () => {
    const { read } = fixture();
    expect(await findFreePlanAccount(WORKSPACE, read, PILOT_ON)).toBeNull();
  });

  it("an entry account on the free status gives its id", async () => {
    const { read, open } = fixture();
    const account = await open(WORKSPACE, "free" as never);

    expect(await findFreePlanAccount(WORKSPACE, read, PILOT_ON)).toEqual({ accountId: account.id });
  });

  it.each(["deploying", "active", "suspended", "closed"])("an entry account on %s is not the free plan", async (status) => {
    const { read, open } = fixture();
    await open(WORKSPACE, status as never);

    expect(await findFreePlanAccount(WORKSPACE, read, PILOT_ON)).toBeNull();
  });

  it("a paid entry account stays paid even if a free account was created after it", async () => {
    const { read, open } = fixture();
    await open(WORKSPACE, "active" as never);
    await open(WORKSPACE, "free" as never);

    expect(await findFreePlanAccount(WORKSPACE, read, PILOT_ON)).toBeNull();
  });

  it("a free entry account stays free even if a paid account was created after it", async () => {
    const { read, open } = fixture();
    const entry = await open(WORKSPACE, "free" as never);
    await open(WORKSPACE, "active" as never);

    expect(await findFreePlanAccount(WORKSPACE, read, PILOT_ON)).toEqual({ accountId: entry.id });
  });

  it("only looks at the accounts of its own workspace", async () => {
    const { read, open } = fixture();
    await open(OTHER_WORKSPACE, "free" as never);

    expect(await findFreePlanAccount(WORKSPACE, read, PILOT_ON)).toBeNull();
    const mine = await open(WORKSPACE, "active" as never);
    expect(mine.status).toBe("active");
    expect(await findFreePlanAccount(WORKSPACE, read, PILOT_ON)).toBeNull();
    expect(await findFreePlanAccount(OTHER_WORKSPACE, read, PILOT_ON)).not.toBeNull();
  });
});

describe("entryAccountFromRepository", () => {
  const row = (id: string, createdAt: string, status = "free") =>
    ({ id, status, createdAt: new Date(createdAt) }) as unknown as EquipeAccount;
  const readerOver = (rows: EquipeAccount[]) => entryAccountFromRepository({ list: async () => rows });

  it("is the oldest account by created_at, whatever order the repository lists them in", async () => {
    const read = readerOver([
      row("b", "2026-01-03T00:00:00Z", "active"),
      row("c", "2026-01-01T00:00:00Z", "free"),
      row("a", "2026-01-02T00:00:00Z", "active"),
    ]);

    expect(await read(WORKSPACE)).toMatchObject({ id: "c", status: "free" });
  });

  it("breaks a created_at tie by id", async () => {
    const same = "2026-01-01T00:00:00.000Z";
    const forward = readerOver([row("a-1", same, "free"), row("b-1", same, "active")]);
    const backward = readerOver([row("b-1", same, "active"), row("a-1", same, "free")]);

    expect(await forward(WORKSPACE)).toMatchObject({ id: "a-1", status: "free" });
    expect(await backward(WORKSPACE)).toMatchObject({ id: "a-1", status: "free" });
  });

  it("does not reorder the repository's own array", async () => {
    const rows = [row("b", "2026-01-02T00:00:00Z"), row("a", "2026-01-01T00:00:00Z")];
    await readerOver(rows)(WORKSPACE);

    expect(rows.map((r) => r.id)).toEqual(["b", "a"]);
  });

  it("answers null with no accounts", async () => {
    expect(await readerOver([])(WORKSPACE)).toBeNull();
  });

  it("the rule follows the entry: the oldest paid one wins over a newer free one, and vice versa", async () => {
    const paidFirst = readerOver([row("n", "2026-02-01T00:00:00Z", "free"), row("o", "2026-01-01T00:00:00Z", "active")]);
    const freeFirst = readerOver([row("n", "2026-02-01T00:00:00Z", "active"), row("o", "2026-01-01T00:00:00Z", "free")]);

    expect(await findFreePlanAccount(WORKSPACE, paidFirst, PILOT_ON)).toBeNull();
    expect(await findFreePlanAccount(WORKSPACE, freeFirst, PILOT_ON)).toEqual({ accountId: "o" });
  });
});
