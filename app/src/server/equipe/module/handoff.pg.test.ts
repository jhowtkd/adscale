/**
 * handoff_* commands against a REAL Postgres, with two independent
 * connections and a deterministic lock barrier (never a sleep) — same
 * pattern as item-decisions-concurrency.pg.test.ts, applied to the account
 * row that `runHandoffCommand` locks with `for no key update`.
 *
 *   TEST_DATABASE_URL=postgresql://jhonatan@localhost:5432/fluxo0_ticket04_test npm test -- src/server/equipe/module/handoff.pg.test.ts
 */
import { afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { readFileSync } from "node:fs";
import type { EquipeUnitOfWork } from "../data";
import { resolveEquipeTestDatabaseUrl } from "../data/test-database";
import { HANDOFF_READ_EVENT } from "../handoff/contract";

const TEST_DATABASE_URL = resolveEquipeTestDatabaseUrl();
if (TEST_DATABASE_URL) process.env.DATABASE_URL = TEST_DATABASE_URL;

const READER = { kind: "system", job: HANDOFF_READ_EVENT } as const;
const SYSTEM_OPEN = { kind: "system", job: "free-open" } as const;

type Fixture = Awaited<ReturnType<typeof createFixture>>;
let activeFixture: Fixture | null = null;

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

async function createFixture() {
  if (!TEST_DATABASE_URL) throw new Error("Equipe Postgres test database is not configured");
  const [{ Pool }, { drizzle }, schema, equipeSchema, { createPostgresEquipeUnitOfWork },
    { makeTestDeps }, { executeCommand }] = await Promise.all([
    import("pg"), import("drizzle-orm/node-postgres"), import("@/server/db/schema"),
    import("@/server/db/equipe-schema"), import("../data/postgres"),
    import("./testing/deps"), import("./commands"),
  ]);
  const poolA = new Pool({ connectionString: TEST_DATABASE_URL, max: 1 });
  const poolB = new Pool({ connectionString: TEST_DATABASE_URL, max: 1 });
  const clientA = await poolA.connect();
  const clientB = await poolB.connect();
  const dbA = drizzle(clientA, { schema: { ...schema, ...equipeSchema } });
  const dbB = drizzle(clientB, { schema: { ...schema, ...equipeSchema } });
  const uowA = createPostgresEquipeUnitOfWork(dbA);
  const uowB = createPostgresEquipeUnitOfWork(dbB);
  const t = makeTestDeps();
  t.deps.uow = uowA;
  const workspaceId = crypto.randomUUID();
  const tag = `handoff-pg-${workspaceId}`;
  const userId = `handoff-${workspaceId}`;
  await dbA.insert(schema.user).values({ id: userId, name: tag, email: `${userId}@example.test`, emailVerified: true });
  await dbA.insert(schema.workspaces).values({ id: workspaceId, name: tag, slug: tag });
  await dbA.insert(schema.workspaceMembers).values({ workspaceId, userId });
  const opened = await executeCommand(t.deps, { actor: SYSTEM_OPEN, workspaceId }, { type: "open_free_account", payload: { userId } });
  if (!opened.ok) throw new Error(`open_free_account failed: ${opened.error.code}`);
  const accountId = opened.value.accountId!;
  const scope = { workspaceId, accountId };
  const [person] = await uowA.repos.people.list(scope);
  if (!person) throw new Error("missing approver person");
  const approver = { kind: "client_person" as const, role: "approver" as const, personId: person.id };
  const second = { ...t, deps: { ...t.deps, uow: uowB } };
  const [pidA, pidB] = await Promise.all([
    clientA.query<{ pid: number }>("select pg_backend_pid() as pid"),
    clientB.query<{ pid: number }>("select pg_backend_pid() as pid"),
  ]);
  return {
    poolA, poolB, clientA, clientB, dbA, dbB, schema, equipeSchema, t, second, executeCommand,
    workspaceId, accountId, scope, approver, userId,
    pidA: pidA.rows[0]!.pid, pidB: pidB.rows[0]!.pid,
  };
}

/** Pauses the command right after it takes `for no key update` on the account row. */
function pauseAfterLockedAccount(uow: EquipeUnitOfWork, accountId: string) {
  const entered = deferred();
  const proceed = deferred();
  let paused = false;
  const wrapped: EquipeUnitOfWork = {
    ...uow,
    run: (fn) => uow.run((repos, internal) => {
      const get = repos.accounts.get.bind(repos.accounts);
      const accounts = {
        ...repos.accounts,
        get: async (...args: Parameters<typeof get>) => {
          const row = await get(...args);
          if (!paused && args[1] === accountId && args[2]?.forUpdate) {
            paused = true;
            entered.resolve();
            await proceed.promise;
          }
          return row;
        },
      };
      return fn({ ...repos, accounts }, internal);
    }),
  };
  return { uow: wrapped, entered: entered.promise, proceed: proceed.resolve };
}

async function waitUntilBlocked(client: Fixture["clientA"], pid: number) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const result = await client.query<{ wait_event_type: string | null; blockers: number[] }>(
      "select wait_event_type, pg_blocking_pids(pid) as blockers from pg_stat_activity where pid = $1",
      [pid],
    );
    const row = result.rows[0];
    if (row?.wait_event_type === "Lock" && row.blockers.length > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("command did not wait on the other PostgreSQL connection's account lock");
}

/** Like waitUntilBlocked, but for a caller (createHandoffWorkspaceAsset) that
 * borrows a connection from the app's own pool instead of a fixture pool, so
 * its backend pid is not known ahead of time — probes for ANY backend
 * currently blocked by `blockerPid`'s lock. */
async function waitUntilAnyBlockedBy(client: Fixture["clientA"], blockerPid: number) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const result = await client.query<{ pid: number }>(
      "select pid from pg_stat_activity where wait_event_type = 'Lock' and $1 = any(pg_blocking_pids(pid))",
      [blockerPid],
    );
    if (result.rows.length > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("no connection blocked on the holder's account lock");
}

/** Runs `first` on the primary connection, pauses it right after it locks the
 * account row, starts `second` on the independent connection, confirms it is
 * genuinely BLOCKED on that same lock (never a sleep-based guess), then lets
 * `first` proceed and resolves both. */
async function contend(
  f: Fixture,
  first: (deps: Fixture["t"]["deps"]) => Promise<unknown>,
  second: (deps: Fixture["second"]["deps"]) => Promise<unknown>,
) {
  const originalUow = f.t.deps.uow;
  const barrier = pauseAfterLockedAccount(originalUow, f.accountId);
  f.t.deps.uow = barrier.uow;
  const firstResult = first(f.t.deps);
  await barrier.entered;
  const secondResult = second(f.second.deps);
  try {
    // Probed from clientA, not clientB: clientB's single connection is itself
    // busy waiting on the lock, so it cannot answer a query about its own state.
    await waitUntilBlocked(f.clientA, f.pidB);
    barrier.proceed();
    return await Promise.all([firstResult, secondResult]);
  } finally {
    barrier.proceed();
    f.t.deps.uow = originalUow;
  }
}

afterEach(async () => {
  const f = activeFixture;
  activeFixture = null;
  if (!f) return;
  try {
    await f.dbA.delete(f.schema.workspaces).where(eq(f.schema.workspaces.id, f.workspaceId));
    await f.dbA.delete(f.schema.user).where(eq(f.schema.user.id, f.userId));
  } finally {
    f.clientA.release();
    f.clientB.release();
    await Promise.all([f.poolA.end(), f.poolB.end()]);
  }
});

describe.skipIf(!TEST_DATABASE_URL)("handoff commands, two independent Postgres connections (ticket 04)", () => {
  async function setup() {
    const f = await createFixture();
    activeFixture = f;
    return f;
  }

  /** Drives the fixture's fresh handoff row through handoff_set_source, so reading groups exist. */
  async function withSource(f: Fixture) {
    const [row] = await f.t.deps.uow.repos.handoffs.list(f.scope);
    const out = await f.executeCommand(f.t.deps, { actor: f.approver, workspaceId: f.workspaceId, accountId: f.accountId }, {
      type: "handoff_set_source", payload: { expectedStep: row!.step, expectedVersion: row!.version, kind: "site", value: "https://acme.com" },
    });
    if (!out.ok) throw new Error(`handoff_set_source failed: ${out.error.code}`);
    const [after] = await f.t.deps.uow.repos.handoffs.list(f.scope);
    return after!;
  }

  it("ticket 07: SQL kinds match the UI classification and always prioritize the profile logo across pages", async () => {
    const f = await setup();
    const [account] = await f.t.deps.uow.repos.accounts.list(f.workspaceId);
    const profileId = account!.clientProfileId;
    const logoKey = `workspaces/${f.workspaceId}/logo.png`;
    await f.dbA.update(f.schema.clientProfiles).set({ logoAssetKey: logoKey }).where(eq(f.schema.clientProfiles.id, profileId));
    const cases = [
      { name: "Official mark", key: logoKey, metadata: { kind: "site_page" }, createdAt: new Date("2020-01-01") },
      { name: "Brand mark", metadata: { kind: "brand_logo" } },
      { name: "Tagged mark", tags: ["LoGo"] },
      { name: "Legacy LOGO" },
      { name: "Generated logo", source: "creative_work", tags: ["logo"] },
      { name: "Instagram logo post", source: "brand_instagram", metadata: { category: "logo" } },
      // Explicit Instagram avatar kind (ticket 07 review follow-up): classified as
      // logo by metadata.kind alone, with no logoAssetKey match and no "logo" text.
      { name: "Avatar", source: "brand_instagram", metadata: { kind: "instagram_avatar" } },
      { name: "Public page", type: "text/markdown", metadata: { kind: "site_page" } },
      { name: "Product", metadata: { category: "PRODUCT" } },
      { name: "Font", type: "font/woff2" },
      ...Array.from({ length: 25 }, (_, index) => ({ name: `Photo ${index}` })),
    ];
    const rows = await f.dbA.insert(f.schema.workspaceAssets).values(cases.map((fixture, index) => ({
      workspaceId: f.workspaceId, clientProfileId: profileId, size: 1, type: "image/png", source: "brand_site",
      key: `workspaces/${f.workspaceId}/${index}.png`, ...fixture,
    }))).returning();
    await f.dbA.insert(f.schema.workspaceAssets).values({ workspaceId: f.workspaceId, clientProfileId: profileId,
      name: "Hidden provisional", key: `workspaces/${f.workspaceId}/hidden.png`, size: 1, type: "image/png", metadata: { provisional: true } });
    const [{ getWorkspaceAssets, getWorkspaceAssetsCount }, { mapWorkspaceAssetToV6 }] = await Promise.all([
      import("@/server/repositories/workspace-asset"), import("@/components/library/v6/map-library-v6"),
    ]);
    const mapped = rows.map(row => ({ row, kind: mapWorkspaceAssetToV6({ ...row, url: "", createdAt: row.createdAt.toISOString() }, 0, String, String, logoKey).kind }));
    for (const kind of ["identity", "images", "post", "page"] as const) {
      // "images" is exclusive of logo/post/page (SQL+UI parity, PR 610 review follow-up).
      const expected = mapped.filter(({ row, kind: classified }) => kind === "identity" ? classified === "logo" || row.type.startsWith("font/")
        : kind === "page" ? classified === "page"
        : kind === "post" ? row.type.startsWith("image/") && classified === "post"
        : row.type.startsWith("image/") && !["logo", "post", "page"].includes(classified));
      const actual = await getWorkspaceAssets(f.workspaceId, { clientProfileId: profileId, kind, limit: 100 });
      expect(actual.map(row => row.id).sort()).toEqual(expected.map(({ row }) => row.id).sort());
      expect(await getWorkspaceAssetsCount(f.workspaceId, { clientProfileId: profileId, kind })).toBe(expected.length);
    }
    // Explicit assertion for the Instagram avatar: classified logo by both the
    // mapper and the SQL kind filters, never as a "post" despite its source.
    const avatarRow = rows.find(row => row.name === "Avatar")!;
    expect(mapped.find(({ row }) => row.id === avatarRow.id)?.kind).toBe("logo");
    const identityIds = (await getWorkspaceAssets(f.workspaceId, { clientProfileId: profileId, kind: "identity", limit: 100 })).map(row => row.id);
    const imagesIds = (await getWorkspaceAssets(f.workspaceId, { clientProfileId: profileId, kind: "images", limit: 100 })).map(row => row.id);
    const postIds = (await getWorkspaceAssets(f.workspaceId, { clientProfileId: profileId, kind: "post", limit: 100 })).map(row => row.id);
    expect(identityIds).toContain(avatarRow.id);
    expect(imagesIds).not.toContain(avatarRow.id);
    expect(postIds).not.toContain(avatarRow.id);
    const firstIdentityPage = await getWorkspaceAssets(f.workspaceId, { clientProfileId: profileId, kind: "identity", limit: 1 });
    expect(firstIdentityPage[0]?.key).toBe(logoKey);
    const firstGalleryPage = await getWorkspaceAssets(f.workspaceId, { clientProfileId: profileId, limit: 24 });
    expect(firstGalleryPage.some(row => row.key === logoKey)).toBe(false);
  });

  it("ticket 07 (review R2, real PG): assignWorkspaceAssetBrand's SQL guard only claims a NULL non-provisional asset in this workspace, never overwriting branded/provisional/foreign-workspace rows", async () => {
    const f = await setup();
    const [account] = await f.t.deps.uow.repos.accounts.list(f.workspaceId);
    const profileHome = account!.clientProfileId;
    const [profileOther] = await f.dbA.insert(f.schema.clientProfiles).values({ workspaceId: f.workspaceId, name: "Outra marca" }).returning();
    const foreignWorkspaceId = crypto.randomUUID();
    await f.dbA.insert(f.schema.workspaces).values({ id: foreignWorkspaceId, name: "outro-ws", slug: `outro-ws-${foreignWorkspaceId}` });
    const [profileForeign] = await f.dbA.insert(f.schema.clientProfiles).values({ workspaceId: foreignWorkspaceId, name: "Marca de outro workspace" }).returning();

    const { assignWorkspaceAssetBrand } = await import("@/server/repositories/workspace-asset");

    const [legacy] = await f.dbA.insert(f.schema.workspaceAssets).values({
      workspaceId: f.workspaceId, clientProfileId: null, name: "legacy", key: `workspaces/${f.workspaceId}/assign-legacy.png`, size: 1, type: "image/png", source: "upload",
    }).returning();
    const [branded] = await f.dbA.insert(f.schema.workspaceAssets).values({
      workspaceId: f.workspaceId, clientProfileId: profileOther!.id, name: "already-branded", key: `workspaces/${f.workspaceId}/assign-branded.png`, size: 1, type: "image/png", source: "upload",
    }).returning();
    const [provisional] = await f.dbA.insert(f.schema.workspaceAssets).values({
      workspaceId: f.workspaceId, clientProfileId: null, name: "provisional", key: `workspaces/${f.workspaceId}/assign-provisional.png`, size: 1, type: "image/png", source: "upload",
      metadata: { provisional: true },
    }).returning();

    // Real claim: NULL + non-provisional + profile belongs to this workspace.
    const claimed = await assignWorkspaceAssetBrand(legacy!.id, f.workspaceId, profileHome);
    expect(claimed?.clientProfileId).toBe(profileHome);

    // Already branded to a DIFFERENT profile: refused, stays as-is.
    expect(await assignWorkspaceAssetBrand(branded!.id, f.workspaceId, profileHome)).toBeNull();
    const [afterBranded] = await f.dbA.select().from(f.schema.workspaceAssets).where(eq(f.schema.workspaceAssets.id, branded!.id));
    expect(afterBranded?.clientProfileId).toBe(profileOther!.id);

    // Provisional: refused, stays NULL (only the handoff confirmation path may claim it).
    expect(await assignWorkspaceAssetBrand(provisional!.id, f.workspaceId, profileHome)).toBeNull();
    const [afterProvisional] = await f.dbA.select().from(f.schema.workspaceAssets).where(eq(f.schema.workspaceAssets.id, provisional!.id));
    expect(afterProvisional?.clientProfileId).toBeNull();

    // The target profile belongs to a FOREIGN workspace: refused even though the asset itself is eligible.
    const [foreignTarget] = await f.dbA.insert(f.schema.workspaceAssets).values({
      workspaceId: f.workspaceId, clientProfileId: null, name: "foreign-target", key: `workspaces/${f.workspaceId}/assign-foreign.png`, size: 1, type: "image/png", source: "upload",
    }).returning();
    expect(await assignWorkspaceAssetBrand(foreignTarget!.id, f.workspaceId, profileForeign!.id)).toBeNull();
    const [afterForeign] = await f.dbA.select().from(f.schema.workspaceAssets).where(eq(f.schema.workspaceAssets.id, foreignTarget!.id));
    expect(afterForeign?.clientProfileId).toBeNull();

    await f.dbA.delete(f.schema.workspaces).where(eq(f.schema.workspaces.id, foreignWorkspaceId));
  });

  it("ticket 07: an unbranded (NULL) asset matching a brand's logo key is still prioritized as that brand's identity, without ever leaking another brand's own assets or a provisional row", async () => {
    const f = await setup();
    const [account] = await f.t.deps.uow.repos.accounts.list(f.workspaceId);
    const profileA = account!.clientProfileId;
    const [profileB] = await f.dbA.insert(f.schema.clientProfiles).values({ workspaceId: f.workspaceId, name: "Brand B" }).returning();
    const legacyLogoKey = `workspaces/${f.workspaceId}/legacy-shared-logo.png`;
    await f.dbA.update(f.schema.clientProfiles).set({ logoAssetKey: legacyLogoKey }).where(eq(f.schema.clientProfiles.id, profileB!.id));

    // A pre-ticket-07 asset the backfill couldn't resolve to a single brand:
    // client_profile_id stays NULL, yet its key matches profile B's logo.
    const [legacyLogo] = await f.dbA.insert(f.schema.workspaceAssets).values({
      workspaceId: f.workspaceId, clientProfileId: null, name: "Official mark",
      key: legacyLogoKey, size: 1, type: "image/png", source: "upload",
    }).returning();
    // Branded exclusively to profile A — must never surface for profile B.
    const [brandedToA] = await f.dbA.insert(f.schema.workspaceAssets).values({
      workspaceId: f.workspaceId, clientProfileId: profileA, name: "A's own photo",
      key: `workspaces/${f.workspaceId}/a-photo.png`, size: 1, type: "image/png", source: "brand_upload",
    }).returning();
    // A provisional NULL row: excluded everywhere, regardless of the OR-NULL brand match.
    await f.dbA.insert(f.schema.workspaceAssets).values({
      workspaceId: f.workspaceId, clientProfileId: null, name: "Provisional download",
      key: `workspaces/${f.workspaceId}/provisional.png`, size: 1, type: "image/png",
      source: "upload", metadata: { provisional: true },
    });

    const { getWorkspaceAssets, getWorkspaceAssetsCount } = await import("@/server/repositories/workspace-asset");

    // Requesting brand B's identity prioritizes the NULL legacy asset as ITS
    // logo — the kind classification uses the REQUESTED profile, not the
    // asset's own (absent) brand.
    const identityForB = await getWorkspaceAssets(f.workspaceId, { clientProfileId: profileB!.id, kind: "identity", limit: 1 });
    expect(identityForB[0]?.id).toBe(legacyLogo!.id);
    // The UI's "images" kind excludes anything classified as a logo, same as for a branded logo.
    const imagesForB = await getWorkspaceAssets(f.workspaceId, { clientProfileId: profileB!.id, kind: "images" });
    expect(imagesForB.some(row => row.id === legacyLogo!.id)).toBe(false);

    // Brand B's general listing sees the shared legacy asset, but never brand A's own asset.
    const galleryForB = await getWorkspaceAssets(f.workspaceId, { clientProfileId: profileB!.id, limit: 100 });
    expect(galleryForB.map(row => row.id)).toContain(legacyLogo!.id);
    expect(galleryForB.map(row => row.id)).not.toContain(brandedToA!.id);
    expect(await getWorkspaceAssetsCount(f.workspaceId, { clientProfileId: profileB!.id })).toBe(galleryForB.length);

    // Brand A's general listing ALSO sees the same shared legacy asset (OR NULL), plus its own.
    const galleryForA = await getWorkspaceAssets(f.workspaceId, { clientProfileId: profileA, limit: 100 });
    expect(galleryForA.map(row => row.id)).toContain(legacyLogo!.id);
    expect(galleryForA.map(row => row.id)).toContain(brandedToA!.id);
    expect(await getWorkspaceAssetsCount(f.workspaceId, { clientProfileId: profileA })).toBe(galleryForA.length);

    // The provisional NULL row never reappears for either brand.
    expect(galleryForA.some(row => row.name === "Provisional download")).toBe(false);
    expect(galleryForB.some(row => row.name === "Provisional download")).toBe(false);
  });

  it("double click: the second connection blocks on the SAME account row lock, then loses to stale_version", async () => {
    const f = await setup();
    const [row] = await f.t.deps.uow.repos.handoffs.list(f.scope);
    const command = { type: "handoff_set_source" as const, payload: { expectedStep: row!.step, expectedVersion: row!.version, kind: "site" as const, value: "https://acme.com" } };
    const [first, second] = await contend(
      f,
      (deps) => f.executeCommand(deps, { actor: f.approver, workspaceId: f.workspaceId, accountId: f.accountId }, command),
      (deps) => f.executeCommand(deps, { actor: f.approver, workspaceId: f.workspaceId, accountId: f.accountId }, command),
    );
    const results = [first, second] as Array<{ ok: boolean; error?: { code: string } }>;
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    const loser = results.find((r) => !r.ok);
    expect(loser?.error?.code).toBe("stale_version");
    const [after] = await f.t.deps.uow.repos.handoffs.list(f.scope);
    expect(after!.step).toBe("reading");
    expect(after!.version).toBe(2);
    expect(after!.readsUsed).toBe(1);
  });

  it("a group result and a decision on a DIFFERENT group never lose each other's captured items (row lock serializes, no lost update)", async () => {
    const f = await setup();
    const row = await withSource(f);
    const nameGroup = row.reading.name!;
    const recordName = {
      type: "handoff_record_group" as const,
      payload: {
        readingId: row!.readingId!, runId: nameGroup.runId, taskIntentId: nameGroup.taskIntentId, group: "name" as const,
        result: { status: "found" as const, items: [{ id: crypto.randomUUID(), value: "Acme", origin: "site" as const }] },
      },
    };
    const logoGroup = row!.reading.logo!;
    const recordLogo = {
      type: "handoff_record_group" as const,
      payload: {
        readingId: row!.readingId!, runId: logoGroup.runId, taskIntentId: logoGroup.taskIntentId, group: "logo" as const,
        result: { status: "not_found" as const, items: [] },
      },
    };
    const [first, second] = await contend(
      f,
      (deps) => f.executeCommand(deps, { actor: READER, workspaceId: f.workspaceId, accountId: f.accountId }, recordName),
      (deps) => f.executeCommand(deps, { actor: READER, workspaceId: f.workspaceId, accountId: f.accountId }, recordLogo),
    );
    expect((first as { ok: boolean }).ok).toBe(true);
    expect((second as { ok: boolean }).ok).toBe(true);

    const [after] = await f.t.deps.uow.repos.handoffs.list(f.scope);
    // Neither concurrent write clobbered the other's captured group.
    expect(after!.reading.name).toMatchObject({ status: "found" });
    expect(after!.captured.name?.[0]).toMatchObject({ value: "Acme" });
    expect(after!.reading.logo).toMatchObject({ status: "not_found" });
  });

  it("resuming with a brand-new pool/unit of work continues the same reading, not a fresh one", async () => {
    const f = await setup();
    const row = await withSource(f);
    const nameGroup = row.reading.name!;
    const recorded = await f.executeCommand(f.t.deps, { actor: READER, workspaceId: f.workspaceId, accountId: f.accountId }, {
      type: "handoff_record_group",
      payload: { readingId: row!.readingId!, runId: nameGroup.runId, taskIntentId: nameGroup.taskIntentId, group: "name",
        result: { status: "found", items: [{ id: crypto.randomUUID(), value: "Acme", origin: "site" }] } },
    });
    expect(recorded.ok).toBe(true);

    // A completely independent connection/unit of work picks up where the first left off.
    const [resumed] = await f.second.deps.uow.repos.handoffs.list(f.scope);
    expect(resumed!.readingId).toBe(row!.readingId);
    expect(resumed!.reading.name).toMatchObject({ status: "found" });
    expect(resumed!.reading.name?.bySource?.site).toMatchObject({ status: "found", runId: nameGroup.runId });
    expect(resumed!.captured.name?.[0]).toMatchObject({ value: "Acme" });

    const confirmed = await f.executeCommand(f.second.deps, { actor: f.approver, workspaceId: f.workspaceId, accountId: f.accountId }, {
      type: "handoff_retry_reading", payload: { expectedStep: resumed!.step, expectedVersion: resumed!.version },
    });
    // Retrying needs a failed group; the point is that the SECOND pool sees the
    // exact live state (right expectedStep/expectedVersion) and is authorized
    // to act on it, not that this particular command succeeds.
    expect(confirmed.ok).toBe(false);
    if (!confirmed.ok) expect(confirmed.error.code).toBe("invalid_transition");
  });

  it("asset policy isolates the handoff and preserves analysis for a mixed-plan workspace", async () => {
    const f = await setup();
    const row = await withSource(f);
    const { shouldAnalyzeWorkspaceAssets, isHandoffInWorkspace } = await import("../handoff/assets");
    expect(await shouldAnalyzeWorkspaceAssets(f.workspaceId)).toBe(false);
    expect(await isHandoffInWorkspace(f.workspaceId, row.id)).toBe(true);
    expect(await isHandoffInWorkspace(crypto.randomUUID(), row.id)).toBe(false);
    const [profile] = await f.dbA.insert(f.schema.clientProfiles).values({ workspaceId: f.workspaceId, name: "Paid brand" }).returning();
    await f.t.deps.uow.repos.accounts.create(f.workspaceId, { clientProfileId: profile!.id, status: "active" });
    expect(await shouldAnalyzeWorkspaceAssets(f.workspaceId)).toBe(true);
    expect(await shouldAnalyzeWorkspaceAssets(f.workspaceId, row.clientProfileId)).toBe(false);
    expect(await shouldAnalyzeWorkspaceAssets(f.workspaceId, profile!.id)).toBe(true);
    expect(await shouldAnalyzeWorkspaceAssets(f.workspaceId, crypto.randomUUID())).toBe(true);
    expect(await shouldAnalyzeWorkspaceAssets(crypto.randomUUID())).toBe(true);
    await f.dbA.delete(f.equipeSchema.equipeAccounts).where(eq(f.equipeSchema.equipeAccounts.workspaceId, f.workspaceId));
    expect(await shouldAnalyzeWorkspaceAssets(f.workspaceId)).toBe(true); // no Equipe account
  });

  it.each(["single-default", "multiple-default", "single-edited", "single-other-default"])("identity persists the brand and protects the workspace: %s", async (scenario) => {
    const f = await setup();
    const [row] = await f.t.deps.uow.repos.handoffs.list(f.scope);
    const originalName = scenario === "single-edited" ? "Minha agência" : scenario === "single-other-default" ? "Outra pessoa's Workspace" : "Ana's Workspace";
    await f.dbA.update(f.schema.user).set({ name: "Ana" }).where(eq(f.schema.user.id, f.userId));
    await f.dbA.update(f.schema.workspaceMembers).set({ role: "owner" }).where(eq(f.schema.workspaceMembers.workspaceId, f.workspaceId));
    await f.dbA.update(f.schema.workspaces).set({ name: originalName }).where(eq(f.schema.workspaces.id, f.workspaceId));
    if (scenario === "multiple-default") await f.dbA.insert(f.schema.clientProfiles).values({ workspaceId: f.workspaceId, name: "Outra marca" });
    await f.t.deps.uow.run(async (_repos, internal) => {
      await internal.saveHandoffIdentity(f.scope, row!.clientProfileId, { name: "Acme", logoAssetKey: null, brandColors: [], brandFonts: [] });
    });
    const [profile] = await f.dbB.select().from(f.schema.clientProfiles).where(eq(f.schema.clientProfiles.id, row!.clientProfileId));
    const [workspace] = await f.dbB.select().from(f.schema.workspaces).where(eq(f.schema.workspaces.id, f.workspaceId));
    expect(profile!.name).toBe("Acme");
    expect(workspace!.name).toBe(scenario === "single-default" ? "Acme" : originalName);
    if (scenario === "multiple-default") {
      const profiles = await f.dbB.select().from(f.schema.clientProfiles).where(eq(f.schema.clientProfiles.workspaceId, f.workspaceId));
      expect(profiles.some(p => p.name === "Outra marca")).toBe(true);
    }
  });

  it("ticket 07 (review R3, real PG): createHandoffWorkspaceAsset takes the SAME account lock as É isso — a late upload that loses the race is rejected, no row inserted", async () => {
    const f = await setup();
    const scope = f.scope;
    const groups = ["name", "logo", "colors", "fonts", "networks", "images"] as const;
    let row = await withSource(f);
    for (const group of groups) {
      const g = row!.reading[group]!;
      const out = await f.executeCommand(f.t.deps, { actor: READER, workspaceId: f.workspaceId, accountId: f.accountId }, {
        type: "handoff_record_group",
        payload: { readingId: row!.readingId!, runId: g.runId, taskIntentId: g.taskIntentId, group, result: { status: "not_found", items: [] } },
      });
      if (!out.ok) throw new Error(`record ${group} failed: ${out.error.code}`);
      row = (await f.t.deps.uow.repos.handoffs.list(scope))[0]!;
    }
    const confirmIdentity = await f.executeCommand(f.t.deps, { actor: f.approver, workspaceId: f.workspaceId, accountId: f.accountId }, {
      type: "handoff_confirm_identity", payload: { expectedStep: row!.step, expectedVersion: row!.version, name: "Acme", logo: null, colors: [], fonts: [], paletteChoice: "site" },
    });
    if (!confirmIdentity.ok) throw new Error(confirmIdentity.error.code);
    row = (await f.t.deps.uow.repos.handoffs.list(scope))[0]!;
    const confirmNetworks = await f.executeCommand(f.t.deps, { actor: f.approver, workspaceId: f.workspaceId, accountId: f.accountId }, {
      type: "handoff_confirm_networks", payload: { expectedStep: row!.step, expectedVersion: row!.version, kept: [], added: [] },
    });
    if (!confirmNetworks.ok) throw new Error(confirmNetworks.error.code);
    row = (await f.t.deps.uow.repos.handoffs.list(scope))[0]!;
    const confirmImages = await f.executeCommand(f.t.deps, { actor: f.approver, workspaceId: f.workspaceId, accountId: f.accountId }, {
      type: "handoff_confirm_images", payload: { expectedStep: row!.step, expectedVersion: row!.version, kept: [], removed: [], uploaded: [] },
    });
    if (!confirmImages.ok) throw new Error(confirmImages.error.code);
    row = (await f.t.deps.uow.repos.handoffs.list(scope))[0]!;
    expect(row.step).toBe("summary");

    const { createHandoffWorkspaceAsset } = await import("../handoff/assets");

    // Pause "É isso" right after it takes the account lock — same barrier the
    // other contention tests in this file use — then start the late upload's
    // OWN transaction (it borrows a connection from the app's pool, not one
    // of this fixture's, so its backend pid is discovered by probing, not known ahead of time).
    const originalUow = f.t.deps.uow;
    const barrier = pauseAfterLockedAccount(originalUow, f.accountId);
    f.t.deps.uow = barrier.uow;
    const confirmSummary = f.executeCommand(f.t.deps, { actor: f.approver, workspaceId: f.workspaceId, accountId: f.accountId }, {
      type: "handoff_confirm_summary", payload: { expectedStep: row.step, expectedVersion: row.version },
    });
    await barrier.entered;

    const lateUpload = createHandoffWorkspaceAsset({
      workspaceId: f.workspaceId, name: "late.png",
      key: `workspaces/${f.workspaceId}/late-${crypto.randomUUID()}.png`,
      type: "image/png", size: 10,
    }, row.id);

    try {
      await waitUntilAnyBlockedBy(f.clientA, f.pidA);
    } finally {
      barrier.proceed();
      await Promise.allSettled([confirmSummary, lateUpload]);
      f.t.deps.uow = originalUow;
    }
    const [summaryResult, lateAsset] = await Promise.all([confirmSummary, lateUpload]);

    expect(summaryResult.ok).toBe(true);
    // The late upload's transaction only resumed AFTER "É isso" committed and
    // closed the handoff — it must see step "done" and insert nothing.
    expect(lateAsset).toBeNull();
    const rows = await f.dbA.select().from(f.schema.workspaceAssets)
      .where(eq(f.schema.workspaceAssets.workspaceId, f.workspaceId));
    expect(rows.some(r => (r.metadata as { handoffId?: string } | null)?.handoffId === row.id)).toBe(false);
  });

  it("resumes after the claim commits in Postgres but its step acknowledgement is lost", async () => {
    const f = await setup();
    const row = await withSource(f);
    const [{ createHandoffReadHandler }, { FakeSiteReader, FakeInstagramReader }, { HANDOFF_GROUPS }] = await Promise.all([
      import("../handoff/read"), import("../handoff/readers"), import("../domain/handoff"),
    ]);
    const taskIntentId = row.reading.name!.taskIntentId;
    const intent = await f.t.deps.uow.repos.taskOutbox.get(f.scope, taskIntentId);
    const event = { data: { ...f.scope, taskIntentId, ...(intent!.data as object) } };
    const cache = new Map<string, unknown>();
    let loseClaim = true;
    const step = { async run<T>(id: string, fn: () => Promise<T>): Promise<T> {
      if (cache.has(id)) return cache.get(id) as T;
      const value = await fn();
      if (id.startsWith("claim-") && loseClaim) { loseClaim = false; throw new Error("lost claim acknowledgement"); }
      cache.set(id, value); return value;
    } };
    const site = new FakeSiteReader();
    const handler = createHandoffReadHandler(f.t.deps, { site, instagram: new FakeInstagramReader() });
    await expect(handler({ event, step })).rejects.toThrow("lost claim acknowledgement");
    const claims = (await f.second.deps.uow.repos.events.list(f.scope)).filter(e => e.eventType === "handoff.read_claimed");
    expect(claims).toHaveLength(1);
    expect(await handler({ event, step })).toEqual({ recorded: HANDOFF_GROUPS.length });
    expect(site.calls).toHaveLength(1);
    const [resumed] = await f.second.deps.uow.repos.handoffs.list(f.scope);
    expect(resumed!.readsUsed).toBe(1);
    expect(HANDOFF_GROUPS.every(group => resumed!.reading[group]?.status === "found")).toBe(true);
    expect((await f.second.deps.uow.repos.events.list(f.scope)).filter(e => e.eventType === "handoff.read_claimed")).toHaveLength(1);
  });

  it("confirming the summary commits the identity, the handoff row and the diagnose intent atomically", async () => {
    const f = await setup();
    const scope = f.scope;
    const groups = ["name", "logo", "colors", "fonts", "networks", "images"] as const;
    let row = await withSource(f);
    for (const group of groups) {
      const g = row!.reading[group]!;
      const items = group === "name" ? [{ id: crypto.randomUUID(), value: "Acme", origin: "site" as const }] : [];
      const out = await f.executeCommand(f.t.deps, { actor: READER, workspaceId: f.workspaceId, accountId: f.accountId }, {
        type: "handoff_record_group",
        payload: { readingId: row!.readingId!, runId: g.runId, taskIntentId: g.taskIntentId, group, result: { status: items.length ? "found" : "not_found", items } },
      });
      if (!out.ok) throw new Error(`record ${group} failed: ${out.error.code}`);
      row = (await f.t.deps.uow.repos.handoffs.list(scope))[0]!;
    }
    const confirmIdentity = await f.executeCommand(f.t.deps, { actor: f.approver, workspaceId: f.workspaceId, accountId: f.accountId }, {
      type: "handoff_confirm_identity",
      payload: { expectedStep: row!.step, expectedVersion: row!.version, name: "Acme", logo: null, colors: [], fonts: [], paletteChoice: "site" },
    });
    if (!confirmIdentity.ok) throw new Error(confirmIdentity.error.code);
    row = (await f.t.deps.uow.repos.handoffs.list(scope))[0]!;
    const confirmNetworks = await f.executeCommand(f.t.deps, { actor: f.approver, workspaceId: f.workspaceId, accountId: f.accountId }, {
      type: "handoff_confirm_networks", payload: { expectedStep: row!.step, expectedVersion: row!.version, kept: [], added: [] },
    });
    if (!confirmNetworks.ok) throw new Error(confirmNetworks.error.code);
    row = (await f.t.deps.uow.repos.handoffs.list(scope))[0]!;
    const confirmImages = await f.executeCommand(f.t.deps, { actor: f.approver, workspaceId: f.workspaceId, accountId: f.accountId }, {
      type: "handoff_confirm_images", payload: { expectedStep: row!.step, expectedVersion: row!.version, kept: [], removed: [], uploaded: [] },
    });
    if (!confirmImages.ok) throw new Error(confirmImages.error.code);
    row = (await f.t.deps.uow.repos.handoffs.list(scope))[0]!;

    const seenFromOtherConnection: Array<{ profileName: string | null; intentCount: number; step: string }> = [];
    f.t.deps.sendTaskEvent = async (event) => {
      // This fires strictly AFTER commit (see module/shared.ts transact()):
      // by this point every write of the transaction must already be visible
      // from the completely independent second connection, all together.
      const [profile] = await f.dbB.select().from(f.schema.clientProfiles).where(eq(f.schema.clientProfiles.id, row!.clientProfileId));
      const [handoffRow] = await f.second.deps.uow.repos.handoffs.list(scope);
      seenFromOtherConnection.push({ profileName: profile?.name ?? null, intentCount: 1, step: handoffRow!.step });
      void event;
    };

    const before = await f.dbB.select().from(f.schema.clientProfiles).where(eq(f.schema.clientProfiles.id, row!.clientProfileId));
    expect(before[0]?.name).not.toBe("Acme");

    const confirmSummary = await f.executeCommand(f.t.deps, { actor: f.approver, workspaceId: f.workspaceId, accountId: f.accountId }, {
      type: "handoff_confirm_summary", payload: { expectedStep: row!.step, expectedVersion: row!.version },
    });
    expect(confirmSummary.ok).toBe(true);

    expect(seenFromOtherConnection).toHaveLength(1);
    expect(seenFromOtherConnection[0]).toMatchObject({ profileName: "Acme", step: "done" });
    const [after] = await f.dbB.select().from(f.schema.clientProfiles).where(eq(f.schema.clientProfiles.id, row!.clientProfileId));
    expect(after?.name).toBe("Acme");
    const [handoff] = await f.second.deps.uow.repos.handoffs.list(scope);
    expect(handoff!.step).toBe("done");
  });

  it("ticket 07: confirming the summary materializes brand assets inside the same commit, and defers R2 cleanup until after it", async () => {
    const f = await setup();
    const scope = f.scope;
    let row = await withSource(f);
    const nameGroup = row!.reading.name!;
    const recorded = await f.executeCommand(f.t.deps, { actor: READER, workspaceId: f.workspaceId, accountId: f.accountId }, {
      type: "handoff_record_group",
      payload: { readingId: row!.readingId!, runId: nameGroup.runId, taskIntentId: nameGroup.taskIntentId, group: "name",
        result: { status: "found", items: [{ id: crypto.randomUUID(), value: "Acme", origin: "site" }] } },
    });
    if (!recorded.ok) throw new Error(`record name failed: ${recorded.error.code}`);
    for (const group of ["logo", "colors", "fonts", "networks", "images"] as const) {
      row = (await f.t.deps.uow.repos.handoffs.list(scope))[0]!;
      const g = row.reading[group]!;
      const out = await f.executeCommand(f.t.deps, { actor: READER, workspaceId: f.workspaceId, accountId: f.accountId }, {
        type: "handoff_record_group",
        payload: { readingId: row.readingId!, runId: g.runId, taskIntentId: g.taskIntentId, group, result: { status: "not_found", items: [] } },
      });
      if (!out.ok) throw new Error(`record ${group} failed: ${out.error.code}`);
    }
    row = (await f.t.deps.uow.repos.handoffs.list(scope))[0]!;

    // A provisional download from THIS handoff's reading, never kept by the person.
    const decoyKey = `workspaces/${f.workspaceId}/handoff/${row.id}/decoy.png`;
    await f.dbA.insert(f.schema.workspaceAssets).values({
      workspaceId: f.workspaceId, name: "decoy", key: decoyKey, type: "image/png", size: 10,
      source: "upload", metadata: { provisional: true, handoffId: row.id },
    });

    const confirmIdentity = await f.executeCommand(f.t.deps, { actor: f.approver, workspaceId: f.workspaceId, accountId: f.accountId }, {
      type: "handoff_confirm_identity", payload: { expectedStep: row.step, expectedVersion: row.version, name: "Acme", logo: null, colors: [], fonts: [], paletteChoice: "site" },
    });
    if (!confirmIdentity.ok) throw new Error(confirmIdentity.error.code);
    row = (await f.t.deps.uow.repos.handoffs.list(scope))[0]!;
    const confirmNetworks = await f.executeCommand(f.t.deps, { actor: f.approver, workspaceId: f.workspaceId, accountId: f.accountId }, {
      type: "handoff_confirm_networks", payload: { expectedStep: row.step, expectedVersion: row.version, kept: [], added: [] },
    });
    if (!confirmNetworks.ok) throw new Error(confirmNetworks.error.code);
    row = (await f.t.deps.uow.repos.handoffs.list(scope))[0]!;
    const confirmImages = await f.executeCommand(f.t.deps, { actor: f.approver, workspaceId: f.workspaceId, accountId: f.accountId }, {
      type: "handoff_confirm_images", payload: { expectedStep: row.step, expectedVersion: row.version, kept: [], removed: [], uploaded: [] },
    });
    if (!confirmImages.ok) throw new Error(confirmImages.error.code);
    row = (await f.t.deps.uow.repos.handoffs.list(scope))[0]!;

    const deleteCalls: string[] = [];
    let deletesAtDispatchTime: number | null = null;
    f.t.deps.handoffStorage = {
      put: async () => {},
      delete: async (key: string) => { deleteCalls.push(key); },
    };
    f.t.deps.sendTaskEvent = async () => {
      // Fires strictly after commit (module/shared.ts transact()): the decoy
      // row must already be gone as seen from a completely independent
      // connection, but R2 deletion (outside the transaction) has not run yet.
      const rowsFromB = await f.dbB.select().from(f.schema.workspaceAssets).where(eq(f.schema.workspaceAssets.key, decoyKey));
      expect(rowsFromB).toHaveLength(0);
      deletesAtDispatchTime = deleteCalls.length;
    };

    const confirmSummary = await f.executeCommand(f.t.deps, { actor: f.approver, workspaceId: f.workspaceId, accountId: f.accountId }, {
      type: "handoff_confirm_summary", payload: { expectedStep: row.step, expectedVersion: row.version },
    });
    expect(confirmSummary.ok).toBe(true);
    expect(deletesAtDispatchTime).toBe(0);
    expect(deleteCalls).toEqual([decoyKey]);
  });

  it("ticket 07: equipe_brand_documents rejects an UPDATE at the database level — versions are immutable", async () => {
    const f = await setup();
    const account = await f.t.deps.uow.repos.accounts.get(f.workspaceId, f.accountId);
    const doc = await f.t.deps.uow.repos.documents.create(f.scope, {
      clientProfileId: account!.clientProfileId, kind: "diagnosis", version: 1,
      content: { summary: "v1" }, createdByRole: "assistant",
    });
    await expect(
      f.clientA.query(`update adscale_equipe.equipe_brand_documents set content = $1 where id = $2`, [JSON.stringify({ summary: "reescrito" }), doc.id]),
    ).rejects.toThrow(/brand_document_versions_are_immutable/);
    const [row] = await f.dbA.select().from(f.equipeSchema.equipeBrandDocuments).where(eq(f.equipeSchema.equipeBrandDocuments.id, doc.id));
    expect(row?.content).toEqual({ summary: "v1" });
  });

  it("ticket 07 (review P3, real PG): a brand that still owns Library assets cannot be deleted, so its uploads never turn into workspace-wide NULL assets", async () => {
    const f = await setup();
    const [account] = await f.t.deps.uow.repos.accounts.list(f.workspaceId);
    const home = account!.clientProfileId;
    // Nothing else links this brand (no logo, font, reference, campaign or work): only the upload below.
    const [doomed] = await f.dbA.insert(f.schema.clientProfiles).values({ workspaceId: f.workspaceId, name: "Doomed brand" }).returning();
    const [asset] = await f.dbA.insert(f.schema.workspaceAssets).values({
      workspaceId: f.workspaceId, clientProfileId: doomed!.id, name: "belongs-to-doomed.png",
      key: `workspaces/${f.workspaceId}/doomed.png`, size: 1, type: "image/png", source: "brand_upload",
    }).returning();
    const { getWorkspaceAssets } = await import("@/server/repositories/workspace-asset");
    const { deleteEmptyClientProfile, getClientProfile } = await import("@/server/repositories/client-reference");
    const visibleToHome = async () => (await getWorkspaceAssets(f.workspaceId, { clientProfileId: home, limit: 100 })).map(row => row.id);
    expect(await visibleToHome()).not.toContain(asset!.id);

    expect(await deleteEmptyClientProfile(f.workspaceId, doomed!.id)).toEqual({ status: "in_use" });
    // The brand stays, the asset keeps its owner, and the other brands still never see it.
    expect(await getClientProfile(f.workspaceId, doomed!.id)).not.toBeNull();
    const [kept] = await f.dbA.select().from(f.schema.workspaceAssets).where(eq(f.schema.workspaceAssets.id, asset!.id));
    expect(kept?.clientProfileId).toBe(doomed!.id);
    expect(await visibleToHome()).not.toContain(asset!.id);

    // The block is about those assets: once the Library holds nothing of the brand, it can be deleted.
    await f.dbA.delete(f.schema.workspaceAssets).where(eq(f.schema.workspaceAssets.id, asset!.id));
    expect(await deleteEmptyClientProfile(f.workspaceId, doomed!.id)).toEqual({ status: "deleted" });
    expect(await getClientProfile(f.workspaceId, doomed!.id)).toBeNull();
  });

  it("ticket 07 (bot review, real PG): materializeHandoffAssets adopts only this handoff's provisional download or the brand's own asset, never a shared legacy row", async () => {
    const f = await setup();
    const [handoff] = await f.t.deps.uow.repos.handoffs.list(f.scope);
    const [otherBrand] = await f.dbA.insert(f.schema.clientProfiles).values({ workspaceId: f.workspaceId, name: "Other brand" }).returning();
    const mk = async (name: string, values: { clientProfileId?: string | null; metadata?: Record<string, unknown> | null }) => (await f.dbA.insert(f.schema.workspaceAssets).values({
      workspaceId: f.workspaceId, clientProfileId: values.clientProfileId ?? null, name, key: `workspaces/${f.workspaceId}/${name}.png`,
      size: 1, type: "image/png", source: "upload", metadata: values.metadata ?? null,
    }).returning())[0]!;
    const own = await mk("own-download", { metadata: { provisional: true, handoffId: handoff!.id } });
    const brandOwned = await mk("brand-owned", { clientProfileId: handoff!.clientProfileId });
    const legacy = await mk("legacy-shared", {});
    const otherHandoff = await mk("other-handoff", { metadata: { provisional: true, handoffId: crypto.randomUUID() } });
    const foreign = await mk("other-brand", { clientProfileId: otherBrand!.id });
    const materialize = (asset: { key: string }) => {
      const item = { id: crypto.randomUUID(), value: "/x.png", origin: "site" as const, key: asset.key };
      return f.t.deps.uow.run((_repos, internal) => internal.materializeHandoffAssets(f.scope,
        { ...handoff!, captured: { images: [item] }, decisions: { images: { kept: [item.id], removed: [], uploaded: [] } } }, []));
    };
    const read = async (id: string) => (await f.dbA.select().from(f.schema.workspaceAssets).where(eq(f.schema.workspaceAssets.id, id)))[0]!;

    await materialize(own);
    await materialize(brandOwned);
    expect(await read(own.id)).toMatchObject({ clientProfileId: handoff!.clientProfileId, source: "brand_site" });
    expect(await read(brandOwned.id)).toMatchObject({ clientProfileId: handoff!.clientProfileId });

    for (const refused of [legacy, otherHandoff, foreign]) {
      await expect(materialize(refused)).rejects.toThrow("handoff_asset_not_found");
      // Refused rows are byte-for-byte as seeded: a shared asset is never claimed by the brand.
      expect(await read(refused.id)).toMatchObject({ clientProfileId: refused.clientProfileId, source: "upload", metadata: refused.metadata });
    }
  });

  it("ticket 07 (bot review, real PG): the 'Enviado por você' origin filter is every source the card labels that way (legacy upload, brand training, generated), with list and count in agreement", async () => {
    const f = await setup();
    const [account] = await f.t.deps.uow.repos.accounts.list(f.workspaceId);
    const home = account!.clientProfileId;
    const mk = async (name: string, source: string, clientProfileId: string | null = home) => (await f.dbA.insert(f.schema.workspaceAssets).values({
      workspaceId: f.workspaceId, clientProfileId, name, key: `workspaces/${f.workspaceId}/${name}.png`, size: 1, type: "image/png", source,
    }).returning())[0]!;
    const legacyShared = await mk("legacy-shared", "upload", null); // before the brand-scoped Library, left unbranded by the backfill
    const legacyBranded = await mk("legacy-branded", "upload");      // before the brand-scoped Library, backfilled to this brand
    const fresh = await mk("fresh-upload", "brand_upload");
    const training = await mk("brand-training", "brand_training"); // a training image the person uploaded
    const generated = await mk("generated-piece", "creative_work"); // a Peça saved to the Library
    const site = await mk("from-site", "brand_site");
    const instagram = await mk("from-instagram", "brand_instagram");
    const { getWorkspaceAssets, getWorkspaceAssetsCount } = await import("@/server/repositories/workspace-asset");
    const ids = async (source?: string) => (await getWorkspaceAssets(f.workspaceId, { clientProfileId: home, source, limit: 100 })).map(row => row.id).sort();

    // The card labels all of these "Enviado por você", so the filter must find every one of them.
    const userOrigin = [legacyShared.id, legacyBranded.id, fresh.id, training.id, generated.id].sort();
    expect(await ids("brand_upload")).toEqual(userOrigin);
    expect(await getWorkspaceAssetsCount(f.workspaceId, { clientProfileId: home, source: "brand_upload" })).toBe(5);
    // The other origins stay exact: nothing above is "from the site" or "from Instagram".
    expect(await ids("brand_site")).toEqual([site.id]);
    expect(await ids("brand_instagram")).toEqual([instagram.id]);
    // "Todos" still lists everything.
    expect(await ids()).toEqual([...userOrigin, site.id, instagram.id].sort());
  });

  it("ticket 07 (bot review, real PG): isBrandLogoKey is true only while a brand of this workspace has that key as its current logo", async () => {
    const f = await setup();
    const [account] = await f.t.deps.uow.repos.accounts.list(f.workspaceId);
    const profileId = account!.clientProfileId;
    const logoKey = `workspaces/${f.workspaceId}/brand-kit/current-logo.png`;
    await f.dbA.update(f.schema.clientProfiles).set({ logoAssetKey: logoKey }).where(eq(f.schema.clientProfiles.id, profileId));
    const { isBrandLogoKey } = await import("@/server/repositories/workspace-asset");

    expect(await isBrandLogoKey(f.workspaceId, logoKey)).toBe(true);
    expect(await isBrandLogoKey(f.workspaceId, `workspaces/${f.workspaceId}/other.png`)).toBe(false);
    // Another workspace never matches, and once the logo is unset the old file can be deleted again.
    expect(await isBrandLogoKey(crypto.randomUUID(), logoKey)).toBe(false);
    await f.dbA.update(f.schema.clientProfiles).set({ logoAssetKey: null }).where(eq(f.schema.clientProfiles.id, profileId));
    expect(await isBrandLogoKey(f.workspaceId, logoKey)).toBe(false);
  });

  it("ticket 07 (bot review, real PG): clearing the Brand Kit also removes the logo's Library row, and only that row", async () => {
    const f = await setup();
    const [account] = await f.t.deps.uow.repos.accounts.list(f.workspaceId);
    const profileId = account!.clientProfileId;
    const logoKey = `workspaces/${f.workspaceId}/brand-kit/logo.png`;
    await f.dbA.update(f.schema.clientProfiles).set({ logoAssetKey: logoKey }).where(eq(f.schema.clientProfiles.id, profileId));
    const mk = async (name: string, key: string) => (await f.dbA.insert(f.schema.workspaceAssets).values({
      workspaceId: f.workspaceId, clientProfileId: profileId, name, key, size: 1, type: "image/png", source: "brand_upload", metadata: null,
    }).returning())[0]!;
    await mk("logo.png", logoKey);
    const other = await mk("other.png", `workspaces/${f.workspaceId}/other.png`);
    await f.dbA.insert(f.schema.clientReferences).values({ workspaceId: f.workspaceId, clientProfileId: profileId, assetKey: logoKey, label: "logo.png", kind: "logo" });
    const { deleteBrandKit } = await import("@/server/repositories/brand-kit");

    await deleteBrandKit(f.workspaceId, profileId);

    // The route deletes the stored logo: a Library row left behind would be a permanently broken card.
    const assets = await f.dbA.select().from(f.schema.workspaceAssets).where(eq(f.schema.workspaceAssets.workspaceId, f.workspaceId));
    expect(assets.map(row => row.id)).toEqual([other.id]);
    expect(await f.dbA.select().from(f.schema.clientReferences).where(eq(f.schema.clientReferences.workspaceId, f.workspaceId))).toEqual([]);
    const [profile] = await f.dbA.select().from(f.schema.clientProfiles).where(eq(f.schema.clientProfiles.id, profileId));
    expect(profile?.logoAssetKey).toBeNull();
  });

  it("ticket 07 (goals materials, real PG): register_material, through the live gateway, accepts only assets the account's brand may use", async () => {
    const f = await setup();
    const account = (await f.t.deps.uow.repos.accounts.get(f.workspaceId, f.accountId))!;
    const [otherBrand] = await f.dbA.insert(f.schema.clientProfiles).values({ workspaceId: f.workspaceId, name: "Other brand" }).returning();
    await f.dbA.update(f.equipeSchema.equipeAccounts).set({ status: "deploying" }).where(eq(f.equipeSchema.equipeAccounts.id, f.accountId));
    const mk = async (name: string, values: { clientProfileId?: string | null; metadata?: Record<string, unknown> | null } = {}) => (await f.dbA.insert(f.schema.workspaceAssets).values({
      workspaceId: f.workspaceId, clientProfileId: values.clientProfileId ?? null, name, key: `workspaces/${f.workspaceId}/${name}.png`, size: 1, type: "image/png",
      source: "upload", metadata: values.metadata ?? null,
    }).returning())[0]!;
    const own = await mk("own", { clientProfileId: account.clientProfileId });
    const shared = await mk("shared");
    const ofOtherBrand = await mk("of-other-brand", { clientProfileId: otherBrand!.id });
    const provisional = await mk("provisional", { metadata: { provisional: true, handoffId: crypto.randomUUID() } });
    const { LiveAdscaleGateway } = await import("../agents/gateway");
    f.t.deps.gateway = new LiveAdscaleGateway(f.workspaceId);
    const register = (assetId: string) => f.executeCommand(f.t.deps, { actor: f.approver, workspaceId: f.workspaceId, accountId: f.accountId }, {
      type: "register_material", payload: { assetId, kind: "deck" },
    });

    for (const allowed of [own, shared]) expect((await register(allowed.id)).ok).toBe(true);
    for (const refused of [ofOtherBrand, provisional]) {
      const outcome = await register(refused.id);
      expect(outcome.ok).toBe(false);
      if (!outcome.ok) expect(outcome.error.code).toBe("unknown_asset");
    }
  });

  it("ticket 07 (PR 612 review, real PG): getAssetIdsVisibleToBrand keeps only what the brand may reference: its own and shared, never another brand's, provisional or foreign-workspace assets", async () => {
    const f = await setup();
    const [account] = await f.t.deps.uow.repos.accounts.list(f.workspaceId);
    const brandA = account!.clientProfileId;
    const [brandB] = await f.dbA.insert(f.schema.clientProfiles).values({ workspaceId: f.workspaceId, name: "Brand B" }).returning();
    const foreignWorkspace = crypto.randomUUID();
    await f.dbA.insert(f.schema.workspaces).values({ id: foreignWorkspace, name: `fw-${foreignWorkspace}`, slug: `fw-${foreignWorkspace}` });
    try {
      const mk = async (workspaceId: string, name: string, values: { clientProfileId?: string | null; metadata?: Record<string, unknown> | null } = {}) => (await f.dbA.insert(f.schema.workspaceAssets).values({
        workspaceId, clientProfileId: values.clientProfileId ?? null, name, key: `workspaces/${workspaceId}/${name}.png`, size: 1, type: "image/png",
        source: "upload", metadata: values.metadata ?? null,
      }).returning())[0]!;
      const ownB = await mk(f.workspaceId, "own-b", { clientProfileId: brandB!.id });
      const ownA = await mk(f.workspaceId, "own-a", { clientProfileId: brandA });
      const shared = await mk(f.workspaceId, "shared");
      const provisional = await mk(f.workspaceId, "provisional", { metadata: { provisional: true, handoffId: crypto.randomUUID() } });
      const foreign = await mk(foreignWorkspace, "foreign");
      const { getAssetIdsVisibleToBrand } = await import("@/server/repositories/workspace-asset");
      const asked = [ownB, ownA, shared, provisional, foreign].map(asset => asset.id);

      expect((await getAssetIdsVisibleToBrand(f.workspaceId, brandB!.id, asked)).sort()).toEqual([ownB.id, shared.id].sort());
      expect((await getAssetIdsVisibleToBrand(f.workspaceId, brandA, asked)).sort()).toEqual([ownA.id, shared.id].sort());
      expect(await getAssetIdsVisibleToBrand(f.workspaceId, brandB!.id, [])).toEqual([]);
      // No brand, no visibility: an empty id fails closed instead of widening to the whole workspace.
      expect(await getAssetIdsVisibleToBrand(f.workspaceId, "", asked)).toEqual([]);
    } finally {
      await f.dbA.delete(f.schema.workspaces).where(eq(f.schema.workspaces.id, foreignWorkspace));
    }
  });

  it("ticket 07 (PR 610 re-review, real PG): select_creative refuses an asset the thread's brand cannot see, before reading or analyzing it", async () => {
    const f = await setup();
    const [account] = await f.t.deps.uow.repos.accounts.list(f.workspaceId);
    const brandA = account!.clientProfileId;
    const [brandB] = await f.dbA.insert(f.schema.clientProfiles).values({ workspaceId: f.workspaceId, name: "Brand B" }).returning();
    const [thread] = await f.dbA.insert(f.schema.assistantThreads).values({ workspaceId: f.workspaceId, clientProfileId: brandB!.id, name: "Thread B" }).returning();
    await f.dbA.insert(f.schema.assistantGuidedFlows).values({
      workspaceId: f.workspaceId, clientProfileId: brandB!.id, threadId: thread!.id, path: "existing_creative", status: "active", currentStep: "select_creative",
    });
    const mk = async (name: string, values: { clientProfileId?: string | null; metadata?: Record<string, unknown> | null } = {}) => (await f.dbA.insert(f.schema.workspaceAssets).values({
      workspaceId: f.workspaceId, clientProfileId: values.clientProfileId ?? null, name, key: `workspaces/${f.workspaceId}/${name}.png`, size: 1, type: "image/png",
      source: "upload", metadata: values.metadata ?? null,
    }).returning())[0]!;
    const ofBrandA = await mk("of-brand-a", { clientProfileId: brandA });
    const provisional = await mk("provisional", { metadata: { provisional: true, handoffId: crypto.randomUUID() } });
    const { analyzeExistingCreativeForJourney } = await import("@/server/assistant/guided-paths/existing-creative");
    const analyze = (assetId: string) => analyzeExistingCreativeForJourney({ workspaceId: f.workspaceId, threadId: thread!.id, clientProfileId: brandB!.id, workspaceAssetId: assetId });

    // Both are rows of this workspace: only the brand check stops them, and before any storage read or model call.
    for (const refused of [ofBrandA, provisional]) await expect(analyze(refused.id)).rejects.toThrow("Workspace asset not found");
  });

  it("ticket 07 (review, real PG): a source filter named like an Object.prototype member is an ordinary unknown origin: empty list, empty count, no error", async () => {
    const f = await setup();
    const [account] = await f.t.deps.uow.repos.accounts.list(f.workspaceId);
    const home = account!.clientProfileId;
    await f.dbA.insert(f.schema.workspaceAssets).values({
      workspaceId: f.workspaceId, clientProfileId: home, name: "upload", key: `workspaces/${f.workspaceId}/upload.png`, size: 1, type: "image/png", source: "brand_upload",
    });
    const { getWorkspaceAssets, getWorkspaceAssetsCount } = await import("@/server/repositories/workspace-asset");

    for (const source of ["constructor", "toString", "__proto__", "hasOwnProperty"]) {
      expect(await getWorkspaceAssets(f.workspaceId, { clientProfileId: home, source, limit: 100 })).toEqual([]);
      expect(await getWorkspaceAssetsCount(f.workspaceId, { clientProfileId: home, source })).toBe(0);
    }
  });

  it("ticket 07 (review P3, real PG): shared (NULL) assets and other brands' assets never keep an otherwise empty brand from being deleted", async () => {
    const f = await setup();
    const [account] = await f.t.deps.uow.repos.accounts.list(f.workspaceId);
    const home = account!.clientProfileId;
    const [empty] = await f.dbA.insert(f.schema.clientProfiles).values({ workspaceId: f.workspaceId, name: "Empty brand" }).returning();
    await f.dbA.insert(f.schema.workspaceAssets).values([
      { workspaceId: f.workspaceId, clientProfileId: null, name: "shared.png", key: `workspaces/${f.workspaceId}/shared.png`, size: 1, type: "image/png", source: "upload" },
      { workspaceId: f.workspaceId, clientProfileId: home, name: "home.png", key: `workspaces/${f.workspaceId}/home.png`, size: 1, type: "image/png", source: "brand_upload" },
    ]);
    const { deleteEmptyClientProfile } = await import("@/server/repositories/client-reference");

    expect(await deleteEmptyClientProfile(f.workspaceId, empty!.id)).toEqual({ status: "deleted" });
  });
});

/**
 * Migration 0133 (fixup PR610): runs the REAL SQL file from
 * `drizzle/0133_backfill_asset_brands.sql` against a real Postgres, so the
 * regression tests the actual migration text, not a reimplementation of it.
 *
 * To never touch the shared test database's real `adscale_app` tables (used
 * by every other suite), the five referenced tables are recreated as TEMP
 * tables on this test's own connection, and the migration text's
 * `"adscale_app".` schema qualifier is rewritten to `pg_temp.` before
 * execution — so every statement resolves against the session-local temp
 * tables instead. The temp tables (and this whole session) are dropped when
 * the dedicated pool for this test is closed in its `finally` block.
 */
describe.skipIf(!TEST_DATABASE_URL)("migration 0133: backfill workspace_assets.client_profile_id (ticket 07 fixup PR610)", () => {
  const migrationSql = readFileSync(
    new URL("../../../../drizzle/0133_backfill_asset_brands.sql", import.meta.url),
    "utf8",
  ).replace(/"adscale_app"\./g, "pg_temp.");

  async function isolatedConnection() {
    const [{ Pool }] = await Promise.all([import("pg")]);
    const pool = new Pool({ connectionString: TEST_DATABASE_URL!, max: 1 });
    const client = await pool.connect();
    await client.query(`
      create temp table workspace_assets (
        id uuid primary key, workspace_id uuid not null, client_profile_id uuid,
        key text not null unique, source text not null default 'upload', metadata jsonb
      );
      create temp table client_profiles (
        id uuid primary key, workspace_id uuid not null, logo_asset_key text, brand_font_assets jsonb
      );
      create temp table client_references (
        id uuid primary key, workspace_id uuid not null, client_profile_id uuid not null, asset_key text not null
      );
      create temp table creative_work_items (
        id uuid primary key, workspace_id uuid not null, client_profile_id uuid not null
      );
      create temp table creative_work_outputs (
        id uuid primary key, workspace_id uuid not null, work_item_id uuid not null, output_key text not null
      );
    `);
    return { pool, client };
  }

  async function teardown(conn: Awaited<ReturnType<typeof isolatedConnection>>) {
    conn.client.release();
    await conn.pool.end();
  }

  it("resolves single-brand fallback, every evidence kind, conflicts, exclusions and idempotency in one real run", async () => {
    const conn = await isolatedConnection();
    try {
      const { client } = conn;
      const wsSingle = crypto.randomUUID();
      const wsMulti = crypto.randomUUID();
      const p1 = crypto.randomUUID(); // WS_SINGLE's only brand.
      const p2 = crypto.randomUUID();
      const p3 = crypto.randomUUID(); // WS_MULTI's two brands.
      const metaFor = (profileId: string) => JSON.stringify({ clientProfileId: profileId });

      await client.query(
        `insert into pg_temp.client_profiles (id, workspace_id, logo_asset_key, brand_font_assets) values
         ($1, $2, null, '[]'),
         ($3, $4, 'assets/p2-logo.png', '[]'),
         ($5, $4, null, '[{"assetKey":"assets/p3-font.ttf"}]')`,
        [p1, wsSingle, p2, wsMulti, p3],
      );

      const a1 = crypto.randomUUID(); // no evidence, single-brand workspace -> fallback to p1.
      const a2 = crypto.randomUUID(); // curated_inspiration, single-brand workspace -> stays NULL.
      const a3 = crypto.randomUUID(); // provisional, single-brand workspace -> stays NULL.
      const a4 = crypto.randomUUID(); // already branded p1 -> untouched.
      const a5 = crypto.randomUUID(); // metadata.clientProfileId points to a FOREIGN workspace's profile (p2) -> ignored, falls back to single-brand p1.
      await client.query(
        `insert into pg_temp.workspace_assets (id, workspace_id, client_profile_id, key, source, metadata) values
         ($1, $6, null, 'assets/a1.png', 'upload', null),
         ($2, $6, null, 'assets/a2.png', 'curated_inspiration', null),
         ($3, $6, null, 'assets/a3.png', 'upload', '{"provisional": true}'::jsonb),
         ($4, $6, $7, 'assets/a4.png', 'upload', null),
         ($5, $6, null, 'assets/a5.png', 'upload', $8::jsonb)`,
        [a1, a2, a3, a4, a5, wsSingle, p1, metaFor(p2)],
      );

      const b1 = crypto.randomUUID(); // generated (creative_work_outputs) evidence -> p2.
      const b2 = crypto.randomUUID(); // train (client_references) evidence -> p3.
      const b3 = crypto.randomUUID(); // logo_asset_key evidence -> p2.
      const b4 = crypto.randomUUID(); // font evidence -> p3.
      const b5 = crypto.randomUUID(); // metadata evidence -> p2.
      const b6 = crypto.randomUUID(); // no evidence, multi-brand workspace -> stays NULL (no single-brand fallback).
      const b7 = crypto.randomUUID(); // conflicting evidence (metadata->p2 AND train->p3 on the SAME asset) -> stays NULL.
      const b8 = crypto.randomUUID(); // duplicate evidence, SAME profile (metadata->p2 AND train->p2) -> p2, not a conflict.
      const b9 = crypto.randomUUID(); // curated_inspiration despite clean metadata evidence -> stays NULL.
      const b10 = crypto.randomUUID(); // provisional despite clean metadata evidence -> stays NULL.
      const b11 = crypto.randomUUID(); // already branded p3, even though its metadata evidence also points to p2 -> stays p3, untouched.

      await client.query(
        `insert into pg_temp.workspace_assets (id, workspace_id, client_profile_id, key, source, metadata) values
         ($1, $12, null, 'creative-work/b1.png', 'creative_work', null),
         ($2, $12, null, 'assets/b2-train.png', 'brand_training', null),
         ($3, $12, null, 'assets/p2-logo.png', 'upload', null),
         ($4, $12, null, 'assets/p3-font.ttf', 'upload', null),
         ($5, $12, null, 'assets/b5-meta.png', 'upload', $13::jsonb),
         ($6, $12, null, 'assets/b6-orphan.png', 'upload', null),
         ($7, $12, null, 'assets/b7-conflict.png', 'upload', $13::jsonb),
         ($8, $12, null, 'assets/b8-dup.png', 'upload', $13::jsonb),
         ($9, $12, null, 'assets/b9-curated.png', 'curated_inspiration', $13::jsonb),
         ($10, $12, null, 'assets/b10-provisional.png', 'upload', $15::jsonb),
         ($11, $12, $14, 'assets/b11-branded.png', 'upload', $13::jsonb)`,
        [b1, b2, b3, b4, b5, b6, b7, b8, b9, b10, b11, wsMulti, metaFor(p2), p3, JSON.stringify({ clientProfileId: p2, provisional: true })],
      );
      // b7: metadata evidence points to p2, but client_references ALSO claims the
      // same key for p3 — two distinct profiles for one asset, so it's a conflict.
      // b8: metadata evidence points to p2, and client_references ALSO claims the
      // same key but for p2 too — same profile via two branches, not a conflict.
      await client.query(
        `insert into pg_temp.client_references (id, workspace_id, client_profile_id, asset_key) values
         ($1, $2, $3, 'assets/b2-train.png'),
         ($4, $2, $3, 'assets/b7-conflict.png'),
         ($5, $2, $6, 'assets/b8-dup.png')`,
        [crypto.randomUUID(), wsMulti, p3, crypto.randomUUID(), crypto.randomUUID(), p2],
      );

      const item = crypto.randomUUID();
      await client.query(
        `insert into pg_temp.creative_work_items (id, workspace_id, client_profile_id) values ($1, $2, $3)`,
        [item, wsMulti, p2],
      );
      await client.query(
        `insert into pg_temp.creative_work_outputs (id, workspace_id, work_item_id, output_key) values ($1, $2, $3, 'creative-work/b1.png')`,
        [crypto.randomUUID(), wsMulti, item],
      );

      await client.query(migrationSql);

      const { rows } = await client.query<{ id: string; client_profile_id: string | null }>(
        `select id, client_profile_id from pg_temp.workspace_assets`,
      );
      const byId = new Map(rows.map(row => [row.id, row.client_profile_id]));

      expect(byId.get(a1)).toBe(p1); // single-brand fallback.
      expect(byId.get(a2)).toBeNull(); // curated_inspiration excluded.
      expect(byId.get(a3)).toBeNull(); // provisional excluded.
      expect(byId.get(a4)).toBe(p1); // already branded, untouched.
      expect(byId.get(a5)).toBe(p1); // foreign-workspace metadata ignored, single-brand fallback still applies.

      expect(byId.get(b1)).toBe(p2); // creative_work_outputs evidence.
      expect(byId.get(b2)).toBe(p3); // client_references evidence.
      expect(byId.get(b3)).toBe(p2); // logo_asset_key evidence.
      expect(byId.get(b4)).toBe(p3); // brand_font_assets[].assetKey evidence.
      expect(byId.get(b5)).toBe(p2); // metadata.clientProfileId evidence.
      expect(byId.get(b6)).toBeNull(); // no evidence, multi-brand workspace: no fallback.
      expect(byId.get(b7)).toBeNull(); // conflicting evidence (two distinct profiles) stays NULL.
      expect(byId.get(b8)).toBe(p2); // duplicate evidence for the SAME profile is not a conflict.
      expect(byId.get(b9)).toBeNull(); // curated_inspiration excluded despite clean evidence.
      expect(byId.get(b10)).toBeNull(); // provisional excluded despite clean evidence.
      expect(byId.get(b11)).toBe(p3); // already branded, untouched even though its metadata evidence also points to p2.

      // Idempotency: re-running the exact same migration a second time changes nothing.
      await client.query(migrationSql);
      const { rows: rowsAfterRerun } = await client.query<{ id: string; client_profile_id: string | null }>(
        `select id, client_profile_id from pg_temp.workspace_assets`,
      );
      expect(new Map(rowsAfterRerun.map(row => [row.id, row.client_profile_id]))).toEqual(byId);
    } finally {
      await teardown(conn);
    }
  });
});
