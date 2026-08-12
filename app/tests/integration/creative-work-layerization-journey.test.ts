import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq, inArray, sql } from "drizzle-orm";
import { initializeCanvas, readPsd } from "ag-psd";
import sharp from "sharp";

const envBeforeTest = vi.hoisted(() => {
  const previous = {
    falKey: process.env.FAL_KEY,
    ownerEmails: process.env.PLATFORM_OWNER_EMAILS,
  };
  process.env.FAL_KEY = "test-fal-key";
  process.env.PLATFORM_OWNER_EMAILS = "layerize-owner@example.com";
  return previous;
});
const sessionState = vi.hoisted(() => ({
  user: { id: "", email: "layerize-owner@example.com", name: "Layerize Owner" },
}));
const sendMock = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock("@/server/auth", () => ({
  auth: { api: { getSession: vi.fn(async () => ({ user: sessionState.user })) } },
}));
vi.mock("@/server/jobs/client", () => ({
  inngest: {
    send: (...args: unknown[]) => sendMock(...args),
    createFunction: vi.fn((options: unknown, handler: unknown) => ({ options, fn: handler })),
  },
}));
vi.mock("@/server/storage", async () => {
  const { InMemoryObjectStorage } = await import("@/server/storage/in-memory-object-storage");
  return { objectStorage: new InMemoryObjectStorage() };
});
vi.mock("node:dns/promises", () => ({
  lookup: vi.fn(async () => [{ address: "93.184.216.34", family: 4 }]),
}));

import { db } from "@/server/db";
import {
  clientProfiles,
  creativeWorkItems,
  creativeWorkOutputs,
  user,
  workspaceMembers,
  workspaces,
} from "@/server/db/schema";
import { objectStorage } from "@/server/storage";
import { InMemoryObjectStorage } from "@/server/storage/in-memory-object-storage";
import { PATCH, POST } from "@/app/api/creative-work/[id]/route";
import { GET as downloadOutput } from "@/app/api/creative-work/[id]/outputs/[outputId]/download/route";
import { creativeWorkLayerizationJob } from "@/server/jobs/creative-work-layerization";
import { markCreativeWorkLayerizationReconciling } from "@/server/repositories/creative-work-layerization";

initializeCanvas(
  () => { throw new Error("Canvas rendering is not used in this test"); },
  () => { throw new Error("Thumbnail rendering is not used in this test"); },
  (width, height) => ({ width, height, colorSpace: "srgb", data: new Uint8ClampedArray(width * height * 4) }),
);

const TEST_DB_EXPLICITLY_CONFIGURED = Boolean(process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL);
const runId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const createdWorkspaceIds: string[] = [];
const createdUserIds: string[] = [];
const storage = objectStorage as InMemoryObjectStorage;

describe.skipIf(!TEST_DB_EXPLICITLY_CONFIGURED)("creative-work layerization HTTP journey", () => {
  beforeAll(async () => {
    await db.execute(sql`select 1`);
    const migration = await db.execute(sql`
      select column_name from information_schema.columns
      where table_schema = 'adscale_app'
        and table_name = 'creative_work_outputs'
        and column_name = 'layerization'
    `);
    if (migration.rows.length === 0) throw new Error("Migration 0083 is not applied to the integration database");
  }, 30_000);

  afterAll(async () => {
    storage.clear();
    if (createdWorkspaceIds.length > 0) {
      await db.delete(creativeWorkOutputs).where(inArray(creativeWorkOutputs.workspaceId, createdWorkspaceIds));
      await db.delete(creativeWorkItems).where(inArray(creativeWorkItems.workspaceId, createdWorkspaceIds));
      await db.delete(clientProfiles).where(inArray(clientProfiles.workspaceId, createdWorkspaceIds));
      await db.delete(workspaceMembers).where(inArray(workspaceMembers.workspaceId, createdWorkspaceIds));
      await db.delete(workspaces).where(inArray(workspaces.id, createdWorkspaceIds));
    }
    if (createdUserIds.length > 0) await db.delete(user).where(inArray(user.id, createdUserIds));
    if (envBeforeTest.falKey === undefined) delete process.env.FAL_KEY;
    else process.env.FAL_KEY = envBeforeTest.falKey;
    if (envBeforeTest.ownerEmails === undefined) delete process.env.PLATFORM_OWNER_EMAILS;
    else process.env.PLATFORM_OWNER_EMAILS = envBeforeTest.ownerEmails;
  }, 30_000);

  it("claims through HTTP, finalizes real artifacts, and serves the private PSD", async () => {
    const userId = `layerize-${runId}`;
    sessionState.user.id = userId;
    await db.insert(user).values({
      id: userId,
      name: "Layerize Owner",
      email: sessionState.user.email,
      emailVerified: true,
    });
    const [workspace] = await db.insert(workspaces).values({ name: `Layerize ${runId}`, slug: `layerize-${runId}` }).returning();
    await db.insert(workspaceMembers).values({ workspaceId: workspace.id, userId, role: "owner" });
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

    const base = await sharp({ create: { width: 8, height: 8, channels: 4, background: [20, 30, 40, 255] } }).png().toBuffer();
    const overlay = await sharp({ create: { width: 2, height: 2, channels: 4, background: [220, 30, 40, 255] } }).png().toBuffer();
    const original = await sharp(base).composite([{ input: overlay, left: 3, top: 2 }]).png().toBuffer();
    await storage.put(sourceKey, original, "image/png");

    const request = new Request(`https://app.example/api/creative-work/${work.id}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        cookie: `adscale_active_workspace=${workspace.id}`,
      },
      body: JSON.stringify({ action: "layerizeOutput", outputId: output.id }),
    });
    const accepted = await PATCH(request, { params: Promise.resolve({ id: work.id }) });
    expect(accepted.status).toBe(202);
    expect(sendMock).toHaveBeenCalledOnce();
    const event = sendMock.mock.calls[0][0].data;

    const callbackRequest = () => new Request(event.callbackUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "OK", request_id: "request-1" }),
    });
    const [callback] = await Promise.all([
      POST(callbackRequest(), { params: Promise.resolve({ id: work.id }) }),
      markCreativeWorkLayerizationReconciling(workspace.id, work.id, output.id),
    ]);
    expect(callback.status).toBe(202);
    const replay = await POST(callbackRequest(), { params: Promise.resolve({ id: work.id }) });
    expect(replay.status).toBe(202);
    await expect(replay.json()).resolves.toMatchObject({ replay: true });

    const providerPayload = {
      images: [],
      layers: [
        { image: { url: "https://v3.fal.media/base.png", width: 8, height: 8 }, z_index: 0, bounding_box: null },
        {
          image: { url: "https://v3.fal.media/overlay.png", width: 2, height: 2 },
          z_index: 1,
          name: "Product",
          description: "Synthetic foreground",
          bounding_box: { absolute: [3, 2, 5, 4], normalized: [375, 250, 625, 500] },
        },
      ],
    };
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = input.toString();
      if (url.endsWith("/status")) return new Response(JSON.stringify({ status: "COMPLETED" }), { status: 200 });
      if (url.endsWith("/requests/request-1")) return new Response(JSON.stringify(providerPayload), { status: 200 });
      if (url.endsWith("base.png")) return new Response(base, { status: 200, headers: { "content-type": "image/png" } });
      if (url.endsWith("overlay.png")) return new Response(overlay, { status: 200, headers: { "content-type": "image/png" } });
      throw new Error(`Unexpected fal request: ${url}`);
    });
    const callbackEvent = sendMock.mock.calls.at(-1)?.[0].data;
    const job = creativeWorkLayerizationJob as unknown as {
      fn(input: { event: { data: typeof callbackEvent }; step: { run<T>(name: string, fn: () => Promise<T>): Promise<T>; sleep(name: string, duration: string): Promise<void> } }): Promise<unknown>;
    };
    await expect(job.fn({
      event: { data: callbackEvent },
      step: { run: async (_name, fn) => fn(), sleep: async () => undefined },
    })).resolves.toEqual({ status: "completed" });
    fetchSpy.mockRestore();

    const [persisted] = await db.select().from(creativeWorkOutputs).where(eq(creativeWorkOutputs.id, output.id)).limit(1);
    expect(persisted.outputKey).toBe(sourceKey);
    expect(persisted.layerization).toMatchObject({ status: "completed", estimatedCostUsd: 0.0675 });

    const download = await downloadOutput(new Request(
      `https://app.example/api/creative-work/${work.id}/outputs/${output.id}/download?format=psd`,
      { headers: { accept: "application/json", cookie: `adscale_active_workspace=${workspace.id}` } },
    ), { params: Promise.resolve({ id: work.id, outputId: output.id }) });
    expect(download.status).toBe(200);
    const { url } = await download.json() as { url: string };
    const psd = await storage.get(url.replace("memory://download/", ""));
    const parsed = readPsd(psd, { skipThumbnail: true, useImageData: true });
    expect(parsed.children?.map((layer) => layer.name)).toEqual(["Product", "Base"]);
    expect(parsed.children?.map(({ left, top, right, bottom }) => ({ left, top, right, bottom }))).toEqual([
      { left: 3, top: 2, right: 5, bottom: 4 },
      { left: 0, top: 0, right: 8, bottom: 8 },
    ]);
    expect(parsed.imageData?.data).toBeDefined();
    expect(parsed.children?.every((layer) => layer.imageData?.data)).toBe(true);
  }, 30_000);
});
