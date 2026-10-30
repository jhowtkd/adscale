import { describe, expect, it } from "vitest";
import { hashGuidanceContent, hashGuidanceSet } from "../brand-taste/learned-guidance";
import { resolveSinglePieceGuidance } from "../brand-taste/single-piece-guidance";
import { compileBrandKnowledgeVersionV2 } from "../brand-knowledge/version-compiler";
import { getCreativeWorkPromptVersion } from "../shared-skills";
import { candidateSchema, freezeCandidate } from "./calibration";
import { hasCalibrationVisualScope, planCalibrationScopes, calibrationGuidanceSnapshotSchema, type CalibrationGuidanceSnapshot } from "./visual-guidance-contract";

const workspaceId = "22222222-2222-4222-8222-222222222222";
const clientProfileId = "11111111-1111-4111-8111-111111111111";
function content() {
  const revision = { ruleId: "rule", revision: 1, contentHash: hashGuidanceContent("Use hierarquia clara."), text: "Use hierarquia clara.", category: "hierarchy" as const, roles: ["art_direction", "image_prompt"] as const };
  const visualGuidance: CalibrationGuidanceSnapshot = { schemaVersion: 1, workspaceId, clientProfileId, sets: ["copy", "art_direction", "image_prompt"].map(role => ({
    role: role as "copy" | "art_direction" | "image_prompt", generationMode: "single", format: "4:5", language: "pt-BR",
    fixedPromptVersion: getCreativeWorkPromptVersion(role === "image_prompt" ? "image_prompt" : "composer"),
    revisions: role === "copy" ? [] : [{ ...revision, roles: [...revision.roles] }],
    setHash: role === "copy" ? null : hashGuidanceSet([revision]), visualRuleIds: role === "copy" ? [] : [revision.ruleId],
  })) };
  return { schemaVersion: 2 as const, visualGuidance,
    knowledge: { schemaVersion: 1 as const, profileId: clientProfileId, compiledAt: "2026-10-15T12:00:00.000Z", claims: [], excluded: [] },
    identity: { clientProfileId, confirmedAt: "2026-10-15T12:00:00.000Z", assets: [], brandKit: { colors: [], fonts: [], toneOfVoice: null, prohibitedElements: null, requiredElements: null } }, evidenceHashes: {},
  };
}

describe("Frozen learned visual candidate", () => {
  it("fits each required context in four images without adding rounds", () => {
    const snapshot = content().visualGuidance;
    const image = snapshot.sets[2]!;
    snapshot.sets.push({ ...image, format: "9:16" },
      { ...image, generationMode: "carousel", language: "en" },
      { ...image, generationMode: "carousel", format: "1:1", language: "en" });
    expect(planCalibrationScopes(snapshot)).toEqual([
      { generationMode: "single", format: "4:5" }, { generationMode: "single", format: "9:16" },
      { generationMode: "carousel", format: "4:5" }, { generationMode: "carousel", format: "1:1" },
    ]);
    expect(planCalibrationScopes()).toEqual(Array.from({ length: 4 }, () => ({ generationMode: "single", format: "4:5" })));
  });

  describe("refinement scopes", () => {
    const peca = { round: 1, slot: 0 as const, workItemId: "work-base", outputId: "output-base" };
    const story = { round: 1, slot: 1 as const, workItemId: "work-story", outputId: "output-story" };
    function refinementSnapshot() {
      const snapshot = content().visualGuidance;
      const direction = snapshot.sets[1]!;
      const image = snapshot.sets[2]!;
      snapshot.sets.push({ ...image, format: "9:16" },
        { ...direction, generationMode: "creative_revision", fixedPromptVersion: "refinement/v1" },
        { ...direction, generationMode: "creative_revision", format: "9:16", fixedPromptVersion: "refinement/v1" },
        { ...direction, generationMode: "format_adaptation", format: "9:16", fixedPromptVersion: "refinement/v1" },
        { ...image, generationMode: "carousel", language: "en" },
        { ...image, generationMode: "carousel", format: "1:1", language: "en" });
      return snapshot;
    }

    it("orders the batch as Peça 4:5, revision, 9:16, adaptation, carousel 4:5, carousel 1:1", () => {
      expect(planCalibrationScopes(refinementSnapshot(), { bases: { "4:5": peca }, provedScopes: [] })).toEqual([
        { generationMode: "single", format: "4:5" },
        { generationMode: "creative_revision", format: "4:5", base: peca },
        { generationMode: "single", format: "9:16" },
        { generationMode: "format_adaptation", format: "9:16", base: peca },
      ]);
      const noAdaptation = refinementSnapshot();
      noAdaptation.sets = noAdaptation.sets.filter(set => set.generationMode !== "format_adaptation");
      expect(planCalibrationScopes(noAdaptation, { bases: { "4:5": peca }, provedScopes: [] }).slice(2)).toEqual([
        { generationMode: "single", format: "9:16" },
        { generationMode: "carousel", format: "4:5" },
      ]);
    });

    it("never carries refinement without an earlier Peça-base, in the same batch included", () => {
      for (const refinement of [undefined, { bases: {}, provedScopes: [] }]) {
        expect(planCalibrationScopes(refinementSnapshot(), refinement).map(scope => scope.generationMode))
          .toEqual(["single", "single", "carousel", "carousel"]);
      }
    });

    it("needs a visual rule of that exact scope: approval alone adds no example", () => {
      const snapshot = refinementSnapshot();
      for (const set of snapshot.sets) if (set.generationMode === "creative_revision") set.visualRuleIds = [];
      expect(planCalibrationScopes(snapshot, { bases: { "4:5": peca }, provedScopes: [] }).map(scope => scope.generationMode))
        .toEqual(["single", "single", "format_adaptation", "carousel"]);
    });

    it("moves the one revision slot to the format still without proof", () => {
      const bases = { "4:5": peca, "9:16": story };
      expect(planCalibrationScopes(refinementSnapshot(), { bases, provedScopes: [{ generationMode: "creative_revision", format: "4:5" }] })[1])
        .toEqual({ generationMode: "creative_revision", format: "9:16", base: story });
      expect(planCalibrationScopes(refinementSnapshot(), { bases, provedScopes: [] })[1])
        .toEqual({ generationMode: "creative_revision", format: "4:5", base: peca });
    });

    it("frees the slot of a proved refinement scope for the next in priority", () => {
      const proved = [
        { generationMode: "creative_revision", format: "4:5" },
        { generationMode: "creative_revision", format: "9:16" },
        { generationMode: "format_adaptation", format: "9:16" },
      ];
      const scopes = planCalibrationScopes(refinementSnapshot(), { bases: { "4:5": peca, "9:16": story }, provedScopes: proved });
      expect(scopes.some(scope => scope.base)).toBe(false);
      expect(scopes.map(scope => `${scope.generationMode}:${scope.format}`)).toEqual([
        "single:4:5", "single:9:16", "carousel:4:5", "carousel:1:1",
      ]);
    });

    it("keeps four units with a single Peça-base and adapts only from 4:5", () => {
      const scopes = planCalibrationScopes(refinementSnapshot(), { bases: { "9:16": story }, provedScopes: [] });
      expect(scopes).toHaveLength(4);
      expect(scopes.map(scope => `${scope.generationMode}:${scope.format}`)).toEqual([
        "single:4:5", "creative_revision:9:16", "single:9:16", "carousel:4:5",
      ]);
    });

    it("distinguishes refinement scopes without the snapshot rejecting them", () => {
      expect(calibrationGuidanceSnapshotSchema.safeParse(refinementSnapshot()).success).toBe(true);
      expect(hasCalibrationVisualScope(refinementSnapshot(), { generationMode: "format_adaptation", format: "9:16" })).toBe(true);
      expect(hasCalibrationVisualScope(refinementSnapshot(), { generationMode: "format_adaptation", format: "4:5" })).toBe(false);
    });

    it("resolves only art direction for a captured refinement context", async () => {
      const base = content();
      const direction = base.visualGuidance.sets[1]!;
      base.visualGuidance.sets.push({ ...direction, generationMode: "creative_revision",
        fixedPromptVersion: getCreativeWorkPromptVersion("refinement") });
      const input = { workspaceId, clientProfileId, generationMode: "creative_revision", format: "4:5", calibrationCandidate: freezeCandidate(base) };
      const selection = await resolveSinglePieceGuidance(input, async () => ({ allowed: true }));
      expect(selection.roles.art_direction.lines.join("\n")).toContain("Use hierarquia clara.");
      expect(selection.roles.image_prompt).toMatchObject({ lines: [], setHash: null });
      expect(selection.roles.copy).toMatchObject({ lines: [], setHash: null });
      await expect(resolveSinglePieceGuidance({ ...input, format: "9:16" }, async () => ({ allowed: true })))
        .rejects.toThrow("calibration_guidance_context_changed");
    });
  });

  it("includes scope, role, fixed version, revisions and approved bytes in the validated hash", () => {
    const original = content();
    const hash = freezeCandidate(original).hash;
    expect(candidateSchema.safeParse(freezeCandidate(original)).success).toBe(true);
    for (const patch of [{ workspaceId: clientProfileId }, { clientProfileId: workspaceId }]) {
      expect(freezeCandidate({ ...original, visualGuidance: { ...original.visualGuidance, ...patch } }).hash).not.toBe(hash);
    }
    for (const patch of [{ role: "image_prompt" as const }, { format: "9:16" }, { generationMode: "carousel" }, { language: "en" as const }, { fixedPromptVersion: "fixed/v2" }, { setHash: "a".repeat(64) }, { revisions: [] }]) {
      const changed = content();
      Object.assign(changed.visualGuidance.sets[1]!, patch);
      expect(freezeCandidate(changed).hash).not.toBe(hash);
    }
    const appended = freezeCandidate(original);
    appended.visualGuidance!.sets[1]!.fixedPromptVersion = "appended-after-validation";
    expect(candidateSchema.safeParse(appended).success).toBe(false);
  });

  it("rejects invalid sets and unknown versions instead of attaching unvalidated content", () => {
    for (const patch of [{ fixedPromptVersion: "unknown" }, { setHash: "a".repeat(64) }, { revisions: [] }]) {
      const changed = content();
      Object.assign(changed.visualGuidance.sets[1]!, patch);
      expect(calibrationGuidanceSnapshotSchema.safeParse(changed.visualGuidance).success).toBe(false);
    }
  });

  it("publishes a detached v3 snapshot without changing the validated candidate hash", () => {
    const candidate = freezeCandidate(content());
    const published = compileBrandKnowledgeVersionV2({ candidate, calibration: { sessionId: workspaceId, round: 1 } });
    expect(published.hash).toBe(candidate.hash);
    expect(published.snapshot).toMatchObject({ schemaVersion: 3, visualGuidance: candidate.visualGuidance });
    candidate.visualGuidance!.sets[1]!.fixedPromptVersion = "later";
    expect(published.snapshot.schemaVersion === 3 && published.snapshot.visualGuidance.sets[1]!.fixedPromptVersion).toBe(getCreativeWorkPromptVersion("composer"));
  });

  it("honors a local-learning refusal even for a frozen calibration candidate", async () => {
    const selection = await resolveSinglePieceGuidance({ workspaceId, clientProfileId, generationMode: "single", format: "4:5", calibrationCandidate: freezeCandidate(content()) },
      async () => ({ allowed: false, reason: "local_learning_denied" }));
    expect(selection.roles.image_prompt).toMatchObject({ lines: [], appliedRefs: [], setHash: null, omissionReason: "local_learning_denied" });
  });

  it("refuses a calibration example under a changed prompt version or outside the captured scope", async () => {
    const candidate = freezeCandidate(content());
    const input = { workspaceId, clientProfileId, generationMode: "single", format: "4:5", calibrationCandidate: candidate };
    expect((await resolveSinglePieceGuidance(input, async () => ({ allowed: true }))).roles.image_prompt.lines.join("\n")).toContain("Use hierarquia clara.");
    await expect(resolveSinglePieceGuidance({ ...input, format: "9:16" }, async () => ({ allowed: true }))).rejects.toThrow("calibration_guidance_context_changed");
    candidate.visualGuidance!.sets[2]!.fixedPromptVersion = "previous/v1";
    await expect(resolveSinglePieceGuidance(input, async () => ({ allowed: true }))).rejects.toThrow("calibration_guidance_context_changed");
  });
});
