// Pure actor-resolution helpers of the /api/equipe guards (#552). The
// async guards (workspace allowlist, account scope, staff rows) are covered
// through the route tests with the deps factory mocked.

import { describe, expect, it } from "vitest";
import type { EquipeAccountPerson, EquipeStaffMember } from "../data";
import { pickClientPerson, resolveStaffActor } from "./guards";

function person(overrides: Partial<EquipeAccountPerson> & { id: string }): EquipeAccountPerson {
  return {
    workspaceId: "ws",
    accountId: "acc",
    userId: null,
    role: "member",
    name: "Rui",
    email: null,
    active: true,
    createdAt: new Date("2026-10-01T00:00:00.000Z"),
    updatedAt: new Date("2026-10-01T00:00:00.000Z"),
    ...overrides,
  };
}

function staff(overrides: Partial<EquipeStaffMember> & { id: string }): EquipeStaffMember {
  return {
    userId: null,
    role: "support",
    displayName: "Bruna",
    active: true,
    createdAt: new Date("2026-10-01T00:00:00.000Z"),
    updatedAt: new Date("2026-10-01T00:00:00.000Z"),
    ...overrides,
  };
}

describe("pickClientPerson", () => {
  it("returns null when the user has no row", () => {
    expect(pickClientPerson([person({ id: "p1", userId: "other" })], "user-1")).toBeNull();
  });

  it("picks the user's row", () => {
    const rows = [person({ id: "p1", userId: "other" }), person({ id: "p2", userId: "user-1" })];
    expect(pickClientPerson(rows, "user-1")?.id).toBe("p2");
  });

  it("prefers the highest-ranked role across several rows", () => {
    const rows = [
      person({ id: "p-member", userId: "user-1", role: "member" }),
      person({ id: "p-custodian", userId: "user-1", role: "custodian" }),
      person({ id: "p-approver", userId: "user-1", role: "approver" }),
    ];
    expect(pickClientPerson(rows, "user-1")?.id).toBe("p-approver");
  });

  it("prefers an active row over an inactive one holding a higher role", () => {
    const rows = [
      person({ id: "p-approver-off", userId: "user-1", role: "approver", active: false }),
      person({ id: "p-member-on", userId: "user-1", role: "member", active: true }),
    ];
    expect(pickClientPerson(rows, "user-1")?.id).toBe("p-member-on");
  });

  it("still returns a lone inactive row so the module can refuse it", () => {
    const rows = [person({ id: "p-off", userId: "user-1", role: "member", active: false })];
    expect(pickClientPerson(rows, "user-1")?.id).toBe("p-off");
  });
});

describe("resolveStaffActor", () => {
  it("has no identity without rows (every role deactivated)", () => {
    expect(resolveStaffActor([])).toEqual({ ok: false, reason: "no_identity" });
  });

  it("uses a single row as-is", () => {
    expect(resolveStaffActor([staff({ id: "s1", role: "support" })])).toEqual({
      ok: true,
      actor: { kind: "staff", role: "support", staffId: "s1" },
    });
  });

  it("uses the row matching an explicit held role", () => {
    const rows = [staff({ id: "s1", role: "support" }), staff({ id: "s2", role: "quality" })];
    expect(resolveStaffActor(rows, "quality")).toEqual({
      ok: true,
      actor: { kind: "staff", role: "quality", staffId: "s2" },
    });
  });

  it("refuses a role the user does not hold", () => {
    expect(resolveStaffActor([staff({ id: "s1", role: "support" })], "quality")).toEqual({
      ok: false,
      reason: "role_not_held",
    });
  });

  it("asks for an explicit role when several rows match", () => {
    const rows = [staff({ id: "s1", role: "support" }), staff({ id: "s2", role: "quality" })];
    expect(resolveStaffActor(rows)).toEqual({ ok: false, reason: "role_required" });
  });
});
