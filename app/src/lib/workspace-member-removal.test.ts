import { describe, expect, it } from "vitest";
import { removableRoles } from "./workspace-member-removal";

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
