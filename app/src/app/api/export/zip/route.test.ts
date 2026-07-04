import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

vi.mock("@/server/auth/workspace", () => ({
  requireWorkspaceAccess: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn(async () => ({ success: true })),
}));

const dbState = vi.hoisted(() => ({
  // Queue of result rows returned by successive db queries (each consumed once).
  results: [] as unknown[][],
}));

vi.mock("@/server/db", () => {
  const buildChain = () => {
    const resolve = async () => dbState.results.shift() ?? [];
    const chain = {
      from: vi.fn(() => chain),
      where: vi.fn(() => chain),
      innerJoin: vi.fn(() => chain),
      limit: vi.fn(() => resolve()),
      then(resolveFn: (value: unknown) => void) {
        resolve().then(resolveFn);
      },
    };
    return chain;
  };
  return {
    db: {
      select: vi.fn(() => buildChain()),
    },
  };
});

vi.mock("@/server/storage", () => ({
  objectStorage: {
    get: vi.fn(async () => Buffer.from("png-bytes")),
    publicUrl: vi.fn((key: string) => `https://cdn/${key}`),
  },
}));

vi.mock("jszip", () => ({
  default: class MockJSZip {
    files: Record<string, unknown> = {};
    file(name: string, buffer: unknown) {
      this.files[name] = buffer;
      return this;
    }
    async generateAsync() {
      // Embed the file names so tests can assert which files were zipped.
      return Buffer.from(Object.keys(this.files).join("|"));
    }
  },
}));

vi.mock("@/server/repositories/campaign", () => ({
  getCampaignById: vi.fn(),
}));

import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { objectStorage } from "@/server/storage";
import { getCampaignById } from "@/server/repositories/campaign";

const mockRequireAccess = vi.mocked(requireWorkspaceAccess);
const mockStorage = vi.mocked(objectStorage.get);
const mockGetCampaign = vi.mocked(getCampaignById);

const workspace = { id: "ws-1" };
const user = { id: "user-1", email: "owner@adscale.com" };

function req(body: unknown): Request {
  return new Request("http://localhost/api/export/zip", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function queueResults(...results: unknown[][]) {
  dbState.results = results;
}

describe("POST /api/export/zip goal branch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbState.results = [];
    mockRequireAccess.mockResolvedValue({ user, workspace } as never);
    mockStorage.mockResolvedValue(Buffer.from("png") as never);
    mockGetCampaign.mockResolvedValue({ id: "c1", name: "Acme", slug: "acme" } as never);
  });

  it("rejects a goal export until all four scoped formats are approved", async () => {
    // Goal row query, then derivations query (only 3 approved).
    queueResults(
      [{ id: "goal-1", campaignId: "c1", objective: "Vender" }],
      [
        { id: "d1", format: "1:1", status: "approved", outputKey: "o1" },
        { id: "d2", format: "4:5", status: "approved", outputKey: "o2" },
        { id: "d3", format: "9:16", status: "approved", outputKey: "o3" },
      ]
    );

    const response = await POST(req({ goalRunId: "00000000-0000-4000-8000-000000000001" }));

    expect(response.status).toBe(400);
  });

  it("uses png extensions and writes one stable file per required format with a manifest", async () => {
    queueResults(
      [{ id: "goal-1", campaignId: "c1", objective: "Vender" }],
      [
        { id: "d1", format: "1:1", status: "approved", outputKey: "o1" },
        { id: "d2", format: "4:5", status: "approved", outputKey: "o2" },
        { id: "d3", format: "9:16", status: "approved", outputKey: "o3" },
        { id: "d4", format: "16:9", status: "approved", outputKey: "o4" },
      ]
    );

    const response = await POST(req({ goalRunId: "00000000-0000-4000-8000-000000000001" }));
    const buffer = Buffer.from(await response.arrayBuffer());
    const fileNames = buffer.toString("utf-8").split("|");

    expect(response.status).toBe(200);
    expect(fileNames).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/-1x1\.png$/),
        expect.stringMatching(/-4x5\.png$/),
        expect.stringMatching(/-9x16\.png$/),
        expect.stringMatching(/-16x9\.png$/),
        "manifest.json",
      ])
    );
    // Never treat 1:1 as an extension.
    expect(fileNames.some((n) => n.endsWith(".1:1"))).toBe(false);
  });

  it("keeps the legacy derivationIds branch working", async () => {
    queueResults([
      { id: "d1", format: "1:1", status: "approved", outputKey: "o1" },
    ]);

    const response = await POST(req({
      derivationIds: ["00000000-0000-4000-8000-0000000000d1"],
    }));

    expect(response.status).toBe(200);
  });
});
