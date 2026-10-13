import { describe, expect, it } from "vitest";
import { snapshotGenerationIdentity, readGenerationIdentity } from "./generation-identity";
import { buildOutputDecisionSnapshot, sanitizeOutputDecisionSnapshot } from "./output-decision-events";

const ref = { ruleId: "11111111-1111-4111-8111-111111111111", revision: "legacy" as const, contentHash: "a".repeat(64) };
const application = { role: "art_direction", appliedRefs: [ref], setHash: "b".repeat(64), fixedPromptVersion: "creative-work-prompts/v2+" + "c".repeat(64) };
describe("generation identity copied into a decision", () => {
  it("keeps the applied references and frozen version, never text, URLs or provider payload", () => {
    const identity = snapshotGenerationIdentity([{ ...application, callId: "call", executionId: "output", prompt: "PRIVATE", lines: ["PRIVATE"], generationLog: { rawResponse: "PRIVATE" }, signedUrl: "https://private.test", appliedRefs: [{ ...ref, text: "PRIVATE" }] }]);
    expect(identity).toEqual({ state: "recorded", applications: [application] });
    const snapshot = buildOutputDecisionSnapshot({}, { generationIdentity: identity });
    expect(snapshot.generationIdentity).toEqual(identity);
    expect(JSON.stringify(snapshot)).not.toMatch(/PRIVATE|https:|callId|executionId|generationLog/);
    const dirty = { ...identity, text: "PRIVATE", applications: [{ ...application, prompt: "PRIVATE" }] };
    expect(sanitizeOutputDecisionSnapshot({ generationIdentity: dirty }).generationIdentity).toEqual(identity);
    expect(sanitizeOutputDecisionSnapshot({ generationIdentity: dirty }).evidenceSanitized).toBe(true);
  });
  it("distinguishes absent records, recorded empty guidance and legacy unknown fixed versions", () => {
    for (const input of [undefined, null, [], {}, "https://private.test"]) expect(snapshotGenerationIdentity(input)).toEqual({ state: "unknown", applications: [] });
    const legacy = { ...application, role: "legacy_derivation", appliedRefs: [], setHash: null, fixedPromptVersion: "unknown" };
    expect(snapshotGenerationIdentity([legacy])).toEqual({ state: "recorded", applications: [legacy] });
    for (const invalid of [Array.from({ length: 101 }, () => application), [{ ...application, appliedRefs: Array.from({ length: 6 }, () => ref) }], [{ ...application, fixedPromptVersion: "v".repeat(161) }]]) {
      expect(snapshotGenerationIdentity(invalid)).toEqual({ state: "unknown", applications: [] });
    }
    expect(readGenerationIdentity(undefined)).toEqual({ state: "unknown", applications: [] });
    for (const change of [{ role: "reviewer" }, { fixedPromptVersion: "https://private.test" }, { appliedRefs: [{ ...ref, ruleId: "https://private.test" }] }, { setHash: "PRIVATE" }]) {
      expect(snapshotGenerationIdentity([{ ...application, ...change }])).toEqual({ state: "unknown", applications: [] });
    }
  });
});
