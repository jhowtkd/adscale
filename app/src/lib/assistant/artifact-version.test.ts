import { describe, expect, it } from "vitest";
import {
  artifactProposalPayloadSchema,
  artifactVersionProvenanceSchema,
  artifactVersionSnapshotSchema,
} from "./artifact-version";

const id = "00000000-0000-4000-8000-000000000001";

describe("artifact version contracts", () => {
  it("accepts the allowlisted plan snapshot", () => {
    expect(
      artifactVersionSnapshotSchema.parse({
        type: "plan",
        strategy: "Lead with proof",
        angles: ["Authority"],
        hooks: ["Stop guessing"],
        ctas: ["Book now"],
        constraints: "No unsupported claims",
      })
    ).toMatchObject({ type: "plan", angles: ["Authority"] });
  });

  it.each(["reasoning", "thinking", "signedUrl", "rawArgs", "prompt", "inputPrompt"])(
    "rejects denied or unallowlisted snapshot key %s",
    (key) => {
      expect(() =>
        artifactVersionSnapshotSchema.parse({
          type: "plan",
          strategy: null,
          angles: [],
          hooks: [],
          ctas: [],
          constraints: null,
          [key]: "secret",
        })
      ).toThrow();
    }
  );

  it("accepts only stable creative metadata", () => {
    const parsed = artifactVersionSnapshotSchema.parse({
      type: "creative",
      derivationId: id,
      outputKey: "outputs/final.png",
      format: "4:5",
      generationMode: "art_variation",
      ctaText: "Saiba mais",
      planVersionId: null,
    });
    expect(parsed).toMatchObject({ type: "creative", format: "4:5" });
  });

  it("rejects unknown provenance fields", () => {
    expect(() =>
      artifactVersionProvenanceSchema.parse({
        origin: "legacy_import",
        originalArtifactId: id,
        sourceVersionId: null,
        messageId: null,
        actionId: null,
        planVersionId: null,
        format: null,
        generationMode: null,
        providerPayload: { raw: true },
      })
    ).toThrow();
  });

  it("accepts only allowlisted proposal payloads", () => {
    expect(
      artifactProposalPayloadSchema.parse({
        type: "creative_revision",
        schemaVersion: 1,
        summary: "Increase product prominence",
        intendedChanges: ["Larger product crop"],
        format: "4:5",
        referenceIds: [],
        creditImpact: 1,
        writes: ["new derivation"],
        planVersionId: id,
      })
    ).toMatchObject({ type: "creative_revision", creditImpact: 1 });

    expect(() =>
      artifactProposalPayloadSchema.parse({
        type: "creative_revision",
        schemaVersion: 1,
        summary: "Unsafe",
        intendedChanges: [],
        format: null,
        referenceIds: [],
        creditImpact: 1,
        writes: [],
        inputPrompt: "hidden",
      })
    ).toThrow();
  });
});
