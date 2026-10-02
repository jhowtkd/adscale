import { afterEach, describe, expect, it } from "vitest";
import sharp from "sharp";
import { createInstagramVision, createSiteVision, normalizeHexColor, siteVisionSchema } from "./site-vision";
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

  it("drops a color that is not one ON ITS OWN: the paid answer and the rest of the palette stay", async () => {
    const storage = new TestObjectStorage();
    const client = new FakeModelClient([{ content: JSON.stringify({ logoConfirmed: null, colors: ["azul", "#111111"], fonts: [] }) }]);
    const vision = createSiteVision({ storage, client });
    const keys = await withStoredKeys(storage, await jpegBytes(800, 600));
    await expect(vision({ ...keys, colors: [], fonts: [] })).resolves.toEqual({ logoConfirmed: null, colors: ["#111111"], fonts: [] });
  });

  describe("the palette is clamped, never refused over a count (ticket 13)", () => {
    const run = async (answer: unknown, input: { colors?: string[]; fonts?: string[] } = {}) => {
      const storage = new TestObjectStorage();
      const client = new FakeModelClient([{ content: JSON.stringify(answer) }]);
      const keys = await withStoredKeys(storage, await jpegBytes(800, 600));
      return createSiteVision({ storage, client })({ ...keys, colors: input.colors ?? [], fonts: input.fonts ?? [] });
    };

    it("takes a brand with one or two colors (a monochrome brand exists)", async () => {
      expect((await run({ logoConfirmed: true, colors: ["#000000"], fonts: [] })).colors).toEqual(["#000000"]);
      expect((await run({ logoConfirmed: true, colors: ["#000000", "#FFFFFF"], fonts: [] })).colors).toEqual(["#000000", "#FFFFFF"]);
    });

    it("reads no color at all as an empty palette (not found), not as an error", async () => {
      await expect(run({ logoConfirmed: null, colors: [], fonts: [] })).resolves.toEqual({ logoConfirmed: null, colors: [], fonts: [] });
    });

    it("keeps the first 6 of a longer list", async () => {
      const colors = ["#111111", "#222222", "#333333", "#444444", "#555555", "#666666", "#777777", "#888888"];
      expect((await run({ logoConfirmed: true, colors, fonts: [] })).colors).toEqual(colors.slice(0, 6));
    });

    it("keeps at most 8 fonts, and only candidates it was offered", async () => {
      const offered = Array.from({ length: 10 }, (_, i) => `Fonte ${i}`);
      const result = await run({ logoConfirmed: true, colors: ["#111111"], fonts: [...offered, "Inventada"] }, { fonts: offered });
      expect(result.fonts).toEqual(offered.slice(0, 8));
    });

    it("still refuses an answer that is not the agreed shape (an extra key, a missing list)", async () => {
      await expect(run({ logoConfirmed: true, colors: ["#111111"], fonts: [], extra: 1 })).rejects.toThrow();
      await expect(run({ logoConfirmed: true, fonts: [] })).rejects.toThrow();
    });

    it("asks the model for 1 to 6 colors, not 3", async () => {
      const storage = new TestObjectStorage();
      const client = new FakeModelClient([{ content: JSON.stringify(visionResult) }]);
      const keys = await withStoredKeys(storage, await jpegBytes(800, 600));
      const instagramClient = new FakeModelClient([{ content: JSON.stringify(visionResult) }]);
      await createSiteVision({ storage, client })({ ...keys, colors: [], fonts: [] });
      await createInstagramVision({ storage, client: instagramClient })({ imageKeys: [keys.screenshotKey] });
      for (const sent of [client, instagramClient]) {
        const prompt = sent.requests[0]!.messages.find((m) => m.role === "system")!.content as string;
        expect(prompt).toContain("1 a 6 cores");
        expect(prompt).not.toContain("3 a 6");
      }
    });
  });

  describe("a color off format never costs the palette (review of PR 614)", () => {
    const run = async (colors: unknown[], input: { colors?: string[] } = {}) => {
      const storage = new TestObjectStorage();
      const client = new FakeModelClient([{ content: JSON.stringify({ logoConfirmed: true, colors, fonts: [] }) }]);
      const keys = await withStoredKeys(storage, await jpegBytes(800, 600));
      return (await createSiteVision({ storage, client })({ ...keys, colors: input.colors ?? [], fonts: [] })).colors;
    };

    it("expands the short form #RGB to six digits, keeping the case it came in", async () => {
      expect(await run(["#fff", "#0A3", "#112233"])).toEqual(["#ffffff", "#00AA33", "#112233"]);
    });

    it("takes a color written without the # as the color it is", async () => {
      expect(await run(["ff0000", "0f0", "#00f"])).toEqual(["#ff0000", "#00ff00", "#0000ff"]);
    });

    it("drops only what is not a color (names, rgb(), eight digits, empty) and keeps the others in order", async () => {
      expect(await run(["#111111", "azul", "rgb(1,2,3)", "#11223344", "", "#fff", "#12345", "#222222"])).toEqual(["#111111", "#ffffff", "#222222"]);
    });

    it("no valid color left is an EMPTY palette (not found), not an error", async () => {
      expect(await run(["azul", "rgb(1,2,3)", "#12"])).toEqual([]);
    });

    it("does not count the same color twice (#fff, #FFFFFF, ffffff), and counts the six AFTER the drops", async () => {
      expect(await run(["#fff", "#FFFFFF", "ffffff", "#111111"])).toEqual(["#ffffff", "#111111"]);
      expect(await run(["azul", "#111111", "#222222", "#333333", "x", "#444444", "#555555", "#666666", "#777777"])).toEqual(["#111111", "#222222", "#333333", "#444444", "#555555", "#666666"]);
    });

    it("does the same for the Instagram palette (the same call)", async () => {
      const storage = new TestObjectStorage();
      const client = new FakeModelClient([{ content: JSON.stringify({ logoConfirmed: null, colors: ["#fff", "nope", "#B45309"], fonts: [] }) }]);
      const keys = await withStoredKeys(storage, await jpegBytes(800, 600));
      expect(await createInstagramVision({ storage, client })({ imageKeys: [keys.screenshotKey] })).toEqual(["#ffffff", "#B45309"]);
    });

    it("normalizeHexColor says null for anything that is not a string or not a color", () => {
      for (const value of [null, undefined, 123, {}, [], "", "  ", "#", "#12", "#1234", "#12345", "#1234567", "#gggggg", "red", "#ff 00 00"]) expect(normalizeHexColor(value), String(value)).toBeNull();
      expect(normalizeHexColor("  #ABC  ")).toBe("#AABBCC");
    });
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

  it("siteVisionSchema accepts logoConfirmed=null (uncertain) and is only the SHAPE: what a color is, is judged one by one after the call", () => {
    expect(siteVisionSchema.safeParse({ logoConfirmed: null, colors: ["#aabbcc", "#112233", "#445566"], fonts: [] }).success).toBe(true);
    expect(siteVisionSchema.safeParse({ logoConfirmed: null, colors: ["#aabbcc"], fonts: [] }).success).toBe(true);
    expect(siteVisionSchema.safeParse({ logoConfirmed: null, colors: ["not-a-color", "#fff", "#445566"], fonts: [""] }).success).toBe(true);
    expect(siteVisionSchema.safeParse({ logoConfirmed: null, colors: [1], fonts: [] }).success).toBe(false);
    expect(siteVisionSchema.safeParse({ logoConfirmed: null, colors: [], fonts: [], extra: 1 }).success).toBe(false);
  });

  it("end to end: a free account's vision call reserves before calling the model, then settles", async () => {
    setEnv("EQUIPE_FREE_DIAGNOSTIC_RESERVE_USD_CENTS", "0");
    const t = makeTestDeps({ now: new Date("2026-10-15T15:00:00.000Z") });
    const workspaceId = uuid();
    const userId = `user-${uuid()}`;
    t.store.workspaceMembers.rows.set(uuid(), { id: uuid(), workspaceId, userId, name: "Ana", email: "a@x.com", emailVerified: true, role: "owner", createdAt: new Date("2026-01-01T00:00:00.000Z") });
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
    t.store.workspaceMembers.rows.set(uuid(), { id: uuid(), workspaceId, userId, name: "Ana", email: "a@x.com", emailVerified: true, role: "owner", createdAt: new Date("2026-01-01T00:00:00.000Z") });
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
