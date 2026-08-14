import { createHash } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

import { getTargetDimensions } from "@/lib/formats";
import {
  brandCortexPilotManifestSchema,
  createBrandCortexReviewTemplate,
  hashBrandCortexEvidence,
  renderBrandCortexReviewHtml,
  type BrandCortexPilotManifest,
} from "@/server/creative-work/brand-cortex-release";
import { normalizeCreativeWorkReferenceImage } from "@/server/creative-work/reference-normalize";
import { getCreativeWork } from "@/server/repositories/creative-work";
import { objectStorage } from "@/server/storage";

type CreativeWorkAggregate = NonNullable<Awaited<ReturnType<typeof getCreativeWork>>>;

export type BrandCortexPilotPackageInput = {
  workspaceId: string;
  pilotId: string;
  createdByUserId: string;
  selections: Array<{ workItemId: string; outputId: string }>;
  outDir: string;
  paidGeneration?: boolean;
  capturedAt?: string;
};

type BrandCortexPilotPackageDependencies = {
  getWork: typeof getCreativeWork;
  getObject: (key: string) => Promise<Buffer>;
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function string(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function number(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

const hash = (buffer: Buffer) => createHash("sha256").update(buffer).digest("hex");

function assertSameIdentity(aggregates: CreativeWorkAggregate[]) {
  const first = aggregates[0]?.work;
  const knowledge = first?.identitySnapshot?.brandKnowledge;
  if (!first || first.toolKind !== "single" || first.inputSnapshot?.generationPolicyVersion !== "quality_recovery_v1" || !knowledge || knowledge.mode !== "published" || !knowledge.versionId || !knowledge.versionHash || !knowledge.versionNumber) {
    throw new Error("Every pilot work must be a current Peça única with published Brand Knowledge");
  }
  for (const aggregate of aggregates) {
    const current = aggregate.work.identitySnapshot?.brandKnowledge;
    if (
      aggregate.work.clientProfileId !== first.clientProfileId
      || aggregate.work.inputSnapshot?.generationPolicyVersion !== "quality_recovery_v1"
      || current?.versionId !== knowledge.versionId
      || current.versionHash !== knowledge.versionHash
    ) {
      throw new Error("Every pilot output must share one client profile and Brand Knowledge version");
    }
  }
  return { first, knowledge };
}

export async function buildBrandCortexPilotPackage(
  input: BrandCortexPilotPackageInput,
  dependencies: BrandCortexPilotPackageDependencies = {
    getWork: getCreativeWork,
    getObject: (key) => objectStorage.get(key),
  },
) {
  if (input.selections.length === 0) throw new Error("At least one pilot output is required");
  const aggregates = await Promise.all(input.selections.map(async (selection) => {
    const aggregate = await dependencies.getWork(input.workspaceId, selection.workItemId);
    if (!aggregate) throw new Error(`Creative Work not found: ${selection.workItemId}`);
    const output = aggregate.outputs.find((item) => item.id === selection.outputId);
    if (!output || output.status !== "completed" || !output.outputKey) {
      throw new Error(`Completed output not found: ${selection.outputId}`);
    }
    return { aggregate, output };
  }));
  const { first, knowledge } = assertSameIdentity(aggregates.map(({ aggregate }) => aggregate));
  const outputDir = path.resolve(input.outDir);
  if (existsSync(outputDir)) throw new Error(`Output directory already exists: ${outputDir}`);
  const artifactsDir = path.join(outputDir, "artifacts");
  mkdirSync(artifactsDir, { recursive: true });

  const artifacts: BrandCortexPilotManifest["artifacts"] = [];
  const referenceBytes = new Map<string, Buffer>();
  const providerReferences = new Map<string, {
    assetKey: string;
    label: string;
    category: string;
    usageMode: string;
    mimeType: string;
  }>();
  const loadReference = async (assetKey: string) => {
    const cached = referenceBytes.get(assetKey);
    if (cached) return cached;
    const bytes = await dependencies.getObject(assetKey);
    referenceBytes.set(assetKey, bytes);
    return bytes;
  };
  for (const { aggregate, output } of aggregates) {
    const bytes = await dependencies.getObject(output.outputKey!);
    const metadata = await sharp(bytes).metadata();
    const quality = record(output.quality);
    const generation = record(quality.generation);
    const winner = record(generation.winner);
    const fidelity = record(quality.brandFidelity);
    const deterministic = record(fidelity.deterministic);
    const residual = record(fidelity.residual);
    const prompt = string(generation.prompt);
    const promptSha256 = string(generation.promptSha256);
    const artifactSha256 = hash(bytes);
    const expectedDimensions = getTargetDimensions(output.targetFormat);
    const providerModel = string(winner.model);
    if (
      !prompt
      || !promptSha256
      || string(winner.provider) !== "openai"
      || !providerModel
      || !string(winner.rawRequestId)
      || number(winner.durationMs) === null
    ) throw new Error(`${output.id}: real provider provenance is incomplete`);
    if (!providerModel.startsWith("gpt-image-2")) throw new Error(`${output.id}: GPT Image 2 provider evidence is required`);
    if (!output.cost || output.cost <= 0) throw new Error(`${output.id}: positive billed credits are required`);
    if (metadata.format !== "png" || !expectedDimensions || metadata.width !== expectedDimensions.width || metadata.height !== expectedDimensions.height) {
      throw new Error(`${output.id}: stored PNG dimensions do not match ${output.targetFormat}`);
    }
    if (createHash("sha256").update(prompt).digest("hex") !== promptSha256) {
      throw new Error(`${output.id}: frozen prompt hash does not match`);
    }
    if (string(winner.model)!.includes("e2e-controlled")) {
      throw new Error(`${output.id}: controlled provider output is not real pilot evidence`);
    }
    if (string(deterministic.artifactSha256) !== artifactSha256) {
      throw new Error(`${output.id}: persisted artifact hash does not match storage`);
    }
    if (!Array.isArray(generation.references)) {
      throw new Error(`${output.id}: provider reference provenance is incomplete`);
    }
    const providerInputs: BrandCortexPilotManifest["artifacts"][number]["provider"]["inputs"] = [];
    for (const [index, value] of generation.references.entries()) {
      const reference = record(value);
      const assetKey = string(reference.assetKey);
      const mimeType = string(reference.mimeType);
      const sourceMimeType = string(reference.sourceMimeType);
      const label = string(reference.label);
      const role = string(reference.role);
      const referenceSha256 = string(reference.sha256);
      if (!assetKey || !mimeType || !sourceMimeType || !label || !role || !referenceSha256 || number(reference.position) !== index + 1 || typeof reference.required !== "boolean") {
        throw new Error(`${output.id}: provider reference provenance is incomplete`);
      }
      const normalized = await normalizeCreativeWorkReferenceImage({ buffer: await loadReference(assetKey), mimeType: sourceMimeType });
      if (hash(normalized.buffer) !== referenceSha256) {
        throw new Error(`${output.id}: provider reference hash no longer matches ${assetKey}`);
      }
      providerReferences.set(assetKey, { assetKey, label, category: role, usageMode: "reference", mimeType: sourceMimeType });
      providerInputs.push({
        position: index + 1,
        role: role as BrandCortexPilotManifest["artifacts"][number]["provider"]["inputs"][number]["role"],
        required: reference.required,
        assetKey,
        label,
        sourceMimeType,
        mimeType,
        sha256: referenceSha256,
      });
    }
    const directionSnapshot = output.directionSnapshot ?? null;
    const directionSnapshotSha256 = string(generation.directionSnapshotSha256);
    if (hashBrandCortexEvidence(directionSnapshot) !== (directionSnapshotSha256 ?? hashBrandCortexEvidence(null))) {
      throw new Error(`${output.id}: direction snapshot no longer matches generation evidence`);
    }
    const artifactPath = `artifacts/${output.targetFormat.replace(":", "x")}-${output.id}.png`;
    writeFileSync(path.join(outputDir, artifactPath), bytes);
    artifacts.push({
      artifactId: `${output.targetFormat}-${output.id}`,
      workItemId: aggregate.work.id,
      outputId: output.id,
      outputKey: output.outputKey,
      format: output.targetFormat,
      artifactPath,
      artifactSha256,
      prompt,
      promptSha256,
      mimeType: "image/png",
      byteLength: bytes.byteLength,
      width: metadata.width ?? 0,
      height: metadata.height ?? 0,
      billingCredits: output.cost,
      identity: {
        snapshotSha256: hashBrandCortexEvidence(aggregate.work.identitySnapshot),
        brandKit: aggregate.work.identitySnapshot!.brandKit,
        referenceAssetKeys: aggregate.work.identitySnapshot!.assets.map((asset) => asset.assetKey),
        claimIds: aggregate.work.identitySnapshot!.brandKnowledge!.claims.map((claim) => claim.id),
      },
      directionSnapshot,
      directionSnapshotSha256,
      provider: {
        name: "openai",
        model: providerModel,
        requestId: string(winner.rawRequestId)!,
        durationMs: number(winner.durationMs)!,
        inputs: providerInputs,
      },
      deterministicFidelity: string(deterministic.overall) as "proven" | "nonconforming" | "not_applicable",
      residualFidelity: string(residual.status) as "clear" | "suspected" | "inconclusive",
      brief: aggregate.work.brief!,
      copy: aggregate.work.copy!,
    });
  }

  const identityAssets = [...new Map(aggregates.flatMap(({ aggregate }) =>
    aggregate.work.identitySnapshot!.assets.map((asset) => [asset.assetKey, asset] as const),
  )).values()];
  const referenceDescriptors = new Map(providerReferences);
  for (const asset of identityAssets) referenceDescriptors.set(asset.assetKey, asset);
  const referenceAssets = await Promise.all([...referenceDescriptors.values()].map(async (asset, index) => {
    const bytes = await loadReference(asset.assetKey);
    const extension = asset.mimeType === "image/svg+xml" ? "svg" : asset.mimeType === "image/webp" ? "webp" : asset.mimeType === "image/jpeg" ? "jpg" : "png";
    const relativePath = `artifacts/reference-${index + 1}.${extension}`;
    writeFileSync(path.join(outputDir, relativePath), bytes);
    return {
      assetKey: asset.assetKey,
      path: relativePath,
      sha256: hash(bytes),
      label: asset.label,
      category: asset.category,
      usageMode: asset.usageMode,
      mimeType: asset.mimeType,
    };
  }));
  const manifest = brandCortexPilotManifestSchema.parse({
    schemaVersion: 1,
    reportType: "brand-cortex-real-pilot",
    pilotId: input.pilotId,
    capturedAt: input.capturedAt ?? new Date().toISOString(),
    createdByUserId: input.createdByUserId,
    workspaceId: input.workspaceId,
    clientProfileId: first.clientProfileId,
    realProviderExecuted: true,
    paidGeneration: input.paidGeneration ?? false,
    brandKnowledge: {
      versionId: knowledge.versionId,
      versionNumber: knowledge.versionNumber,
      versionHash: knowledge.versionHash,
    },
    coverage: { requiredFormats: ["1:1", "4:5", "9:16"], minimumArtifactsPerFormat: 2 },
    referenceAssets,
    brandKit: first.identitySnapshot!.brandKit,
    claims: [...new Map(aggregates.flatMap(({ aggregate }) =>
      aggregate.work.identitySnapshot!.brandKnowledge!.claims.map((claim) => [claim.id, claim] as const),
    )).values()],
    artifacts,
  });
  const manifestSha256 = hashBrandCortexEvidence(manifest);
  writeFileSync(path.join(outputDir, "pilot.manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  writeFileSync(path.join(outputDir, "review.template.json"), `${JSON.stringify(createBrandCortexReviewTemplate(manifest), null, 2)}\n`);
  writeFileSync(path.join(outputDir, "index.html"), renderBrandCortexReviewHtml(manifest));
  return { manifest, manifestSha256, outputDir };
}

function parseArgs(argv: string[]): BrandCortexPilotPackageInput {
  const values: Record<string, string> = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || !value) throw new Error("Arguments must be --key value pairs");
    values[key.slice(2)] = value;
  }
  const selections = JSON.parse(values.selections ?? "[]") as BrandCortexPilotPackageInput["selections"];
  const paidGeneration = values["paid-generation"];
  if (paidGeneration !== undefined && paidGeneration !== "true" && paidGeneration !== "false") {
    throw new Error("--paid-generation must be true or false");
  }
  if (!values.workspace || !values.pilot || !values.user || !values.out) {
    throw new Error("Required: --workspace ID --pilot ID --user ID --selections JSON --out PATH");
  }
  return {
    workspaceId: values.workspace,
    pilotId: values.pilot,
    createdByUserId: values.user,
    selections,
    outDir: values.out,
    paidGeneration: paidGeneration === "true",
  };
}

export async function main(argv = process.argv.slice(2)): Promise<number> {
  try {
    const result = await buildBrandCortexPilotPackage(parseArgs(argv));
    console.log(`BRAND-CORTEX-PILOT: ${result.manifestSha256}`);
    console.log(`Review package: ${result.outputDir}`);
    return 0;
  } catch (error) {
    console.error(`BRAND-CORTEX-PILOT: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void main().then((code) => { process.exitCode = code; });
}
