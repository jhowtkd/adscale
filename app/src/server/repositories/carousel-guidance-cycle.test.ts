import { beforeEach, describe, expect, it, vi } from "vitest";
import { hashGuidanceContent, renderLearnedGuidance } from "../brand-taste/learned-guidance";
import { freezeCarouselGuidanceCycle } from "./carousel-guidance-cycle";
import type { CarouselEditorialState } from "../creative-work/carousel-editorial-state";
import type { FrozenCarouselGuidanceCycle } from "../brand-taste/carousel-guidance-cycle";
import { emptyCarouselGuidanceFixture } from "../creative-work/testing/carousel-guidance";

const state = vi.hoisted(() => ({ reads: [] as unknown[][], writes: vi.fn() }));
vi.mock("../db", () => ({ db: {} }));
vi.mock("./creative-work", () => ({ withCreativeWorkPreparationLock: async (_w: string, _id: string, run: (tx: object) => Promise<unknown>) => run({
  select: () => ({ from: () => ({ where: () => {
    const rows = state.reads.shift();
    if (!rows) throw new Error("unexpected test read");
    return Object.assign(Promise.resolve(rows), { limit: async () => rows });
  } }) }),
  update: () => ({ set: (patch: unknown) => ({ where: async () => state.writes(patch) }) }),
}) }));

const work = { id: "work-1", workspaceId: "workspace-1", toolKind: "carousel", clientProfileId: "brand-1", format: "4:5", updatedAt: new Date("2026-10-01T00:00:00Z") };
const editorial: CarouselEditorialState = { version: 1, revision: "pending", contextHash: "pending",
  research: { status: "not_needed", question: "", thesis: "", sources: [], claims: [], gaps: [] },
  hooks: [], recommendedHookId: null, recommendation: null, selectedHookId: null, storyboard: [], caption: null,
  approvedScriptRevision: null, approvedCover: null, confirmedInteriorsRevision: null };
const input = { editorial, workspaceId: work.workspaceId, workItemId: work.id, executionId: "root-attempt", expectedUpdatedAt: work.updatedAt.toISOString(), requestKey: "request", contextFingerprint: "context" };
const selection = (text: string) => ({ ...renderLearnedGuidance({ role: "carousel_editorial", language: "en", revisions: [{
  ruleId: "rule-1", revision: "legacy", category: "voice", roles: ["carousel_editorial"], text, contentHash: hashGuidanceContent(text),
}] }), omissions: [] });

beforeEach(() => { state.reads = []; state.writes.mockReset(); });

describe("Carousel guidance execution freeze", () => {
  it("resolves every role once, persists before returning, and reuses on resume/retry after approval changes", async () => {
    const approved = selection("Voz aprovada inicial.");
    const read = vi.fn().mockResolvedValue(approved);
    state.reads = [[work], [], [{ id: input.executionId }]];
    const first = await freezeCarouselGuidanceCycle(input, { loadLearnedGuidance: read });
    expect(read.mock.calls.map(([call]) => call.role)).toEqual(["carousel_editorial", "image_prompt"]);
    expect(read).toHaveBeenCalledWith(expect.objectContaining({ clientProfileId: "brand-1", format: "4:5", generationMode: "carousel", language: "en" }));
    expect(state.writes).toHaveBeenCalledWith({ frozenCarouselGuidance: first });
    approved.lines.push("Mutação posterior não pode mudar o congelado.");
    expect(first.selections.carousel_editorial.lines).not.toContain("Mutação posterior não pode mudar o congelado.");
    read.mockResolvedValue(selection("Aprovação nova."));
    state.reads = [[work], [{ id: first.cycleId, frozenCarouselGuidance: first }]];
    expect(await freezeCarouselGuidanceCycle({ ...input, executionId: "script-attempt", parentCycleId: first.cycleId, reuseCycle: true }, { loadLearnedGuidance: read })).toEqual(first);
    state.reads = [[work], [{ id: first.cycleId, frozenCarouselGuidance: first }]];
    expect(await freezeCarouselGuidanceCycle({ ...input, executionId: "retry-attempt" }, { loadLearnedGuidance: read })).toEqual(first);
    const autosaved = { ...work, updatedAt: new Date("2026-10-02T00:00:00Z") };
    state.reads = [[autosaved], [{ frozenCarouselGuidance: first }]];
    expect(await freezeCarouselGuidanceCycle({ ...input, executionId: "autosave-retry", parentCycleId: first.cycleId,
      expectedUpdatedAt: autosaved.updatedAt.toISOString(), requestKey: "new-timestamp", reuseWhenContextMatches: true },
    { loadLearnedGuidance: read })).toEqual(first);
    expect(read).toHaveBeenCalledTimes(2);
    expect(state.writes).toHaveBeenCalledWith({ settings: { carouselEditorial: { ...editorial, guidanceCycleId: first.cycleId } } });
    expect(state.writes).toHaveBeenCalledTimes(2);
  });

  it("deliberate revision creates a child from the current approval instead of reinterpreting its parent", async () => {
    const parent = { cycleId: "root", selections: { carousel_editorial: selection("Anterior") } } as FrozenCarouselGuidanceCycle;
    state.reads = [[work], [{ frozenCarouselGuidance: parent }], [], [{ id: "child" }]];
    const read = vi.fn().mockResolvedValue(selection("Atual"));
    const child = await freezeCarouselGuidanceCycle({ ...input, executionId: "child", requestKey: "revision", parentCycleId: "root" }, { loadLearnedGuidance: read });
    expect(child).toMatchObject({ cycleId: "child", parentCycleId: "root" });
    expect(child.selections.carousel_editorial.setHash).not.toBe(parent.selections.carousel_editorial.setHash);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it.each([
    { scope: "format", change: { format: "9:16" }, reuseCycle: true },
    { scope: "format", change: { format: "9:16" }, reuseWhenContextMatches: true },
    { scope: "brand", change: { clientProfileId: "brand-2" }, reuseCycle: true },
    { scope: "brand", change: { clientProfileId: "brand-2" }, reuseWhenContextMatches: true },
  ])("resolves a child after $scope changes even if parent and retry key both match", async ({ change, reuseCycle, reuseWhenContextMatches }) => {
    const parent = { ...emptyCarouselGuidanceFixture(), cycleId: "root", clientProfileId: work.clientProfileId,
      contextFingerprint: input.contextFingerprint, requestKey: input.requestKey };
    const current = { ...work, ...change };
    state.reads = [[current], [{ frozenCarouselGuidance: parent }], [{ frozenCarouselGuidance: parent }], [{ id: "child" }]];
    const read = vi.fn().mockResolvedValue(selection("Orientação do escopo atual."));
    const child = await freezeCarouselGuidanceCycle({ ...input, reuseCycle, reuseWhenContextMatches, executionId: "child", parentCycleId: parent.cycleId }, { loadLearnedGuidance: read });
    expect(child).toMatchObject({ cycleId: "child", parentCycleId: parent.cycleId, format: current.format, clientProfileId: current.clientProfileId });
    expect(read).toHaveBeenCalledTimes(2);
    for (const [call] of read.mock.calls) expect(call).toMatchObject({ format: current.format, clientProfileId: current.clientProfileId });
    expect(state.writes).toHaveBeenCalledWith({ settings: { carouselEditorial: { ...editorial, guidanceCycleId: child.cycleId } } });
  });

  it("refuses stale or untrusted units before reading learning and never overwrites a frozen execution", async () => {
    const read = vi.fn();
    state.reads = [[{ ...work, updatedAt: new Date("2026-10-02") }]];
    await expect(freezeCarouselGuidanceCycle(input, { loadLearnedGuidance: read })).rejects.toThrow("stale_carousel_guidance_cycle");
    state.reads = [[work], []];
    await expect(freezeCarouselGuidanceCycle({ ...input, parentCycleId: "foreign", reuseCycle: true }, { loadLearnedGuidance: read })).rejects.toThrow("unknown_carousel_guidance_cycle");
    state.reads = [[work], [], [{ id: input.executionId, frozenCarouselGuidance: { requestKey: "other-unit" } }]];
    await expect(freezeCarouselGuidanceCycle(input, { loadLearnedGuidance: read })).rejects.toThrow("carousel_execution_already_frozen");
    expect(read).not.toHaveBeenCalled();
    expect(state.writes).not.toHaveBeenCalled();
  });
});
