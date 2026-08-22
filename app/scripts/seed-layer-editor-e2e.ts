/**
 * Synthetic local fixture for the native layer-editor Playwright flow.
 *
 * It reuses the dedicated Create Post E2E account, writes only generated
 * Sharp buffers to configured object storage, and persists ids/login only in
 * `tests/fixtures/layer-editor-e2e.json` (a runtime fixture, never a source
 * of customer media or provider credentials).
 */
import "./load-env";

import fs from "node:fs";
import path from "node:path";
import { and, eq, inArray, like } from "drizzle-orm";
import sharp from "sharp";

import { db } from "../src/server/db";
import {
  clientProfiles,
  creativeWorkItems,
  creativeWorkOutputs,
  user,
  usageEvents,
  workspaceEntitlements,
  workspaceMembers,
} from "../src/server/db/schema";
import { createClientProfile } from "../src/server/repositories/client-reference";
import { objectStorage } from "../src/server/storage";

const E2E_EMAIL = "frictionless-e2e@adscale.local";
const E2E_PASSWORD = "FrictionlessE2E123!";
const PROFILE_NAME = "Layer Editor E2E Brand";
const FIXTURE_PATH = process.env.LAYER_EDITOR_E2E_FIXTURE_PATH
  ? path.resolve(process.env.LAYER_EDITOR_E2E_FIXTURE_PATH)
  : path.resolve(__dirname, "../tests/fixtures/layer-editor-e2e.json");

async function resolveLocalE2EWorkspace() {
  const [account] = await db.select().from(user).where(eq(user.email, E2E_EMAIL)).limit(1);
  if (!account) throw new Error(`Missing ${E2E_EMAIL}. Run npm run seed:create-post-e2e first.`);
  const [membership] = await db.select().from(workspaceMembers).where(eq(workspaceMembers.userId, account.id)).limit(1);
  if (!membership) throw new Error(`Dedicated E2E user ${E2E_EMAIL} has no workspace.`);
  return { userId: account.id, workspaceId: membership.workspaceId };
}

async function ensureProfile(workspaceId: string) {
  const [existing] = await db.select().from(clientProfiles).where(and(
    eq(clientProfiles.workspaceId, workspaceId),
    eq(clientProfiles.name, PROFILE_NAME),
  )).limit(1);
  return existing ?? createClientProfile(workspaceId, { name: PROFILE_NAME });
}

async function clearPreviousFixture(workspaceId: string) {
  const previous = await db.select({ id: creativeWorkItems.id }).from(creativeWorkItems).where(and(
    eq(creativeWorkItems.workspaceId, workspaceId),
    like(creativeWorkItems.title, "Layer Editor E2E%"),
  ));
  const ids = previous.map((work) => work.id);
  if (ids.length === 0) return;
  await db.delete(creativeWorkOutputs).where(inArray(creativeWorkOutputs.workItemId, ids));
  await db.delete(creativeWorkItems).where(inArray(creativeWorkItems.id, ids));
}

async function syntheticPng(width: number, height: number, background: [number, number, number, number]) {
  return sharp({ create: { width, height, channels: 4, background } }).png().toBuffer();
}

type Variant = { label: string; selected: boolean; foreignLeaseUserId?: string; readyCandidate?: boolean };

async function seedVariant(input: { workspaceId: string; userId: string; profileId: string; variant: Variant }) {
  const [work] = await db.insert(creativeWorkItems).values({
    workspaceId: input.workspaceId,
    clientProfileId: input.profileId,
    createdByUserId: input.userId,
    toolKind: "social_post",
    title: `Layer Editor E2E ${input.variant.label}`,
    request: "Synthetic native layer editor fixture",
    brief: { theme: "Synthetic fixture", objective: "Exercise native editor", audience: "QA", offer: "None" },
    format: "4:5",
    settings: { targetFormats: [] },
    status: "completed",
  }).returning();
  const prefix = `e2e/layer-editor/${input.workspaceId.slice(0, 8)}/${work.id.slice(0, 8)}`;
  const [base, product, candidate] = await Promise.all([
    syntheticPng(160, 100, [20, 32, 56, 255]),
    syntheticPng(56, 28, [220, 72, 92, 255]),
    input.variant.readyCandidate ? syntheticPng(56, 28, [40, 196, 104, 255]) : Promise.resolve(null),
  ]);
  const original = await sharp(base).composite([{ input: product, left: 52, top: 36 }]).png().toBuffer();
  const originalKey = `${prefix}/original.png`;
  const baseKey = `${prefix}/layers/base.png`;
  const productKey = `${prefix}/layers/product.png`;
  const candidateKey = candidate ? `${prefix}/candidates/product.png` : null;
  await Promise.all([
    objectStorage.put(originalKey, original, "image/png"),
    objectStorage.put(baseKey, base, "image/png"),
    objectStorage.put(productKey, product, "image/png"),
    candidate && candidateKey ? objectStorage.put(candidateKey, candidate, "image/png") : Promise.resolve(),
  ]);
  const baseId = crypto.randomUUID();
  const productId = crypto.randomUUID();
  const now = new Date().toISOString();
  const lease = input.variant.foreignLeaseUserId ? {
    id: crypto.randomUUID(), userId: input.variant.foreignLeaseUserId,
    acquiredAt: now, expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
  } : null;
  const regeneration = input.variant.readyCandidate ? {
    id: crypto.randomUUID(), status: "ready" as const, layerId: productId, instruction: "Synthetic ready candidate",
    requestedByUserId: input.userId, usageKey: `layer-editor-e2e:candidate:${work.id}`,
    candidateKey, providerRequestId: "synthetic-candidate", failureCode: null, createdAt: now, updatedAt: now,
  } : null;
  const [output] = await db.insert(creativeWorkOutputs).values({
    workspaceId: input.workspaceId,
    workItemId: work.id,
    creativeLevel: "balanced",
    targetFormat: "4:5",
    operationKey: `layer-editor-e2e:${work.id}`,
    status: "completed",
    outputKey: originalKey,
    isSelected: input.variant.selected,
    quality: { schemaVersion: 1, objectiveVerdict: "pass", e2eFixture: true },
    layerization: {
      status: "completed", attemptId: `layer-editor-e2e:${work.id}`, callbackTokenHash: "a".repeat(64), callbackConsumedAt: null,
      requestedByUserId: input.userId, createdAt: now, updatedAt: now, callbackDeadlineAt: null,
      latencyMs: 0, providerRequestId: "synthetic-layerize", providerModel: "synthetic", providerEndpoint: "local://seed", estimatedCostUsd: 0,
      baseWidth: 160, baseHeight: 100,
      layers: [
        { order: 0, isBase: true, name: "Base", description: null, x: 0, y: 0, width: 160, height: 100, normalizedBoundingBox: null, storageKey: baseKey, sourceBytes: base.byteLength },
        { order: 1, isBase: false, name: "Product", description: null, x: 52, y: 36, width: 56, height: 28, normalizedBoundingBox: null, storageKey: productKey, sourceBytes: product.byteLength },
      ],
      psdKey: `${prefix}/source.psd`, diagnosticZipKey: `${prefix}/source.zip`, fidelity: null, failureCode: null,
    },
    layerEditor: {
      schemaVersion: 1, revision: 1, sourceLayerizationAttemptId: `layer-editor-e2e:${work.id}`,
      canvas: { width: 160, height: 100 },
      layers: [
        { id: baseId, source: { order: 1, name: "Base", visible: true, x: 0, y: 0, width: 160, height: 100, key: baseKey }, order: 1, name: "Base", visible: true, x: 0, y: 0, width: 160, height: 100, currentKey: baseKey, currentKind: "source", restorableKey: null },
        { id: productId, source: { order: 0, name: "Product", visible: true, x: 52, y: 36, width: 56, height: 28, key: productKey }, order: 0, name: "Product", visible: true, x: 52, y: 36, width: 56, height: 28, currentKey: productKey, currentKind: "source", restorableKey: null },
      ],
      lease, regeneration, publishedPsdKey: null, updatedAt: now,
    },
  }).returning();
  return { workItemId: work.id, outputId: output.id };
}

async function main() {
  if (!process.env.DATABASE_URL && !process.env.TEST_DATABASE_URL) {
    throw new Error("Local layer-editor E2E seed requires DATABASE_URL or TEST_DATABASE_URL.");
  }
  const { userId, workspaceId } = await resolveLocalE2EWorkspace();
  await clearPreviousFixture(workspaceId);
  const profile = await ensureProfile(workspaceId);
  await db.insert(workspaceEntitlements).values({
    workspaceId,
    kind: "layer_editor_v1",
    status: "active",
    metadata: { layerizeMonthlyLimit: 5, regenerationMonthlyLimit: 5 },
    startsAt: new Date(Date.now() - 60_000),
    updatedAt: new Date(),
  }).onConflictDoUpdate({
    target: [workspaceEntitlements.workspaceId, workspaceEntitlements.kind],
    set: {
      status: "active",
      metadata: { layerizeMonthlyLimit: 5, regenerationMonthlyLimit: 5 },
      startsAt: new Date(Date.now() - 60_000),
      expiresAt: null,
      updatedAt: new Date(),
    },
  });

  const foreignEmail = `layer-editor-foreign-${workspaceId.slice(0, 8)}@adscale.local`;
  const [existingForeign] = await db.select().from(user).where(eq(user.email, foreignEmail)).limit(1);
  const foreignUserId = existingForeign?.id ?? crypto.randomUUID();
  if (!existingForeign) await db.insert(user).values({ id: foreignUserId, name: "Foreign E2E editor", email: foreignEmail, emailVerified: true });
  const [foreignMembership] = await db.select().from(workspaceMembers).where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, foreignUserId))).limit(1);
  if (!foreignMembership) await db.insert(workspaceMembers).values({ workspaceId, userId: foreignUserId, role: "member" });
  await db.delete(usageEvents).where(and(eq(usageEvents.workspaceId, workspaceId), like(usageEvents.idempotencyKey, "layer-editor-e2e:regeneration:%")));
  await db.insert(usageEvents).values(Array.from({ length: 5 }, (_, index) => ({
    workspaceId, type: "layer_regeneration_v1", amount: 1,
    idempotencyKey: `layer-editor-e2e:regeneration:${index}`,
    metadata: { synthetic: true },
  })));
  const primary = await seedVariant({ workspaceId, userId, profileId: profile.id, variant: { label: "primary", selected: true } });
  const candidate = await seedVariant({ workspaceId, userId, profileId: profile.id, variant: { label: "ready candidate", selected: true, readyCandidate: true } });
  const foreign = await seedVariant({ workspaceId, userId, profileId: profile.id, variant: { label: "foreign lease", selected: false, foreignLeaseUserId } });
  const fixture = { email: E2E_EMAIL, password: E2E_PASSWORD, userId, workspaceId, ...primary, readyCandidateWorkItemId: candidate.workItemId, readyCandidateOutputId: candidate.outputId, foreignLeaseWorkItemId: foreign.workItemId, foreignLeaseOutputId: foreign.outputId };
  fs.mkdirSync(path.dirname(FIXTURE_PATH), { recursive: true });
  fs.writeFileSync(FIXTURE_PATH, `${JSON.stringify(fixture, null, 2)}\n`);
  console.log("Layer editor E2E seed ready:");
  console.log(JSON.stringify({ ...fixture, password: "[synthetic login omitted]" }, null, 2));
}

main().then(
  () => process.exit(0),
  (error: unknown) => { console.error(error); process.exit(1); },
);
