import { describe, expect, it } from "vitest";
import {
  createE2EControlledScore,
  E2EControlledImageProvider,
  isE2EControlledProviderEnabled,
} from "./e2e-controlled-provider";

describe("E2E controlled provider", () => {
  it("requires the explicit flag and only permits production on local E2E", () => {
    expect(
      isE2EControlledProviderEnabled({
        NODE_ENV: "development",
        E2E_CONTROLLED_PROVIDER: "true",
      })
    ).toBe(true);
    expect(
      isE2EControlledProviderEnabled({
        NODE_ENV: "production",
        E2E_CONTROLLED_PROVIDER: "true",
      })
    ).toBe(false);
    expect(
      isE2EControlledProviderEnabled({
        NODE_ENV: "production",
        E2E_CONTROLLED_PROVIDER: "true",
        E2E_DISABLE_RATE_LIMIT: "true",
        APP_URL: "http://localhost:3000",
      })
    ).toBe(true);
    expect(
      isE2EControlledProviderEnabled({
        NODE_ENV: "production",
        E2E_CONTROLLED_PROVIDER: "true",
        E2E_DISABLE_RATE_LIMIT: "true",
        APP_URL: "https://app.example.com",
      })
    ).toBe(false);
    expect(isE2EControlledProviderEnabled({ NODE_ENV: "development" })).toBe(
      false
    );
  });

  it("returns a deterministic valid image candidate", async () => {
    const candidate = await new E2EControlledImageProvider().generate({
      prompt: "UAT",
      dimensions: { width: 1024, height: 1024 },
      referenceImages: [],
      generationMode: "art_variation",
      outputPrefix: "uat/work/output",
    });

    expect(candidate.buffer.subarray(1, 4).toString()).toBe("PNG");
    expect(candidate.providerMeta.model).toBe("e2e-controlled-image");
    expect(candidate.providerMeta.rawRequestId).toBe("e2e:uat/work/output");
  });

  it("returns an acceptable deterministic creative score", () => {
    const score = createE2EControlledScore();

    expect(score.scoreStatus).toBe("analyzed");
    expect(score.qualityScore).toBeGreaterThanOrEqual(60);
    expect(score.scoreIssues).toEqual([]);
  });
});
