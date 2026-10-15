import { describe, expect, it, vi } from "vitest";
import { hashGuidanceContent, hashGuidanceSet } from "../../brand-taste/learned-guidance";
import { validateGuidanceExperimentManifest, type GuidanceExperimentManifest } from "./manifest";
import { partitionGuidanceExperimentLearningEvidence } from "./learning-evidence";
import { buildSimulatedGuidanceExperimentReport, type GuidanceExperimentEvidence } from "./report";

function simulatedManifest(): GuidanceExperimentManifest {
  const appliedRefs = [{ ruleId: "simulated-rule", revision: 1, contentHash: hashGuidanceContent("Voz direta.") }];
  return {
    schemaVersion: 1,
    experimentId: "simulated-guidance",
    origin: "simulated",
    provider: "controlled",
    changedFeatures: ["guidance_revisions"],
    window: { startsAt: "2026-10-15T00:00:00.000Z", endsAt: "2026-10-16T00:00:00.000Z" },
    closedAt: null,
    brands: [{
      workspaceId: "simulated-workspace", clientProfileId: "simulated-brand",
      role: "copy", generationMode: "single", format: "4:5",
      training: { contextIds: ["training-work"], evidenceIds: ["training-decision"] },
      holdout: [{ contextId: "holdout-work", contextKind: "creative_work", inputsHash: hashGuidanceContent("Pedido simulado"), evidenceIds: ["holdout-source"] }],
      exclusions: [{ contextId: "excluded-work", reason: "Entrada incompleta" }],
      arms: {
        treatment: { fixedPromptVersion: "copy/v1", appliedRefs, setHash: hashGuidanceSet(appliedRefs) },
        control: { fixedPromptVersion: "copy/v1", appliedRefs: [], setHash: null },
      },
    }],
  };
}

describe("guidance experiment manifest", () => {
  it("freezes a simulated selection, holdout, window and exclusions independently of later edits", () => {
    const input = simulatedManifest();
    const result = validateGuidanceExperimentManifest(input);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.failures.join("; "));
    input.brands[0].arms.treatment.appliedRefs[0].revision = 2;
    input.brands[0].holdout[0].evidenceIds.push("later-source");
    input.window.endsAt = "2027-01-01T00:00:00.000Z";
    expect(result.manifest.brands[0].arms.treatment.appliedRefs[0].revision).toBe(1);
    expect(result.manifest.brands[0].holdout[0].evidenceIds).toEqual(["holdout-source"]);
    expect(Object.isFrozen(result.manifest.brands[0].arms.treatment.appliedRefs[0])).toBe(true);
    expect(result).toMatchObject({ realExecutionAllowed: false, realExecutionBlock: "d4_pending_704" });
  });

  it.each([
    ["different fixed versions", (m: ReturnType<typeof simulatedManifest>) => { m.brands[0].arms.control.fixedPromptVersion = "copy/v2"; }],
    ["unknown fixed version", (m: ReturnType<typeof simulatedManifest>) => { m.brands[0].arms.control.fixedPromptVersion = m.brands[0].arms.treatment.fixedPromptVersion = "unknown"; }],
    ["changed selection hash", (m: ReturnType<typeof simulatedManifest>) => { m.brands[0].arms.treatment.appliedRefs[0].revision = 2; }],
    ["empty treatment", (m: ReturnType<typeof simulatedManifest>) => { m.brands[0].arms.treatment.appliedRefs = []; m.brands[0].arms.treatment.setHash = null; }],
    ["guidance in control", (m: ReturnType<typeof simulatedManifest>) => { m.brands[0].arms.control = m.brands[0].arms.treatment; }],
    ["training context in holdout", (m: ReturnType<typeof simulatedManifest>) => { m.brands[0].training.contextIds.push("holdout-work"); }],
    ["training evidence in holdout", (m: ReturnType<typeof simulatedManifest>) => { m.brands[0].training.evidenceIds.push("holdout-source"); }],
    ["cross-brand training contamination", (m: ReturnType<typeof simulatedManifest>) => {
      const other = structuredClone(m.brands[0]);
      other.clientProfileId = "other-brand";
      other.holdout[0] = { ...other.holdout[0], contextId: "other-holdout", evidenceIds: ["other-source"] };
      other.training.evidenceIds.push("holdout-source");
      m.brands.push(other);
    }],
    ["cross-brand training context", (m: ReturnType<typeof simulatedManifest>) => {
      const other = structuredClone(m.brands[0]);
      other.clientProfileId = "other-brand";
      other.holdout[0] = { ...other.holdout[0], contextId: "other-holdout", evidenceIds: ["other-source"] };
      other.training.contextIds.push("holdout-work");
      m.brands.push(other);
    }],
    ["duplicate brand", (m: ReturnType<typeof simulatedManifest>) => { m.brands.push(structuredClone(m.brands[0])); }],
    ["duplicate holdout context", (m: ReturnType<typeof simulatedManifest>) => { m.brands[0].holdout.push(structuredClone(m.brands[0].holdout[0])); }],
    ["holdout also excluded", (m: ReturnType<typeof simulatedManifest>) => { m.brands[0].exclusions[0].contextId = "holdout-work"; }],
    ["inverted window", (m: ReturnType<typeof simulatedManifest>) => { m.window.endsAt = m.window.startsAt; }],
  ])("blocks comparison with %s", (_label, change) => {
    const input = simulatedManifest();
    change(input);
    expect(validateGuidanceExperimentManifest(input).ok).toBe(false);
  });

  it.each([
    { origin: "real" }, { provider: "production" }, { changedFeatures: ["guidance_revisions", "quality_recovery"] },
    { changedFeatures: ["guidance_revisions", "guidance_revisions"] }, { changedFeatures: [] },
    { authorization: { issue: 704, authorized: true } }, { closedAt: "2026-10-15T12:00:00.000Z" },
  ])("rejects invalid or real manifests even with caller-supplied authorization: %j", change => {
    const result = validateGuidanceExperimentManifest({ ...simulatedManifest(), ...change });
    expect(result).toMatchObject({ ok: false, realExecutionAllowed: false, realExecutionBlock: "d4_pending_704" });
  });
});

function simulatedEvidence(manifest = simulatedManifest()): GuidanceExperimentEvidence {
  return {
    origin: "simulated",
    generations: manifest.brands.flatMap(brand => brand.holdout.flatMap(item => (["treatment", "control"] as const).map(arm => ({
      id: `${brand.clientProfileId}/${item.contextId}/${arm}`, workspaceId: brand.workspaceId, clientProfileId: brand.clientProfileId,
      contextId: item.contextId, contextKind: item.contextKind, generationMode: brand.generationMode, format: brand.format,
      arm, inputsHash: item.inputsHash, generatedAt: "2026-10-15T12:00:00.000Z",
      applications: [{ ...brand.arms[arm], role: brand.role, situation: arm === "treatment" ? "applied" : "no_guidance" }],
    })))),
    decisions: [],
  };
}

describe("simulated guidance experiment report", () => {
  const capturedAt = "2026-10-16T00:00:00.000Z";

  it("reports equivalent arms separately per brand and preserves missing measurements", async () => {
    const manifest = simulatedManifest();
    manifest.brands.push({ ...structuredClone(manifest.brands[0]), clientProfileId: "other-brand" });
    const evidence = simulatedEvidence(manifest);
    evidence.decisions.push({ id: "simulated-approval", generationId: evidence.generations[0].id, authorType: "human", action: "approved",
      snapshot: { generationIdentity: { state: "recorded", applications: [{ ...manifest.brands[0].arms.treatment, role: "copy" }] } } });
    const result = await buildSimulatedGuidanceExperimentReport({ manifest, provider: { kind: "controlled", read: async () => evidence }, capturedAt });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.failures.join("; "));
    expect(result).toMatchObject({ origin: "simulated", conclusion: "simulated_only", realExecutionAllowed: false });
    expect(result.report.groups).toHaveLength(4);
    expect(result.report.groups.find(group => group.clientProfileId === "simulated-brand" && group.situation === "applied")?.humanApproval).toEqual({ numerator: 1, denominator: 1, value: 1 });
    expect(result.report.groups.filter(group => group.clientProfileId === "other-brand").every(group => group.humanApproval.denominator === 0)).toBe(true);
    expect(result.report.groups.every(group => group.humanVisualScore.value === null && group.factualPass.value === null)).toBe(true);
  });

  it.each([{ origin: "real" }, { authorization: { issue: 704, authorized: true } }])("blocks before the provider is read: %j", async change => {
    const read = vi.fn(async () => simulatedEvidence());
    const result = await buildSimulatedGuidanceExperimentReport({ manifest: { ...simulatedManifest(), ...change }, provider: { kind: "controlled", read }, capturedAt });
    expect(result).toMatchObject({ ok: false, realExecutionAllowed: false, realExecutionBlock: "d4_pending_704" });
    expect(read).not.toHaveBeenCalled();
  });

  it("refuses an uncontrolled provider before reading or a provider returning real data", async () => {
    const read = vi.fn(async () => simulatedEvidence());
    const provider = { kind: "controlled" as const, read };
    Object.assign(provider, { kind: "production" });
    expect(await buildSimulatedGuidanceExperimentReport({ manifest: simulatedManifest(), provider, capturedAt })).toMatchObject({ ok: false });
    expect(read).not.toHaveBeenCalled();
    const realEvidence = Object.assign(simulatedEvidence(), { origin: "real" });
    read.mockResolvedValue(realEvidence);
    expect(await buildSimulatedGuidanceExperimentReport({ manifest: simulatedManifest(), provider: { kind: "controlled", read }, capturedAt })).toMatchObject({ ok: false });
  });

  it.each([
    ["different inputs", (e: GuidanceExperimentEvidence) => { e.generations[1].inputsHash = hashGuidanceContent("Outro pedido"); }],
    ["another brand", (e: GuidanceExperimentEvidence) => { e.generations[1].clientProfileId = "other-brand"; }],
    ["another workspace", (e: GuidanceExperimentEvidence) => { e.generations[1].workspaceId = "other-workspace"; }],
    ["another format", (e: GuidanceExperimentEvidence) => { e.generations[1].format = "9:16"; }],
    ["another mode", (e: GuidanceExperimentEvidence) => { e.generations[1].generationMode = "carousel"; }],
    ["another context kind", (e: GuidanceExperimentEvidence) => { e.generations[1].contextKind = "legacy_campaign"; }],
    ["excluded context", (e: GuidanceExperimentEvidence) => { e.generations[1].contextId = "excluded-work"; }],
    ["training context", (e: GuidanceExperimentEvidence) => { e.generations[1].contextId = "training-work"; }],
    ["outside window", (e: GuidanceExperimentEvidence) => { e.generations[1].generatedAt = "2026-10-16T00:00:00.000Z"; }],
    ["invalid generation date", (e: GuidanceExperimentEvidence) => { e.generations[1].generatedAt = "unknown"; }],
    ["missing control", (e: GuidanceExperimentEvidence) => { e.generations.pop(); }],
    ["no evidence", (e: GuidanceExperimentEvidence) => { e.generations = []; }],
    ["duplicate generation id", (e: GuidanceExperimentEvidence) => { e.generations[1].id = e.generations[0].id; }],
    ["unknown application", (e: GuidanceExperimentEvidence) => { e.generations[0].applications = null; }],
    ["unknown fixed version", (e: GuidanceExperimentEvidence) => { e.generations[0].applications = [{ ...simulatedManifest().brands[0].arms.treatment, role: "copy", situation: "applied", fixedPromptVersion: "unknown" }]; }],
    ["changed fixed version", (e: GuidanceExperimentEvidence) => { e.generations[0].applications = [{ ...simulatedManifest().brands[0].arms.treatment, role: "copy", situation: "applied", fixedPromptVersion: "copy/v2" }]; }],
    ["changed learned revision", (e: GuidanceExperimentEvidence) => {
      const selection = simulatedManifest().brands[0].arms.treatment;
      selection.appliedRefs[0].revision = 2;
      e.generations[0].applications = [{ ...selection, role: "copy", situation: "applied", setHash: hashGuidanceSet(selection.appliedRefs) }];
    }],
    ["omitted application", (e: GuidanceExperimentEvidence) => { e.generations[1].applications = [{ ...simulatedManifest().brands[0].arms.control, role: "copy", situation: "omitted" }]; }],
    ["another role", (e: GuidanceExperimentEvidence) => { e.generations[0].applications = [{ ...simulatedManifest().brands[0].arms.treatment, role: "image_prompt", situation: "applied" }]; }],
    ["multiple roles", (e: GuidanceExperimentEvidence) => { e.generations[0].applications = [
      { ...simulatedManifest().brands[0].arms.treatment, role: "copy", situation: "applied" },
      { ...simulatedManifest().brands[0].arms.treatment, role: "image_prompt", situation: "applied" },
    ]; }],
    ["unknown decision identity", (e: GuidanceExperimentEvidence) => { e.decisions.push({ id: "decision", generationId: e.generations[0].id, authorType: "human", action: "approved", snapshot: {} }); }],
    ["different decision version", (e: GuidanceExperimentEvidence) => { e.decisions.push({ id: "decision", generationId: e.generations[0].id, authorType: "human", action: "approved", snapshot: {
      generationIdentity: { state: "recorded", applications: [{ ...simulatedManifest().brands[0].arms.treatment, role: "copy", fixedPromptVersion: "copy/v2" }] },
    } }); }],
    ["different decision scope", (e: GuidanceExperimentEvidence) => { e.decisions.push({ id: "decision", generationId: e.generations[0].id, authorType: "human", action: "approved", snapshot: {
      format: "9:16", generationMode: "carousel",
      generationIdentity: { state: "recorded", applications: [{ ...simulatedManifest().brands[0].arms.treatment, role: "copy" }] },
    } }); }],
    ["orphan decision", (e: GuidanceExperimentEvidence) => { e.decisions.push({ id: "decision", generationId: "outside-holdout", authorType: "human", action: "approved", snapshot: {} }); }],
  ])("blocks comparison with %s in observed evidence", async (_label, change) => {
    const evidence = simulatedEvidence();
    change(evidence);
    const result = await buildSimulatedGuidanceExperimentReport({ manifest: simulatedManifest(), provider: { kind: "controlled", read: async () => evidence }, capturedAt });
    expect(result).toMatchObject({ ok: false });
    expect(result).not.toHaveProperty("report");
  });
});

describe("simulated holdout isolation", () => {
  const evidence = [
    { id: "new-holdout-decision", workspaceId: "simulated-workspace", clientProfileId: "simulated-brand", contextId: "holdout-work" },
    { id: "holdout-source", workspaceId: "simulated-workspace", clientProfileId: "other-brand", contextId: "other-work" },
    { id: "training-decision", workspaceId: "simulated-workspace", clientProfileId: "simulated-brand", contextId: "training-work" },
    { id: "independent-decision", workspaceId: "other-workspace", clientProfileId: "simulated-brand", contextId: "holdout-work" },
  ];

  it("withholds holdout sources and new decisions until explicit closure, even after the window ends", () => {
    for (const asOf of ["2026-10-15T12:00:00.000Z", "2026-10-17T00:00:00.000Z"]) {
      const result = partitionGuidanceExperimentLearningEvidence({ manifest: simulatedManifest(), evidence, asOf });
      expect(result.eligible.map(item => item.id)).toEqual(["training-decision", "independent-decision"]);
      expect(result.withheld.map(item => item.id)).toEqual(["new-holdout-decision", "holdout-source"]);
    }
  });

  it("releases simulated evidence only at the recorded closure, without authorizing any real experiment", () => {
    const manifest = simulatedManifest();
    manifest.closedAt = "2026-10-17T00:00:00.000Z";
    expect(partitionGuidanceExperimentLearningEvidence({ manifest, evidence, asOf: "2026-10-16T23:59:59.999Z" }).withheld).toHaveLength(2);
    expect(partitionGuidanceExperimentLearningEvidence({ manifest, evidence, asOf: manifest.closedAt })).toEqual({ eligible: evidence, withheld: [] });
    expect(validateGuidanceExperimentManifest(manifest).realExecutionAllowed).toBe(false);
  });

  it("fails closed for an invalid manifest or clock", () => {
    expect(() => partitionGuidanceExperimentLearningEvidence({ manifest: { ...simulatedManifest(), origin: "real" }, evidence, asOf: "2026-10-17T00:00:00.000Z" })).toThrow();
    expect(() => partitionGuidanceExperimentLearningEvidence({ manifest: simulatedManifest(), evidence, asOf: "unknown" })).toThrow();
  });
});
