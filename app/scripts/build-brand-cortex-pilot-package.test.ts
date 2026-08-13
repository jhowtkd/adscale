import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { hashBrandCortexEvidence } from "@/server/creative-work/brand-cortex-release";
import { normalizeCreativeWorkReferenceImage } from "@/server/creative-work/reference-normalize";
import { buildBrandCortexPilotPackage } from "./build-brand-cortex-pilot-package";

describe("build Brand Cortex pilot package", () => {
  it("copies a proven real output and writes a hash-bound review package", async () => {
    const outDir = join(mkdtempSync(join(tmpdir(), "brand-cortex-package-")), "pilot");
    const artifact = await sharp({
      create: { width: 1080, height: 1080, channels: 3, background: "#0B1F33" },
    }).png().toBuffer();
    const artifactSha256 = createHash("sha256").update(artifact).digest("hex");
    const normalizedReference = await normalizeCreativeWorkReferenceImage({ buffer: artifact, mimeType: "image/png" });
    const referenceSha256 = createHash("sha256").update(normalizedReference.buffer).digest("hex");
    const prompt = "Gere uma peça coerente com a marca.";
    const directionSnapshot = { label: "Editorial", instruction: "Use grid editorial", order: 0, safetyBand: "safe" as const };
    const aggregate = {
      work: {
        id: "work-1",
        workspaceId: "workspace-1",
        clientProfileId: "profile-1",
        createdByUserId: "operator-1",
        toolKind: "single",
        status: "completed",
        brief: { theme: "Marca", objective: "Reconhecimento", audience: "Público", offer: null },
        copy: { headline: "Conheça", body: "Uma marca consistente.", cta: "Saiba mais" },
        inputSnapshot: { generationPolicyVersion: "quality_recovery_v1", request: "Marca", settings: {}, sources: [] },
        identitySnapshot: {
          clientProfileId: "profile-1",
          confirmedAt: "2026-08-13T12:00:00.000Z",
          assets: [{
            referenceId: "reference-1",
            assetKey: "brand/reference.png",
            label: "Referência principal",
            category: "visual_reference",
            usageMode: "reference",
            mimeType: "image/png",
            hasAlpha: false,
            placement: null,
            analysis: { description: "", visualAttributes: [], rules: [], constraints: [], confidence: 1 },
          }],
          brandKit: { colors: ["#0B1F33"], fonts: ["Brand Sans"], toneOfVoice: "Direto", prohibitedElements: "Gradientes", requiredElements: "Logo" },
          brandKnowledge: {
            mode: "published",
            versionId: "version-1",
            versionNumber: 1,
            versionHash: "b".repeat(64),
            compiledAt: "2026-08-13T11:00:00.000Z",
            claims: [],
          },
        },
      },
      outputs: [{
        id: "output-1",
        status: "completed",
        targetFormat: "1:1",
        outputKey: "creative-work/output-1/final.png",
        cost: 5,
        quality: {
          generation: {
            version: 1,
            prompt,
            promptSha256: createHash("sha256").update(prompt).digest("hex"),
            imageOperation: "edit",
            providerCalls: 1,
            providerRetries: 0,
            references: [{
              position: 1,
              role: "brand_identity",
              required: false,
              assetKey: "brand/reference.png",
              label: "Referência principal",
              sourceMimeType: "image/png",
              mimeType: normalizedReference.mimeType,
              sha256: referenceSha256,
            }],
            directionSnapshot,
            directionSnapshotSha256: hashBrandCortexEvidence(directionSnapshot),
            winner: { provider: "openai", model: "gpt-image-2-2026-04-21", durationMs: 2_500, rawRequestId: "req-1" },
          },
          brandFidelity: {
            deterministic: { overall: "proven", artifactSha256 },
            residual: { status: "clear" },
          },
        },
        directionSnapshot,
      }],
      sources: [],
    };

    const result = await buildBrandCortexPilotPackage({
      workspaceId: "workspace-1",
      pilotId: "pilot-1",
      createdByUserId: "operator-1",
      selections: [{ workItemId: "work-1", outputId: "output-1" }],
      outDir,
      capturedAt: "2026-08-13T13:00:00.000Z",
    }, {
      getWork: async () => aggregate,
      getObject: async () => artifact,
    });

    expect(result.manifest.artifacts[0]).toMatchObject({
      artifactSha256,
      artifactPath: "artifacts/1x1-output-1.png",
      provider: { requestId: "req-1", inputs: [expect.objectContaining({ sha256: referenceSha256 })] },
      directionSnapshot,
      identity: { referenceAssetKeys: ["brand/reference.png"] },
    });
    expect(readFileSync(join(outDir, "artifacts/1x1-output-1.png"))).toEqual(artifact);
    expect(JSON.parse(readFileSync(join(outDir, "review.template.json"), "utf8"))).toMatchObject({
      pilotSha256: result.manifestSha256,
    });
    expect(readFileSync(join(outDir, "index.html"), "utf8")).toContain("artifacts/1x1-output-1.png");
  });

  it("rejects controlled provider evidence before writing a releasable package", async () => {
    const outDir = join(mkdtempSync(join(tmpdir(), "brand-cortex-package-")), "pilot");
    const artifact = await sharp({ create: { width: 1080, height: 1080, channels: 3, background: "#000" } }).png().toBuffer();
    const artifactSha256 = createHash("sha256").update(artifact).digest("hex");
    const prompt = "Gere uma peça coerente com a marca.";
    const aggregate = {
      work: {
        id: "work-1", workspaceId: "workspace-1", clientProfileId: "profile-1", createdByUserId: "operator-1",
        toolKind: "single", status: "completed",
        brief: { theme: "Marca", objective: "Reconhecimento", audience: "Público", offer: null },
        copy: { headline: "Conheça", body: "Consistente.", cta: "Saiba mais" },
        inputSnapshot: { generationPolicyVersion: "quality_recovery_v1", request: "Marca", settings: {}, sources: [] },
        identitySnapshot: {
          clientProfileId: "profile-1", confirmedAt: "2026-08-13T12:00:00.000Z", assets: [],
          brandKit: { colors: [], fonts: [], toneOfVoice: null, prohibitedElements: null, requiredElements: null },
          brandKnowledge: { mode: "published", versionId: "version-1", versionNumber: 1, versionHash: "b".repeat(64), compiledAt: null, claims: [] },
        },
      },
      outputs: [{
        id: "output-1", status: "completed", targetFormat: "1:1", outputKey: "out.png", cost: 5,
        quality: {
          generation: { version: 1, prompt, promptSha256: createHash("sha256").update(prompt).digest("hex"), references: [], directionSnapshot: null, directionSnapshotSha256: null, winner: { provider: "openai", model: "e2e-controlled-image", durationMs: 0, rawRequestId: "e2e:req" } },
          brandFidelity: { deterministic: { overall: "proven", artifactSha256 }, residual: { status: "clear" } },
        },
      }],
      sources: [],
    };

    await expect(buildBrandCortexPilotPackage({
      workspaceId: "workspace-1", pilotId: "pilot-1", createdByUserId: "operator-1",
      selections: [{ workItemId: "work-1", outputId: "output-1" }], outDir,
    }, { getWork: async () => aggregate, getObject: async () => artifact }))
      .rejects.toThrow("GPT Image 2 provider evidence is required");
  });

  it("rejects legacy outputs whose provider inputs were not frozen", async () => {
    const outDir = join(mkdtempSync(join(tmpdir(), "brand-cortex-package-")), "pilot");
    const aggregate = {
      work: {
        id: "work-legacy", workspaceId: "workspace-1", clientProfileId: "profile-1", createdByUserId: "operator-1",
        toolKind: "single", status: "completed", inputSnapshot: { request: "legacy", settings: {}, sources: [] },
        brief: { theme: "Marca", objective: "Reconhecimento", audience: "Público", offer: null },
        copy: { headline: "Conheça", body: "Consistente.", cta: "Saiba mais" },
        identitySnapshot: {
          clientProfileId: "profile-1", confirmedAt: "2026-08-13T12:00:00.000Z", assets: [], brandKit: {},
          brandKnowledge: { mode: "published", versionId: "version-1", versionNumber: 1, versionHash: "b".repeat(64), claims: [] },
        },
      },
      outputs: [{ id: "output-legacy", status: "completed", targetFormat: "1:1", outputKey: "out.png", cost: 5 }],
      sources: [],
    };

    await expect(buildBrandCortexPilotPackage({
      workspaceId: "workspace-1", pilotId: "pilot-1", createdByUserId: "operator-1",
      selections: [{ workItemId: "work-legacy", outputId: "output-legacy" }], outDir,
    }, { getWork: async () => aggregate, getObject: async () => Buffer.from("unused") }))
      .rejects.toThrow("current Peça única");
  });
});
