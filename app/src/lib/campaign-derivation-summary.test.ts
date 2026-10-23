/**
 * Parity (#503, §9.2): the server summary and the produce surface computed on the light projection must
 * equal the rules the client applied on `main` (46e2a710) to the COMPLETE list. The old rules are copied
 * below from main; they never call the new code.
 */
import { describe, expect, it } from "vitest";
import {
  isPendingDerivationWork,
  summarizeCampaignDerivations,
  workspaceDerivationStatus,
  type DerivationSummaryRow,
} from "./campaign-derivation-summary";
import { resolveWorkspaceProduceSurface } from "@/server/application/resolve-workspace-produce-surface";

type Full = DerivationSummaryRow & {
  imageUrl: string | null;
  outputKey: string | null;
  qualityVerdict: "invalid" | "improvable" | "acceptable" | null;
  hardFailures: Array<{ code: string; message: string }> | null;
};

// --- main: use-derivations.ts hasPendingDerivationWork ---
function oldHasPending(data: Full[]) {
  return Boolean(
    data.some(
      (d) =>
        d.status === "queued" ||
        d.status === "processing" ||
        d.scoreStatus === "heuristic" ||
        (d.status === "completed" && d.scoreStatus === "pending") ||
        (d.isPreview && d.status === "completed" && d.qualityGatedAt == null)
    )
  );
}
// --- main: map-workspace-derivations.ts status mapping ---
const oldMappedStatus = (status: string) =>
  status === "queued" || status === "processing" ? "generating" : status;
// --- main: map-campaign-workspace-v6.ts ---
const oldReviewCount = (list: Full[]) =>
  list.map((d) => ({ status: oldMappedStatus(d.status) })).filter((d) => d.status === "active" || d.status === "generating").length;
const oldApprovedCount = (list: Full[]) =>
  list.map((d) => ({ status: oldMappedStatus(d.status) })).filter((d) => d.status === "approved").length;
// --- main: use-campaign-workspace.ts ---
const oldIsGenerating = (list: Full[]) => list.some((d) => d.status === "queued" || d.status === "processing");
const oldApprovedDerivation = (list: Full[]) => list.map((d) => ({ ...d, status: oldMappedStatus(d.status) })).find((d) => d.status === "approved");

function oldSummary(list: Full[]) {
  return {
    total: list.length, // derivationCount
    approvedCount: oldApprovedCount(list),
    reviewCount: oldReviewCount(list),
    isGenerating: oldIsGenerating(list),
    hasPendingWork: oldHasPending(list),
    approvedFirstId: oldApprovedDerivation(list)?.id ?? null,
  };
}

let seq = 0;
const row = (over: Partial<Full> & { status: string }): Full => {
  seq += 1;
  const id = `00000000-0000-4000-8000-${String(seq).padStart(12, "0")}`;
  return {
    id,
    isPreview: false,
    scoreStatus: "analyzed",
    qualityGatedAt: null,
    outputKey: `out/${id}.png`,
    imageUrl: `https://signed.test/out/${id}.png`,
    qualityVerdict: null,
    hardFailures: null,
    ...over,
  };
};
const gated = new Date("2026-10-01T10:00:00Z");

const FIXTURES: Record<string, Full> = {
  readyPreview: row({ status: "completed", isPreview: true, qualityGatedAt: gated, qualityVerdict: "acceptable" }),
  rejectedPreview: row({
    status: "completed", isPreview: true, qualityGatedAt: gated, qualityVerdict: "invalid",
    hardFailures: [{ code: "text_unreadable", message: "x" }],
  }),
  batchQueued: row({ status: "queued", scoreStatus: "pending", outputKey: null, imageUrl: null }),
  batchProcessing: row({ status: "processing", scoreStatus: "pending", outputKey: null, imageUrl: null }),
  approved: row({ status: "approved", qualityGatedAt: gated }),
  previewWithoutGate: row({ status: "completed", isPreview: true, qualityGatedAt: null }),
  heuristic: row({ status: "completed", scoreStatus: "heuristic" }),
  pending: row({ status: "completed", scoreStatus: "pending" }),
  failedBatch: row({ status: "failed", outputKey: null, imageUrl: null }),
  rejectedBatch: row({ status: "rejected" }),
  completedBatch: row({ status: "completed", scoreStatus: "analyzed" }),
  activeStatus: row({ status: "active" }),
  nullScore: row({ status: "completed", scoreStatus: null }),
};

const CAMPAIGNS = [
  { generationMode: "art_variation", creativeLevel: "balanced", ctaVariants: ["A", " B ", ""], targetFormats: ["1:1"] },
  { generationMode: "format_adaptation", creativeLevel: "safe", ctaVariants: ["A"], targetFormats: ["1:1", "9:16", "4:5"] },
  { generationMode: "restyling", creativeLevel: null, ctaVariants: null, targetFormats: null },
] as const;

/** The light projection the server reads: no imageUrl, no heavy jsonb. */
const light = (d: Full) => ({
  id: d.id,
  status: d.status,
  isPreview: d.isPreview,
  outputKey: d.outputKey,
  qualityVerdict: d.qualityVerdict,
  hardFailures: d.hardFailures,
  scoreStatus: d.scoreStatus,
  qualityGatedAt: d.qualityGatedAt,
});

function expectParity(list: Full[], label: string) {
  const old = oldSummary(list);
  const next = summarizeCampaignDerivations(list.map(light));
  expect(next.total, label).toBe(old.total);
  expect(next.approvedCount, label).toBe(old.approvedCount);
  expect(next.reviewCount, label).toBe(old.reviewCount);
  expect(next.isGenerating, label).toBe(old.isGenerating);
  expect(next.hasPendingWork, label).toBe(old.hasPendingWork);
  expect(next.approvedIds[0] ?? null, label).toBe(old.approvedFirstId);
  expect(next.approvedIds, label).toEqual(list.filter((d) => d.status === "approved").map((d) => d.id));

  for (const campaign of CAMPAIGNS) {
    const oldSurface = resolveWorkspaceProduceSurface({ campaign, derivations: list as never });
    const newSurface = resolveWorkspaceProduceSurface({ campaign, derivations: list.map(light) as never });
    expect(newSurface, label).toEqual(oldSurface);
  }
}

describe("summarizeCampaignDerivations and the light projection equal the main rules", () => {
  it("every named fixture alone", () => {
    for (const [name, d] of Object.entries(FIXTURES)) expectParity([d], name);
  });

  it("an empty Campanha", () => {
    expectParity([], "empty");
    expect(summarizeCampaignDerivations([])).toEqual({
      total: 0, approvedCount: 0, reviewCount: 0, isGenerating: false, hasPendingWork: false, approvedIds: [],
    });
  });

  it("known mixed lists, newest first", () => {
    const f = FIXTURES;
    expectParity([f.batchQueued!, f.batchProcessing!, f.approved!, f.readyPreview!], "batch in progress");
    expectParity([f.readyPreview!], "preview ready, no batch");
    expectParity([f.rejectedPreview!, f.failedBatch!], "rejected preview");
    expectParity([f.completedBatch!, f.approved!, f.readyPreview!], "approved behind newer pieces");
    expectParity([f.previewWithoutGate!, f.completedBatch!], "preview waiting for the gate");
    expectParity([f.heuristic!, f.pending!, f.nullScore!], "scoring in flight");
    expectParity(Object.values(FIXTURES), "everything");
    expectParity([...Object.values(FIXTURES)].reverse(), "everything reversed");
  });

  it("every ordered pair and triple of fixtures", () => {
    const all = Object.values(FIXTURES);
    for (const a of all) {
      for (const b of all) {
        if (a.id === b.id) continue;
        expectParity([a, b], `${a.id}+${b.id}`);
        for (const c of all) {
          if (c.id === a.id || c.id === b.id) continue;
          expectParity([a, b, c], `${a.id}+${b.id}+${c.id}`);
        }
      }
    }
  });

  it("the full status x score x preview x gate matrix, in lists of three", () => {
    const statuses = ["queued", "processing", "completed", "approved", "failed", "rejected", "active"];
    const scores = ["pending", "heuristic", "analyzed", "failed", null];
    const singles: Full[] = [];
    for (const status of statuses) {
      for (const scoreStatus of scores) {
        for (const isPreview of [false, true]) {
          for (const qualityGatedAt of [null, gated]) {
            singles.push(row({ status, scoreStatus, isPreview, qualityGatedAt, outputKey: isPreview ? null : "k" , imageUrl: isPreview ? null : "u" }));
          }
        }
      }
    }
    expect(singles.length).toBe(7 * 5 * 2 * 2);
    singles.forEach((d, i) => {
      expectParity([d], `single ${i}`);
      expectParity([d, singles[(i * 7 + 3) % singles.length]!, singles[(i * 13 + 5) % singles.length]!], `triple ${i}`);
    });
  });

  it("workspaceDerivationStatus is the old status mapping", () => {
    for (const s of ["queued", "processing", "completed", "approved", "failed", "rejected", "active", "generating", "draft"]) {
      expect(workspaceDerivationStatus(s)).toBe(oldMappedStatus(s));
    }
  });

  it("isPendingDerivationWork on a loaded row equals the old per-row rule", () => {
    for (const d of Object.values(FIXTURES)) expect(isPendingDerivationWork(d)).toBe(oldHasPending([d]));
  });

  it("the approved Peça outside the first page is still summarized (page size is irrelevant)", () => {
    const list = [
      ...Array.from({ length: 30 }, () => row({ status: "completed" })),
      row({ status: "approved" }),
    ];
    const next = summarizeCampaignDerivations(list.map(light));
    expect(next.approvedIds).toEqual([list[30]!.id]);
    expect(next.total).toBe(31);
    expectParity(list, "31 pieces");
  });
});
