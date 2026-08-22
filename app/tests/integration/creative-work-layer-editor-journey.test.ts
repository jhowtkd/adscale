/**
 * Native editor acceptance journey. It uses the real Postgres repositories and
 * artifact writers, while storage, Inngest, and regeneration are controlled
 * fakes. No provider request can leave this process.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash, randomUUID } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { initializeCanvas, readPsd } from "ag-psd";
import sharp from "sharp";

import { db } from "@/server/db";
import {
  clientProfiles,
  creativeWorkItems,
  creativeWorkOutputs,
  user,
  usageEvents,
  workspaceEntitlements,
  workspaceMembers,
  workspaces,
} from "@/server/db/schema";
import { heartbeatCreativeWorkLayerEditor, openCreativeWorkLayerEditor, saveCreativeWorkLayerEditor } from "@/server/application/manage-creative-work-layer-editor";
import { requestCreativeWorkLayerRegeneration } from "@/server/application/request-creative-work-layer-regeneration";
import { publishCreativeWorkLayerEditor } from "@/server/application/publish-creative-work-layer-editor";
import { selectCreativeWorkOutputCommand } from "@/server/application/select-creative-work-output";
import {
  acceptLayerRegenerationCandidate,
  getCreativeWorkLayerEditorOutput,
  layerEditorFromOutput,
  reserveLayerRegeneration,
  rollbackReservedLayerRegeneration,
} from "@/server/repositories/creative-work-layer-editor";
import { runCreativeWorkLayerRegeneration } from "@/server/jobs/creative-work-layer-regeneration";
import { normalizeLayerCandidate } from "@/server/layer-editor/openai-provider";
import { layerizationStateSchema } from "@/server/layerize/contracts";
import { inngest } from "@/server/jobs/client";
import { objectStorage } from "@/server/storage";
import { InMemoryObjectStorage } from "@/server/storage/in-memory-object-storage";

initializeCanvas(
  () => { throw new Error("Canvas rendering is not used in this synthetic journey"); },
  () => { throw new Error("Canvas rendering is not used in this synthetic journey"); },
  (width, height) => ({ width, height, colorSpace: "srgb", data: new Uint8ClampedArray(width * height * 4) }),
);

const TEST_DB_EXPLICITLY_CONFIGURED = Boolean(process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL);
const runId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
const createdWorkspaceIds: string[] = [];
const createdUserIds: string[] = [];
const storage = new InMemoryObjectStorage();
const digest = (buffer: Buffer) => createHash("sha256").update(buffer).digest("hex");

async function transparentCandidateFixture() {
  const subject = await sharp({ create: { width: 2, height: 2, channels: 4, background: [30, 200, 80, 255] } }).png().toBuffer();
  return sharp({ create: { width: 4, height: 4, channels: 4, background: [0, 0, 0, 0] } })
    .composite([{ input: subject, left: 1, top: 1 }]).png().toBuffer();
}

describe("native layer editor journey fixture contract", () => {
  it("keeps the completed Layerize source strict-schema valid without a database", () => {
    expect(layerizationStateSchema.safeParse({
      status: "completed", attemptId: "fixture", callbackTokenHash: "a".repeat(64), callbackConsumedAt: null, requestedByUserId: "fixture-user",
      createdAt: "2026-08-22T00:00:00.000Z", updatedAt: "2026-08-22T00:00:00.000Z", callbackDeadlineAt: "2026-08-22T02:00:00.000Z",
      latencyMs: 0, providerRequestId: "fixture", providerModel: "fixture", providerEndpoint: "https://fixture.example/layerize", estimatedCostUsd: 0,
      baseWidth: 8, baseHeight: 8,
      layers: [
        { order: 0, isBase: true, name: "Base", description: "Synthetic base", x: 0, y: 0, width: 8, height: 8, normalizedBoundingBox: { x: 0, y: 0, width: 1, height: 1 }, storageKey: "fixture/base.png", sourceBytes: 1 },
        { order: 1, isBase: false, name: "Product", description: "Synthetic product", x: 3, y: 2, width: 2, height: 2, normalizedBoundingBox: { x: 0.375, y: 0.25, width: 0.25, height: 0.25 }, storageKey: "fixture/product.png", sourceBytes: 1 },
      ], psdKey: "fixture/piece.psd", diagnosticZipKey: "fixture/piece.zip", fidelity: null, failureCode: null,
    }).success).toBe(true);
  });

  it("uses a transparent regeneration candidate accepted by the production normalizer", async () => {
    const normalized = await normalizeLayerCandidate(await transparentCandidateFixture(), { width: 2, height: 2 });
    const raw = await sharp(normalized).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    expect(raw.info.width).toBe(2);
    expect([...raw.data].some((_, index) => index % raw.info.channels === 3 && raw.data[index]! < 255)).toBe(true);
  });
});

function bindStorage() {
  vi.spyOn(objectStorage, "put").mockImplementation((key, data, contentType) => storage.put(key, data, contentType));
  vi.spyOn(objectStorage, "putStream").mockImplementation((key, data, contentType, signal) => storage.putStream(key, data, contentType, signal));
  vi.spyOn(objectStorage, "get").mockImplementation((key) => storage.get(key));
  vi.spyOn(objectStorage, "head").mockImplementation((key) => storage.head(key));
  vi.spyOn(objectStorage, "delete").mockImplementation((key) => storage.delete(key));
  vi.spyOn(objectStorage, "signedDownloadUrl").mockImplementation((key, ttl) => storage.signedDownloadUrl(key, ttl));
  vi.spyOn(objectStorage, "signedUploadUrl").mockImplementation((key, ttl) => storage.signedUploadUrl(key, ttl));
}

describe.skipIf(!TEST_DB_EXPLICITLY_CONFIGURED)("creative-work native layer editor journey", () => {
  beforeAll(async () => {
    await db.execute(sql`select 1`);
    const migration = await db.execute(sql`
      select column_name from information_schema.columns
      where table_schema = 'adscale_app'
        and table_name = 'creative_work_outputs'
        and column_name = 'layer_editor'
    `);
    if (migration.rows.length === 0) throw new Error("Migration 0086 is not applied to the integration database");
    bindStorage();
  }, 30_000);

  beforeEach(() => {
    storage.clear();
    vi.restoreAllMocks();
    bindStorage();
  });

  afterAll(async () => {
    storage.clear();
    if (createdWorkspaceIds.length > 0) {
      await db.delete(usageEvents).where(inArray(usageEvents.workspaceId, createdWorkspaceIds));
      await db.delete(creativeWorkOutputs).where(inArray(creativeWorkOutputs.workspaceId, createdWorkspaceIds));
      await db.delete(creativeWorkItems).where(inArray(creativeWorkItems.workspaceId, createdWorkspaceIds));
      await db.delete(clientProfiles).where(inArray(clientProfiles.workspaceId, createdWorkspaceIds));
      await db.delete(workspaceEntitlements).where(inArray(workspaceEntitlements.workspaceId, createdWorkspaceIds));
      await db.delete(workspaceMembers).where(inArray(workspaceMembers.workspaceId, createdWorkspaceIds));
      await db.delete(workspaces).where(inArray(workspaces.id, createdWorkspaceIds));
    }
    if (createdUserIds.length > 0) await db.delete(user).where(inArray(user.id, createdUserIds));
    vi.restoreAllMocks();
  }, 30_000);

  it("keeps original artifacts private and immutable through lease, regeneration, publication, and approval", async () => {
    const memberA = `layer-editor-a-${runId}`;
    const memberB = `layer-editor-b-${runId}`;
    await db.insert(user).values([
      { id: memberA, name: "Editor A", email: `${memberA}@example.com`, emailVerified: true },
      { id: memberB, name: "Editor B", email: `${memberB}@example.com`, emailVerified: true },
    ]);
    const [workspace] = await db.insert(workspaces).values({ name: `Layer editor ${runId}`, slug: `layer-editor-${runId}` }).returning();
    await db.insert(workspaceMembers).values([
      { workspaceId: workspace.id, userId: memberA, role: "owner" },
      { workspaceId: workspace.id, userId: memberB, role: "member" },
    ]);
    await db.insert(workspaceEntitlements).values({
      workspaceId: workspace.id,
      kind: "layer_editor_v1",
      status: "active",
      metadata: { layerizeMonthlyLimit: 5, regenerationMonthlyLimit: 5 },
      startsAt: new Date(Date.now() - 60_000),
    });
    const [profile] = await db.insert(clientProfiles).values({ workspaceId: workspace.id, name: "Synthetic Layer Brand" }).returning();
    const [work] = await db.insert(creativeWorkItems).values({
      workspaceId: workspace.id,
      clientProfileId: profile.id,
      createdByUserId: memberA,
      toolKind: "social_post",
      title: "Synthetic layer editor",
      request: "Synthetic editor journey",
      brief: { theme: "Synthetic", objective: "Verify editor", audience: "Test", offer: "None" },
      format: "4:5",
      settings: { targetFormats: [] },
      status: "completed",
    }).returning();
    const originalKey = `journey/${work.id}/original.png`;
    const baseKey = `journey/${work.id}/layers/base.png`;
    const productKey = `journey/${work.id}/layers/product.png`;
    const [parent] = await db.insert(creativeWorkOutputs).values({
      workspaceId: workspace.id,
      workItemId: work.id,
      creativeLevel: "balanced",
      targetFormat: "4:5",
      operationKey: `layer-editor-parent:${runId}`,
      status: "completed",
      outputKey: originalKey,
      isSelected: true,
      quality: { schemaVersion: 1, objectiveVerdict: "pass" },
      layerization: {
        status: "completed", attemptId: `attempt-${runId}`, callbackTokenHash: "a".repeat(64), callbackConsumedAt: null,
        requestedByUserId: memberA, createdAt: "2026-08-22T00:00:00.000Z", updatedAt: "2026-08-22T00:00:00.000Z", callbackDeadlineAt: "2026-08-22T02:00:00.000Z",
        latencyMs: 0, providerRequestId: "fake-layerize", providerModel: "fake", providerEndpoint: "https://fake.example/provider", estimatedCostUsd: 0,
        baseWidth: 8, baseHeight: 8,
        layers: [
          { order: 0, isBase: true, name: "Base", description: "Synthetic base", x: 0, y: 0, width: 8, height: 8, normalizedBoundingBox: { x: 0, y: 0, width: 1, height: 1 }, storageKey: baseKey, sourceBytes: 1 },
          { order: 1, isBase: false, name: "Product", description: "Synthetic product", x: 3, y: 2, width: 2, height: 2, normalizedBoundingBox: { x: 0.375, y: 0.25, width: 0.25, height: 0.25 }, storageKey: productKey, sourceBytes: 1 },
        ],
        psdKey: "journey/private/source.psd", diagnosticZipKey: "journey/private/source.zip", fidelity: null, failureCode: null,
      },
    }).returning();
    createdWorkspaceIds.push(workspace.id);
    createdUserIds.push(memberA, memberB);

    const base = await sharp({ create: { width: 8, height: 8, channels: 4, background: [20, 30, 40, 255] } }).png().toBuffer();
    const product = await sharp({ create: { width: 2, height: 2, channels: 4, background: [220, 30, 40, 255] } }).png().toBuffer();
    const original = await sharp(base).composite([{ input: product, left: 3, top: 2 }]).png().toBuffer();
    await objectStorage.put(originalKey, original, "image/png");
    await objectStorage.put(baseKey, base, "image/png");
    await objectStorage.put(productKey, product, "image/png");
    const originalHash = digest(original);
    const baseHash = digest(base);
    const productHash = digest(product);

    const scope = { workspaceId: workspace.id, workItemId: work.id, outputId: parent.id };
    const openedByA = await openCreativeWorkLayerEditor({ ...scope, userId: memberA, userName: "Editor A", mode: "edit" });
    expect(openedByA).toMatchObject({ ok: true, document: { lease: { mode: "edit" } } });
    if (!openedByA.ok) throw new Error("Member A should own the edit lease");
    const heartbeatBeforeSave = await heartbeatCreativeWorkLayerEditor({ ...scope, userId: memberA, userName: "Editor A", leaseId: openedByA.document.lease.leaseId! });
    expect(heartbeatBeforeSave).toMatchObject({ ok: true, document: { lease: { mode: "edit" } } });
    if (!heartbeatBeforeSave.ok) throw new Error("Heartbeat should renew member A's lease");
    const openedByB = await openCreativeWorkLayerEditor({ ...scope, userId: memberB, userName: "Editor B", mode: "inspect" });
    expect(openedByB).toMatchObject({ ok: true, document: { lease: { mode: "read", leaseId: null } } });
    expect(JSON.stringify(openedByB)).not.toMatch(/currentKey|restorableKey|requestedByUserId|candidateKey/);

    const productLayer = openedByA.document.layers.find((layer) => layer.name === "Product");
    if (!productLayer || !openedByA.document.lease.leaseId) throw new Error("Synthetic product layer and lease are required");
    const saved = await saveCreativeWorkLayerEditor({
      ...scope,
      userId: memberA,
      userName: "Editor A",
      leaseId: openedByA.document.lease.leaseId,
      expectedRevision: openedByA.document.revision,
      snapshot: {
        layers: openedByA.document.layers.map((layer) => layer.id === productLayer.id
          ? { id: layer.id, order: 1, name: "Renamed product", visible: true, x: 2, y: 3, width: 2, height: 2, useSource: true }
          : { id: layer.id, order: 0, name: layer.name, visible: layer.visible, x: layer.x, y: layer.y, width: layer.width, height: layer.height, useSource: true }),
      },
    });
    expect(saved).toMatchObject({ ok: true, document: { revision: 2 } });
    if (!saved.ok) throw new Error("Save should succeed under A's lease");
    expect(saved.document.lease.expiresAt).toBe(heartbeatBeforeSave.document.lease.expiresAt);

    const rollbackOperationId = randomUUID();
    const heartbeatBeforeReserve = await heartbeatCreativeWorkLayerEditor({ ...scope, userId: memberA, userName: "Editor A", leaseId: openedByA.document.lease.leaseId! });
    expect(heartbeatBeforeReserve).toMatchObject({ ok: true });
    if (!heartbeatBeforeReserve.ok) throw new Error("Heartbeat should renew before reservation");
    const reservedForRollback = layerEditorFromOutput(await reserveLayerRegeneration({
      ...scope, userId: memberA, leaseId: openedByA.document.lease.leaseId!, expectedRevision: saved.document.revision,
      operationId: rollbackOperationId, layerId: productLayer.id, instruction: "Rollback lease check", usageKey: `journey:${rollbackOperationId}`, now: new Date(),
    }));
    if (!reservedForRollback) throw new Error("Synthetic rollback reservation is required");
    const heartbeatBeforeRollback = await heartbeatCreativeWorkLayerEditor({ ...scope, userId: memberA, userName: "Editor A", leaseId: openedByA.document.lease.leaseId! });
    expect(heartbeatBeforeRollback).toMatchObject({ ok: true });
    if (!heartbeatBeforeRollback.ok) throw new Error("Heartbeat should renew before rollback");
    const rolledBack = layerEditorFromOutput(await rollbackReservedLayerRegeneration({
      ...scope, userId: memberA, leaseId: openedByA.document.lease.leaseId!, expectedRevision: reservedForRollback.revision,
      operationId: rollbackOperationId, now: new Date(),
    }));
    expect(rolledBack).toMatchObject({ regeneration: null, lease: { expiresAt: heartbeatBeforeRollback.document.lease.expiresAt } });
    if (!rolledBack) throw new Error("Synthetic rollback should preserve the valid lease");

    const operationId = randomUUID();
    const dispatch = vi.spyOn(inngest, "send").mockResolvedValue({ ids: ["synthetic-regeneration"] } as never);
    await expect(requestCreativeWorkLayerRegeneration({
      ...scope,
      userId: memberA,
      leaseId: openedByA.document.lease.leaseId,
      expectedRevision: rolledBack.revision,
      operationId,
      layerId: productLayer.id,
      instruction: "Change only the product color",
    })).resolves.toMatchObject({ ok: true, accepted: true });
    expect(dispatch).toHaveBeenCalledOnce();
    expect(layerEditorFromOutput(await getCreativeWorkLayerEditorOutput(scope))?.lease?.expiresAt).toBe(heartbeatBeforeRollback.document.lease.expiresAt);

    const candidate = await transparentCandidateFixture();
    const provider = { regenerate: vi.fn(async () => ({ requestId: "fake-regeneration", buffer: candidate })) };
    await expect(runCreativeWorkLayerRegeneration({ ...scope, operationId }, provider)).resolves.toEqual({ status: "ready" });
    const ready = layerEditorFromOutput(await getCreativeWorkLayerEditorOutput(scope));
    expect(ready?.regeneration).toMatchObject({ id: operationId, status: "ready", layerId: productLayer.id });
    if (!ready?.regeneration?.candidateKey) throw new Error("Fake provider candidate is required");
    const heartbeatBeforeAccept = await heartbeatCreativeWorkLayerEditor({ ...scope, userId: memberA, userName: "Editor A", leaseId: openedByA.document.lease.leaseId! });
    expect(heartbeatBeforeAccept).toMatchObject({ ok: true });
    if (!heartbeatBeforeAccept.ok) throw new Error("Heartbeat should renew before accepting");

    const immutableKey = `journey/${work.id}/accepted/${operationId}.png`;
    await objectStorage.put(immutableKey, await objectStorage.get(ready.regeneration.candidateKey), "image/png");
    const accepted = await acceptLayerRegenerationCandidate({
      ...scope,
      userId: memberA,
      leaseId: openedByA.document.lease.leaseId,
      expectedRevision: ready.revision,
      operationId,
      immutableKey,
      now: new Date(),
    });
    const acceptedState = layerEditorFromOutput(accepted);
    expect(acceptedState?.lease?.expiresAt).toBe(heartbeatBeforeAccept.document.lease.expiresAt);
    expect(acceptedState?.layers.find((layer) => layer.id === productLayer.id)).toMatchObject({ currentKey: immutableKey, currentKind: "regenerated", restorableKey: null });
    const untouched = acceptedState?.layers.find((layer) => layer.id !== productLayer.id);
    expect(untouched?.currentKey).toBe(baseKey);
    await expect(objectStorage.get(originalKey).then(digest)).resolves.toBe(originalHash);
    await expect(objectStorage.get(baseKey).then(digest)).resolves.toBe(baseHash);
    await expect(objectStorage.get(productKey).then(digest)).resolves.toBe(productHash);

    if (!acceptedState?.lease?.id) throw new Error("Accepted draft retains A's lease");
    const publication = await publishCreativeWorkLayerEditor({
      ...scope,
      userId: memberA,
      leaseId: acceptedState.lease.id,
      expectedRevision: acceptedState.revision,
      operationId: randomUUID(),
    });
    expect(publication).toMatchObject({ ok: true, replay: false, output: { parentOutputId: parent.id, isSelected: false, status: "completed" } });
    if (!publication.ok) throw new Error("Publication should succeed");
    const child = await getCreativeWorkLayerEditorOutput({ workspaceId: workspace.id, workItemId: work.id, outputId: publication.output.id });
    if (!child) throw new Error("Published child row is required");
    const childState = layerEditorFromOutput(child);
    expect(childState?.layers.find((layer) => layer.id === productLayer.id)).toMatchObject({ currentKind: "source", restorableKey: null, source: { key: immutableKey } });
    const childPng = await objectStorage.get(child.outputKey!);
    if (!childState?.publishedPsdKey) throw new Error("Published child PSD is required");
    const childPsd = await objectStorage.get(childState.publishedPsdKey);
    await expect(sharp(childPng).metadata()).resolves.toMatchObject({ format: "png", width: 8, height: 8 });
    const psd = readPsd(childPsd, { skipThumbnail: true, useImageData: true });
    expect({ width: psd.width, height: psd.height }).toEqual({ width: 8, height: 8 });
    expect(psd.children?.map((layer) => layer.name)).toEqual(["Renamed product", "Base"]);

    await expect(selectCreativeWorkOutputCommand({
      workspaceId: workspace.id,
      workItemId: work.id,
      outputId: publication.output.id,
      saveToLibrary: false,
      confirmObjective: true,
    })).resolves.toMatchObject({ ok: true, value: { output: { id: publication.output.id, isSelected: true } } });
    const [persistedParent, persistedChild] = await db.select().from(creativeWorkOutputs).where(and(
      eq(creativeWorkOutputs.workspaceId, workspace.id),
      inArray(creativeWorkOutputs.id, [parent.id, publication.output.id]),
    ));
    expect(persistedParent.outputKey).toBe(originalKey);
    expect(persistedParent.isSelected).toBe(false);
    expect(persistedChild.isSelected).toBe(true);
    await expect(objectStorage.get(originalKey).then(digest)).resolves.toBe(originalHash);
  }, 30_000);
});
