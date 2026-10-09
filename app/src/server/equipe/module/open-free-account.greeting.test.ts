// Task 16 (owner, 09/10): a brand that enters by import (a paying workspace, a brand with a Brand Kit) opens its conversation
// with one short line of the Strategist, written once in the import's transaction by the same event -> message projection the
// free opening line uses. The free plan's opening is unchanged.
import { describe, expect, it } from "vitest";
import { executeCommand } from "./commands";
import { makeTestDeps, uuid } from "./testing/deps";
import { projectConversationEvent } from "./conversation-events";
import { FREE_INTRO_EVENT } from "../handoff/contract";
import { BRAND_IMPORTED_EVENT } from "./open-free-account";

const SYSTEM = { kind: "system", job: "free-open" } as const;
const GREETING = "Oi! Li o Brand Kit da marca CENBRAP e já estou com a identidade dela. Me conte o que você quer criar ou resolver agora.";
type T = ReturnType<typeof makeTestDeps>;

function seedOwner(t: T, workspaceId: string) {
  const userId = `user-${uuid()}`;
  t.store.workspaceMembers.rows.set(uuid(), {
    id: uuid(), workspaceId, userId, name: "Ana Souza", email: "ana@example.com", emailVerified: true,
    role: "owner", createdAt: new Date("2026-01-01T00:00:00.000Z"),
  });
  return userId;
}

const openBrand = (t: T, workspaceId: string, userId: string, clientProfileId: string) =>
  executeCommand(t.deps, { actor: SYSTEM, workspaceId }, { type: "open_free_account", payload: { userId, clientProfileId } });

/** A workspace with one brand that has a Brand Kit; `paying` says whether it pays (tester entitlement, platform owner, subscription). */
function workspaceWithBrand(paying: boolean, name = "CENBRAP") {
  const t = makeTestDeps();
  const workspaceId = uuid();
  const userId = seedOwner(t, workspaceId);
  const brand = uuid();
  t.gateway.addProfile({ id: brand, workspaceId, name, logoAssetKey: "logos/cenbrap.png", brandColors: ["#123456"] });
  t.deps.hasClassicPaidAccess = async () => paying;
  return { t, workspaceId, userId, brand };
}

const messages = (t: T) => [...t.store.assistantMessages.rows.values()];
const greetings = (t: T) => messages(t).filter((message) => message.payload?.handoffStep === "imported");

describe("open_free_account: the Strategist greets a brand that enters by import", () => {
  it("writes one greeting, in pt-BR, naming the brand, in the brand's new conversation, keyed by the import event", async () => {
    const { t, workspaceId, userId, brand } = workspaceWithBrand(true);

    const opened = await openBrand(t, workspaceId, userId, brand);

    if (!opened.ok) throw new Error(opened.error.code);
    expect(opened.value.data).toMatchObject({ created: true, imported: true });
    const scope = { workspaceId, accountId: opened.value.accountId! };
    const [imported] = await t.deps.uow.repos.events.list(scope, { eventType: BRAND_IMPORTED_EVENT });
    expect(imported?.payload).toEqual({ clientProfileId: brand, brandName: "CENBRAP" });
    expect(messages(t)).toEqual([expect.objectContaining({
      id: imported!.id, threadId: opened.value.data!.assistantThreadId, type: "assistant", content: GREETING,
      payload: { handoffStep: "imported", brandName: "CENBRAP" },
    })]);
    // Neither the old name of the product nor the free plan's opening line.
    expect(GREETING).not.toMatch(/\bEquipe\b|Est[uú]dio/);
    expect(await t.deps.uow.repos.events.list(scope, { eventType: FREE_INTRO_EVENT })).toHaveLength(0);
  });

  it("cites the brand as its Brand Kit names it, trimmed", async () => {
    const { t, workspaceId, userId, brand } = workspaceWithBrand(true, "  Café São Jorge  ");
    const opened = await openBrand(t, workspaceId, userId, brand);
    if (!opened.ok) throw new Error(opened.error.code);
    expect(greetings(t)).toEqual([expect.objectContaining({
      content: "Oi! Li o Brand Kit da marca Café São Jorge e já estou com a identidade dela. Me conte o que você quer criar ou resolver agora.",
      payload: { handoffStep: "imported", brandName: "Café São Jorge" },
    })]);
  });

  it("opening the brand again (reopening /) repeats nothing, and neither does delivering the import event again", async () => {
    const { t, workspaceId, userId, brand } = workspaceWithBrand(true);
    const first = await openBrand(t, workspaceId, userId, brand);
    if (!first.ok) throw new Error(first.error.code);

    for (let i = 0; i < 2; i++) {
      const again = await openBrand(t, workspaceId, userId, brand);
      expect(again.ok && again.value.data).toMatchObject({ accountId: first.value.accountId, created: false });
    }
    const scope = { workspaceId, accountId: first.value.accountId! };
    const events = await t.deps.uow.repos.events.list(scope, { eventType: BRAND_IMPORTED_EVENT });
    expect(events).toHaveLength(1);
    // The outbox delivers at least once: the same source event never writes a second message.
    await t.deps.uow.run(async (repos, internal) => {
      const ctx = { repos, internal, actor: SYSTEM, workspaceId, accountId: scope.accountId, now: new Date(), events: [] } as never;
      await projectConversationEvent(ctx, events[0]!);
      await projectConversationEvent(ctx, events[0]!);
    });
    expect(greetings(t)).toHaveLength(1);
    expect(messages(t)).toHaveLength(1);
  });

  it("the free plan does not change: the same brand opens with the opening line and the handoff card, never the greeting", async () => {
    const { t, workspaceId, userId, brand } = workspaceWithBrand(false);
    const opened = await openBrand(t, workspaceId, userId, brand);
    if (!opened.ok) throw new Error(opened.error.code);
    expect(opened.value.data).not.toMatchObject({ imported: true });
    expect(messages(t).map((message) => [message.type, message.payload])).toEqual([
      ["assistant", { handoffStep: "intro" }],
      ["equipe_card", expect.objectContaining({ kind: "handoff", step: "source" })],
    ]);
    expect(await t.deps.uow.repos.events.list({ workspaceId, accountId: opened.value.accountId! }, { eventType: BRAND_IMPORTED_EVENT })).toHaveLength(0);
  });

  it("a paying workspace's brand without a Brand Kit goes through the handoff, never the greeting", async () => {
    const t = makeTestDeps();
    const workspaceId = uuid();
    const userId = seedOwner(t, workspaceId);
    const brand = uuid();
    t.gateway.addProfile({ id: brand, workspaceId, name: "Nova marca" });
    t.deps.hasClassicPaidAccess = async () => true;
    const opened = await openBrand(t, workspaceId, userId, brand);
    if (!opened.ok) throw new Error(opened.error.code);
    expect(greetings(t)).toHaveLength(0);
    expect(messages(t).map((message) => message.payload?.handoffStep ?? message.type)).toEqual(["intro", "equipe_card"]);
  });
});
