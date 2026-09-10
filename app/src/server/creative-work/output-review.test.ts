import { describe, expect, it } from "vitest";
import {
  outputReviewInputSchema,
  compileOutputReview,
  parsePersistedOutputReviewDraft,
  parsePersistedOutputRevisionContext,
} from "./output-review";

describe("output review", () => {
  it("compiles location and instruction without replacing user text", () => {
    const input = outputReviewInputSchema.parse({
      action: "format",
      targetFormat: "9:16",
      instruction: "Preserve a pessoa.",
      revisionAssetId: null,
      annotations: [
        {
          id: "00000000-0000-4000-8000-000000000001",
          x: 0.25,
          y: 0.8,
          text: "Aumente o CTA",
        },
      ],
    });
    const text = compileOutputReview(input);
    expect(text).toContain("Preserve a pessoa.");
    expect(text).toContain("x=25%, y=80%");
    expect(text).toContain("Aumente o CTA");
    expect(text).toContain("9:16");
    expect(text.length).toBeLessThanOrEqual(2000);
    expect(
      outputReviewInputSchema.safeParse({ ...input, targetFormat: "16:9" })
        .success,
    ).toBe(false);
    expect(
      outputReviewInputSchema.safeParse({
        ...input,
        annotations: [{ ...input.annotations[0], x: 1.1 }],
      }).success,
    ).toBe(false);
    expect(compileOutputReview({ ...input, instruction: "" })).toContain(
      "Aumente o CTA",
    );
  });

  it("keeps historic null while rejecting invalid persisted drafts", () => {
    expect(parsePersistedOutputReviewDraft(null)).toBeNull();
    expect(parsePersistedOutputReviewDraft(undefined)).toBeNull();
    const valid = {
      version: 1,
      revision: 2,
      revisionKey: "00000000-0000-4000-8000-000000000001",
      action: "refine",
      targetFormat: "4:5",
      instruction: "Ajuste",
      annotations: [],
      revisionAssetId: null,
    };
    expect(parsePersistedOutputReviewDraft(valid)).toEqual(valid);
    // Extra private keys never validate through the strict schema.
    expect(
      parsePersistedOutputReviewDraft({ ...valid, storageKey: "private/x.png" }),
    ).toBeNull();
    expect(
      parsePersistedOutputReviewDraft({ ...valid, version: 2 }),
    ).toBeNull();
    expect(
      parsePersistedOutputReviewDraft({ ...valid, revision: 0 }),
    ).toBeNull();
  });

  it("rejects invalid persisted revision contexts without throwing", () => {
    expect(parsePersistedOutputRevisionContext(null)).toBeNull();
    const valid = {
      version: 1,
      reviewRevision: 2,
      sourceOutputId: "00000000-0000-4000-8000-000000000002",
      sourceOutputVersion: 1,
      action: "format",
      targetFormat: "9:16",
      instruction: "Preserve.",
      annotations: [],
      revisionAssetId: null,
    };
    expect(parsePersistedOutputRevisionContext(valid)).toEqual(valid);
    expect(
      parsePersistedOutputRevisionContext({ ...valid, outputKey: "private/x.png" }),
    ).toBeNull();
    expect(
      parsePersistedOutputRevisionContext({ ...valid, reviewRevision: -1 }),
    ).toBeNull();
  });
});
