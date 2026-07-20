import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("./team", () => ({ getWorkspaceMembers: vi.fn() }));

import { getWorkspaceMembers } from "./team";
import { isPlatformOwnerEmail, workspaceHasPlatformOwnerMember } from "./platform-owner";

const members = vi.mocked(getWorkspaceMembers);

describe("isPlatformOwnerEmail", () => {
  const original = process.env.PLATFORM_OWNER_EMAILS;

  beforeEach(() => {
    process.env.PLATFORM_OWNER_EMAILS = "owner@example.com,admin@example.com";
  });

  afterEach(() => {
    process.env.PLATFORM_OWNER_EMAILS = original;
  });

  it("matches configured owner emails case-insensitively", () => {
    expect(isPlatformOwnerEmail("Owner@Example.com")).toBe(true);
    expect(isPlatformOwnerEmail("other@example.com")).toBe(false);
  });

  it("recognizes every configured platform administrator in a workspace", async () => {
    members.mockResolvedValue([
      { email: "ADMIN@example.com" },
    ] as Awaited<ReturnType<typeof getWorkspaceMembers>>);

    await expect(workspaceHasPlatformOwnerMember("workspace-1")).resolves.toBe(true);
  });
});
