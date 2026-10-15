import { describe, expect, it } from "vitest";
import { hashGuidanceContent, hashGuidanceSet } from "../../brand-taste/learned-guidance";
import { snapshotGenerationIdentity } from "../../output-learning/generation-identity";
import type { GuidanceImpactDecision, GuidanceImpactGeneration } from "./types";
import { buildGuidanceImpactReport } from "./aggregate";

const ref = { ruleId: "rule", revision: 1, contentHash: hashGuidanceContent("Simulado") };
const applied = { role: "copy", fixedPromptVersion: "copy/v1", situation: "applied", appliedRefs: [ref], setHash: hashGuidanceSet([ref]) };
const control = { ...applied, situation: "no_guidance", appliedRefs: [], setHash: null };
const scope = { workspaceId: "workspace", clientProfileId: "brand", contextId: "work", contextKind: "creative_work" as const, generationMode: "single", format: "4:5" };
function sample(count = 3) {
  const generations: GuidanceImpactGeneration[] = [];
  const decisions: GuidanceImpactDecision[] = [];
  for (const [arm, application] of [applied, control].entries()) {
    for (let index = 0; index < count; index++) {
      const id = `${arm}:${index}`;
      generations.push({ ...scope, id, applications: [application] });
      decisions.push({ id, generationId: id, authorType: "human", action: arm ? "rejected" : "approved", snapshot: { generationIdentity: snapshotGenerationIdentity([application]) } });
    }
  }
  return { generations, decisions, capturedAt: "2026-10-15" };
}

describe("guidance impact comparison limits (simulated evidence)", () => {
  it("requires three distinct assessed generations in each arm, not three events on one Peça", () => {
    const input = sample(1);
    input.decisions.push(...input.decisions.flatMap(decision => [1, 2].map(index => ({ ...decision, id: `${decision.id}:${index}` }))));
    const report = buildGuidanceImpactReport(input);
    expect(report.samplePolicy).toEqual({ minimumPerArm: 3, unit: "distinct_generations_per_metric" });
    expect(report.status).toBe("insufficient_sample");
    expect(report.comparisons[0]).toMatchObject({ status: "insufficient_sample", metrics: {
      humanDecision: { appliedCount: 1, controlCount: 1, sufficient: false },
      humanVisualScore: { appliedCount: 0, controlCount: 0, sufficient: false },
      factualPass: { appliedCount: 0, controlCount: 0, sufficient: false },
    } });
  });

  it.each([
    ["workspaceId", "other"], ["clientProfileId", "other"], ["contextId", "other"],
    ["contextKind", "legacy_campaign"], ["generationMode", "carousel"], ["format", "9:16"],
  ])("does not use a control with a different %s, even with enough observations", (key, value) => {
    const input = sample();
    for (const generation of input.generations.slice(3)) Object.assign(generation, { [key]: value });
    expect(buildGuidanceImpactReport(input).comparisons[0]).toMatchObject({ status: "insufficient_sample", controlGroupIndex: null, reasons: expect.arrayContaining(["missing_control"]) });
  });

  it.each(["copy/v2", "unknown"])("blocks comparison against fixed version %s", version => {
    const input = sample();
    const application = { ...control, fixedPromptVersion: version };
    for (const generation of input.generations.slice(3)) generation.applications = [application];
    for (const decision of input.decisions.slice(3)) decision.snapshot.generationIdentity = snapshotGenerationIdentity([application]);
    expect(buildGuidanceImpactReport(input).comparisons[0]).toMatchObject({ status: "insufficient_sample", controlGroupIndex: null });
  });

  it("keeps unknown fixed versions inconclusive even when both arms have the same unknown version", () => {
    const input = sample();
    input.generations.forEach((generation, index) => {
      const application = { ...(index < 3 ? applied : control), fixedPromptVersion: "unknown" };
      generation.applications = [application];
      input.decisions[index].snapshot.generationIdentity = snapshotGenerationIdentity([application]);
    });
    expect(buildGuidanceImpactReport(input).comparisons[0]).toMatchObject({ status: "inconclusive", target: "unisolated", reasons: ["unknown_fixed_version"] });
  });

  it.each([2, 3])("uses the existing boundary with %i independent observations per arm", count => {
    const report = buildGuidanceImpactReport(sample(count));
    expect(report.status).toBe(count === 3 ? "inconclusive" : "insufficient_sample");
    expect(report.comparisons[0]).toMatchObject({ target: "revision", metrics: {
      humanDecision: { appliedCount: count, controlCount: count, sufficient: count === 3 },
    } });
  });

  it("identifies the whole set rather than each rule when the treatment contains multiple revisions", () => {
    const input = sample();
    const refs = [ref, { ...ref, ruleId: "other-rule" }];
    const application = { ...applied, appliedRefs: refs, setHash: hashGuidanceSet(refs) };
    input.generations.slice(0, 3).forEach((generation, index) => {
      generation.applications = [application];
      input.decisions[index].snapshot.generationIdentity = snapshotGenerationIdentity([application]);
    });
    expect(buildGuidanceImpactReport(input).comparisons).toMatchObject([{ status: "inconclusive", target: "set" }]);
  });

  it("does not isolate one revision if another role also changes", () => {
    const input = sample();
    input.generations.forEach((generation, index) => {
      const applications = [index < 3 ? applied : control, { ...(index < 3 ? applied : control), role: "image_prompt", fixedPromptVersion: "image/v1" }];
      generation.applications = applications;
      input.decisions[index].snapshot.generationIdentity = snapshotGenerationIdentity(applications);
    });
    expect(buildGuidanceImpactReport(input).comparisons).toMatchObject([
      { target: "unisolated", reasons: ["other_guidance_changed"] },
      { target: "unisolated", reasons: ["other_guidance_changed"] },
    ]);
  });

  it("checks each available metric independently and preserves zero and false evaluations", () => {
    const input = sample();
    input.generations.forEach(generation => { generation.humanVisualScore = 0; generation.factualPass = false; });
    delete input.generations[0].humanVisualScore;
    const report = buildGuidanceImpactReport(input);
    expect(report.comparisons[0]).toMatchObject({ status: "inconclusive", metrics: {
      humanDecision: { sufficient: true }, humanVisualScore: { appliedCount: 2, controlCount: 3, sufficient: false },
      factualPass: { appliedCount: 3, controlCount: 3, sufficient: true },
    } });
    expect(report.groups[0]).toMatchObject({ humanVisualScore: { value: 0 }, factualPass: { value: 0 } });
    input.decisions = [];
    expect(buildGuidanceImpactReport(input).comparisons[0].metrics.humanDecision.sufficient).toBe(false);
  });

  it.each(["omitted", "unknown"])("never fills the control arm with %s application", situation => {
    const input = sample();
    input.generations.slice(3).forEach((generation, index) => {
      const application = { ...control, situation };
      generation.applications = [application];
      input.decisions[index + 3].snapshot.generationIdentity = snapshotGenerationIdentity([application]);
    });
    expect(buildGuidanceImpactReport(input).comparisons[0]).toMatchObject({ controlGroupIndex: null, status: "insufficient_sample" });
  });

  it("does not pool revisions, retries, replayed decisions or agent selections to reach the minimum", () => {
    const input = sample(2);
    const revision2 = { ...ref, revision: 2 };
    const application = { ...applied, appliedRefs: [revision2], setHash: hashGuidanceSet([revision2]) };
    input.generations.push({ ...scope, id: "new-revision", applications: [application] });
    input.decisions.push({ id: "new-revision", generationId: "new-revision", authorType: "human", action: "approved", snapshot: { generationIdentity: snapshotGenerationIdentity([application]) } });
    input.generations[0].applications = [applied, applied];
    input.decisions.push(input.decisions[0], { ...input.decisions[0], id: "agent", authorType: "agent" });
    const report = buildGuidanceImpactReport(input);
    expect(report.status).toBe("insufficient_sample");
    expect(report.comparisons.map(item => item.metrics.humanDecision.appliedCount)).toEqual([2, 1]);
    expect(report.groups.filter(group => group.situation === "applied").map(group => group.appliedRefs[0].revision)).toEqual([1, 2]);
  });

  it("keeps a single-revision contrast isolated when all other recorded roles remain fixed", () => {
    const input = sample();
    input.generations.forEach((generation, index) => {
      const applications = [index < 3 ? applied : control, { ...applied, role: "image_prompt", fixedPromptVersion: "image/v1" }];
      generation.applications = applications;
      input.decisions[index].snapshot.generationIdentity = snapshotGenerationIdentity(applications);
    });
    expect(buildGuidanceImpactReport(input).comparisons[0]).toMatchObject({ target: "revision", status: "inconclusive", reasons: [] });
  });
});
