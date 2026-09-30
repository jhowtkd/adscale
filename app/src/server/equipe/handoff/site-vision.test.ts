import { afterEach, describe, expect, it } from "vitest";
import sharp from "sharp";
import { createInstagramVision, createSiteVision, siteVisionSchema } from "./site-vision";
import { modelInputTokenBound } from "../agents/free-budget";
import { createBudgetedModelClient } from "../agents/budgeted-client";
import { MemoryLedgerStore } from "../agents/ledger";
import { EquipeModelTruncatedError, type EquipeModelClient } from "../agents/model-client";
import { FakeModelClient, textResponse } from "../agents/testing";
import { InMemoryObjectStorage } from "@/server/storage/in-memory-object-storage";
import { executeCommand } from "../module/commands";
import { makeTestDeps, uuid } from "../module/testing/deps";

/** signedDownloadUrl must be https:// for normalizedImagePart to accept it. */
class TestObjectStorage extends InMemoryObjectStorage {
  async signedDownloadUrl(key: string) {
    return `https://assets.example.com/${encodeURIComponent(key)}`;
  }
}

async function jpegBytes(width: number, height: number) {
  return sharp({ create: { width, height, channels: 3, background: { r: 120, g: 30, b: 200 } } }).jpeg({ quality: 85 }).toBuffer();
}
async function pngBytes(width = 100, height = 100) {
  return sharp({ create: { width, height, channels: 3, background: { r: 10, g: 10, b: 10 } } }).png().toBuffer();
}

const visionResult = { logoConfirmed: true, colors: ["#111111", "#222222", "#333333"], fonts: ["Inter"] };

async function withStoredKeys(storage: TestObjectStorage, screenshot: Buffer, logo?: Buffer) {
  await storage.put("screenshot.jpg", screenshot, "image/jpeg");
  if (logo) await storage.put("logo.jpg", logo, "image/jpeg");
  return { screenshotKey: "screenshot.jpg", ...(logo ? { logoKey: "logo.jpg" } : {}) };
}

const saved = new Map<string, string | undefined>();
function setEnv(key: string, value: string | undefined) {
  if (!saved.has(key)) saved.set(key, process.env[key]);
  if (value === undefined) delete process.env[key]; else process.env[key] = value;
}
afterEach(() => {
  for (const [k, v] of saved) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  saved.clear();
});

describe("createSiteVision", () => {
  it("sends the screenshot and logo as normalized image parts, plus a text part with the candidates", async () => {
    const storage = new TestObjectStorage();
    const client = new FakeModelClient([{ content: JSON.stringify(visionResult) }]);
    const vision = createSiteVision({ storage, client });
    const keys = await withStoredKeys(storage, await jpegBytes(800, 600), await jpegBytes(300, 300));
    await vision({ ...keys, colors: ["#0000EE"], fonts: ["Roboto"] });
    const request = client.requests[0]!;
    const userMessage = request.messages.find((m) => m.role === "user")!;
    expect(Array.isArray(userMessage.content)).toBe(true);
    const content = userMessage.content as Array<{ type: string; text?: string; image_url?: { url: string } }>;
    const images = content.filter((c) => c.type === "image_url");
    expect(images).toHaveLength(2);
    expect(images[0]!.image_url!.url).toBe(`https://assets.example.com/${encodeURIComponent("screenshot.jpg")}`);
    expect(images[1]!.image_url!.url).toBe(`https://assets.example.com/${encodeURIComponent("logo.jpg")}`);
    const text = content.find((c) => c.type === "text")!;
    expect(JSON.parse(text.text!)).toEqual({ candidateColors: ["#0000EE"], candidateFonts: ["Roboto"] });
  });

  it("sends only the screenshot when no logo key is given", async () => {
    const storage = new TestObjectStorage();
    const client = new FakeModelClient([{ content: JSON.stringify(visionResult) }]);
    const vision = createSiteVision({ storage, client });
    const keys = await withStoredKeys(storage, await jpegBytes(800, 600));
    await vision({ ...keys, colors: [], fonts: [] });
    const content = client.requests[0]!.messages.find((m) => m.role === "user")!.content as Array<{ type: string }>;
    expect(content.filter((c) => c.type === "image_url")).toHaveLength(1);
  });

  it("sets an explicit inputTokenBound derived from the normalized image parts", async () => {
    const storage = new TestObjectStorage();
    const client = new FakeModelClient([{ content: JSON.stringify(visionResult) }]);
    const vision = createSiteVision({ storage, client });
    const keys = await withStoredKeys(storage, await jpegBytes(800, 600), await jpegBytes(300, 300));
    await vision({ ...keys, colors: [], fonts: [] });
    const request = client.requests[0]!;
    expect(request.inputTokenBound).toBe(modelInputTokenBound(request));
    expect(request.inputTokenBound).toBeGreaterThan(2 * 4096);
  });

  it("returns only the model fonts that were offered as candidates, dropping invented ones", async () => {
    const storage = new TestObjectStorage();
    const client = new FakeModelClient([{ content: JSON.stringify({ logoConfirmed: true, colors: ["#111111", "#222222", "#333333"], fonts: ["Inter", "Helvetica Neue"] }) }]);
    const vision = createSiteVision({ storage, client });
    const keys = await withStoredKeys(storage, await jpegBytes(800, 600));
    const result = await vision({ ...keys, colors: [], fonts: ["Inter", "Roboto"] });
    expect(result.fonts).toEqual(["Inter"]);
    expect(result.colors).toEqual(["#111111", "#222222", "#333333"]);
    expect(result.logoConfirmed).toBe(true);
  });

  it("throws EquipeModelTruncatedError when the model stops at max_tokens", async () => {
    const storage = new TestObjectStorage();
    const client = new FakeModelClient([{ stopReason: "max_tokens" }]);
    const vision = createSiteVision({ storage, client });
    const keys = await withStoredKeys(storage, await jpegBytes(800, 600));
    await expect(vision({ ...keys, colors: [], fonts: [] })).rejects.toBeInstanceOf(EquipeModelTruncatedError);
  });

  it("rejects a response that fails the output schema (too few colors)", async () => {
    const storage = new TestObjectStorage();
    const client = new FakeModelClient([{ content: JSON.stringify({ logoConfirmed: null, colors: ["#111111"], fonts: [] }) }]);
    const vision = createSiteVision({ storage, client });
    const keys = await withStoredKeys(storage, await jpegBytes(800, 600));
    await expect(vision({ ...keys, colors: [], fonts: [] })).rejects.toThrow();
  });

  it("rejects stored bytes that aren't JPEG", async () => {
    const storage = new TestObjectStorage();
    await storage.put("screenshot.jpg", await pngBytes(), "image/png");
    const client = new FakeModelClient([textResponse(JSON.stringify(visionResult))]);
    const vision = createSiteVision({ storage, client });
    await expect(vision({ screenshotKey: "screenshot.jpg", colors: [], fonts: [] })).rejects.toThrow("free_image_unbounded");
    expect(client.requests).toHaveLength(0);
  });

  it("rejects stored JPEGs wider or taller than 1024px", async () => {
    const storage = new TestObjectStorage();
    await storage.put("screenshot.jpg", await jpegBytes(1030, 900), "image/jpeg");
    const client = new FakeModelClient([textResponse(JSON.stringify(visionResult))]);
    const vision = createSiteVision({ storage, client });
    await expect(vision({ screenshotKey: "screenshot.jpg", colors: [], fonts: [] })).rejects.toThrow("free_image_unbounded");
    expect(client.requests).toHaveLength(0);
  });

  it("rejects stored bytes over 10 MB without even decoding them", async () => {
    const storage = new TestObjectStorage();
    await storage.put("screenshot.jpg", Buffer.alloc(10 * 1024 * 1024 + 1, 1), "image/jpeg");
    const client = new FakeModelClient([textResponse(JSON.stringify(visionResult))]);
    const vision = createSiteVision({ storage, client });
    await expect(vision({ screenshotKey: "screenshot.jpg", colors: [], fonts: [] })).rejects.toThrow("free_image_unbounded");
    expect(client.requests).toHaveLength(0);
  });

  it("siteVisionSchema accepts logoConfirmed=null (uncertain) alongside 3-6 hex colors and up to 8 fonts", () => {
    expect(siteVisionSchema.safeParse({ logoConfirmed: null, colors: ["#aabbcc", "#112233", "#445566"], fonts: [] }).success).toBe(true);
    expect(siteVisionSchema.safeParse({ logoConfirmed: null, colors: ["not-a-color", "#112233", "#445566"], fonts: [] }).success).toBe(false);
  });

  it("end to end: a free account's vision call reserves before calling the model, then settles", async () => {
    setEnv("EQUIPE_FREE_DIAGNOSTIC_RESERVE_USD_CENTS", "0");
    const t = makeTestDeps({ now: new Date("2026-10-15T15:00:00.000Z") });
    const workspaceId = uuid();
    const userId = `user-${uuid()}`;
    t.store.workspaceMembers.rows.set(uuid(), { id: uuid(), workspaceId, userId, name: "Ana", email: "a@x.com", emailVerified: true });
    const opened = await executeCommand(t.deps, { actor: { kind: "system", job: "free" }, workspaceId }, { type: "open_free_account", payload: { userId } });
    if (!opened.ok) throw new Error(opened.error.code);
    const scope = { workspaceId, accountId: opened.value.accountId! };
    const storage = new TestObjectStorage();
    const now = () => new Date("2026-10-15T15:00:00.000Z");
    const ledger = new MemoryLedgerStore();
    const rawClient = new FakeModelClient([{ content: JSON.stringify(visionResult), usage: { inputTokens: 500, outputTokens: 40 } }]);
    const budgeted: EquipeModelClient = createBudgetedModelClient({
      scope, repos: t.deps.uow.repos, ledger, client: () => rawClient,
      free: true, model: "claude-opus-5-5", role: "strategist", taskKind: "site_vision", now,
    });
    const vision = createSiteVision({ storage, client: budgeted, model: "claude-opus-5-5" });
    const keys = await withStoredKeys(storage, await jpegBytes(800, 600));
    const result = await vision({ ...keys, colors: [], fonts: [] });
    expect(result.colors).toEqual(visionResult.colors);
    expect(ledger.entries).toHaveLength(1);
    expect(ledger.entries[0]).toMatchObject({ inputTokens: 500, outputTokens: 40, settledAt: now() });
    expect(rawClient.requests[0]!.noRetries).toBe(true);
  });

  it("end to end: a failed model call still leaves the reservation spent, not refunded", async () => {
    setEnv("EQUIPE_FREE_DIAGNOSTIC_RESERVE_USD_CENTS", "0");
    const t = makeTestDeps({ now: new Date("2026-10-15T15:00:00.000Z") });
    const workspaceId = uuid();
    const userId = `user-${uuid()}`;
    t.store.workspaceMembers.rows.set(uuid(), { id: uuid(), workspaceId, userId, name: "Ana", email: "a@x.com", emailVerified: true });
    const opened = await executeCommand(t.deps, { actor: { kind: "system", job: "free" }, workspaceId }, { type: "open_free_account", payload: { userId } });
    if (!opened.ok) throw new Error(opened.error.code);
    const scope = { workspaceId, accountId: opened.value.accountId! };
    const storage = new TestObjectStorage();
    const now = () => new Date("2026-10-15T15:00:00.000Z");
    const ledger = new MemoryLedgerStore();
    const failingClient: EquipeModelClient = { async chat() { throw new Error("provider_down"); } };
    const budgeted: EquipeModelClient = createBudgetedModelClient({
      scope, repos: t.deps.uow.repos, ledger, client: () => failingClient,
      free: true, model: "claude-opus-5-5", role: "strategist", taskKind: "site_vision", now,
    });
    const vision = createSiteVision({ storage, client: budgeted, model: "claude-opus-5-5" });
    const keys = await withStoredKeys(storage, await jpegBytes(800, 600));
    await expect(vision({ ...keys, colors: [], fonts: [] })).rejects.toThrow("provider_down");
    expect(ledger.entries).toHaveLength(1);
    expect(ledger.entries[0]!.settledAt).toBeUndefined();
    expect(ledger.entries[0]!.costUsdCents).toBe(ledger.entries[0]!.reservedCostUsdCents);
  });
});

describe("createInstagramVision", () => {
  const igVisionResult = { logoConfirmed: null as boolean | null, colors: ["#445566", "#778899", "#aabbcc"], fonts: [] as string[] };

  it("returns the model's colors for the avatar + up to 3 post images", async () => {
    const storage = new TestObjectStorage();
    const client = new FakeModelClient([{ content: JSON.stringify(igVisionResult) }]);
    const vision = createInstagramVision({ storage, client });
    await storage.put("avatar.jpg", await jpegBytes(400, 400), "image/jpeg");
    await storage.put("p1.jpg", await jpegBytes(400, 400), "image/jpeg");
    const colors = await vision({ imageKeys: ["avatar.jpg", "p1.jpg"] });
    expect(colors).toEqual(igVisionResult.colors);
  });

  it("accepts up to 4 image keys (avatar + 3 posts) — unlike the 2-image site cap", async () => {
    const storage = new TestObjectStorage();
    const client = new FakeModelClient([{ content: JSON.stringify(igVisionResult) }]);
    const vision = createInstagramVision({ storage, client });
    for (const key of ["avatar.jpg", "p1.jpg", "p2.jpg", "p3.jpg"]) await storage.put(key, await jpegBytes(400, 400), "image/jpeg");
    await expect(vision({ imageKeys: ["avatar.jpg", "p1.jpg", "p2.jpg", "p3.jpg"] })).resolves.toEqual(igVisionResult.colors);
    const request = client.requests[0]!;
    const userMessage = request.messages.find((m) => m.role === "user")!;
    const content = userMessage.content as Array<{ type: string }>;
    expect(content.filter((c) => c.type === "image_url")).toHaveLength(4);
  });

  it("throws free_image_unbounded with no image keys, without calling the model", async () => {
    const storage = new TestObjectStorage();
    const client = new FakeModelClient([{ content: JSON.stringify(igVisionResult) }]);
    const vision = createInstagramVision({ storage, client });
    await expect(vision({ imageKeys: [] })).rejects.toThrow("free_image_unbounded");
    expect(client.requests).toHaveLength(0);
  });

  it("throws free_image_unbounded with MORE than 4 image keys, without calling the model", async () => {
    const storage = new TestObjectStorage();
    const client = new FakeModelClient([{ content: JSON.stringify(igVisionResult) }]);
    const vision = createInstagramVision({ storage, client });
    for (const key of ["a.jpg", "b.jpg", "c.jpg", "d.jpg", "e.jpg"]) await storage.put(key, await jpegBytes(400, 400), "image/jpeg");
    await expect(vision({ imageKeys: ["a.jpg", "b.jpg", "c.jpg", "d.jpg", "e.jpg"] })).rejects.toThrow("free_image_unbounded");
    expect(client.requests).toHaveLength(0);
  });

  it("sends an Instagram-specific system prompt, distinct from the site one (no logo/font validation language)", async () => {
    const storage = new TestObjectStorage();
    const client = new FakeModelClient([{ content: JSON.stringify(igVisionResult) }]);
    const vision = createInstagramVision({ storage, client });
    await storage.put("avatar.jpg", await jpegBytes(400, 400), "image/jpeg");
    await vision({ imageKeys: ["avatar.jpg"] });
    const system = client.requests[0]!.messages.find((m) => m.role === "system")!.content as string;
    expect(system).toMatch(/publicações públicas/);
    expect(system).not.toMatch(/logo candidato/);
  });

  it("sends an empty candidateColors/candidateFonts payload alongside the images", async () => {
    const storage = new TestObjectStorage();
    const client = new FakeModelClient([{ content: JSON.stringify(igVisionResult) }]);
    const vision = createInstagramVision({ storage, client });
    await storage.put("avatar.jpg", await jpegBytes(400, 400), "image/jpeg");
    await vision({ imageKeys: ["avatar.jpg"] });
    const content = client.requests[0]!.messages.find((m) => m.role === "user")!.content as Array<{ type: string; text?: string }>;
    const text = content.find((c) => c.type === "text")!;
    expect(JSON.parse(text.text!)).toEqual({ candidateColors: [], candidateFonts: [] });
  });

  it("throws EquipeModelTruncatedError when the model stops at max_tokens", async () => {
    const storage = new TestObjectStorage();
    const client = new FakeModelClient([{ stopReason: "max_tokens" }]);
    const vision = createInstagramVision({ storage, client });
    await storage.put("avatar.jpg", await jpegBytes(400, 400), "image/jpeg");
    await expect(vision({ imageKeys: ["avatar.jpg"] })).rejects.toBeInstanceOf(EquipeModelTruncatedError);
  });

  it("rejects stored bytes that aren't a normalized (<=1024px) JPEG, same as the site vision path", async () => {
    const storage = new TestObjectStorage();
    await storage.put("avatar.jpg", await jpegBytes(1030, 900), "image/jpeg");
    const client = new FakeModelClient([textResponse(JSON.stringify(igVisionResult))]);
    const vision = createInstagramVision({ storage, client });
    await expect(vision({ imageKeys: ["avatar.jpg"] })).rejects.toThrow("free_image_unbounded");
    expect(client.requests).toHaveLength(0);
  });

  it("sets an explicit inputTokenBound derived from the normalized image parts, up to 4 images", async () => {
    const storage = new TestObjectStorage();
    const client = new FakeModelClient([{ content: JSON.stringify(igVisionResult) }]);
    const vision = createInstagramVision({ storage, client });
    for (const key of ["avatar.jpg", "p1.jpg", "p2.jpg"]) await storage.put(key, await jpegBytes(400, 400), "image/jpeg");
    await vision({ imageKeys: ["avatar.jpg", "p1.jpg", "p2.jpg"] });
    const request = client.requests[0]!;
    expect(request.inputTokenBound).toBe(modelInputTokenBound(request));
    expect(request.inputTokenBound).toBeGreaterThan(3 * 4096);
  });
});
