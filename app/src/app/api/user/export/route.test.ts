import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { db } from "@/server/db";
import { handleApiError } from "@/lib/api-response";
import {
  campaigns,
  campaignAssets,
  creativePlans,
  derivations,
  user,
  workspaces,
} from "@/server/db/schema";
import { GET } from "./route";

vi.mock("@/server/auth/workspace", () => ({ requireWorkspaceAccess: vi.fn() }));
vi.mock("@/server/db", () => ({ db: { transaction: vi.fn() } }));
vi.mock("@/lib/api-response", () => ({
  handleApiError: vi.fn(() => Response.json({ error: "forbidden" }, { status: 403 })),
}));

const date = new Date("2026-09-23T00:00:00.000Z");
const request = new Request("http://localhost/api/user/export");

function fakeTransaction(campaignCount: number, failOnCampaignPage?: number) {
  const data = new Map<object, Record<string, unknown>[]>([
    [user, [{ id: "user-1", name: "User", email: "user@example.com", createdAt: date }]],
    [workspaces, [{ id: "ws-1", name: "Workspace", createdAt: date }]],
    [campaigns, Array.from({ length: campaignCount }, (_, index) => ({
      id: `campaign-${String(index).padStart(5, "0")}`,
      name: `Campaign ${index}`,
      client: "Client",
      status: "draft",
      generationMode: "art_variation",
      createdAt: date,
      updatedAt: date,
    }))],
    [derivations, [{ id: "derivation-1", campaignId: "campaign-00000", status: "ready", format: "1:1", generationMode: "art_variation", createdAt: date }]],
    [campaignAssets, [{ id: "asset-1", campaignId: "campaign-00000", key: "asset-key", role: "source", createdAt: date }]],
    [creativePlans, [{ id: "plan-1", campaignId: "campaign-00000", strategy: { goal: "test" }, status: "draft", createdAt: date }]],
  ]);
  const pageReads = new Map<object, number>();
  const select = vi.fn(() => ({
    from: (table: object) => ({
      where: () => ({
        limit: async () => data.get(table)?.slice(0, 1) ?? [],
        orderBy: () => ({
          limit: async (size: number) => {
            const page = pageReads.get(table) ?? 0;
            pageReads.set(table, page + 1);
            if (table === campaigns && page === failOnCampaignPage) {
              throw new Error("page read failed");
            }
            return data.get(table)?.slice(page * size, (page + 1) * size) ?? [];
          },
        }),
      }),
    }),
  }));
  vi.mocked(db.transaction).mockImplementation(async (callback) =>
    callback({ select } as never)
  );
  return { pageReads, select };
}

describe("GET /api/user/export", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireWorkspaceAccess).mockResolvedValue({
      user: { id: "user-1" }, workspace: { id: "ws-1" },
    } as never);
  });

  it("streams every row in 100-row pages with the existing JSON shape", async () => {
    const { pageReads } = fakeTransaction(205);
    const response = await GET(request);
    const reader = response.body!.getReader();
    const chunks: Uint8Array[] = [];
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    const bytes = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
    const json = JSON.parse(Buffer.concat(chunks).toString("utf8"));

    expect(response.headers.get("content-type")).toContain("application/json");
    expect(Object.keys(json)).toEqual([
      "exportedAt", "user", "workspace", "campaigns", "derivations", "assets", "plans",
    ]);
    expect(json).toMatchObject({ user: { id: "user-1" }, workspace: { id: "ws-1" } });
    expect(json.campaigns).toHaveLength(205);
    expect(json.campaigns[0]).toEqual({
      id: "campaign-00000",
      name: "Campaign 0",
      client: "Client",
      status: "draft",
      generationMode: "art_variation",
      createdAt: date.toISOString(),
      updatedAt: date.toISOString(),
    });
    expect(json.campaigns[204].id).toBe("campaign-00204");
    expect(json.derivations).toHaveLength(1);
    expect(json.assets).toHaveLength(1);
    expect(json.plans).toHaveLength(1);
    expect(pageReads.get(campaigns)).toBe(3);
    expect(Math.max(...chunks.map((chunk) => chunk.byteLength))).toBeLessThan(bytes / 2);
    expect(db.transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "repeatable read",
      accessMode: "read only",
    });
  });

  it("keeps page chunks bounded for a large workspace", async () => {
    const { pageReads } = fakeTransaction(10_000);
    const baselineHeap = process.memoryUsage().heapUsed;
    const response = await GET(request);
    const reader = response.body!.getReader();
    let peakHeap = baselineHeap;
    let totalBytes = 0;
    let maxChunkBytes = 0;
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      maxChunkBytes = Math.max(maxChunkBytes, value.byteLength);
      peakHeap = Math.max(peakHeap, process.memoryUsage().heapUsed);
    }

    expect(pageReads.get(campaigns)).toBe(101);
    expect(totalBytes).toBeGreaterThan(1_000_000);
    expect(maxChunkBytes).toBeLessThan(totalBytes / 20);
    console.info(`user export synthetic 10k: ${totalBytes} bytes, max chunk ${maxChunkBytes} bytes, peak heap delta ${peakHeap - baselineHeap} bytes`);
  });

  it("keeps the JSON valid when a table has no rows", async () => {
    fakeTransaction(0);
    const response = await GET(request);
    const json = await response.json();
    expect(json.campaigns).toEqual([]);
    expect(json.derivations).toHaveLength(1);
  });

  it("errors the response body when a later page fails", async () => {
    fakeTransaction(205, 1);
    const response = await GET(request);
    await expect(response.text()).rejects.toThrow("page read failed");
  });

  it("returns an API error when the transaction cannot start", async () => {
    const error = new Error("database unavailable");
    vi.mocked(db.transaction).mockRejectedValueOnce(error);
    const response = await GET(request);
    expect(response.status).toBe(403);
    expect(handleApiError).toHaveBeenCalledWith(error, "user.export.GET");
  });

  it("returns an API error when an initial scoped read fails", async () => {
    const error = new Error("user read failed");
    vi.mocked(db.transaction).mockImplementationOnce(async (callback) =>
      callback({ select: () => ({ from: () => ({ where: () => ({ limit: async () => { throw error; } }) }) }) } as never)
    );
    const response = await GET(request);
    expect(response.status).toBe(403);
    expect(handleApiError).toHaveBeenCalledWith(error, "user.export.GET");
  });

  it("does not query the database when access is denied", async () => {
    vi.mocked(requireWorkspaceAccess).mockRejectedValueOnce(new Error("forbidden"));
    const response = await GET(request);
    expect(response.status).toBe(403);
    expect(db.transaction).not.toHaveBeenCalled();
  });
});
