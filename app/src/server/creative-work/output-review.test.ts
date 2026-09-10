import { describe, expect, it } from "vitest";
import { outputReviewInputSchema, compileOutputReview } from "./output-review";

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
});
