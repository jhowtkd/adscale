import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";
import { z } from "zod";

import { measureImageBuffer } from "@/server/brand-training/measure-image";
import { E2EControlledImageProvider } from "@/server/ai/providers/e2e-controlled-provider";
import type { ImageGenerationProvider } from "@/server/ai/providers/image-provider";
import {
  buildBrandConsistencyEvidence,
  formatBrandConsistencyEvidence,
  type BrandConsistencyEvidence,
} from "@/server/creative-work/brand-consistency-evidence";
import { canonicalJsonStringify } from "@/server/creative-work/canonical-json";
import {
  socialPostBriefSchema,
  socialPostCopySchema,
  type CreativeWorkIdentitySnapshot,
  type CreativeWorkInputSnapshot,
} from "@/server/creative-work/contracts";
import { buildSocialPostPrompt } from "@/server/creative-work/prompt";
import { selectReferences } from "@/server/creative-work/reference-selection";
import {
  productionPilotBaselineSchema,
  productionPilotRequestBaselineSchema,
} from "@/server/human-quality/production-pilot-baseline";

const REPLAY_VERSION = "brand-consistency-replay-v1";
const DIMENSIONS = {
  "1:1": { width: 1080, height: 1080 },
  "4:5": { width: 1080, height: 1350 },
  "9:16": { width: 1080, height: 1920 },
} as const;

const replayRequestSchema = productionPilotRequestBaselineSchema.extend({
  format: z.enum(["1:1", "4:5", "9:16"]),
  replay: z.object({
    brief: socialPostBriefSchema,
    copy: socialPostCopySchema,
    brandKit: z
      .object({
        colors: z.array(z.string()).default([]),
        fonts: z.array(z.string()).default([]),
        toneOfVoice: z.string().nullable().default(null),
        prohibitedElements: z.string().nullable().default(null),
        requiredElements: z.string().nullable().default(null),
      })
      .optional(),
  }),
});

const replayManifestSchema = productionPilotBaselineSchema.extend({
  requests: z.array(replayRequestSchema).min(1),
});

function stableHash(value: unknown): string {
  return createHash("sha256").update(canonicalJsonStringify(value)).digest("hex");
}

function identitySnapshotFor(
  request: z.infer<typeof replayRequestSchema>,
): CreativeWorkIdentitySnapshot {
  const selection = selectReferences({
    candidates: request.selectedReferences.map((reference) => ({
      referenceId: reference.referenceId,
      usageMode: "reference" as const,
      analysis: null,
      briefOverlap: 0,
    })),
    format: request.format,
    objective: request.replay.brief.objective,
    limit: 4,
  });
  const brandKit = request.replay.brandKit ?? {
    colors: [],
    fonts: [],
    toneOfVoice: null,
    prohibitedElements: null,
    requiredElements: null,
  };

  return {
    clientProfileId: "brand-consistency-fixture",
    confirmedAt: request.capturedAt,
    assets: selection.selected.map((reference) => ({
      referenceId: reference.referenceId,
      assetKey: `fixture:${reference.referenceId}`,
      label: reference.referenceId,
      category: "visual_reference",
      usageMode: "reference",
      analysis: null,
      mimeType: "image/png",
      hasAlpha: false,
      placement: null,
    })),
    referenceSelection: {
      strategy: "ranked",
      format: request.format,
      operatorSelectedReferenceIds: [],
      reasons: Object.fromEntries(
        selection.selected.map((reference) => [reference.referenceId, reference.reasons]),
      ),
    },
    brandKit,
  };
}

async function executeReplay(
  manifest: z.infer<typeof replayManifestSchema>,
  provider: ImageGenerationProvider,
) {
  const requests: Array<Record<string, unknown>> = [];

  for (const request of manifest.requests) {
    const identitySnapshot = identitySnapshotFor(request);
    const inputSnapshot: CreativeWorkInputSnapshot = {
      request: request.requestText,
      settings: { targetFormats: [request.format] },
      sources: [],
    };
    const prompt = buildSocialPostPrompt({
      format: request.format,
      copy: request.replay.copy,
      brief: request.replay.brief,
      inputSnapshot,
      identitySnapshot,
      creativeLevel: "balanced",
    });
    const dimensions = DIMENSIONS[request.format];
    const selectedReferences = identitySnapshot.assets.map((asset) => ({
      referenceId: asset.referenceId,
      reason:
        identitySnapshot.referenceSelection?.reasons[asset.referenceId]?.join("; ") ??
        "ranked selection",
    }));
    const candidate = await provider.generate({
      prompt,
      dimensions,
      referenceImages: identitySnapshot.assets.map((asset) => ({
        buffer: Buffer.from(asset.referenceId, "utf8"),
        mimeType: asset.mimeType,
        name: asset.label,
      })),
      generationMode: "art_variation",
      outputPrefix: `brand-consistency/${manifest.pilotId}/${request.requestId}`,
      quality: "high",
    });
    const artifact = await sharp(candidate.buffer)
      .resize(dimensions.width, dimensions.height, { fit: "cover", position: "attention" })
      .png()
      .toBuffer();
    const measurement = await measureImageBuffer(artifact, {
      colorTargets: identitySnapshot.brandKit.colors.map((hex) => ({ hex })),
      now: () => new Date(request.capturedAt),
    });
    const artifactHash = createHash("sha256").update(artifact).digest("hex");
    const frozenSnapshot = { inputSnapshot, identitySnapshot, prompt };

    requests.push({
      ...request,
      replay: undefined,
      effectivePrompt: prompt,
      effectiveSpecSummary: `snapshot=${REPLAY_VERSION}`,
      selectedReferences,
      snapshot: {
        available: true,
        version: REPLAY_VERSION,
        hash: stableHash(frozenSnapshot),
      },
      observedHardFailures:
        measurement.width === dimensions.width && measurement.height === dimensions.height
          ? []
          : ["other"],
      artifactRef: `sha256:${artifactHash}`,
      artifact: {
        sha256: artifactHash,
        mimeType: "image/png",
        byteLength: artifact.byteLength,
        width: measurement.width,
        height: measurement.height,
        measurement: {
          aspectRatio: measurement.aspectRatio,
          meanLuminance: measurement.meanLuminance,
          hasRealTransparency: measurement.hasRealTransparency,
          transparentAreaPercent: measurement.transparentAreaPercent,
          colorCoverage: measurement.colorCoverage,
          contentBoundingBox: measurement.contentBoundingBox,
          margins: measurement.margins,
          regions: measurement.regions,
        },
      },
    });
  }

  return { ...manifest, requests };
}

export function defaultEvidencePath(manifestPath: string): string {
  const extension = path.extname(manifestPath);
  const stem = extension ? manifestPath.slice(0, -extension.length) : manifestPath;
  return `${stem}.evidence.json`;
}

export async function runBrandConsistencyValidation(input: {
  manifestPath: string;
  outputPath?: string;
  capturedAt?: string;
  provider?: ImageGenerationProvider;
}): Promise<{ report: BrandConsistencyEvidence; outputPath: string }> {
  const startedAt = performance.now();
  const manifest = replayManifestSchema.parse(
    JSON.parse(readFileSync(input.manifestPath, "utf8")) as unknown,
  );
  const replay = await executeReplay(
    manifest,
    input.provider ?? E2EControlledImageProvider.forLocalRuntime(),
  );
  const report = buildBrandConsistencyEvidence(replay, input.capturedAt, {
    provider: "e2e-controlled-replay",
    providerCalls: manifest.requests.length,
    durationMs: performance.now() - startedAt,
    rssBytes: process.memoryUsage().rss,
  });
  const outputPath = input.outputPath ?? defaultEvidencePath(input.manifestPath);
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return { report, outputPath };
}

function usage(): string {
  return "Usage: npm run validate:brand-consistency -- --manifest PATH [--out PATH]";
}

function parseArgs(argv: string[]): { manifestPath: string; outputPath?: string } {
  let manifestPath = "";
  let outputPath: string | undefined;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--manifest") manifestPath = argv[++index] ?? "";
    else if (arg === "--out") outputPath = argv[++index];
    else if (arg === "--help" || arg === "-h") throw new Error(usage());
    else throw new Error(`Unknown argument: ${arg}\n${usage()}`);
  }
  if (!manifestPath) throw new Error(`--manifest is required\n${usage()}`);
  return { manifestPath: path.resolve(manifestPath), outputPath: outputPath && path.resolve(outputPath) };
}

export async function main(argv = process.argv.slice(2)): Promise<number> {
  try {
    const result = await runBrandConsistencyValidation(parseArgs(argv));
    console.log(formatBrandConsistencyEvidence(result.report));
    console.log(`Structured evidence: ${result.outputPath}`);
    return result.report.status === "fail" ? 1 : 0;
  } catch (error) {
    console.error(`BRAND-CONSISTENCY: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void main().then((code) => {
    process.exitCode = code;
  });
}
