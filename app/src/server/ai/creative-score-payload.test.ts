import { describe, expect, it } from "vitest";

import { buildCreativeScoreImageDataUrl } from "./creative-score";

describe("creative score image payload", () => {
  it("keeps the provider payload as one data URL representation", () => {
    const payload = buildCreativeScoreImageDataUrl({
      imageBuffer: Buffer.from("image-bytes"),
      mimeType: "image/png",
    });

    expect(payload).toBe(`data:image/png;base64,${Buffer.from("image-bytes").toString("base64")}`);
    expect(payload).not.toContain("undefined");
  });
});
