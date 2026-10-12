import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { clientCorpusConsents, clientProfiles, user, workspaces } from "@/server/db/schema";
import { authorizeLocalLearning } from "./local-learning-authorization";

const testUrl = process.env.TEST_DATABASE_URL;
if (testUrl) {
  const parsed = new URL(testUrl);
  if (!(parsed.hostname === "localhost" && parsed.port === "5432" && parsed.pathname === "/impl_655_test" && process.env.DATABASE_URL === testUrl)) {
    throw new Error("Local learning tests require matching DATABASE_URL and TEST_DATABASE_URL for localhost:5432/impl_655_test");
  }
}

const workspaceIds: string[] = [];
const actorId = `learning-${randomUUID()}`;
let own: { workspaceId: string; clientProfileId: string };
let other: { workspaceId: string; clientProfileId: string };

async function createScope() {
  const id = randomUUID();
  const [workspace] = await db.insert(workspaces).values({ name: id, slug: id }).returning();
  workspaceIds.push(workspace.id);
  const [brand] = await db.insert(clientProfiles).values({ workspaceId: workspace.id, name: id }).returning();
  return { workspaceId: workspace.id, clientProfileId: brand.id };
}

describe.skipIf(!testUrl)("local learning authorization (Postgres)", () => {
  beforeAll(async () => {
    own = await createScope();
    other = await createScope();
    await db.insert(user).values({ id: actorId, name: "Learning", email: `${actorId}@example.com` });
  });

  afterAll(async () => {
    if (workspaceIds.length) await db.delete(workspaces).where(inArray(workspaces.id, workspaceIds));
    await db.delete(user).where(eq(user.id, actorId));
  });

  it("authorizes the own brand without a grant and after corpus consent is revoked", async () => {
    expect(await authorizeLocalLearning(own)).toEqual({ allowed: true });
    await db.insert(clientCorpusConsents).values({
      ...own, status: "revoked", reviewedByUserId: actorId, revokedAt: new Date(),
    });
    expect(await authorizeLocalLearning(own)).toEqual({ allowed: true });
  });

  it("refuses another workspace's brand and an unknown brand", async () => {
    expect(await authorizeLocalLearning({ ...own, clientProfileId: other.clientProfileId }))
      .toEqual({ allowed: false, reason: "brand_out_of_scope" });
    expect(await authorizeLocalLearning({ ...own, clientProfileId: randomUUID() }))
      .toEqual({ allowed: false, reason: "brand_out_of_scope" });
    expect(await authorizeLocalLearning(other)).toEqual({ allowed: true });
  });

  it("refuses absence and malformed scope with stable domain reasons", async () => {
    expect(await authorizeLocalLearning({ ...own, clientProfileId: null }))
      .toEqual({ allowed: false, reason: "missing_brand" });
    expect(await authorizeLocalLearning({ ...own, workspaceId: "invalid" }))
      .toEqual({ allowed: false, reason: "brand_out_of_scope" });
    expect(await authorizeLocalLearning({ ...own, clientProfileId: "invalid" }))
      .toEqual({ allowed: false, reason: "brand_out_of_scope" });
  });
});
