import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { inArray, sql } from "drizzle-orm";

import { db } from "@/server/db";
import { brandKnowledgeVersions, clientProfiles, user, workspaces } from "@/server/db/schema";
import { getBrandKnowledgeVersion, listBrandKnowledgeVersions } from "./brand-knowledge";

const testUrl = process.env.TEST_DATABASE_URL;
if (testUrl) {
  const parsed = new URL(testUrl);
  if (!(["localhost", "127.0.0.1"].includes(parsed.hostname) && parsed.pathname.endsWith("_test") && process.env.DATABASE_URL === testUrl)) {
    throw new Error("Brand Knowledge history test requires matching local TEST_DATABASE_URL and DATABASE_URL ending in _test");
  }
}

const createdWorkspaces: string[] = [];
const createdUsers: string[] = [];

async function scope() {
  const id = randomUUID();
  const userId = `history-${id}`;
  await db.insert(user).values({ id: userId, name: "History", email: `${id}@example.com`, emailVerified: true });
  const [workspace] = await db.insert(workspaces).values({ name: id, slug: id }).returning();
  const [profile] = await db.insert(clientProfiles).values({ workspaceId: workspace.id, name: id }).returning();
  createdUsers.push(userId);
  createdWorkspaces.push(workspace.id);
  return { userId, workspaceId: workspace.id, clientProfileId: profile.id };
}

describe.skipIf(!testUrl)("Brand Knowledge version history (Postgres)", () => {
  beforeAll(async () => {
    await db.execute(sql`select 1 from adscale_app.brand_knowledge_versions limit 0`);
  });

  afterAll(async () => {
    if (createdWorkspaces.length) await db.delete(workspaces).where(inArray(workspaces.id, createdWorkspaces));
    if (createdUsers.length) await db.delete(user).where(inArray(user.id, createdUsers));
  });

  it("lists metadata only and loads the same snapshot by scoped id", async () => {
    const own = await scope();
    const other = await scope();
    const snapshot = {
      schemaVersion: 1 as const,
      profileId: own.clientProfileId,
      compiledAt: "2026-09-24T12:00:00.000Z",
      claims: [],
      excluded: Array.from({ length: 100 }, (_, index) => ({ claimId: `${index}-${"x".repeat(128)}`, reason: "not_approved" as const })),
    };
    const [inserted] = await db.insert(brandKnowledgeVersions).values({
      workspaceId: own.workspaceId,
      clientProfileId: own.clientProfileId,
      versionNumber: 1,
      hash: "a".repeat(64),
      status: "active",
      snapshot,
      publishedByUserId: own.userId,
    }).returning();

    const versions = await listBrandKnowledgeVersions(own.workspaceId, own.clientProfileId);
    expect(versions).toHaveLength(1);
    expect(versions[0]).not.toHaveProperty("snapshot");
    const detail = await getBrandKnowledgeVersion(own.workspaceId, own.clientProfileId, inserted.id);
    expect(detail?.snapshot).toEqual(snapshot);
    expect(await getBrandKnowledgeVersion(other.workspaceId, own.clientProfileId, inserted.id)).toBeNull();
    expect(await getBrandKnowledgeVersion(own.workspaceId, other.clientProfileId, inserted.id)).toBeNull();
    expect(Buffer.byteLength(JSON.stringify(versions))).toBeLessThan(Buffer.byteLength(JSON.stringify([detail])) / 10);
  });
});
