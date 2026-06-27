import {
  artifactVersionProvenanceSchema,
  artifactVersionSnapshotSchema,
  type ArtifactVersionProvenance,
  type ArtifactVersionSnapshot,
} from "@/lib/assistant/artifact-version";
import { containsDeniedPersistenceKeys } from "@/server/repositories/assistant-types";

export class ArtifactSnapshotValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ArtifactSnapshotValidationError";
  }
}

function assertSafe(value: unknown, label: string) {
  if (containsDeniedPersistenceKeys(value)) {
    throw new ArtifactSnapshotValidationError(`${label} contains denied keys`);
  }
}

export function parseArtifactSnapshot(value: unknown): ArtifactVersionSnapshot {
  assertSafe(value, "snapshot");
  return artifactVersionSnapshotSchema.parse(value);
}

export function parseArtifactProvenance(
  value: unknown
): ArtifactVersionProvenance {
  assertSafe(value, "provenance");
  return artifactVersionProvenanceSchema.parse(value);
}

export function buildPlanSnapshot(input: {
  strategy?: string | null;
  angles?: string[] | null;
  hooks?: string[] | null;
  ctas?: string[] | null;
  constraints?: string | null;
}): ArtifactVersionSnapshot {
  return parseArtifactSnapshot({
    type: "plan",
    strategy: input.strategy ?? null,
    angles: input.angles ?? [],
    hooks: input.hooks ?? [],
    ctas: input.ctas ?? [],
    constraints: input.constraints ?? null,
  });
}

export function buildCreativeSnapshot(input: {
  id: string;
  outputKey?: string | null;
  format?: string | null;
  generationMode?: string | null;
  ctaText?: string | null;
  planVersionId?: string | null;
}): ArtifactVersionSnapshot {
  return parseArtifactSnapshot({
    type: "creative",
    derivationId: input.id,
    outputKey: input.outputKey ?? null,
    format: input.format ?? null,
    generationMode: input.generationMode ?? null,
    ctaText: input.ctaText ?? null,
    planVersionId: input.planVersionId ?? null,
  });
}

