import { describe, expect, it } from "vitest";
import { hashGuidanceContent, renderLearnedGuidance } from "../brand-taste/learned-guidance";
import type { LocalLearningPromptContext } from "../brand-taste/prompt-calibration-loader";
import type { FrozenSinglePieceGuidance } from "../brand-taste/single-piece-guidance";
import { resolveArtDirectionGuidance, appendArtDirectionGuidance } from "./art-direction-guidance";

const fixed = "fixed/v3";
const text = "Reserve um foco dominante e respiro entre os grupos.";
const fragment = { ...renderLearnedGuidance({ role: "art_direction", language: "pt-BR", revisions: [{ ruleId: "visual", revision: 3, contentHash: hashGuidanceContent(text), text, category: "hierarchy", roles: ["art_direction"] }] }), omissions: [] };
const empty = { lines: [], appliedRefs: [], setHash: null, omissions: [] };
const snapshot = (art: LocalLearningPromptContext = fragment): FrozenSinglePieceGuidance => ({ version: 1, generationMode: "single", format: "4:5", fixedPromptVersion: fixed, roles: { copy: { ...fragment, lines: ["COPY_SENTINEL"] }, art_direction: art, image_prompt: { ...fragment, lines: ["IMAGE_SENTINEL"] } } });

describe("frozen art-direction production guidance", () => {
  it("delivers only the selected role and keeps the exact applied identity without modifying the snapshot", () => {
    const frozen = snapshot(), before = JSON.stringify(frozen);
    const result = resolveArtDirectionGuidance(frozen, fixed);
    expect(result.section).toBe(fragment.lines.join("\n"));
    expect(result.identity).toMatchObject({ situation: "applied", appliedRefs: fragment.appliedRefs, setHash: fragment.setHash });
    expect(appendArtDirectionGuidance("Preserve os fatos.", result)).toBe(`Preserve os fatos.\n\n${fragment.lines.join("\n")}`);
    expect(result.section).not.toMatch(/COPY_SENTINEL|IMAGE_SENTINEL/);
    expect(JSON.stringify(frozen)).toBe(before);
  });

  it("omits unproved visual guidance with its reason and preserves the baseline production bytes", () => {
    const omissions = [{ ruleId: "visual", reason: "visual_proof_missing" as const }];
    const result = resolveArtDirectionGuidance(snapshot({ ...empty, omissions }), fixed);
    expect(result.identity).toMatchObject({ situation: "omitted", appliedRefs: [], setHash: null, omissions });
    expect(appendArtDirectionGuidance("BASELINE\n", result)).toBe("BASELINE\n");
  });

  it("distinguishes a known empty set from missing historical trace", () => {
    expect(resolveArtDirectionGuidance(snapshot(empty), fixed).identity.situation).toBe("no_guidance");
    expect(resolveArtDirectionGuidance(null, fixed).identity).toMatchObject({ situation: "unknown", appliedRefs: [], setHash: null });
  });

  it("omits a selection prepared for another format or production mode", () => {
    for (const scope of [{ format: "9:16", generationMode: "single" }, { format: "4:5", generationMode: "creative_revision" }]) {
      const result = resolveArtDirectionGuidance(snapshot(), fixed, scope);
      expect(result.section).toBe("");
      expect(result.identity).toMatchObject({ situation: "omitted", omissionReason: "scope_mismatch", appliedRefs: [], setHash: null });
    }
  });

  it("never uses a frozen visual proof with another effective fixed prompt version", () => {
    const result = resolveArtDirectionGuidance(snapshot(), "fixed/v4");
    expect(result.section).toBe("");
    expect(result.identity).toMatchObject({ situation: "omitted", omissionReason: "fixed_prompt_version_mismatch", appliedRefs: [], setHash: null });
  });
});
