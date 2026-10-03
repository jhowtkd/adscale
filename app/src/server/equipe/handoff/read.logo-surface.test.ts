// The plate a captured logo asks for travels in the item (ticket 16): site logo and Instagram avatar, and the strict contract that records it.
import { describe, expect, it } from "vitest";
import { createHandoffReadHandler } from "./read";
import { FakeInstagramReader, FakeSiteReader, type InstagramReadResult, type SiteReadResult } from "./readers";
import { handoffItemSchema, handoffRecordGroupSchema } from "./contract";
import { executeCommand } from "../module/commands";
import { makeTestDeps, uuid } from "../module/testing/deps";
import { HANDOFF_GROUPS, type HandoffState } from "../domain/handoff";

type Deps = ReturnType<typeof makeTestDeps>;
type Scope = { workspaceId: string; accountId: string };
const SYSTEM_OPEN = { kind: "system", job: "free-open" } as const;
const step = { run: async <T>(_id: string, fn: () => Promise<T>) => fn() };

async function openHandoff(t: Deps) {
  const workspaceId = uuid();
  const userId = `user-${uuid()}`;
  t.store.workspaceMembers.rows.set(uuid(), { id: uuid(), workspaceId, userId, name: "Ana", email: "ana@example.com", emailVerified: true, role: "owner", createdAt: new Date("2026-01-01T00:00:00.000Z") });
  const outcome = await executeCommand(t.deps, { actor: SYSTEM_OPEN, workspaceId }, { type: "open_free_account", payload: { userId } });
  if (!outcome.ok) throw new Error(`openHandoff failed: ${outcome.error.code}`);
  const accountId = outcome.value.accountId!;
  const people = await t.deps.uow.repos.people.list({ workspaceId, accountId });
  return { scope: { workspaceId, accountId }, approver: { kind: "client_person", role: "approver", personId: people[0]!.id } as const };
}
async function currentHandoff(t: Deps, scope: Scope): Promise<HandoffState & { id: string }> {
  const [row] = await t.deps.uow.repos.handoffs.list(scope);
  if (!row) throw new Error("no handoff row");
  return row;
}
async function setSource(t: Deps, scope: Scope, approver: { kind: "client_person"; role: "approver"; personId: string }, kind: "site" | "instagram", value: string) {
  const row = await currentHandoff(t, scope);
  const outcome = await executeCommand(t.deps, { actor: approver, workspaceId: scope.workspaceId, accountId: scope.accountId }, { type: "handoff_set_source", payload: { expectedStep: row.step, expectedVersion: row.version, kind, value } });
  if (!outcome.ok) throw new Error(`setSource failed: ${outcome.error.code}`);
}
async function readEvent(t: Deps, scope: Scope) {
  const row = await currentHandoff(t, scope);
  const taskIntentId = row.reading[HANDOFF_GROUPS[0]]!.taskIntentId;
  const runIds = Object.fromEntries(HANDOFF_GROUPS.map(g => [g, row.reading[g]!.runId]));
  return { event: { data: { workspaceId: scope.workspaceId, accountId: scope.accountId, taskIntentId, readingId: row.readingId, source: row.source, groups: [...HANDOFF_GROUPS], runIds } }, step };
}

const siteResult = (logo: unknown): SiteReadResult => ({ title: "T", siteName: "Marca", markdown: "m", links: [], images: [], screenshotUrl: null, statusCode: 200, branding: { logo: logo as never, colors: [], fonts: [] } });
async function readSite(logo: unknown) {
  const t = makeTestDeps();
  const { scope, approver } = await openHandoff(t);
  await setSource(t, scope, approver, "site", "https://acme.com");
  await createHandoffReadHandler(t.deps, { site: new FakeSiteReader(siteResult(logo)), instagram: new FakeInstagramReader() })(await readEvent(t, scope));
  return (await currentHandoff(t, scope)).captured.logo ?? [];
}
const igResult = (extra: Partial<InstagramReadResult>): InstagramReadResult => ({ exists: true, isPrivate: false, name: "Marca", avatarUrl: "https://ig.example/a.png", avatarKey: "k-avatar", avatarAssetId: "asset-avatar", bio: "", posts: [], ...extra });
async function readInstagram(extra: Partial<InstagramReadResult>) {
  const t = makeTestDeps();
  const { scope, approver } = await openHandoff(t);
  await setSource(t, scope, approver, "instagram", "acme.oficial");
  await createHandoffReadHandler(t.deps, { site: new FakeSiteReader(), instagram: new FakeInstagramReader(igResult(extra)) })(await readEvent(t, scope));
  return (await currentHandoff(t, scope)).captured.logo ?? [];
}

describe("the captured site logo", () => {
  it.each(["dark", "light"] as const)("carries surface %s when the reader reports it", async surface => {
    expect(await readSite({ url: "https://r2.example/logo.png", key: "k-logo", assetId: "asset-1", surface })).toEqual([expect.objectContaining({ value: "https://r2.example/logo.png", key: "k-logo", id: "asset-1", origin: "site", surface })]);
  });
  it.each([[undefined], ["purple"], ["DARK"], [""], [null], [1], [{}]] as unknown[][])("has no surface key at all when the reader says %j", async surface => {
    const [item] = await readSite({ url: "https://r2.example/logo.png", key: "k-logo", surface });
    expect(item).toMatchObject({ value: "https://r2.example/logo.png", key: "k-logo" });
    expect("surface" in item!).toBe(false);
  });
});

describe("the captured Instagram avatar", () => {
  it.each(["dark", "light"] as const)("carries surface %s when the reader reports it", async avatarSurface => {
    expect(await readInstagram({ avatarSurface })).toEqual([expect.objectContaining({ value: "https://ig.example/a.png", key: "k-avatar", origin: "instagram", surface: avatarSurface })]);
  });
  it.each([[undefined], ["purple"], [null], [2]] as unknown[][])("has no surface key when the reader says %j", async avatarSurface => {
    const [item] = await readInstagram({ avatarSurface: avatarSurface as never });
    expect(item).toMatchObject({ key: "k-avatar" });
    expect("surface" in item!).toBe(false);
  });
});

describe("handoff_record_group accepts a surface only if it is one", () => {
  const base = { readingId: uuid(), runId: uuid(), taskIntentId: uuid(), group: "logo" as const };
  const withItem = (item: Record<string, unknown>) => handoffRecordGroupSchema.safeParse({ ...base, result: { status: "found", items: [{ id: "a", value: "https://x/logo.png", origin: "site", ...item }] } });

  it.each(["dark", "light"])("accepts %s", surface => expect(withItem({ surface }).success).toBe(true));
  it.each([["purple"], ["DARK"], [""], [null], [1], [{}]])("rejects %j", surface => expect(withItem({ surface }).success).toBe(false));
  it("an item without surface stays valid", () => expect(withItem({}).success).toBe(true));
  it("the item schema stays strict: another stray key is still refused", () => {
    expect(handoffItemSchema.safeParse({ id: "a", value: "v", origin: "site", plate: "dark" }).success).toBe(false);
  });
  it("the content items accept a surface like the others", () => {
    const parsed = handoffRecordGroupSchema.safeParse({ ...base, result: { status: "found", items: [], content: [{ id: "a", value: "v", origin: "site", surface: "dark" }] } });
    expect(parsed.success).toBe(true);
  });

  it("through the command: a recorded item keeps its surface, and a bad one is refused before anything is written", async () => {
    const t = makeTestDeps();
    const { scope, approver } = await openHandoff(t);
    await setSource(t, scope, approver, "site", "https://acme.com");
    const row = await currentHandoff(t, scope);
    const g = row.reading.logo!;
    const record = (surface: unknown) => executeCommand(t.deps, { actor: { kind: "system", job: "equipe.handoff.read" }, workspaceId: scope.workspaceId, accountId: scope.accountId }, {
      type: "handoff_record_group",
      payload: { readingId: row.readingId!, runId: g.runId, taskIntentId: g.taskIntentId, group: "logo", result: { status: "found", items: [{ id: "a", value: "https://x/logo.png", origin: "site", surface }] } },
    } as never);
    const refused = await record("purple");
    expect(refused.ok).toBe(false);
    expect((await currentHandoff(t, scope)).captured.logo ?? []).toEqual([]);
    expect((await record("dark")).ok).toBe(true);
    expect((await currentHandoff(t, scope)).captured.logo).toEqual([expect.objectContaining({ surface: "dark" })]);
  });
});

// Ticket 17: a site whose pictures were all refused (too big to open, a lying header, a file that is not the picture it says) is a site with no pictures found, not a failed reading.
describe("images that were refused are 'not found', never a failed reading", () => {
  async function readWithErrors(groupErrors: NonNullable<SiteReadResult["groupErrors"]>) {
    const t = makeTestDeps();
    const { scope, approver } = await openHandoff(t);
    await setSource(t, scope, approver, "site", "https://acme.com");
    await createHandoffReadHandler(t.deps, { site: new FakeSiteReader({ ...siteResult(undefined), groupErrors }), instagram: new FakeInstagramReader() })(await readEvent(t, scope));
    const row = await currentHandoff(t, scope);
    return Object.fromEntries(HANDOFF_GROUPS.map(group => [group, { status: row.reading[group]!.status, error: row.reading[group]!.error }]));
  }
  it("images_not_found records the images as not found, with the reason, and the other groups are not touched", async () => {
    const groups = await readWithErrors({ images: "images_not_found" });
    expect(groups.images).toMatchObject({ status: "not_found", error: "images_not_found" });
    expect(groups.logo!.status).not.toBe("failed");
  });
  it("logo_unsupported_format (a logo whose file was refused) is not found too, and a download that failed still fails the group", async () => {
    expect((await readWithErrors({ logo: "logo_unsupported_format" })).logo).toMatchObject({ status: "not_found" });
    expect((await readWithErrors({ images: "image_download_failed" })).images).toMatchObject({ status: "failed" });
  });
});
