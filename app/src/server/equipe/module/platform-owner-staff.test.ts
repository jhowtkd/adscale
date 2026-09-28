import { describe, expect, it } from "vitest";
import { ensurePlatformOwnerStaff } from "./platform-owner-staff";
import { makeTestDeps, testActors } from "./testing/deps";

const SYSTEM = testActors.system!;
const OWNER_ID = "owner-1";

function setup() {
  return makeTestDeps();
}

async function rowsForUser(t: ReturnType<typeof setup>, userId: string) {
  return (await t.deps.uow.internal.staff.list()).filter((row) => row.userId === userId);
}

describe("ensure_platform_owner_staff", () => {
  it("creates the three active rows for a fresh user", async () => {
    const t = setup();

    const outcome = await ensurePlatformOwnerStaff(t.deps, SYSTEM, {
      userId: OWNER_ID,
      displayName: "Dona da plataforma",
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value).toEqual({
      created: ["support", "quality", "operations"],
      alreadyActive: [],
      deactivated: [],
    });
    const rows = await rowsForUser(t, OWNER_ID);
    expect(rows).toHaveLength(3);
    expect(rows.map((row) => row.role).sort()).toEqual(["operations", "quality", "support"]);
    expect(rows.every((row) => row.active)).toBe(true);
    expect(rows.every((row) => row.displayName === "Dona da plataforma")).toBe(true);
  });

  it("is idempotent: a second call creates nothing", async () => {
    const t = setup();
    const first = await ensurePlatformOwnerStaff(t.deps, SYSTEM, {
      userId: OWNER_ID,
      displayName: "Dona",
    });
    expect(first.ok).toBe(true);
    const before = await rowsForUser(t, OWNER_ID);

    const second = await ensurePlatformOwnerStaff(t.deps, SYSTEM, {
      userId: OWNER_ID,
      displayName: "Dona",
    });

    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.value).toEqual({
      created: [],
      alreadyActive: ["support", "quality", "operations"],
      deactivated: [],
    });
    const after = await rowsForUser(t, OWNER_ID);
    expect(after.map((row) => row.id).sort()).toEqual(before.map((row) => row.id).sort());
  });

  it("creates exactly the missing roles", async () => {
    const t = setup();
    await t.deps.uow.internal.staff.create({
      userId: OWNER_ID,
      role: "support",
      displayName: "Dona",
      active: true,
    });

    const outcome = await ensurePlatformOwnerStaff(t.deps, SYSTEM, {
      userId: OWNER_ID,
      displayName: "Dona",
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value).toEqual({
      created: ["quality", "operations"],
      alreadyActive: ["support"],
      deactivated: [],
    });
    expect(await rowsForUser(t, OWNER_ID)).toHaveLength(3);
  });

  it("never reactivates an explicitly deactivated row — it is left alone and reported", async () => {
    const t = setup();
    const operations = await t.deps.uow.internal.staff.create({
      userId: OWNER_ID,
      role: "operations",
      displayName: "Dona",
      active: true,
    });
    await t.deps.uow.internal.staff.update(operations.id, { active: false });

    const outcome = await ensurePlatformOwnerStaff(t.deps, SYSTEM, {
      userId: OWNER_ID,
      displayName: "Dona",
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value).toEqual({
      created: ["support", "quality"],
      alreadyActive: [],
      deactivated: ["operations"],
    });
    const rows = await rowsForUser(t, OWNER_ID);
    expect(rows).toHaveLength(3);
    expect(rows.find((row) => row.role === "operations")?.active).toBe(false);
  });

  it("refuses every non-system actor", async () => {
    const t = setup();
    for (const actor of [
      testActors.support!,
      testActors.quality!,
      testActors.operations!,
      testActors.agent!,
      testActors.approver!,
    ]) {
      const outcome = await ensurePlatformOwnerStaff(t.deps, actor, {
        userId: OWNER_ID,
        displayName: "Dona",
      });
      expect(outcome.ok).toBe(false);
      if (!outcome.ok) expect(outcome.error.code).toBe("forbidden_actor");
    }
    expect(await rowsForUser(t, OWNER_ID)).toHaveLength(0);
  });

  it("rejects an empty user id or display name", async () => {
    const t = setup();
    for (const input of [
      { userId: "", displayName: "Dona" },
      { userId: OWNER_ID, displayName: "" },
    ]) {
      const outcome = await ensurePlatformOwnerStaff(t.deps, SYSTEM, input);
      expect(outcome.ok).toBe(false);
      if (!outcome.ok) expect(outcome.error.code).toBe("invalid_command");
    }
    expect(await t.deps.uow.internal.staff.list()).toHaveLength(0);
  });

  it("ignores other users' rows", async () => {
    const t = setup();
    await t.deps.uow.internal.staff.create({
      userId: "someone-else",
      role: "support",
      displayName: "Outrem",
      active: true,
    });

    const outcome = await ensurePlatformOwnerStaff(t.deps, SYSTEM, {
      userId: OWNER_ID,
      displayName: "Dona",
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.created).toEqual(["support", "quality", "operations"]);
    expect(await rowsForUser(t, OWNER_ID)).toHaveLength(3);
  });
});
