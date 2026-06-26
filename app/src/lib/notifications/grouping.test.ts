import { describe, it, expect } from "vitest";
import {
  consolidateNotifications,
  consolidationKey,
  groupAndConsolidateNotifications,
  type NotificationLike,
  type NotificationGroup,
} from "./grouping";

function makeItem(overrides: Partial<NotificationLike> & { id: string }): NotificationLike {
  return {
    type: "derivation_completed",
    title: "Derivação pronta",
    message: 'Uma derivação da campanha "Cenbrap em Dobro - Teste" foi gerada com sucesso.',
    campaignId: "camp-1",
    derivationId: null,
    readAt: null,
    createdAt: new Date("2026-06-26T10:00:00.000Z"),
    ...overrides,
  };
}

describe("consolidationKey", () => {
  it("combines type and campaignId", () => {
    expect(consolidationKey(makeItem({ id: "1", type: "derivation_completed", campaignId: "c1" })))
      .toBe("derivation_completed::c1");
  });

  it("uses a sentinel for campaign-less notifications", () => {
    expect(consolidationKey(makeItem({ id: "1", campaignId: null })))
      .toBe("derivation_completed::_");
  });
});

describe("consolidateNotifications", () => {
  it("returns an empty array for an empty input", () => {
    expect(consolidateNotifications([])).toEqual([]);
  });

  it("collapses all-same-type+campaign notifications into one group", () => {
    const now = Date.now();
    const items = Array.from({ length: 39 }, (_, i) =>
      makeItem({
        id: `n-${i}`,
        createdAt: new Date(now - i * 1000),
      })
    );
    const consolidated = consolidateNotifications(items);
    expect(consolidated).toHaveLength(1);
    expect(consolidated[0].count).toBe(39);
    expect(consolidated[0].type).toBe("derivation_completed");
    expect(consolidated[0].campaignId).toBe("camp-1");
    expect(consolidated[0].unreadCount).toBe(39);
    expect(consolidated[0].allRead).toBe(false);
    // latest is the most recent
    expect(consolidated[0].latest.id).toBe("n-0");
  });

  it("keeps mixed types as separate groups", () => {
    const items = [
      makeItem({ id: "1", type: "derivation_completed" }),
      makeItem({ id: "2", type: "derivation_failed", title: "Falha na geração" }),
      makeItem({ id: "3", type: "derivation_completed" }),
    ];
    const consolidated = consolidateNotifications(items);
    expect(consolidated).toHaveLength(2);
    const completed = consolidated.find((c) => c.type === "derivation_completed");
    const failed = consolidated.find((c) => c.type === "derivation_failed");
    expect(completed?.count).toBe(2);
    expect(failed?.count).toBe(1);
    expect(failed?.title).toBe("Falha na geração");
  });

  it("keeps same-type cross-campaign notifications as separate groups", () => {
    const items = [
      makeItem({ id: "1", campaignId: "camp-A" }),
      makeItem({ id: "2", campaignId: "camp-B" }),
      makeItem({ id: "3", campaignId: "camp-A" }),
    ];
    const consolidated = consolidateNotifications(items);
    expect(consolidated).toHaveLength(2);
    const a = consolidated.find((c) => c.campaignId === "camp-A");
    const b = consolidated.find((c) => c.campaignId === "camp-B");
    expect(a?.count).toBe(2);
    expect(b?.count).toBe(1);
  });

  it("treats campaign-less notifications as their own bucket", () => {
    const items = [
      makeItem({ id: "1", campaignId: null }),
      makeItem({ id: "2", campaignId: "camp-1" }),
      makeItem({ id: "3", campaignId: null }),
    ];
    const consolidated = consolidateNotifications(items);
    expect(consolidated).toHaveLength(2);
    const noCamp = consolidated.find((c) => c.campaignId === null);
    expect(noCamp?.count).toBe(2);
  });

  it("counts read vs unread correctly within a batch", () => {
    const items = [
      makeItem({ id: "1", readAt: new Date() }),
      makeItem({ id: "2", readAt: null }),
      makeItem({ id: "3", readAt: new Date() }),
    ];
    const consolidated = consolidateNotifications(items);
    expect(consolidated[0].count).toBe(3);
    expect(consolidated[0].unreadCount).toBe(1);
    expect(consolidated[0].allRead).toBe(false);
  });

  it("marks allRead true when every item is read", () => {
    const items = [
      makeItem({ id: "1", readAt: new Date() }),
      makeItem({ id: "2", readAt: new Date() }),
    ];
    const consolidated = consolidateNotifications(items);
    expect(consolidated[0].allRead).toBe(true);
    expect(consolidated[0].unreadCount).toBe(0);
  });

  it("preserves the most-recent item as latest regardless of input order", () => {
    const newest = new Date("2026-06-26T12:00:00.000Z");
    const middle = new Date("2026-06-26T11:00:00.000Z");
    const oldest = new Date("2026-06-26T10:00:00.000Z");
    const items = [
      makeItem({ id: "old", createdAt: oldest }),
      makeItem({ id: "new", createdAt: newest }),
      makeItem({ id: "mid", createdAt: middle }),
    ];
    const consolidated = consolidateNotifications(items);
    expect(consolidated[0].latest.id).toBe("new");
  });

  it("uses a stable key combining type and campaignId", () => {
    const items = [
      makeItem({ id: "1", type: "derivation_completed", campaignId: "camp-1" }),
      makeItem({ id: "2", type: "derivation_completed", campaignId: "camp-1" }),
    ];
    const consolidated = consolidateNotifications(items);
    expect(consolidated[0].key).toBe("derivation_completed::camp-1");
  });
});

describe("groupAndConsolidateNotifications", () => {
  it("preserves the outer date groups and consolidates within each", () => {
    const today = new Date("2026-06-26T10:00:00.000Z");
    const yesterday = new Date("2026-06-25T10:00:00.000Z");
    const dateGroups: NotificationGroup[] = [
      {
        label: "Hoje",
        items: [
          makeItem({ id: "t1", createdAt: today, campaignId: "camp-1" }),
          makeItem({ id: "t2", createdAt: today, campaignId: "camp-1" }),
          makeItem({ id: "t3", createdAt: today, campaignId: "camp-2" }),
        ],
      },
      {
        label: "Ontem",
        items: [
          makeItem({ id: "y1", createdAt: yesterday, campaignId: "camp-1" }),
        ],
      },
    ];
    const result = groupAndConsolidateNotifications([], dateGroups);
    expect(result).toHaveLength(2);
    expect(result[0].label).toBe("Hoje");
    expect(result[0].items).toHaveLength(2);
    expect(result[0].items[0].count).toBe(2);
    expect(result[1].label).toBe("Ontem");
    expect(result[1].items).toHaveLength(1);
    expect(result[1].items[0].count).toBe(1);
  });

  it("returns empty inner arrays for empty date groups", () => {
    const result = groupAndConsolidateNotifications([], [
      { label: "Hoje", items: [] },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].items).toEqual([]);
  });
});
