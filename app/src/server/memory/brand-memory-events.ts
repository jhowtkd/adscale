import type { Zep } from "@getzep/zep-cloud";

export type BrandMemoryEventType =
  | "brand_profile_created_or_updated"
  | "campaign_created_or_updated"
  | "creative_approved"
  | "creative_rejected"
  | "creative_saved_as_reference"
  | "creative_qa_completed"
  | "persona_test_completed"
  | "delivery_prepared";

export interface BrandMemoryEvent {
  type: BrandMemoryEventType;
  workspaceId: string;
  clientProfileId?: string | null;
  campaignId?: string | null;
  derivationId?: string | null;
  occurredAt?: Date | string | null;
  summary: string;
  payload: Record<string, unknown>;
}

export interface PreparedBrandMemoryEvent {
  graphId: string;
  data: string;
  createdAt?: string;
  sourceDescription: string;
  metadata: Record<string, string | number | boolean>;
  type: Zep.GraphDataType;
}

const SECRET_FIELD_PATTERN =
  /^(apiKey|api_key|authorization|password|secret|clientSecret|accessToken|refreshToken|webhookSecret)$/i;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function sanitizeBrandMemoryPayload(value: unknown, depth = 0): unknown {
  if (depth > 8) return "[truncated]";
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return value.length > 2000 ? `${value.slice(0, 2000)}...` : value;
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Date) return value.toISOString();

  if (Array.isArray(value)) {
    return value.slice(0, 30).map((item) => sanitizeBrandMemoryPayload(item, depth + 1));
  }

  if (!isPlainObject(value)) return String(value);

  return Object.fromEntries(
    Object.entries(value).flatMap(([key, nestedValue]) =>
      SECRET_FIELD_PATTERN.test(key)
        ? []
        : [[key, sanitizeBrandMemoryPayload(nestedValue, depth + 1)]]
    )
  );
}

function metadataValue(value: string | null | undefined) {
  return value && value.trim() ? value.trim() : undefined;
}

export function buildBrandMemorySearchQuery(input: {
  clientProfileName?: string | null;
  client?: string | null;
  product?: string | null;
  offer?: string | null;
  audience?: string | null;
  generationMode?: string | null;
  targetFormat?: string | null;
  ctaText?: string | null;
}) {
  return [
    input.clientProfileName ? `brand profile: ${input.clientProfileName}` : "",
    input.client ? `client: ${input.client}` : "",
    input.product ? `product: ${input.product}` : "",
    input.offer ? `offer: ${input.offer}` : "",
    input.audience ? `audience: ${input.audience}` : "",
    input.generationMode ? `generation mode: ${input.generationMode}` : "",
    input.targetFormat ? `target format: ${input.targetFormat}` : "",
    input.ctaText ? `CTA: ${input.ctaText}` : "",
    "approved patterns rejected patterns brand constraints tone visual style campaign memory",
  ]
    .filter(Boolean)
    .join("\n");
}

export function prepareBrandMemoryEvent(
  event: BrandMemoryEvent,
  graphId: string
): PreparedBrandMemoryEvent {
  const sanitizedPayload = sanitizeBrandMemoryPayload(event.payload) as Record<string, unknown>;
  const createdAt =
    event.occurredAt instanceof Date
      ? event.occurredAt.toISOString()
      : event.occurredAt || undefined;

  return {
    graphId,
    type: "json",
    createdAt,
    sourceDescription: `ADScale ${event.type}`,
    metadata: {
      eventType: event.type,
      workspaceId: event.workspaceId,
      ...(metadataValue(event.clientProfileId) && { clientProfileId: event.clientProfileId! }),
      ...(metadataValue(event.campaignId) && { campaignId: event.campaignId! }),
      ...(metadataValue(event.derivationId) && { derivationId: event.derivationId! }),
    },
    data: JSON.stringify({
      eventType: event.type,
      summary: event.summary,
      workspaceId: event.workspaceId,
      clientProfileId: event.clientProfileId ?? null,
      campaignId: event.campaignId ?? null,
      derivationId: event.derivationId ?? null,
      occurredAt: createdAt ?? null,
      payload: sanitizedPayload,
    }),
  };
}
