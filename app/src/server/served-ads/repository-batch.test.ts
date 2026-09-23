import { beforeEach, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  insert: vi.fn(),
  batches: [] as Array<Array<Record<string, unknown>>>,
  failAt: 0,
}));
vi.mock("@/server/db", () => ({ db: { insert: mock.insert } }));

import {
  upsertAdAccounts,
  upsertAdMetricsBatch,
  upsertServedAds,
  type UpsertServedAd,
} from "./repository";

beforeEach(() => {
  vi.clearAllMocks();
  mock.batches = [];
  mock.failAt = 0;
  mock.insert.mockImplementation(() => ({
    values: (input: Record<string, unknown> | Array<Record<string, unknown>>) => {
      const rows = Array.isArray(input) ? input : [input];
      mock.batches.push(rows);
      return {
        onConflictDoUpdate: () => {
          if (mock.failAt === mock.batches.length) throw new Error("chunk failed");
          return {
            returning: async () => rows.map((row) => ({
              id: `row-${row.adAccountId}`,
              adAccountId: row.adAccountId,
            })),
          };
        },
      };
    },
  }));
});

it("upserts accounts in chunks with the last duplicate and preserves input mapping", async () => {
  const accounts = Array.from({ length: 251 }, (_, index) => ({
    adAccountId: `account-${index}`,
    name: `Name ${index}`,
    currency: "BRL",
  }));
  accounts.push({ ...accounts[0], name: "Updated name" });

  const rows = await upsertAdAccounts("connection-1", accounts);

  expect(mock.batches.map((batch) => batch.length)).toEqual([250, 1]);
  expect(mock.batches.flat().every((row) => row.connectionId === "connection-1")).toBe(true);
  expect(mock.batches[0][0]).toMatchObject({ adAccountId: "account-0", name: "Updated name" });
  expect(rows).toHaveLength(accounts.length);
  expect(rows[0]).toEqual(rows.at(-1));
});

it("chunks ads and retains a previous delivery timestamp across duplicate IDs", async () => {
  const deliveredAt = new Date("2026-09-22T12:00:00Z");
  const ads: UpsertServedAd[] = Array.from({ length: 251 }, (_, index) => ({
    id: `ad-${index}`,
    accountId: "account-row-1",
    adAccountId: "account-1",
    creativeId: `creative-${index}`,
    format: "imagem",
    text: null,
    lastDeliveredAt: index === 0 ? deliveredAt : null,
  }));
  ads.push({ ...ads[0], format: "video", lastDeliveredAt: null });

  await upsertServedAds(ads);

  expect(mock.batches.map((batch) => batch.length)).toEqual([250, 1]);
  expect(mock.batches[0][0]).toMatchObject({
    id: "ad-0",
    format: "video",
    lastDeliveredAt: deliveredAt,
  });
});

it("chunks metrics with last duplicate values and a shared timestamp", async () => {
  const metrics = Array.from({ length: 251 }, (_, index) => ({
    anuncioId: `ad-${index}`,
    windowDays: 30,
    impressions: index,
    clicks: 1,
    spend: 1.235,
    conversions: 1,
    actionCounts: { purchase: 1 },
    definitionVersion: 2,
    snapshotId: "snapshot-1",
  }));
  metrics.push({ ...metrics[0], impressions: 999 });

  await upsertAdMetricsBatch(metrics);

  expect(mock.batches.map((batch) => batch.length)).toEqual([250, 1]);
  expect(mock.batches[0][0]).toMatchObject({ anuncioId: "ad-0", impressions: 999, spend: "1.24" });
  expect(new Set(mock.batches.flat().map((row) => row.syncedAt))).toHaveProperty("size", 1);
});

it("retries the same bounded ads after a later chunk fails", async () => {
  const ads = Array.from({ length: 251 }, (_, index) => ({
    id: `ad-${index}`,
    accountId: "account-row-1",
    adAccountId: "account-1",
    creativeId: `creative-${index}`,
    format: "imagem" as const,
    text: null,
    lastDeliveredAt: null,
  }));
  mock.failAt = 2;
  await expect(upsertServedAds(ads)).rejects.toThrow("chunk failed");
  expect(mock.batches.map((batch) => batch.length)).toEqual([250, 1]);

  mock.failAt = 0;
  mock.batches = [];
  await upsertServedAds(ads);
  expect(mock.batches.map((batch) => batch.length)).toEqual([250, 1]);
  expect(mock.batches.flat().map((row) => row.id)).toEqual(ads.map((ad) => ad.id));
});
