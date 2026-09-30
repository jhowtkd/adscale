import { describe, expect, it } from "vitest";
import { executeCommand } from "./commands";
import {
  isEquipeEnabledForWorkspace, listPilotWorkspaceIds, listPilotWorkspaceIdsForOpening, OPEN_ACCOUNT_WORKSPACE_PAGE_SIZE,
} from "./equipe-enabled";
import { makeTestDeps, seedStaff, uuid } from "./testing/deps";
import { vi } from "vitest";

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

describe("allowlist wildcard", () => {
  it("* enables any valid workspace uuid and needs the master switch", () => {
    expect(isEquipeEnabledForWorkspace(WS, { enabledRaw: "true", allowlistRaw: "*" })).toBe(true);
    expect(isEquipeEnabledForWorkspace(OTHER, { enabledRaw: "true", allowlistRaw: " * " })).toBe(true);
    expect(isEquipeEnabledForWorkspace(WS, { enabledRaw: "true", allowlistRaw: `*,${OTHER}` })).toBe(true);
    expect(isEquipeEnabledForWorkspace(WS, { enabledRaw: "false", allowlistRaw: "*" })).toBe(false);
    expect(isEquipeEnabledForWorkspace(WS, { enabledRaw: undefined, allowlistRaw: "*" })).toBe(false);
  });

  it("* never enables an invalid or empty workspace id", () => {
    for (const id of ["", "not-a-uuid", "*", "1111", `${WS}x`]) {
      expect(isEquipeEnabledForWorkspace(id, { enabledRaw: "true", allowlistRaw: "*" })).toBe(false);
    }
  });

  it("still fails closed on empty, blank or invalid entries next to *", () => {
    expect(isEquipeEnabledForWorkspace(WS, { enabledRaw: "true", allowlistRaw: "" })).toBe(false);
    expect(isEquipeEnabledForWorkspace(WS, { enabledRaw: "true", allowlistRaw: ",  ," })).toBe(false);
    expect(isEquipeEnabledForWorkspace(WS, { enabledRaw: "true", allowlistRaw: "*,nope" })).toBe(false);
    expect(isEquipeEnabledForWorkspace(WS, { enabledRaw: "true", allowlistRaw: "**" })).toBe(false);
    expect(isEquipeEnabledForWorkspace(WS, { enabledRaw: "true", allowlistRaw: "*x" })).toBe(false);
  });

  it("the pilot job list never contains the wildcard and keeps explicit ids", () => {
    expect(listPilotWorkspaceIds({ enabledRaw: "true", allowlistRaw: "*" })).toEqual([]);
    expect(listPilotWorkspaceIds({ enabledRaw: "true", allowlistRaw: `*,${WS}` })).toEqual([WS]);
    expect(listPilotWorkspaceIds({ enabledRaw: "true", allowlistRaw: "*,nope" })).toEqual([]);
  });
});

describe("listPilotWorkspaceIdsForOpening", () => {
  const internal = { listWorkspaceIds: async () => [WS, OTHER] };
  it("resolves * to every real workspace id, keeps explicit ids, and is closed when the switch is off", async () => {
    expect(await listPilotWorkspaceIdsForOpening(internal, { enabledRaw: "true", allowlistRaw: "*" })).toEqual([WS, OTHER]);
    expect(await listPilotWorkspaceIdsForOpening(internal, { enabledRaw: "true", allowlistRaw: `${OTHER},${OTHER}` })).toEqual([OTHER]);
    expect(await listPilotWorkspaceIdsForOpening(internal, { enabledRaw: "false", allowlistRaw: "*" })).toEqual([]);
    expect(await listPilotWorkspaceIdsForOpening(internal, { enabledRaw: "true", allowlistRaw: "*,nope" })).toEqual([]);
    expect(await listPilotWorkspaceIdsForOpening(internal, { enabledRaw: "true", allowlistRaw: "" })).toEqual([]);
  });
});

describe("listPilotWorkspaceIdsForOpening pagination (bounded page + sentinel)", () => {
  const PAGE = 20;
  const id = (n: number) => `${n.toString(16).padStart(8, "0")}-0000-4000-8000-000000000000`;
  const ALL = Array.from({ length: 50 }, (_, i) => id(i + 1));           // sorted id ASC
  const enabled = { enabledRaw: "true", allowlistRaw: "*" } as const;

  /** Fake repository: keyset page over a sorted id list, recording every call. */
  function fakeInternal(ids: string[] = ALL) {
    const sorted = [...ids].sort();
    const listWorkspaceIds = vi.fn(async (page?: { after?: string; limit: number }) =>
      sorted.filter((x) => !page?.after || x > page.after).slice(0, page?.limit));
    return { listWorkspaceIds } as unknown as Parameters<typeof listPilotWorkspaceIdsForOpening>[0] & { listWorkspaceIds: typeof listWorkspaceIds };
  }

  it("exports the page size 20", () => {
    expect(OPEN_ACCOUNT_WORKSPACE_PAGE_SIZE).toBe(PAGE);
  });

  it("wildcard asks the repository for ONE page of size+1 and returns at most 21 ids", async () => {
    const internal = fakeInternal();
    const page = await listPilotWorkspaceIdsForOpening(internal, enabled);
    expect(internal.listWorkspaceIds).toHaveBeenCalledTimes(1);
    expect(internal.listWorkspaceIds).toHaveBeenCalledWith({ after: undefined, limit: PAGE + 1 });
    expect(page).toEqual(ALL.slice(0, PAGE + 1));
  });

  it("forwards the cursor to the repository and pages without gaps or duplicates", async () => {
    const internal = fakeInternal();
    const seen: string[] = [];
    let after: string | undefined;
    for (let guard = 0; guard < 10; guard += 1) {
      const page = await listPilotWorkspaceIdsForOpening(internal, enabled, after);
      expect(page.length).toBeLessThanOrEqual(PAGE + 1);
      expect(internal.listWorkspaceIds).toHaveBeenLastCalledWith({ after, limit: PAGE + 1 });
      const shown = page.slice(0, PAGE);
      seen.push(...shown);
      if (page.length <= PAGE) break;             // no sentinel → last page
      after = shown[shown.length - 1];
    }
    expect(seen).toEqual(ALL);
    expect(new Set(seen).size).toBe(ALL.length);
  });

  it("a final page smaller than the size carries no sentinel", async () => {
    const internal = fakeInternal(ALL.slice(0, 5));
    expect(await listPilotWorkspaceIdsForOpening(internal, enabled)).toEqual(ALL.slice(0, 5));
    expect(await listPilotWorkspaceIdsForOpening(internal, enabled, ALL[4])).toEqual([]);
  });

  it("an explicit allowlist is sorted, de-duplicated, paged the same way and NEVER reads the repository", async () => {
    const internal = fakeInternal();
    const shuffled = [...ALL.slice(0, 25)].reverse();
    const allowlistRaw = [...shuffled, ...shuffled.slice(0, 3)].join(",");
    const first = await listPilotWorkspaceIdsForOpening(internal, { enabledRaw: "true", allowlistRaw });
    expect(first).toEqual(ALL.slice(0, PAGE + 1));
    const second = await listPilotWorkspaceIdsForOpening(internal, { enabledRaw: "true", allowlistRaw }, ALL[PAGE - 1]);
    expect(second).toEqual(ALL.slice(PAGE, 25));
    // the cursor is exclusive
    expect(second).not.toContain(ALL[PAGE - 1]);
    expect(internal.listWorkspaceIds).not.toHaveBeenCalled();
  });

  it("a malformed cursor closes the gate without reading the database (wildcard and explicit)", async () => {
    for (const allowlistRaw of ["*", ALL[0]!]) {
      const internal = fakeInternal();
      for (const bad of ["not-a-uuid", "*", "0000", `${ALL[0]}x`, "'; drop table x; --"]) {
        expect(await listPilotWorkspaceIdsForOpening(internal, { enabledRaw: "true", allowlistRaw }, bad)).toEqual([]);
      }
      expect(internal.listWorkspaceIds).not.toHaveBeenCalled();
    }
  });

  it("keeps the enable gate: switch off, empty or invalid allowlist never touch the repository", async () => {
    const internal = fakeInternal();
    expect(await listPilotWorkspaceIdsForOpening(internal, { enabledRaw: "false", allowlistRaw: "*" })).toEqual([]);
    expect(await listPilotWorkspaceIdsForOpening(internal, { enabledRaw: undefined, allowlistRaw: "*" })).toEqual([]);
    expect(await listPilotWorkspaceIdsForOpening(internal, { enabledRaw: "true", allowlistRaw: "" })).toEqual([]);
    expect(await listPilotWorkspaceIdsForOpening(internal, { enabledRaw: "true", allowlistRaw: "*,nope" })).toEqual([]);
    expect(internal.listWorkspaceIds).not.toHaveBeenCalled();
  });

  it("wildcard keeps working for any real workspace uuid (page is data-driven, not allowlist-driven)", async () => {
    const random = [uuid(), uuid(), uuid()];
    const internal = fakeInternal(random);
    expect(await listPilotWorkspaceIdsForOpening(internal, enabled)).toEqual([...random].sort());
    for (const w of random) expect(isEquipeEnabledForWorkspace(w, enabled)).toBe(true);
  });

  it("the memory repository honours {after, limit} with id ASC order", async () => {
    const t = makeTestDeps();
    const ids = [id(9), id(3), id(7), id(1), id(5)];
    for (const workspaceId of ids) t.store.adscaleWorkspaces.rows.set(workspaceId, { id: workspaceId, name: workspaceId });
    const internal = t.deps.uow.internal;
    expect(await internal.listWorkspaceIds({ limit: 3 })).toEqual([id(1), id(3), id(5)]);
    expect(await internal.listWorkspaceIds({ after: id(3), limit: 2 })).toEqual([id(5), id(7)]);
    expect(await internal.listWorkspaceIds({ after: id(9), limit: 5 })).toEqual([]);
    expect(await listPilotWorkspaceIdsForOpening(internal, enabled)).toEqual([id(1), id(3), id(5), id(7), id(9)]);
  });
});
