import { describe, expect, it } from "vitest";
import { executeCommand } from "./commands";
import { isEquipeEnabledForWorkspace } from "./equipe-enabled";
import { makeTestDeps, seedStaff, uuid } from "./testing/deps";

const WS = "11111111-1111-1111-1111-111111111111";
const OTHER = "22222222-2222-2222-2222-222222222222";

describe("isEquipeEnabledForWorkspace", () => {
  it("enables only allowlisted workspaces when the switch is on", async () => {
    expect(isEquipeEnabledForWorkspace(WS, { enabledRaw: "true", allowlistRaw: WS })).toBe(true);
    expect(
      isEquipeEnabledForWorkspace(WS, { enabledRaw: "true", allowlistRaw: `${OTHER}, ${WS} ` }),
    ).toBe(true);
    expect(isEquipeEnabledForWorkspace(OTHER, { enabledRaw: "true", allowlistRaw: WS })).toBe(
      false,
    );
  });

  it("fails closed: switch off, empty allowlist, or malformed entries", async () => {
    // Switch off (or unset) → nobody.
    expect(isEquipeEnabledForWorkspace(WS, { enabledRaw: "false", allowlistRaw: WS })).toBe(false);
    expect(isEquipeEnabledForWorkspace(WS, { enabledRaw: undefined, allowlistRaw: WS })).toBe(false);
    expect(isEquipeEnabledForWorkspace(WS, { enabledRaw: "yes", allowlistRaw: WS })).toBe(false);
    // Empty allowlist → nobody (unlike the quality pilot).
    expect(isEquipeEnabledForWorkspace(WS, { enabledRaw: "true", allowlistRaw: "" })).toBe(false);
    expect(isEquipeEnabledForWorkspace(WS, { enabledRaw: "true", allowlistRaw: "  " })).toBe(false);
    expect(isEquipeEnabledForWorkspace(WS, { enabledRaw: "true", allowlistRaw: undefined })).toBe(false);
    // One invalid UUID poisons the whole list → nobody.
    expect(isEquipeEnabledForWorkspace(WS, { enabledRaw: "true", allowlistRaw: "nope" })).toBe(false);
    expect(
      isEquipeEnabledForWorkspace(WS, { enabledRaw: "true", allowlistRaw: `${WS},nope` }),
    ).toBe(false);
  });
});

describe("workspace gate on commands", () => {
  it("refuses every command with a domain error when the workspace is off", async () => {
    const t = makeTestDeps({ isEnabledForWorkspace: () => false });
    const operations = await seedStaff(t, "operations");
    const workspaceId = uuid();
    const profileId = uuid();
    t.gateway.addProfile({ id: profileId, workspaceId });
    const outcome = await executeCommand(t.deps, { actor: operations, workspaceId }, {
      type: "open_account",
      payload: {
        clientProfileId: profileId,
        fronts: ["social_instagram"],
        people: [{ name: "Ana", role: "approver" }],
      },
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.error.code).toBe("equipe_not_enabled");
    expect(await t.deps.uow.repos.accounts.list(workspaceId)).toHaveLength(0);
  });
});
