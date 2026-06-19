export type InviteWeight = "absent" | "weak" | "balanced" | "overpowering";

export type BrandPresence = "absent" | "weak" | "present" | "dominant";

export interface BaseCreativeReading {
  dominantIdea: string;
  gestaltRead: string;
  inviteWeight: InviteWeight;
  thumbnailRead: string;
  brandPresence: BrandPresence;
  risks: string[];
}

const INVITE_WEIGHTS = new Set<InviteWeight>([
  "absent",
  "weak",
  "balanced",
  "overpowering",
]);

const BRAND_PRESENCES = new Set<BrandPresence>([
  "absent",
  "weak",
  "present",
  "dominant",
]);

const MAX_RISKS = 2;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeInviteWeight(value: unknown): InviteWeight {
  if (typeof value === "string" && INVITE_WEIGHTS.has(value as InviteWeight)) {
    return value as InviteWeight;
  }
  return "weak";
}

function normalizeBrandPresence(value: unknown): BrandPresence {
  if (typeof value === "string" && BRAND_PRESENCES.has(value as BrandPresence)) {
    return value as BrandPresence;
  }
  return "weak";
}

function normalizeRisks(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim())
    .slice(0, MAX_RISKS);
}

/**
 * Normalizes the Leitura do base object from model output.
 * Returns null when required creative-reading fields are missing.
 */
export function normalizeBaseCreativeReading(
  value: unknown
): BaseCreativeReading | null {
  if (!isRecord(value)) {
    return null;
  }

  if (
    !isNonEmptyString(value.dominantIdea) ||
    !isNonEmptyString(value.gestaltRead) ||
    !isNonEmptyString(value.thumbnailRead)
  ) {
    return null;
  }

  return {
    dominantIdea: value.dominantIdea.trim(),
    gestaltRead: value.gestaltRead.trim(),
    inviteWeight: normalizeInviteWeight(value.inviteWeight),
    thumbnailRead: value.thumbnailRead.trim(),
    brandPresence: normalizeBrandPresence(value.brandPresence),
    risks: normalizeRisks(value.risks),
  };
}

export function buildBaseReadingPromptSection(reading: BaseCreativeReading): string {
  const lines = [
    "## Leitura do base",
    `- Ideia dominante: ${reading.dominantIdea}`,
    `- Gestalt: ${reading.gestaltRead}`,
    `- Peso do convite: ${reading.inviteWeight}`,
    `- Leitura em miniatura: ${reading.thumbnailRead}`,
    `- Presença de marca: ${reading.brandPresence}`,
  ];

  if (reading.risks.length > 0) {
    lines.push("", "### Riscos pré-geração");
    for (const risk of reading.risks) {
      lines.push(`- ${risk}`);
    }
  }

  return lines.join("\n");
}
