import { describe, expect, it } from "vitest";
import { effectiveRole, removableRoles } from "./workspace-member-removal";

describe("removableRoles", () => {
  it("mirrors the invite rule", () => {
    expect(removableRoles("owner")).toEqual(["owner", "admin", "member"]);
    expect(removableRoles("admin")).toEqual(["member"]);
    expect(removableRoles("member")).toEqual([]);
  });

  it("grants nothing to unknown roles, including inherited object keys", () => {
    expect(removableRoles("")).toEqual([]);
    expect(removableRoles("superadmin")).toEqual([]);
    expect(removableRoles("toString")).toEqual([]);
    expect(removableRoles("__proto__")).toEqual([]);
  });
});

describe("effectiveRole", () => {
  it("picks the highest-precedence role across a user's membership rows", () => {
    expect(effectiveRole(["member", "owner"])).toBe("owner");
    expect(effectiveRole(["member", "admin", "member"])).toBe("admin");
    expect(effectiveRole(["member"])).toBe("member");
  });

  it("returns no role for no rows or only unknown roles", () => {
    expect(effectiveRole([])).toBe("");
    expect(effectiveRole(["superadmin"])).toBe("");
  });
});
