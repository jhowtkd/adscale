import { describe, expect, it } from "vitest";
import { mapDashboardToV6View } from "./map-dashboard-v6";
import type { DashboardStats } from "@/server/repositories/dashboard";

const baseStats: DashboardStats = {
  totalCampaigns: 2,
  campaignsChange: 0,
  totalDerivations: 10,
  derivationsThisMonth: 4,
  derivationsChange: 0,
  approvedDerivations: 6,
  approvalRate: 60,
  approvalChange: 0,
  avgGenerationTimeSeconds: 30,
  creditsRemaining: 100,
  creditsUsedThisMonth: 20,
  creditsTotal: 120,
  creditUsageSeries: [],
  recentCampaigns: [
    {
      id: "camp-1",
      name: "Summer",
      thumbnailUrl: null,
      pieceCount: 5,
      approvedCount: 3,
      status: "active",
      platforms: ["Meta", "Google"],
      updatedAt: new Date("2026-06-01T12:00:00Z"),
    },
    {
      id: "camp-2",
      name: "Winter",
      thumbnailUrl: null,
      pieceCount: 2,
      approvedCount: 1,
      status: "draft",
      platforms: [],
      updatedAt: new Date("2026-06-02T12:00:00Z"),
    },
  ],
  recentActivity: [],
  subscription: { planKey: "starter", status: "active" },
};

const labels = {
  tKpi: (key: string) => (key === "vsLastMonth" ? "vs período anterior" : key),
  tStatus: (key: string) => key,
  tHero: (key: string) => key,
  tBriefing: (key: string) => key,
  tRelative: {
    now: "agora",
    minutes: (count: number) => `${count} min`,
    hours: (count: number) => `${count} h`,
    oneDay: "1 dia",
    days: (count: number) => `${count} dias`,
  },
  authorName: "Ana",
  templateFallback: "—",
  varsCount: (count: number) => `${count} vars`,
};

const templates = [
  { id: "t-1", name: "Lançamento", description: null, objective: null, audience: null, tone: null, platforms: [], offer: null, constraints: null, targetFormats: ["1:1", "4:5"] } as never,
  { id: "t-2", name: "Black Friday", description: null, objective: null, audience: null, tone: null, platforms: [], offer: null, constraints: null, targetFormats: ["1:1"] } as never,
  { id: "t-3", name: "Natal", description: null, objective: null, audience: null, tone: null, platforms: [], offer: null, constraints: null, targetFormats: ["9:16"] } as never,
  { id: "t-4", name: "Ano novo", description: null, objective: null, audience: null, tone: null, platforms: [], offer: null, constraints: null, targetFormats: [] } as never,
  { id: "t-5", name: "Volta às aulas", description: null, objective: null, audience: null, tone: null, platforms: [], offer: null, constraints: null, targetFormats: [] } as never,
];

describe("mapDashboardToV6View", () => {
  it("renders campaign platforms and uses em dash only when empty", () => {
    const view = mapDashboardToV6View({
      stats: baseStats,
      firstName: "Ana",
      templates: [],
      ...labels,
    });

    expect(view.activity[0]?.platforms).toBe("Meta, Google");
    expect(view.activity[1]?.platforms).toBe("—");
  });

  it("shows 0% vs período anterior when change is zero", () => {
    const view = mapDashboardToV6View({
      stats: baseStats,
      firstName: "Ana",
      templates: [],
      ...labels,
    });

    expect(view.kpis[0]?.trend).toBe("0% vs período anterior");
    expect(view.kpis[1]?.trend).toBe("0% vs período anterior");
    expect(view.kpis[2]?.trend).toBe("0% vs período anterior");
  });

  it("prepends the create-post quick action to the recipes list", () => {
    const view = mapDashboardToV6View({
      stats: baseStats,
      firstName: "Ana",
      templates,
      ...labels,
    });

    expect(view.recipes).toHaveLength(4);
    expect(view.recipes[0]?.id).toBe("quick-tool-create-post");
    expect(view.recipes[0]?.href).toBe("/quick-tools/create-post");
    expect(view.recipes[0]?.name).toBe("createPostName");
    expect(view.recipes[0]?.desc).toBe("createPostDescription");
    expect(view.recipes[0]?.count).toBe("createPostCount");
    expect(view.recipes[0]?.icon).toBe("✦");
    expect(view.recipes[1]?.id).toBe("t-1");
    expect(view.recipes[2]?.id).toBe("t-2");
    expect(view.recipes[3]?.id).toBe("t-3");
  });

  it.each([
    ["generating", "warning"],
    ["processing", "warning"],
    ["queued", "warning"],
    ["failed", "danger"],
    ["completed", "success"],
    ["approved", "success"],
    ["active", "info"],
    ["review", "info"],
    ["draft", "neutral"],
    ["archived", "neutral"],
    ["unknown", "neutral"],
  ] as const)("maps %s to %s across activity and hero", (status, tone) => {
    const stats = {
      ...baseStats,
      recentCampaigns: [{ ...baseStats.recentCampaigns[0], status }],
    };

    const view = mapDashboardToV6View({
      stats,
      firstName: "Ana",
      templates: [],
      ...labels,
    });

    expect(view.activity[0]?.statusClass).toBe(tone);
    expect(view.hero?.badgeClass).toBe(tone);
  });
});
