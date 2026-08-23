/**
 * Primary Layerize journey at the HTTP boundary.
 *
 * Real: Better Auth session cookie, workspace authorization, Postgres,
 * application services, repositories, PSD readback, on-demand ZIP.
 *
 * Still intercepted:
 * - `inngest.send` does not go through `/api/inngest` or Inngest Cloud
 * - continuation calls `layerizationJobHandler` in-process
 * - `objectStorage` methods are delegated to `InMemoryObjectStorage`, not R2
 * - fal HTTP is a fake server
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomBytes, randomUUID } from "node:crypto";
import { eq, inArray, sql } from "drizzle-orm";
import { initializeCanvas, readPsd } from "ag-psd";
import JSZip from "jszip";
import sharp from "sharp";

const envBeforeTest = vi.hoisted(() => {
  const previous = {
    atlasCloudKey: process.env.ATLASCLOUD_API_KEY,
    ownerEmails: process.env.PLATFORM_OWNER_EMAILS,
    authSecret: process.env.BETTER_AUTH_SECRET,
    authUrl: process.env.BETTER_AUTH_URL,
    appUrl: process.env.APP_URL,
  };
  process.env.ATLASCLOUD_API_KEY = "test-atlas-key";
  process.env.PLATFORM_OWNER_EMAILS = "layerize-owner@example.com";
  process.env.BETTER_AUTH_SECRET ??= "layerize-journey-secret-32-chars-min";
  process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
  process.env.APP_URL ??= "http://localhost:3000";
  return previous;
});

vi.mock("node:dns/promises", () => ({
  lookup: vi.fn(async () => [{ address: "93.184.216.34", family: 4 }]),
}));

import { db } from "@/server/db";
import {
  clientProfiles,
  creativeWorkItems,
  creativeWorkOutputs,
  session,
  user,
  usageEvents,
  workspaceEntitlements,
  workspaceMembers,
  workspaces,
} from "@/server/db/schema";
import { inngest } from "@/server/jobs/client";
import { layerizationJobHandler } from "@/server/jobs/creative-work-layerization";
import { objectStorage } from "@/server/storage";
import { InMemoryObjectStorage } from "@/server/storage/in-memory-object-storage";
import { GET, PATCH, POST } from "@/app/api/creative-work/[id]/route";
import { GET as downloadOutput } from "@/app/api/creative-work/[id]/outputs/[outputId]/download/route";

initializeCanvas(
  () => { throw new Error("Canvas rendering is not used in this test"); },
  () => { throw new Error("Thumbnail rendering is not used in this test"); },
  (width, height) => ({ width, height, colorSpace: "srgb", data: new Uint8ClampedArray(width * height * 4) }),
);

const TEST_DB_EXPLICITLY_CONFIGURED = Boolean(process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL);
const runId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const createdWorkspaceIds: string[] = [];
const createdUserIds: string[] = [];
const createdSessionTokens: string[] = [];
const memory = new InMemoryObjectStorage();
const dispatched: Array<{ data: { workspaceId: string; workItemId: string; outputId: string; attemptId: string; callbackUrl?: string } }> = [];

function bindProductionStorage() {
  vi.spyOn(objectStorage, "put").mockImplementation((key, data, contentType) => memory.put(key, data, contentType));
  vi.spyOn(objectStorage, "putStream").mockImplementation((key, data, contentType, signal) => memory.putStream(key, data, contentType, signal));
  vi.spyOn(objectStorage, "get").mockImplementation((key) => memory.get(key));
  vi.spyOn(objectStorage, "head").mockImplementation((key) => memory.head(key));
  vi.spyOn(objectStorage, "delete").mockImplementation((key) => memory.delete(key));
  vi.spyOn(objectStorage, "signedDownloadUrl").mockImplementation((key) => memory.signedDownloadUrl(key));
  vi.spyOn(objectStorage, "signedUploadUrl").mockImplementation((key) => memory.signedUploadUrl(key));
}

async function signedSessionCookie(token: string): Promise<string> {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error("BETTER_AUTH_SECRET is required for a real Better Auth session");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(token));
  const encoded = encodeURIComponent(`${token}.${btoa(String.fromCharCode(...new Uint8Array(signature)))}`);
  return `better-auth.session_token=${encoded}`;
}

async function continueDispatchedJob(event = dispatched.at(-1)) {
  if (!event) throw new Error("No layerization event was dispatched");
  return layerizationJobHandler({
    event: { data: event.data },
    step: {
      run: async (_name, fn) => fn(),
      sleep: async () => undefined,
    },
  });
}

describe.skipIf(!TEST_DB_EXPLICITLY_CONFIGURED)("creative-work layerization HTTP journey", () => {
  beforeAll(async () => {
    await db.execute(sql`select 1`);
    const migration = await db.execute(sql`
      select column_name from information_schema.columns
      where table_schema = 'adscale_app'
        and table_name = 'creative_work_outputs'
        and column_name = 'layerization'
    `);
    if (migration.rows.length === 0) throw new Error("Migration 0085 is not applied to the integration database");
    bindProductionStorage();
    vi.spyOn(inngest, "send").mockImplementation(async (payload) => {
      dispatched.push(payload as (typeof dispatched)[number]);
      return { ids: [`evt-${dispatched.length}`] };
    });
  }, 30_000);

  beforeEach(() => {
    dispatched.length = 0;
    memory.clear();
  });

  afterAll(async () => {
    memory.clear();
    if (createdWorkspaceIds.length > 0) {
      await db.delete(usageEvents).where(inArray(usageEvents.workspaceId, createdWorkspaceIds));
      await db.delete(creativeWorkOutputs).where(inArray(creativeWorkOutputs.workspaceId, createdWorkspaceIds));
      await db.delete(creativeWorkItems).where(inArray(creativeWorkItems.workspaceId, createdWorkspaceIds));
      await db.delete(clientProfiles).where(inArray(clientProfiles.workspaceId, createdWorkspaceIds));
      await db.delete(workspaceEntitlements).where(inArray(workspaceEntitlements.workspaceId, createdWorkspaceIds));
      await db.delete(workspaceMembers).where(inArray(workspaceMembers.workspaceId, createdWorkspaceIds));
      await db.delete(workspaces).where(inArray(workspaces.id, createdWorkspaceIds));
    }
    if (createdSessionTokens.length > 0) {
      await db.delete(session).where(inArray(session.token, createdSessionTokens));
    }
    if (createdUserIds.length > 0) await db.delete(user).where(inArray(user.id, createdUserIds));
    if (envBeforeTest.atlasCloudKey === undefined) delete process.env.ATLASCLOUD_API_KEY;
    else process.env.ATLASCLOUD_API_KEY = envBeforeTest.atlasCloudKey;
    if (envBeforeTest.ownerEmails === undefined) delete process.env.PLATFORM_OWNER_EMAILS;
    else process.env.PLATFORM_OWNER_EMAILS = envBeforeTest.ownerEmails;
    if (envBeforeTest.authSecret === undefined) delete process.env.BETTER_AUTH_SECRET;
    else process.env.BETTER_AUTH_SECRET = envBeforeTest.authSecret;
    if (envBeforeTest.authUrl === undefined) delete process.env.BETTER_AUTH_URL;
    else process.env.BETTER_AUTH_URL = envBeforeTest.authUrl;
    if (envBeforeTest.appUrl === undefined) delete process.env.APP_URL;
    else process.env.APP_URL = envBeforeTest.appUrl;
    vi.restoreAllMocks();
  }, 30_000);

  it("claims through HTTP, continues the dispatched job, and serves the private PSD", async () => {
    const userId = `layerize-${runId}`;
    const sessionToken = randomBytes(32).toString("hex");
    await db.insert(user).values({
      id: userId,
      name: "Layerize Owner",
      email: "layerize-owner@example.com",
      emailVerified: true,
    });
    await db.insert(session).values({
      id: randomUUID(),
      userId,
      token: sessionToken,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    const [workspace] = await db.insert(workspaces).values({ name: `Layerize ${runId}`, slug: `layerize-${runId}` }).returning();
    await db.insert(workspaceMembers).values({ workspaceId: workspace.id, userId, role: "owner" });
    await db.insert(workspaceEntitlements).values({
      workspaceId: workspace.id,
      kind: "layer_editor_v1",
      status: "active",
      metadata: { layerizeMonthlyLimit: 5, regenerationMonthlyLimit: 5 },
      startsAt: new Date(Date.now() - 60_000),
    });
    const [profile] = await db.insert(clientProfiles).values({ workspaceId: workspace.id, name: "Synthetic brand" }).returning();
    const [work] = await db.insert(creativeWorkItems).values({
      workspaceId: workspace.id,
      clientProfileId: profile.id,
      createdByUserId: userId,
      toolKind: "social_post",
      title: "Synthetic layerization",
      request: "Synthetic integration fixture",
      format: "4:5",
      settings: { targetFormats: [] },
      status: "completed",
    }).returning();
    const sourceKey = `creative-work/${work.id}/original.png`;
    const [output] = await db.insert(creativeWorkOutputs).values({
      workspaceId: workspace.id,
      workItemId: work.id,
      creativeLevel: "balanced",
      targetFormat: "4:5",
      operationKey: "balanced:4:5:1",
      status: "completed",
      outputKey: sourceKey,
      isSelected: true,
    }).returning();
    createdUserIds.push(userId);
    createdWorkspaceIds.push(workspace.id);
    createdSessionTokens.push(sessionToken);

    const base = await sharp({ create: { width: 8, height: 8, channels: 4, background: [20, 30, 40, 255] } }).png().toBuffer();
    const overlay = await sharp({ create: { width: 2, height: 2, channels: 4, background: [220, 30, 40, 255] } }).png().toBuffer();
    const original = await sharp(base).composite([{ input: overlay, left: 3, top: 2 }]).png().toBuffer();
    await objectStorage.put(sourceKey, original, "image/png");

    const authHeaders = {
      "content-type": "application/json",
      cookie: `${await signedSessionCookie(sessionToken)}; adscale_active_workspace=${workspace.id}`,
    };
    const operationId = randomUUID();
    const accepted = await PATCH(new Request(`https://app.example/api/creative-work/${work.id}`, {
      method: "PATCH",
      headers: authHeaders,
      body: JSON.stringify({ action: "layerizeOutput", outputId: output.id, operationId }),
    }), { params: Promise.resolve({ id: work.id }) });
    expect(accepted.status).toBe(202);
    expect(dispatched).toHaveLength(1);
    const event = dispatched[0].data;

    const patchReplay = await PATCH(new Request(`https://app.example/api/creative-work/${work.id}`, {
      method: "PATCH",
      headers: authHeaders,
      body: JSON.stringify({ action: "layerizeOutput", outputId: output.id, operationId }),
    }), { params: Promise.resolve({ id: work.id }) });
    expect(patchReplay.status).toBe(200);
    await expect(patchReplay.json()).resolves.toMatchObject({ replay: true });
    expect(dispatched).toHaveLength(1);

    const providerPayload = {
      data: {
        id: "request-1",
        status: "completed",
        outputs: [
          "https://storage.atlascloud.ai/base.png",
          "https://storage.atlascloud.ai/overlay.png",
        ],
        layers: [
          { z_index: 0, bounding_box: null },
        {
          z_index: 1,
          name: "Product",
          description: "Synthetic foreground",
          bounding_box: { absolute: [3, 2, 5, 4], normalized: [375, 250, 625, 500] },
        },
        ],
      },
    };
    const fetchedUrls: string[] = [];
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = input.toString();
      fetchedUrls.push(url);
      if (url.endsWith("/prediction/request-1")) return new Response(JSON.stringify(providerPayload), { status: 200 });
      if (url.endsWith("base.png")) return new Response(base, { status: 200, headers: { "content-type": "image/png" } });
      if (url.endsWith("overlay.png")) return new Response(overlay, { status: 200, headers: { "content-type": "image/png" } });
      throw new Error(`Unexpected Atlas request: ${url}`);
    });

    const callbackRequest = () => new Request(event.callbackUrl!, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "OK", request_id: "request-1" }),
    });
    const [callback, handlerResult] = await Promise.all([
      POST(callbackRequest(), { params: Promise.resolve({ id: work.id }) }),
      continueDispatchedJob(dispatched[0]),
    ]);
    expect(callback.status).toBe(202);
    expect(handlerResult).toEqual({ status: "completed" });
    expect(fetchedUrls.filter((url) => url.endsWith("base.png"))).toHaveLength(1);
    expect(fetchedUrls.filter((url) => url.endsWith("overlay.png"))).toHaveLength(1);
    const replay = await POST(callbackRequest(), { params: Promise.resolve({ id: work.id }) });
    expect(replay.status).toBe(202);
    await expect(replay.json()).resolves.toMatchObject({ replay: true });

    let [persisted] = await db.select().from(creativeWorkOutputs).where(eq(creativeWorkOutputs.id, output.id)).limit(1);
    expect(persisted.outputKey).toBe(sourceKey);
    expect(persisted.layerization).toMatchObject({ status: "completed", estimatedCostUsd: 0.1575 });

    const completedLayerization = persisted.layerization as Record<string, unknown>;
    await db.update(creativeWorkOutputs).set({
      layerization: {
        ...completedLayerization,
        status: "finalizing",
        updatedAt: "2026-08-12T10:00:00.000Z",
      },
    }).where(eq(creativeWorkOutputs.id, output.id));
    const detailRequest = () => new Request(`https://app.example/api/creative-work/${work.id}`, {
      headers: { cookie: authHeaders.cookie },
    });
    const sendsBeforeFinalizingRecovery = dispatched.length;
    const finalizingRecovery = await GET(detailRequest(), { params: Promise.resolve({ id: work.id }) });
    expect(finalizingRecovery.status).toBe(200);
    expect(dispatched).toHaveLength(sendsBeforeFinalizingRecovery + 1);
    await expect(continueDispatchedJob(dispatched.at(-1))).resolves.toEqual({ status: "completed" });
    [persisted] = await db.select().from(creativeWorkOutputs).where(eq(creativeWorkOutputs.id, output.id)).limit(1);
    expect(persisted.layerization).toMatchObject({ status: "completed" });
    fetchSpy.mockRestore();

    const download = await downloadOutput(new Request(
      `https://app.example/api/creative-work/${work.id}/outputs/${output.id}/download?format=psd`,
      { headers: { accept: "application/json", cookie: authHeaders.cookie } },
    ), { params: Promise.resolve({ id: work.id, outputId: output.id }) });
    expect(download.status).toBe(200);
    const { url } = await download.json() as { url: string };
    const psd = await objectStorage.get(url.replace("memory://download/", ""));
    const parsed = readPsd(psd, { skipThumbnail: true, useImageData: true });
    expect(parsed.children?.map((layer) => layer.name)).toEqual(["Base", "Product"]);
    expect(parsed.children?.map(({ left, top, right, bottom }) => ({ left, top, right, bottom }))).toEqual([
      { left: 0, top: 0, right: 8, bottom: 8 },
      { left: 3, top: 2, right: 5, bottom: 4 },
    ]);
    expect(parsed.imageData?.data).toBeDefined();
    expect(parsed.children?.every((layer) => layer.imageData?.data)).toBe(true);

    const zipDownload = await downloadOutput(new Request(
      `https://app.example/api/creative-work/${work.id}/outputs/${output.id}/download?format=zip`,
      { headers: { accept: "application/json", cookie: authHeaders.cookie } },
    ), { params: Promise.resolve({ id: work.id, outputId: output.id }) });
    expect(zipDownload.status).toBe(200);
    const { url: zipUrl } = await zipDownload.json() as { url: string };
    const zip = await JSZip.loadAsync(await objectStorage.get(zipUrl.replace("memory://download/", "")));
    expect(Object.keys(zip.files)).toEqual(expect.arrayContaining([
      "manifest.json",
      "original.png",
      "recomposed-preview.png",
      "layers/00-base.png",
      "layers/01-product.png",
    ]));
    await expect(zip.file("manifest.json")?.async("string")).resolves.toContain('"attemptId":');

    const expiredLayerization = {
      status: "queued" as const,
      attemptId: "queued-attempt",
      callbackTokenHash: "a".repeat(64),
      callbackConsumedAt: null,
      requestedByUserId: userId,
      createdAt: "2026-08-12T10:00:00.000Z",
      updatedAt: "2026-08-12T10:00:00.000Z",
      callbackDeadlineAt: "2026-08-12T12:00:00.000Z",
      latencyMs: null,
      providerRequestId: null,
      providerModel: "bytedance/seedream-v5.0-pro/layer-decomposition",
      providerEndpoint: "https://api.atlascloud.ai/api/v1/model/generateImage",
      estimatedCostUsd: null,
      baseWidth: null,
      baseHeight: null,
      layers: [],
      psdKey: null,
      diagnosticZipKey: null,
      fidelity: null,
      failureCode: null,
    };
    const [expiredQueued] = await db.insert(creativeWorkOutputs).values({
      workspaceId: workspace.id,
      workItemId: work.id,
      creativeLevel: "balanced",
      targetFormat: "4:5",
      versionNumber: 2,
      operationKey: "balanced:4:5:queued-recovery",
      status: "completed",
      outputKey: sourceKey,
      isSelected: false,
      layerization: expiredLayerization,
    }).returning();
    const sendsBeforeQueuedRecovery = dispatched.length;
    const queuedRecovery = await GET(detailRequest(), { params: Promise.resolve({ id: work.id }) });
    expect(queuedRecovery.status).toBe(200);
    const queuedBody = await queuedRecovery.json();
    expect(queuedBody.outputs.find((candidate: { id: string }) => candidate.id === expiredQueued.id).layerization.status).toBe("submission_unknown");
    expect(dispatched).toHaveLength(sendsBeforeQueuedRecovery);

    await db.update(creativeWorkOutputs).set({
      layerization: { ...expiredLayerization, status: "reconciling", attemptId: "recovery-attempt", providerRequestId: "request-recovery" },
    }).where(eq(creativeWorkOutputs.id, expiredQueued.id));
    vi.mocked(inngest.send).mockRejectedValueOnce(new Error("inngest unavailable"));
    const failedDispatch = await GET(detailRequest(), { params: Promise.resolve({ id: work.id }) });
    expect(failedDispatch.status).toBe(200);
    expect(dispatched).toHaveLength(sendsBeforeQueuedRecovery);
    const knownRecovery = await GET(detailRequest(), { params: Promise.resolve({ id: work.id }) });
    expect(knownRecovery.status).toBe(200);
    expect(dispatched).toHaveLength(sendsBeforeQueuedRecovery + 1);
    expect(dispatched.at(-1)?.data).toMatchObject({
      outputId: expiredQueued.id,
      attemptId: "recovery-attempt",
    });
  }, 30_000);
});
