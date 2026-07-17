import { describe, expect, it, vi } from "vitest";
import {
  createE2EControlledScore,
  E2EControlledImageProvider,
  isE2EControlledProviderEnabled,
} from "./e2e-controlled-provider";
import { analyzeImageContent, analyzeImageStyle } from "../image-analysis";

describe("E2E controlled provider", () => {
  it("requires the explicit flag and a loopback APP_URL in every environment", () => {
    expect(
      isE2EControlledProviderEnabled({
        NODE_ENV: "development",
        E2E_CONTROLLED_PROVIDER: "true",
        APP_URL: "http://localhost:3000",
      })
    ).toBe(true);
    expect(
      isE2EControlledProviderEnabled({
        NODE_ENV: "development",
        E2E_CONTROLLED_PROVIDER: "true",
        APP_URL: "https://preview.example.com",
      })
    ).toBe(false);
    expect(
      isE2EControlledProviderEnabled({
        NODE_ENV: "production",
        E2E_CONTROLLED_PROVIDER: "true",
      })
    ).toBe(false);
    expect(
      isE2EControlledProviderEnabled({
        NODE_ENV: "development",
        E2E_CONTROLLED_PROVIDER: "true",
        APP_URL: "http://[::1]:3000",
      })
    ).toBe(true);
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
    const candidate = await E2EControlledImageProvider.forUnitTests().generate({
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

  it("rejects the dedicated unit fixture outside NODE_ENV=test", () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";
    try {
      expect(() => E2EControlledImageProvider.forUnitTests()).toThrow("test-only");
    } finally {
      process.env.NODE_ENV = previous;
    }
  });

  it("fails only the bold controlled candidate once so the real job retry can recover", async () => {
    const provider = E2EControlledImageProvider.forUnitTests();
    const input = {
      prompt: "REQUEST: [e2e:retry-once-bold]\nCREATIVE LEVEL: bold",
      dimensions: { width: 1024, height: 1024 },
      referenceImages: [],
      generationMode: "art_variation" as const,
      outputPrefix: `uat/retry-once/${crypto.randomUUID()}`,
    };

    await expect(provider.generate(input)).rejects.toMatchObject({
      retryable: true,
    });
    await expect(provider.generate(input)).resolves.toMatchObject({
      providerMeta: { model: "e2e-controlled-image" },
    });
  });

  it("can fail bold twice so the second retryable failure reaches manual recovery", async () => {
    const provider = E2EControlledImageProvider.forUnitTests();
    const input = {
      prompt: "REQUEST: [e2e:retry-twice-bold]\nCREATIVE LEVEL: bold",
      dimensions: { width: 1024, height: 1024 },
      referenceImages: [],
      generationMode: "art_variation" as const,
      outputPrefix: `uat/retry-twice/${crypto.randomUUID()}`,
    };

    await expect(provider.generate(input)).rejects.toMatchObject({ retryable: true });
    await expect(provider.generate(input)).rejects.toMatchObject({ retryable: true });
    await expect(provider.generate(input)).resolves.toMatchObject({ mimeType: "image/png" });
  });

  it("holds the second attempt open for the polling UI's partial state", async () => {
    vi.useFakeTimers();
    try {
      const provider = E2EControlledImageProvider.forUnitTests(3_500);
      const input = {
        prompt: "REQUEST: [e2e:retry-once-bold]\nCREATIVE LEVEL: bold",
        dimensions: { width: 1024, height: 1024 },
        referenceImages: [],
        generationMode: "art_variation" as const,
        outputPrefix: `uat/retry-delay/${crypto.randomUUID()}`,
      };

      await expect(provider.generate(input)).rejects.toMatchObject({ retryable: true });
      const retry = provider.generate(input);
      let settled = false;
      void retry.finally(() => { settled = true; });
      await Promise.resolve();
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(3_500);
      await expect(retry).resolves.toMatchObject({ mimeType: "image/png" });
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns an acceptable deterministic creative score", () => {
    const score = createE2EControlledScore();

    expect(score.scoreStatus).toBe("analyzed");
    expect(score.qualityScore).toBeGreaterThanOrEqual(60);
    expect(score.scoreIssues).toEqual([]);
  });

  it("keeps attached-art analysis deterministic under the controlled provider", async () => {
    process.env.E2E_CONTROLLED_PROVIDER = "true";
    process.env.APP_URL = "http://localhost:3000";
    try {
      await expect(analyzeImageContent(Buffer.from("fixture"), "image/png"))
        .resolves.toMatchObject({ product: "Produto da arte", offer: "Oferta da arte" });
      await expect(analyzeImageStyle(Buffer.from("fixture"), "image/png"))
        .resolves.toMatchObject({ mood: "direto e vibrante" });
    } finally {
      delete process.env.E2E_CONTROLLED_PROVIDER;
      delete process.env.APP_URL;
    }
  });
});
