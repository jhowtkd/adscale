import { randomUUID } from "node:crypto";
import { and, eq, gt, lte, sql } from "drizzle-orm";

import type { ArtRefinementState } from "../creative-work/art-refinement";
import { db } from "../db";
import { creativeWorkComparisonLeases, creativeWorkItems } from "../db/schema";

const LEASE_SECONDS = 90;
const HEARTBEAT_MS = 20_000;
const RETRY_MS = 250;

function leaseExpiry() {
  return sql`now() + make_interval(secs => ${LEASE_SECONDS})`;
}

async function claim(workspaceId: string, workItemId: string, token: string): Promise<boolean> {
  const [row] = await db.insert(creativeWorkComparisonLeases).values({
    workspaceId,
    workItemId,
    token,
    leaseExpiresAt: leaseExpiry() as unknown as Date,
  }).onConflictDoUpdate({
    target: creativeWorkComparisonLeases.workItemId,
    set: { token, leaseExpiresAt: leaseExpiry() as unknown as Date },
    setWhere: lte(creativeWorkComparisonLeases.leaseExpiresAt, sql`now()`),
  }).returning({ token: creativeWorkComparisonLeases.token });
  return row?.token === token;
}

async function renew(workspaceId: string, workItemId: string, token: string): Promise<boolean> {
  const [row] = await db.update(creativeWorkComparisonLeases).set({
    leaseExpiresAt: leaseExpiry() as unknown as Date,
  }).where(and(
    eq(creativeWorkComparisonLeases.workspaceId, workspaceId),
    eq(creativeWorkComparisonLeases.workItemId, workItemId),
    eq(creativeWorkComparisonLeases.token, token),
    gt(creativeWorkComparisonLeases.leaseExpiresAt, sql`now()`),
  )).returning({ token: creativeWorkComparisonLeases.token });
  return row?.token === token;
}

async function release(workspaceId: string, workItemId: string, token: string): Promise<void> {
  await db.delete(creativeWorkComparisonLeases).where(and(
    eq(creativeWorkComparisonLeases.workspaceId, workspaceId),
    eq(creativeWorkComparisonLeases.workItemId, workItemId),
    eq(creativeWorkComparisonLeases.token, token),
  ));
}

/** One process compares a Work at a time; no DB connection is held across image or model calls. */
export async function withCreativeWorkComparisonLease(
  workspaceId: string,
  workItemId: string,
  callback: (token: string) => Promise<void>,
): Promise<void> {
  const token = randomUUID();
  while (true) {
    try {
      if (await claim(workspaceId, workItemId, token)) break;
    } catch (error) {
      const [work] = await db.select({ id: creativeWorkItems.id }).from(creativeWorkItems).where(and(
        eq(creativeWorkItems.workspaceId, workspaceId),
        eq(creativeWorkItems.id, workItemId),
      )).limit(1);
      if (!work) return;
      throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, RETRY_MS));
  }

  let lost = false;
  let renewal = Promise.resolve();
  const heartbeat = setInterval(() => {
    renewal = renewal.then(async () => {
      if (!lost && !(await renew(workspaceId, workItemId, token))) lost = true;
    }).catch(() => { lost = true; });
  }, HEARTBEAT_MS);

  try {
    await callback(token);
    await renewal;
    if (lost) throw new Error("Art comparison lease lost");
  } finally {
    clearInterval(heartbeat);
    await renewal;
    await release(workspaceId, workItemId, token).catch(() => undefined);
  }
}

/** The short row lock fences a worker whose lease expired during an external call. */
export async function setArtRefinementStateWithComparisonLease(
  workspaceId: string,
  workItemId: string,
  token: string,
  state: ArtRefinementState,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [lease] = await tx.select({ token: creativeWorkComparisonLeases.token })
      .from(creativeWorkComparisonLeases)
      .where(and(
        eq(creativeWorkComparisonLeases.workspaceId, workspaceId),
        eq(creativeWorkComparisonLeases.workItemId, workItemId),
        gt(creativeWorkComparisonLeases.leaseExpiresAt, sql`now()`),
      )).for("update").limit(1);
    if (lease?.token !== token) return false;
    const [updated] = await tx.update(creativeWorkItems).set({
      artRefinementState: state,
      updatedAt: new Date(),
    }).where(and(
      eq(creativeWorkItems.workspaceId, workspaceId),
      eq(creativeWorkItems.id, workItemId),
    )).returning({ id: creativeWorkItems.id });
    return Boolean(updated);
  });
}
