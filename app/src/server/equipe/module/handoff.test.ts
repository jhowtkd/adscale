import { describe, expect, it } from "vitest";
import { executeCommand } from "./commands";
import { makeTestDeps, uuid } from "./testing/deps";
import { HANDOFF_READ_EVENT } from "../handoff/contract";
import type { HandoffGroup, HandoffItem } from "../domain/handoff";

type Deps = ReturnType<typeof makeTestDeps>;
type Scope = { workspaceId: string; accountId: string };

const SYSTEM_OPEN = { kind: "system", job: "free-open" } as const;
const READER = { kind: "system", job: HANDOFF_READ_EVENT } as const;

function seedMember(t: Deps, workspaceId: string) {
  const userId = `user-${uuid()}`;
  t.store.workspaceMembers.rows.set(uuid(), {
    id: uuid(), workspaceId, userId, name: "Ana Souza",
    email: "ana@example.com", emailVerified: true,
  });
  return userId;
}

/** Opens a free account (creates the source-step handoff row) and returns the bound approver actor. */
async function openHandoff(t: Deps) {
  const workspaceId = uuid();
  const userId = seedMember(t, workspaceId);
  const outcome = await executeCommand(t.deps, { actor: SYSTEM_OPEN, workspaceId }, { type: "open_free_account", payload: { userId } });
  if (!outcome.ok) throw new Error(`openHandoff failed: ${outcome.error.code}`);
  const accountId = outcome.value.accountId!;
  const people = await t.deps.uow.repos.people.list({ workspaceId, accountId });
  const approver = { kind: "client_person", role: "approver", personId: people[0]!.id } as const;
  return { workspaceId, accountId, approver, scope: { workspaceId, accountId } };
}

async function currentHandoff(t: Deps, scope: Scope) {
  const [row] = await t.deps.uow.repos.handoffs.list(scope);
  if (!row) throw new Error("no handoff row");
  return row;
}

function siteItem(id: string, value: string, extra: Partial<HandoffItem> = {}): HandoffItem {
  return { id, value, origin: "site", ...extra };
}

function igItem(id: string, value: string, extra: Partial<HandoffItem> = {}): HandoffItem {
  return { id, value, origin: "instagram", ...extra };
}

/** Records one group's result as the reading task itself (`system`, job = the read event). */
async function recordGroup(
  t: Deps, scope: Scope, group: HandoffGroup,
  status: "found" | "not_found" | "failed", items: HandoffItem[] = [], error?: string,
) {
  const row = await currentHandoff(t, scope);
  const g = row.reading[group];
  if (!g) throw new Error(`group ${group} has no pending run`);
  return executeCommand(t.deps, { actor: READER, workspaceId: scope.workspaceId, accountId: scope.accountId }, {
    type: "handoff_record_group",
    payload: {
      readingId: row.readingId!, runId: g.runId, taskIntentId: g.taskIntentId, group,
      result: { status, items, ...(error ? { error } : {}) },
    },
  });
}

async function setSource(t: Deps, scope: Scope, approver: { kind: "client_person"; role: "approver"; personId: string },
  kind: "site" | "instagram", value: string) {
  const row = await currentHandoff(t, scope);
  return executeCommand(t.deps, { actor: approver, workspaceId: scope.workspaceId, accountId: scope.accountId }, {
    type: "handoff_set_source",
    payload: { expectedStep: row.step, expectedVersion: row.version, kind, value },
  });
}

describe("handoff: happy path via site", () => {
  it("reads name/logo/colors/fonts, releases identity early, then networks/images/summary complete the handoff", async () => {
    const t = makeTestDeps();
    const { scope, approver } = await openHandoff(t);

    const setResult = await setSource(t, scope, approver, "site", "https://acme.com");
    expect(setResult.ok).toBe(true);
    let row = await currentHandoff(t, scope);
    expect(row.step).toBe("reading");
    expect(row.readsUsed).toBe(1);
    for (const group of ["name", "logo", "colors", "fonts", "networks", "images"] as const) {
      expect(row.reading[group]?.status).toBe("pending");
    }

    const nameId = uuid(); const logoId = uuid();
    t.store.workspaceAssets.rows.set(logoId, {
      id: logoId, workspaceId: scope.workspaceId, clientProfileId: null, name: "logo.png", key: "workspaces/logo.png",
      type: "image/png", size: 1, width: null, height: null, source: "brand_site", tags: [], aiDescription: null,
      metadata: { provisional: true, handoffId: row.id }, createdAt: new Date(), updatedAt: new Date(),
    });
    await recordGroup(t, scope, "name", "found", [siteItem(nameId, "Acme")]);
    await recordGroup(t, scope, "logo", "found", [siteItem(logoId, "logo.png", { key: "workspaces/logo.png" })]);
    await recordGroup(t, scope, "colors", "found", [siteItem(uuid(), "#112233")]);
    await recordGroup(t, scope, "fonts", "found", [siteItem(uuid(), "Inter")]);

    // Step 3 unlocked before networks/images finish reading.
    row = await currentHandoff(t, scope);
    expect(row.step).toBe("identity");
    expect(row.reading.networks?.status).toBe("pending");
    expect(row.reading.images?.status).toBe("pending");

    const confirmIdentity = await executeCommand(t.deps, { actor: approver, workspaceId: scope.workspaceId, accountId: scope.accountId }, {
      type: "handoff_confirm_identity",
      payload: {
        expectedStep: row.step, expectedVersion: row.version,
        name: "Acme", logo: logoId, colors: ["#112233"], fonts: ["Inter"], paletteChoice: "site",
      },
    });
    expect(confirmIdentity.ok).toBe(true);

    row = await currentHandoff(t, scope);
    expect(row.step).toBe("networks");
    expect(row.decisions.identity).toMatchObject({ name: { value: "Acme" }, logo: { id: logoId }, paletteChoice: "site" });

    await recordGroup(t, scope, "networks", "not_found");
    await recordGroup(t, scope, "images", "not_found");
    row = await currentHandoff(t, scope);
    expect(row.step).toBe("networks");

    // A site source accepts an empty confirmed networks list.
    const confirmNetworks = await executeCommand(t.deps, { actor: approver, workspaceId: scope.workspaceId, accountId: scope.accountId }, {
      type: "handoff_confirm_networks",
      payload: { expectedStep: row.step, expectedVersion: row.version, kept: [], added: [] },
    });
    expect(confirmNetworks.ok).toBe(true);

    row = await currentHandoff(t, scope);
    expect(row.step).toBe("images");
    const confirmImages = await executeCommand(t.deps, { actor: approver, workspaceId: scope.workspaceId, accountId: scope.accountId }, {
      type: "handoff_confirm_images",
      payload: { expectedStep: row.step, expectedVersion: row.version, kept: [], removed: [], uploaded: [] },
    });
    expect(confirmImages.ok).toBe(true);

    row = await currentHandoff(t, scope);
    expect(row.step).toBe("summary");
    const confirmSummary = await executeCommand(t.deps, { actor: approver, workspaceId: scope.workspaceId, accountId: scope.accountId }, {
      type: "handoff_confirm_summary",
      payload: { expectedStep: row.step, expectedVersion: row.version },
    });
    expect(confirmSummary.ok).toBe(true);

    row = await currentHandoff(t, scope);
    expect(row.step).toBe("done");
    const profile = [...t.store.adscaleProfiles.rows.values()].find((p) => p.id === row.clientProfileId);
    expect(profile).toMatchObject({ name: "Acme", brandColors: ["#112233"], brandFonts: ["Inter"] });
    const [diagnoseIntent] = (await t.deps.uow.repos.taskOutbox.list(scope)).filter((i) => i.eventName === "equipe.handoff.diagnose");
    expect(diagnoseIntent).toBeDefined();
  });
});

describe("handoff: happy path via Instagram", () => {
  it("reads every group from Instagram and auto-confirms the single profile it found", async () => {
    const t = makeTestDeps();
    const { scope, approver } = await openHandoff(t);
    await setSource(t, scope, approver, "instagram", "acme.oficial");

    await recordGroup(t, scope, "name", "found", [igItem(uuid(), "Acme")]);
    await recordGroup(t, scope, "logo", "found", [igItem(uuid(), "avatar.png")]);
    await recordGroup(t, scope, "colors", "found", [igItem(uuid(), "#445566")]);
    await recordGroup(t, scope, "fonts", "not_found");
    const netId = uuid();
    await recordGroup(t, scope, "networks", "found", [igItem(netId, "acme.oficial", { platform: "instagram" })]);

    let row = await currentHandoff(t, scope);
    // The Instagram source is self-evidently confirmed by the person's own choice of source.
    expect(row.decisions.networks).toEqual([expect.objectContaining({ id: netId, platform: "instagram" })]);
    expect(row.step).toBe("identity");

    const confirmIdentity = await executeCommand(t.deps, { actor: approver, workspaceId: scope.workspaceId, accountId: scope.accountId }, {
      type: "handoff_confirm_identity",
      payload: { expectedStep: row.step, expectedVersion: row.version, name: "Acme", logo: null, colors: ["#445566"], fonts: [], paletteChoice: "instagram" },
    });
    expect(confirmIdentity.ok).toBe(true);

    row = await currentHandoff(t, scope);
    const confirmNetworks = await executeCommand(t.deps, { actor: approver, workspaceId: scope.workspaceId, accountId: scope.accountId }, {
      type: "handoff_confirm_networks",
      payload: { expectedStep: row.step, expectedVersion: row.version, kept: [netId], added: [] },
    });
    expect(confirmNetworks.ok).toBe(true);
    row = await currentHandoff(t, scope);
    expect(row.step).toBe("images");
    // Confirming the very same Instagram profile again must not spend another reading.
    expect(row.readsUsed).toBe(1);
  });

  it("requires a confirmed Instagram profile: a site source cannot use paletteChoice instagram before confirming one", async () => {
    const t = makeTestDeps();
    const { scope, approver } = await openHandoff(t);
    await setSource(t, scope, approver, "site", "https://acme.com");
    await recordGroup(t, scope, "name", "found", [siteItem(uuid(), "Acme")]);
    await recordGroup(t, scope, "logo", "not_found");
    await recordGroup(t, scope, "colors", "found", [siteItem(uuid(), "#112233")]);
    await recordGroup(t, scope, "fonts", "found", [siteItem(uuid(), "Inter")]);
    const row = await currentHandoff(t, scope);
    expect(row.step).toBe("identity");
    const rejected = await executeCommand(t.deps, { actor: approver, workspaceId: scope.workspaceId, accountId: scope.accountId }, {
      type: "handoff_confirm_identity",
      payload: { expectedStep: row.step, expectedVersion: row.version, name: "Acme", logo: null, colors: ["#112233"], fonts: ["Inter"], paletteChoice: "instagram" },
    });
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) expect(rejected.error.code).toBe("invalid_command");
  });
});

describe("handoff: Instagram found on the site stays provisional until confirmed", () => {
  it("does not decide the network on its own; confirming it triggers its own (charged) reading", async () => {
    const t = makeTestDeps();
    const { scope, approver } = await openHandoff(t);
    await setSource(t, scope, approver, "site", "https://acme.com");
    await recordGroup(t, scope, "name", "found", [siteItem(uuid(), "Acme")]);
    await recordGroup(t, scope, "logo", "not_found");
    await recordGroup(t, scope, "colors", "found", [siteItem(uuid(), "#112233")]);
    await recordGroup(t, scope, "fonts", "found", [siteItem(uuid(), "Inter")]);
    const foundId = uuid();
    await recordGroup(t, scope, "networks", "found", [siteItem(foundId, "acme.site.found", { platform: "instagram" })]);

    let row = await currentHandoff(t, scope);
    // Provisional: captured, but not yet a decision.
    expect(row.captured.networks?.[0]).toMatchObject({ id: foundId, origin: "site" });
    expect(row.decisions.networks).toBeUndefined();
    expect(row.readsUsed).toBe(1);

    // Identity -> networks
    const confirmIdentity = await executeCommand(t.deps, { actor: approver, workspaceId: scope.workspaceId, accountId: scope.accountId }, {
      type: "handoff_confirm_identity",
      payload: { expectedStep: row.step, expectedVersion: row.version, name: "Acme", logo: null, colors: ["#112233"], fonts: ["Inter"], paletteChoice: "site" },
    });
    expect(confirmIdentity.ok).toBe(true);
    row = await currentHandoff(t, scope);
    expect(row.step).toBe("networks");

    const confirmNetworks = await executeCommand(t.deps, { actor: approver, workspaceId: scope.workspaceId, accountId: scope.accountId }, {
      type: "handoff_confirm_networks",
      payload: { expectedStep: row.step, expectedVersion: row.version, kept: [foundId], added: [] },
    });
    expect(confirmNetworks.ok).toBe(true);
    row = await currentHandoff(t, scope);
    expect(row.decisions.networks).toEqual([expect.objectContaining({ id: foundId })]);
    // Confirming it spent one more reading (it was never read before confirmation).
    expect(row.readsUsed).toBe(2);
    expect(row.reading.colors?.status).toBe("pending");
    expect(row.reading.images?.status).toBe("pending");
    // The site step already advances past networks once the read is dispatched.
    expect(row.step).not.toBe("networks");
  });

  it("accepts at most one confirmed Instagram profile", async () => {
    const t = makeTestDeps();
    const { scope, approver } = await openHandoff(t);
    await setSource(t, scope, approver, "instagram", "acme.oficial");
    await recordGroup(t, scope, "name", "found", [igItem(uuid(), "Acme")]);
    await recordGroup(t, scope, "logo", "not_found");
    await recordGroup(t, scope, "colors", "found", [igItem(uuid(), "#445566")]);
    await recordGroup(t, scope, "fonts", "not_found");
    let row = await currentHandoff(t, scope);
    await executeCommand(t.deps, { actor: approver, workspaceId: scope.workspaceId, accountId: scope.accountId }, {
      type: "handoff_confirm_identity",
      payload: { expectedStep: row.step, expectedVersion: row.version, name: "Acme", logo: null, colors: ["#445566"], fonts: [], paletteChoice: "instagram" },
    });
    row = await currentHandoff(t, scope);
    const rejected = await executeCommand(t.deps, { actor: approver, workspaceId: scope.workspaceId, accountId: scope.accountId }, {
      type: "handoff_confirm_networks",
      payload: {
        expectedStep: row.step, expectedVersion: row.version,
        kept: [], added: [{ platform: "instagram", value: "acme.oficial" }, { platform: "instagram", value: "outra.marca" }],
      },
    });
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) expect(rejected.error.code).toBe("invalid_command");
  });
});

describe("handoff: swapping the confirmed Instagram handle", () => {
  it("spends a new reading and assigns a fresh run for the affected groups", async () => {
    const t = makeTestDeps();
    const { scope, approver } = await openHandoff(t);
    await setSource(t, scope, approver, "instagram", "acme.oficial");
    await recordGroup(t, scope, "name", "found", [igItem(uuid(), "Acme")]);
    await recordGroup(t, scope, "logo", "not_found");
    const colorId = uuid();
    await recordGroup(t, scope, "colors", "found", [igItem(colorId, "#445566")]);
    await recordGroup(t, scope, "fonts", "not_found");
    let row = await currentHandoff(t, scope);
    const oldColorsRunId = row.reading.colors!.runId;
    await executeCommand(t.deps, { actor: approver, workspaceId: scope.workspaceId, accountId: scope.accountId }, {
      type: "handoff_confirm_identity",
      payload: { expectedStep: row.step, expectedVersion: row.version, name: "Acme", logo: null, colors: ["#445566"], fonts: [], paletteChoice: "instagram" },
    });
    row = await currentHandoff(t, scope);
    expect(row.readsUsed).toBe(1);

    const swapped = await executeCommand(t.deps, { actor: approver, workspaceId: scope.workspaceId, accountId: scope.accountId }, {
      type: "handoff_confirm_networks",
      payload: { expectedStep: row.step, expectedVersion: row.version, kept: [], added: [{ platform: "instagram", value: "nova.marca" }] },
    });
    expect(swapped.ok).toBe(true);
    row = await currentHandoff(t, scope);
    expect(row.readsUsed).toBe(2);
    expect(row.source).toMatchObject({ kind: "instagram", normalized: "nova.marca" });
    // A full restart on an Instagram-only source: fresh identity/captured/decisions and a new run.
    expect(row.reading.colors!.runId).not.toBe(oldColorsRunId);
    expect(row.captured.colors ?? []).toEqual([]);
    expect(row.decisions.identity).toBeUndefined();
  });
});

describe("handoff: a failed group does not block the others and can be retried", () => {
  it("marks the group failed with its error, still lets siblings progress, and retry spends another reading", async () => {
    const t = makeTestDeps();
    const { scope, approver } = await openHandoff(t);
    await setSource(t, scope, approver, "site", "https://acme.com");
    const failed = await recordGroup(t, scope, "name", "failed", [], "timeout");
    expect(failed.ok).toBe(true);
    await recordGroup(t, scope, "logo", "found", [siteItem(uuid(), "logo.png")]);
    await recordGroup(t, scope, "colors", "found", [siteItem(uuid(), "#112233")]);
    await recordGroup(t, scope, "fonts", "found", [siteItem(uuid(), "Inter")]);

    let row = await currentHandoff(t, scope);
    expect(row.reading.name).toMatchObject({ status: "failed", error: "timeout" });
    // identityReady requires name to have been FOUND, not merely finished.
    expect(row.step).toBe("reading");
    expect(row.readsUsed).toBe(1);

    const retry = await executeCommand(t.deps, { actor: approver, workspaceId: scope.workspaceId, accountId: scope.accountId }, {
      type: "handoff_retry_reading",
      payload: { expectedStep: row.step, expectedVersion: row.version },
    });
    expect(retry.ok).toBe(true);
    row = await currentHandoff(t, scope);
    expect(row.readsUsed).toBe(2);
    // Retrying restarts the whole reading (fresh readingId/groups).
    expect(row.reading.name?.status).toBe("pending");
  });

  it("refuses to retry when there is no failed group", async () => {
    const t = makeTestDeps();
    const { scope, approver } = await openHandoff(t);
    await setSource(t, scope, approver, "site", "https://acme.com");
    const row = await currentHandoff(t, scope);
    const retry = await executeCommand(t.deps, { actor: approver, workspaceId: scope.workspaceId, accountId: scope.accountId }, {
      type: "handoff_retry_reading",
      payload: { expectedStep: row.step, expectedVersion: row.version },
    });
    expect(retry.ok).toBe(false);
    if (!retry.ok) expect(retry.error.code).toBe("invalid_transition");
  });
});

describe("handoff: reading limit of 3 new triggers per account", () => {
  it("counts a charged failure toward the limit and blocks the 4th trigger", async () => {
    const t = makeTestDeps();
    const { scope, approver } = await openHandoff(t);
    await setSource(t, scope, approver, "site", "https://acme.com");
    for (let i = 0; i < 2; i += 1) {
      const row = await currentHandoff(t, scope);
      await recordGroup(t, scope, "name", "failed", [], "boom");
      const retry = await executeCommand(t.deps, { actor: approver, workspaceId: scope.workspaceId, accountId: scope.accountId }, {
        type: "handoff_retry_reading",
        payload: { expectedStep: row.step, expectedVersion: row.version },
      });
      expect(retry.ok).toBe(true);
    }
    const row = await currentHandoff(t, scope);
    expect(row.readsUsed).toBe(3);
    const blocked = await executeCommand(t.deps, { actor: approver, workspaceId: scope.workspaceId, accountId: scope.accountId }, {
      type: "handoff_retry_reading",
      payload: { expectedStep: row.step, expectedVersion: row.version },
    });
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.error.code).toBe("reading_limit");
  });

  it("recording a group's result never spends a reading (consulting the same run is free)", async () => {
    const t = makeTestDeps();
    const { scope, approver } = await openHandoff(t);
    await setSource(t, scope, approver, "site", "https://acme.com");
    await recordGroup(t, scope, "name", "found", [siteItem(uuid(), "Acme")]);
    await recordGroup(t, scope, "logo", "found", [siteItem(uuid(), "logo.png")]);
    const row = await currentHandoff(t, scope);
    expect(row.readsUsed).toBe(1);
  });
});

describe("handoff: double click (stale version)", () => {
  it("rejects a command carrying a version the state has already moved past", async () => {
    const t = makeTestDeps();
    const { scope, approver } = await openHandoff(t);
    const row = await currentHandoff(t, scope);
    const first = await setSource(t, scope, approver, "site", "https://acme.com");
    expect(first.ok).toBe(true);
    // A second click sends the same, now-stale, expectedStep/expectedVersion.
    const second = await executeCommand(t.deps, { actor: approver, workspaceId: scope.workspaceId, accountId: scope.accountId }, {
      type: "handoff_set_source",
      payload: { expectedStep: row.step, expectedVersion: row.version, kind: "site", value: "https://acme.com" },
    });
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error.code).toBe("stale_version");
  });

  it("rejects a mismatched expectedStep even with the right version", async () => {
    const t = makeTestDeps();
    const { scope, approver } = await openHandoff(t);
    const row = await currentHandoff(t, scope);
    const outcome = await executeCommand(t.deps, { actor: approver, workspaceId: scope.workspaceId, accountId: scope.accountId }, {
      type: "handoff_set_source",
      payload: { expectedStep: "identity", expectedVersion: row.version, kind: "site", value: "https://acme.com" },
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.error.code).toBe("stale_version");
  });
});

describe("handoff: a late result from a discarded reading is ignored", () => {
  it("ignores a record for a readingId that is no longer current", async () => {
    const t = makeTestDeps();
    const { scope, approver } = await openHandoff(t);
    await setSource(t, scope, approver, "site", "https://acme.com");
    const stale = await currentHandoff(t, scope);
    const staleGroup = stale.reading.name!;

    // The person corrects the address before the first reading finishes: a new readingId is minted.
    const changed = await setSource(t, scope, approver, "site", "https://acme-novo.com");
    expect(changed.ok).toBe(true);
    const fresh = await currentHandoff(t, scope);
    expect(fresh.readingId).not.toBe(stale.readingId);

    const lateResult = await executeCommand(t.deps, { actor: READER, workspaceId: scope.workspaceId, accountId: scope.accountId }, {
      type: "handoff_record_group",
      payload: {
        readingId: stale.readingId!, runId: staleGroup.runId, taskIntentId: staleGroup.taskIntentId, group: "name",
        result: { status: "found", items: [siteItem(uuid(), "Old Acme")] },
      },
    });
    expect(lateResult.ok).toBe(true);
    if (lateResult.ok) expect(lateResult.value.data).toEqual({ ignored: true });

    const after = await currentHandoff(t, scope);
    expect(after).toEqual(fresh);
  });

  it("ignores a result whose runId does not match the group's current run", async () => {
    const t = makeTestDeps();
    const { scope, approver } = await openHandoff(t);
    await setSource(t, scope, approver, "site", "https://acme.com");
    const row = await currentHandoff(t, scope);
    const outcome = await executeCommand(t.deps, { actor: READER, workspaceId: scope.workspaceId, accountId: scope.accountId }, {
      type: "handoff_record_group",
      payload: {
        readingId: row.readingId!, runId: uuid(), taskIntentId: row.reading.name!.taskIntentId, group: "name",
        result: { status: "found", items: [siteItem(uuid(), "Acme")] },
      },
    });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.value.data).toEqual({ ignored: true });
    expect((await currentHandoff(t, scope)).reading.name?.status).toBe("pending");
  });
});

describe("handoff: handoff_record_group is system/job only", () => {
  it("refuses the approver and any actor whose system job does not match the reading event", async () => {
    const t = makeTestDeps();
    const { scope, approver } = await openHandoff(t);
    await setSource(t, scope, approver, "site", "https://acme.com");
    const row = await currentHandoff(t, scope);
    const payload = {
      readingId: row.readingId!, runId: row.reading.name!.runId, taskIntentId: row.reading.name!.taskIntentId, group: "name" as const,
      result: { status: "found" as const, items: [siteItem(uuid(), "Acme")] },
    };
    const byApprover = await executeCommand(t.deps, { actor: approver, workspaceId: scope.workspaceId, accountId: scope.accountId }, { type: "handoff_record_group", payload });
    expect(byApprover.ok).toBe(false);
    const byWrongJob = await executeCommand(t.deps, { actor: { kind: "system", job: "reminders" }, workspaceId: scope.workspaceId, accountId: scope.accountId }, { type: "handoff_record_group", payload });
    expect(byWrongJob.ok).toBe(false);
    expect((await currentHandoff(t, scope)).reading.name?.status).toBe("pending");
  });
});

describe("handoff: summary is blocked while any group is pending, and back returns from summary", () => {
  async function reachSummary(t: Deps) {
    const { scope, approver } = await openHandoff(t);
    await setSource(t, scope, approver, "site", "https://acme.com");
    await recordGroup(t, scope, "name", "found", [siteItem(uuid(), "Acme")]);
    await recordGroup(t, scope, "logo", "not_found");
    await recordGroup(t, scope, "colors", "found", [siteItem(uuid(), "#112233")]);
    await recordGroup(t, scope, "fonts", "found", [siteItem(uuid(), "Inter")]);
    let row = await currentHandoff(t, scope);
    await executeCommand(t.deps, { actor: approver, workspaceId: scope.workspaceId, accountId: scope.accountId }, {
      type: "handoff_confirm_identity",
      payload: { expectedStep: row.step, expectedVersion: row.version, name: "Acme", logo: null, colors: ["#112233"], fonts: ["Inter"], paletteChoice: "site" },
    });
    row = await currentHandoff(t, scope);
    await recordGroup(t, scope, "networks", "not_found");
    row = await currentHandoff(t, scope);
    await executeCommand(t.deps, { actor: approver, workspaceId: scope.workspaceId, accountId: scope.accountId }, {
      type: "handoff_confirm_networks",
      payload: { expectedStep: row.step, expectedVersion: row.version, kept: [], added: [] },
    });
    return { t, scope, approver };
  }

  it("blocks confirming images (and so reaching summary) while the images group is still pending", async () => {
    const t = makeTestDeps();
    const { scope, approver } = await reachSummary(t);
    const row = await currentHandoff(t, scope);
    expect(row.step).toBe("images");
    expect(row.reading.images?.status).toBe("pending");
    const confirmImages = await executeCommand(t.deps, { actor: approver, workspaceId: scope.workspaceId, accountId: scope.accountId }, {
      type: "handoff_confirm_images",
      payload: { expectedStep: row.step, expectedVersion: row.version, kept: [], removed: [], uploaded: [] },
    });
    expect(confirmImages.ok).toBe(false);
    if (!confirmImages.ok) expect(confirmImages.error.code).toBe("invalid_transition");

    // A summary command submitted early (still on the images step) is rejected the same way.
    const summary = await executeCommand(t.deps, { actor: approver, workspaceId: scope.workspaceId, accountId: scope.accountId }, {
      type: "handoff_confirm_summary",
      payload: { expectedStep: row.step, expectedVersion: row.version },
    });
    expect(summary.ok).toBe(false);
    if (!summary.ok) expect(summary.error.code).toBe("invalid_transition");
  });

  it("lets the approver go back from summary to any brand step, and forward again", async () => {
    const t = makeTestDeps();
    const { scope, approver } = await reachSummary(t);
    await recordGroup(t, scope, "images", "not_found");
    let row = await currentHandoff(t, scope);
    const confirmImages = await executeCommand(t.deps, { actor: approver, workspaceId: scope.workspaceId, accountId: scope.accountId }, {
      type: "handoff_confirm_images",
      payload: { expectedStep: row.step, expectedVersion: row.version, kept: [], removed: [], uploaded: [] },
    });
    expect(confirmImages.ok).toBe(true);
    row = await currentHandoff(t, scope);
    expect(row.step).toBe("summary");

    const back = await executeCommand(t.deps, { actor: approver, workspaceId: scope.workspaceId, accountId: scope.accountId }, {
      type: "handoff_back_to",
      payload: { expectedStep: row.step, expectedVersion: row.version, step: "images" },
    });
    expect(back.ok).toBe(true);
    row = await currentHandoff(t, scope);
    expect(row.step).toBe("images");

    // handoff_back_to only works FROM summary.
    const invalid = await executeCommand(t.deps, { actor: approver, workspaceId: scope.workspaceId, accountId: scope.accountId }, {
      type: "handoff_back_to",
      payload: { expectedStep: row.step, expectedVersion: row.version, step: "source" },
    });
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) expect(invalid.error.code).toBe("invalid_transition");
  });
});

describe("handoff: outbox atomicity for the reading task", () => {
  it("records the reading intent in the same transaction as the state change, and sends it only after commit", async () => {
    const sent: Array<{ id: string; name: string; data: Record<string, unknown> }> = [];
    const t = makeTestDeps();
    t.deps.sendTaskEvent = async (e) => { sent.push(e); };
    const { scope, approver } = await openHandoff(t);
    const outcome = await setSource(t, scope, approver, "site", "https://acme.com");
    expect(outcome.ok).toBe(true);
    const [intent] = await t.deps.uow.repos.taskOutbox.list(scope);
    expect(intent!.eventName).toBe(HANDOFF_READ_EVENT);
    expect(intent!.dispatchedAt).toBeInstanceOf(Date);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.name).toBe(HANDOFF_READ_EVENT);
  });

  it("rolls back the reading intent (and the state change) when the command fails, and sends nothing", async () => {
    const sent: unknown[] = [];
    const t = makeTestDeps();
    t.deps.sendTaskEvent = async (e) => { sent.push(e); };
    const { scope, approver } = await openHandoff(t);
    const invalid = await setSource(t, scope, approver, "site", "http://127.0.0.1/");
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) expect(invalid.error.code).toBe("invalid_source");
    expect(await t.deps.uow.repos.taskOutbox.list(scope)).toEqual([]);
    expect(sent).toEqual([]);
    expect((await currentHandoff(t, scope)).step).toBe("source");
  });

  it("keeps a pending, reconciler-visible intent when the transport send itself fails", async () => {
    const t = makeTestDeps();
    t.deps.sendTaskEvent = async () => { throw new Error("inngest down"); };
    const { scope, approver } = await openHandoff(t);
    const outcome = await setSource(t, scope, approver, "site", "https://acme.com");
    expect(outcome.ok).toBe(true);
    const [intent] = await t.deps.uow.repos.taskOutbox.list(scope);
    expect(intent!.dispatchedAt).toBeNull();
    const pending = await t.deps.uow.internal.listPendingTaskIntents();
    expect(pending.some((p) => p.id === intent!.id)).toBe(true);
  });
});

describe("handoff: a name reading that succeeds but finds no name still releases identity (module integration)", () => {
  it("advances to identity so the person can type the name manually (origin user)", async () => {
    const t = makeTestDeps();
    const { scope, approver } = await openHandoff(t);
    await setSource(t, scope, approver, "site", "https://acme.com");
    await recordGroup(t, scope, "name", "not_found");
    await recordGroup(t, scope, "logo", "not_found");
    await recordGroup(t, scope, "colors", "found", [siteItem(uuid(), "#112233")]);
    await recordGroup(t, scope, "fonts", "found", [siteItem(uuid(), "Inter")]);
    let row = await currentHandoff(t, scope);
    expect(row.step).toBe("identity");

    const confirmIdentity = await executeCommand(t.deps, { actor: approver, workspaceId: scope.workspaceId, accountId: scope.accountId }, {
      type: "handoff_confirm_identity",
      payload: { expectedStep: row.step, expectedVersion: row.version, name: "Acme Digitado", logo: null, colors: ["#112233"], fonts: ["Inter"], paletteChoice: "site" },
    });
    expect(confirmIdentity.ok).toBe(true);
    row = await currentHandoff(t, scope);
    expect(row.decisions.identity?.name).toMatchObject({ value: "Acme Digitado", origin: "user" });
  });

  it("still blocks identity when the name group's own reading FAILED, unlike a clean not_found", async () => {
    const t = makeTestDeps();
    const { scope, approver } = await openHandoff(t);
    await setSource(t, scope, approver, "site", "https://acme.com");
    await recordGroup(t, scope, "name", "failed", [], "timeout");
    await recordGroup(t, scope, "logo", "not_found");
    await recordGroup(t, scope, "colors", "found", [siteItem(uuid(), "#112233")]);
    await recordGroup(t, scope, "fonts", "found", [siteItem(uuid(), "Inter")]);
    const row = await currentHandoff(t, scope);
    expect(row.step).toBe("reading");
  });
});

describe("handoff: publicContent — the reader's caption/bio/markdown, kept separate from captured items", () => {
  it("stores content from record_group.result.content, scoped by origin like every other group", async () => {
    const t = makeTestDeps();
    const { scope, approver } = await openHandoff(t);
    await setSource(t, scope, approver, "site", "https://acme.com");
    const row = await currentHandoff(t, scope);
    const nameGroup = row.reading.name!;
    const outcome = await executeCommand(t.deps, { actor: READER, workspaceId: scope.workspaceId, accountId: scope.accountId }, {
      type: "handoff_record_group",
      payload: {
        readingId: row.readingId!, runId: nameGroup.runId, taskIntentId: nameGroup.taskIntentId, group: "name",
        result: { status: "not_found", items: [], content: [siteItem(uuid(), "Somos uma marca de streetwear independente.")] },
      },
    });
    expect(outcome.ok).toBe(true);
    const after = await currentHandoff(t, scope);
    expect(after.captured.publicContent).toEqual([expect.objectContaining({ value: "Somos uma marca de streetwear independente.", origin: "site" })]);
    // No name was captured as an item — only the free-text content.
    expect(after.captured.name ?? []).toEqual([]);
  });
});

describe("handoff: regression — revising the Instagram choice discards everything the rejected profile contributed", () => {
  it("site source: confirm an Instagram profile, pick its palette/images on revision, then swap the @ — the old IG data never survives", async () => {
    const t = makeTestDeps();
    const { scope, approver } = await openHandoff(t);
    const cmd = (type: string, payload: Record<string, unknown>) =>
      executeCommand(t.deps, { actor: approver, workspaceId: scope.workspaceId, accountId: scope.accountId }, { type, payload });

    // 1) Site reading: identity groups finish, plus a provisional Instagram link and a site image.
    await setSource(t, scope, approver, "site", "https://acme.com");
    await recordGroup(t, scope, "name", "found", [siteItem(uuid(), "Acme")]);
    await recordGroup(t, scope, "logo", "not_found");
    await recordGroup(t, scope, "colors", "found", [siteItem(uuid(), "#111111")]);
    await recordGroup(t, scope, "fonts", "found", [siteItem(uuid(), "Inter")]);
    const netSiteId = uuid();
    await recordGroup(t, scope, "networks", "found", [siteItem(netSiteId, "acme.oficial", { platform: "instagram" })]);
    const imgSiteId = uuid();
    // A managed key is required to confirm a kept image (ticket 07 follow-up:
    // keyless captures stay "unavailable" until a real download materializes them).
    await recordGroup(t, scope, "images", "found", [siteItem(imgSiteId, "https://cdn/site.png", { key: "workspaces/ws/site-img.png" })]);

    // 2) First pass: identity with the SITE palette (Instagram isn't confirmed yet, so its palette is not choosable).
    let row = await currentHandoff(t, scope);
    expect(row.step).toBe("identity");
    let out = await cmd("handoff_confirm_identity", { expectedStep: row.step, expectedVersion: row.version, name: "Acme", logo: null, colors: ["#111111"], fonts: ["Inter"], paletteChoice: "site" });
    if (!out.ok) throw new Error(out.error.code);

    // 3) Confirm the Instagram profile found on the site: first confirmation of an unread profile — spends a reading.
    row = await currentHandoff(t, scope);
    expect(row.step).toBe("networks");
    out = await cmd("handoff_confirm_networks", { expectedStep: row.step, expectedVersion: row.version, kept: [netSiteId], added: [] });
    if (!out.ok) throw new Error(out.error.code);
    row = await currentHandoff(t, scope);
    expect(row.step).toBe("images");
    expect(row.readsUsed).toBe(2);

    // Record the just-dispatched Instagram colors/images.
    const igColorId = uuid();
    await recordGroup(t, scope, "colors", "found", [igItem(igColorId, "#222222")]);
    const igImageId = uuid();
    await recordGroup(t, scope, "images", "found", [igItem(igImageId, "https://cdn/ig.png", { key: "workspaces/ws/ig-img.png" })]);

    // 4) Keep both images (site + Instagram), reach summary.
    row = await currentHandoff(t, scope);
    out = await cmd("handoff_confirm_images", { expectedStep: row.step, expectedVersion: row.version, kept: [imgSiteId, igImageId], removed: [], uploaded: [] });
    if (!out.ok) throw new Error(out.error.code);
    row = await currentHandoff(t, scope);
    expect(row.step).toBe("summary");

    // 5) Revise: go back to identity and pick the Instagram palette now that it's confirmed.
    out = await cmd("handoff_back_to", { expectedStep: row.step, expectedVersion: row.version, step: "identity" });
    if (!out.ok) throw new Error(out.error.code);
    row = await currentHandoff(t, scope);
    expect(row.decisions.revising).toBe(true);
    out = await cmd("handoff_confirm_identity", { expectedStep: row.step, expectedVersion: row.version, name: "Acme", logo: null, colors: ["#222222"], fonts: ["Inter"], paletteChoice: "instagram" });
    if (!out.ok) throw new Error(out.error.code);
    row = await currentHandoff(t, scope);
    // Networks and images were unaffected by the identity edit — straight back to summary.
    expect(row.step).toBe("summary");
    expect(row.decisions.identity?.colors[0]).toMatchObject({ value: "#222222", origin: "instagram" });

    // 6) Revise again: go back to networks and swap the confirmed @.
    out = await cmd("handoff_back_to", { expectedStep: row.step, expectedVersion: row.version, step: "networks" });
    if (!out.ok) throw new Error(out.error.code);
    row = await currentHandoff(t, scope);
    out = await cmd("handoff_confirm_networks", { expectedStep: row.step, expectedVersion: row.version, kept: [], added: [{ platform: "instagram", value: "outro.perfil" }] });
    if (!out.ok) throw new Error(out.error.code);
    row = await currentHandoff(t, scope);

    // The swap bounces back to identity (its palette depended on the rejected profile)...
    expect(row.step).toBe("identity");
    expect(row.decisions.needsConfirmation).toEqual(expect.arrayContaining(["identity", "images"]));
    // ...and every trace of the rejected Instagram profile's contribution is gone.
    expect(row.decisions.identity?.colors).toEqual([]);
    expect(row.decisions.images?.kept).toEqual([imgSiteId]);
    expect(row.captured.colors).toEqual([expect.objectContaining({ value: "#111111", origin: "site" })]);
    expect(row.captured.images).toEqual([expect.objectContaining({ id: imgSiteId, origin: "site" })]);
    expect(row.source).toMatchObject({ kind: "site" });
    expect(row.decisions.networks?.[0]).toMatchObject({ value: "outro.perfil", origin: "user" });
    // The new profile is read again (a fresh, charged, partial reading).
    expect(row.reading.colors?.status).toBe("pending");
    expect(row.reading.images?.status).toBe("pending");
    expect(row.readsUsed).toBe(3);
  });
});

describe("handoff: ticket 07 — confirm_summary materializes brand assets and defers R2 cleanup", () => {
  function seedAsset(t: Deps, overrides: {
    key: string; workspaceId: string; clientProfileId?: string | null; source?: string;
    metadata?: Record<string, unknown> | null;
  }) {
    const id = uuid();
    const row = {
      id, workspaceId: overrides.workspaceId, clientProfileId: overrides.clientProfileId ?? null,
      name: "asset", key: overrides.key, type: "image/png", size: 1024,
      width: null, height: null, tags: null, aiDescription: null,
      source: overrides.source ?? "upload", metadata: overrides.metadata ?? null,
      createdAt: new Date(), updatedAt: new Date(),
    };
    t.store.workspaceAssets.rows.set(id, row);
    return row;
  }

  /** Opens a handoff, sets a site source, and returns the scope/approver so the
   * caller can seed workspaceAssets fixtures (which need the real workspaceId)
   * before driving the reading groups and confirmations up to "summary". */
  async function openWithSite(t: Deps) {
    const { scope, approver } = await openHandoff(t);
    await setSource(t, scope, approver, "site", "https://acme.com");
    return { scope, approver };
  }

  /** From a site-sourced handoff already at "reading", records name/logo/colors/fonts,
   * confirms identity with the given logo item id, then records networks/images and
   * confirms networks + images (kept: [imgItemId]), landing on "summary". */
  async function reachSummary(t: Deps, scope: Scope, approver: { kind: "client_person"; role: "approver"; personId: string },
    opts: { logoKey: string; imgKey: string; caption?: string }) {
    const logoItemId = uuid();
    const imgItemId = uuid();
    await recordGroup(t, scope, "name", "found", [siteItem(uuid(), "Acme")]);
    await recordGroup(t, scope, "logo", "found", [siteItem(logoItemId, "https://acme.com/logo.png", { key: opts.logoKey })]);
    await recordGroup(t, scope, "colors", "not_found");
    await recordGroup(t, scope, "fonts", "not_found");
    let row = await currentHandoff(t, scope);
    const confirmIdentity = await executeCommand(t.deps, { actor: approver, workspaceId: scope.workspaceId, accountId: scope.accountId }, {
      type: "handoff_confirm_identity",
      payload: { expectedStep: row.step, expectedVersion: row.version, name: "Acme", logo: logoItemId, colors: [], fonts: [], paletteChoice: "site" },
    });
    if (!confirmIdentity.ok) throw new Error(confirmIdentity.error.code);
    await recordGroup(t, scope, "networks", "not_found");
    await recordGroup(t, scope, "images", "found", [siteItem(imgItemId, "https://acme.com/img1.png", { key: opts.imgKey, ...(opts.caption ? { caption: opts.caption } : {}) })]);
    row = await currentHandoff(t, scope);
    const confirmNetworks = await executeCommand(t.deps, { actor: approver, workspaceId: scope.workspaceId, accountId: scope.accountId }, {
      type: "handoff_confirm_networks", payload: { expectedStep: row.step, expectedVersion: row.version, kept: [], added: [] },
    });
    if (!confirmNetworks.ok) throw new Error(confirmNetworks.error.code);
    row = await currentHandoff(t, scope);
    const confirmImages = await executeCommand(t.deps, { actor: approver, workspaceId: scope.workspaceId, accountId: scope.accountId }, {
      type: "handoff_confirm_images", payload: { expectedStep: row.step, expectedVersion: row.version, kept: [imgItemId], removed: [], uploaded: [] },
    });
    if (!confirmImages.ok) throw new Error(confirmImages.error.code);
    row = await currentHandoff(t, scope);
    expect(row.step).toBe("summary");
    return row;
  }

  function fakeHandoffStorage() {
    const putCalls: string[] = [];
    const deleteCalls: string[] = [];
    return {
      putCalls, deleteCalls,
      handoffStorage: {
        put: async (key: string) => { putCalls.push(key); },
        delete: async (key: string) => { deleteCalls.push(key); },
      },
    };
  }

  it("marks kept assets with the brand/origin, preserves caption and originUrl, and only deletes leftover provisional R2 keys after the commit", async () => {
    const t = makeTestDeps();
    const { scope, approver } = await openWithSite(t);
    const workspaceId = scope.workspaceId;
    const handoffBefore = await currentHandoff(t, scope);
    const logoKey = `workspaces/${workspaceId}/handoff/${handoffBefore.id}/logo.png`;
    const imgKey = `workspaces/${workspaceId}/handoff/${handoffBefore.id}/img1.png`;
    const decoyKey = `workspaces/${workspaceId}/handoff/${handoffBefore.id}/decoy.png`;
    const normalUploadKey = `workspaces/${workspaceId}/assets/normal.png`;
    const otherHandoffKey = `workspaces/${workspaceId}/handoff/other-handoff/decoy.png`;

    seedAsset(t, { key: logoKey, workspaceId, metadata: { provisional: true, handoffId: handoffBefore.id } });
    seedAsset(t, { key: imgKey, workspaceId, metadata: { provisional: true, handoffId: handoffBefore.id } });
    // Never kept by the person — a provisional download from THIS handoff's reading, must be cleaned up.
    seedAsset(t, { key: decoyKey, workspaceId, metadata: { provisional: true, handoffId: handoffBefore.id } });
    // A legitimate upload from another producer, unrelated to the handoff — must survive untouched.
    seedAsset(t, { key: normalUploadKey, workspaceId, source: "upload", metadata: null });
    // A provisional leftover from a DIFFERENT handoff — must survive untouched.
    seedAsset(t, { key: otherHandoffKey, workspaceId, metadata: { provisional: true, handoffId: "other-handoff" } });

    const row = await reachSummary(t, scope, approver, { logoKey, imgKey, caption: "Equipe no escritório" });
    const { deleteCalls, handoffStorage } = fakeHandoffStorage();
    t.deps.handoffStorage = handoffStorage;

    const confirmSummary = await executeCommand(t.deps, { actor: approver, workspaceId: scope.workspaceId, accountId: scope.accountId }, {
      type: "handoff_confirm_summary", payload: { expectedStep: row.step, expectedVersion: row.version },
    });
    expect(confirmSummary.ok).toBe(true);

    // R2 cleanup only ran after the command (and its commit) resolved successfully.
    expect(deleteCalls).toEqual([decoyKey]);

    const after = await currentHandoff(t, scope);
    const assets = [...t.store.workspaceAssets.rows.values()];
    const logoAsset = assets.find(a => a.key === logoKey)!;
    const imgAsset = assets.find(a => a.key === imgKey)!;
    expect(logoAsset).toMatchObject({ clientProfileId: after.clientProfileId, source: "brand_site" });
    expect(logoAsset.metadata).toMatchObject({ provisional: false, originUrl: "https://acme.com/logo.png", handoffId: handoffBefore.id });
    expect(imgAsset).toMatchObject({ clientProfileId: after.clientProfileId, source: "brand_site" });
    expect(imgAsset.metadata).toMatchObject({ provisional: false, originUrl: "https://acme.com/img1.png", caption: "Equipe no escritório" });

    // The decoy row itself is gone from the Library store.
    expect(assets.some(a => a.key === decoyKey)).toBe(false);
    // Untouched: a normal upload without a brand, and another handoff's provisional leftover.
    const normalAsset = assets.find(a => a.key === normalUploadKey)!;
    expect(normalAsset).toMatchObject({ clientProfileId: null, source: "upload" });
    const otherAsset = assets.find(a => a.key === otherHandoffKey)!;
    expect(otherAsset).toMatchObject({ clientProfileId: null });
    expect((otherAsset.metadata as Record<string, unknown>).provisional).toBe(true);
  });

  it("a transaction that fails deletes nothing from R2 and leaves every asset row untouched", async () => {
    const t = makeTestDeps();
    const { scope, approver } = await openWithSite(t);
    const workspaceId = scope.workspaceId;
    const handoffBefore = await currentHandoff(t, scope);
    const logoKey = `workspaces/${workspaceId}/handoff/${handoffBefore.id}/logo.png`;
    const imgKey = `workspaces/${workspaceId}/handoff/${handoffBefore.id}/img1.png`;
    const decoyKey = `workspaces/${workspaceId}/handoff/${handoffBefore.id}/decoy.png`;

    seedAsset(t, { key: logoKey, workspaceId, metadata: { provisional: true, handoffId: handoffBefore.id } });
    // Already claimed by a DIFFERENT brand — materialization must refuse and roll back.
    seedAsset(t, { key: imgKey, workspaceId, clientProfileId: "someone-elses-profile", metadata: { provisional: true, handoffId: handoffBefore.id } });
    seedAsset(t, { key: decoyKey, workspaceId, metadata: { provisional: true, handoffId: handoffBefore.id } });

    const row = await reachSummary(t, scope, approver, { logoKey, imgKey });
    const { deleteCalls, handoffStorage } = fakeHandoffStorage();
    t.deps.handoffStorage = handoffStorage;

    await expect(executeCommand(t.deps, { actor: approver, workspaceId: scope.workspaceId, accountId: scope.accountId }, {
      type: "handoff_confirm_summary", payload: { expectedStep: row.step, expectedVersion: row.version },
    })).rejects.toThrow();

    // Nothing was ever deleted from R2.
    expect(deleteCalls).toEqual([]);

    // The handoff row never advanced past "summary" — the write was rolled back.
    const after = await currentHandoff(t, scope);
    expect(after.step).toBe("summary");
    expect(after.version).toBe(row.version);

    // Every asset row is byte-for-byte as seeded — including the still-provisional decoy.
    const assets = [...t.store.workspaceAssets.rows.values()];
    expect(assets.find(a => a.key === logoKey)).toMatchObject({ clientProfileId: null });
    expect(assets.find(a => a.key === imgKey)).toMatchObject({ clientProfileId: "someone-elses-profile" });
    expect(assets.find(a => a.key === decoyKey)).toMatchObject({ clientProfileId: null });
    expect((assets.find(a => a.key === decoyKey)!.metadata as Record<string, unknown>).provisional).toBe(true);
  });
});

describe("handoff: rereading the current state is idempotent", () => {
  it("reading the handoff row repeatedly never mutates it", async () => {
    const t = makeTestDeps();
    const { scope, approver } = await openHandoff(t);
    await setSource(t, scope, approver, "site", "https://acme.com");
    await recordGroup(t, scope, "name", "found", [siteItem(uuid(), "Acme")]);
    const first = await currentHandoff(t, scope);
    const second = await currentHandoff(t, scope);
    const third = await currentHandoff(t, scope);
    expect(second).toEqual(first);
    expect(third).toEqual(first);
  });
});
