import { z } from "zod";
import { ALLOWED_PROPERTY_KEYS } from "./types";

export const MAX_PROPERTIES_BYTES = 32 * 1024;

const DENIED_KEY_NAMES = new Set([
  "prompt",
  "email",
  "message",
  "url",
  "assetUrl",
  "token",
  "authToken",
  "breadcrumbs",
  "diagnosticContext",
  "note",
  "freeText",
]);

const scalarValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
]);

const propertiesSchema = z.strictObject(
  Object.fromEntries(
    ALLOWED_PROPERTY_KEYS.map((key) => [key, scalarValueSchema.optional()])
  ) as Record<(typeof ALLOWED_PROPERTY_KEYS)[number], z.ZodOptional<typeof scalarValueSchema>>
);

export type BetaEventPropertyValue = string | number | boolean | null;

export class BetaEventPropertiesValidationError extends Error {
  readonly code = "validation_error" as const;
  readonly details: unknown;

  constructor(message: string, details?: unknown) {
    super(message);
    this.name = "BetaEventPropertiesValidationError";
    this.details = details;
  }
}

function findDeniedKeys(input: Record<string, unknown>): string[] {
  return Object.keys(input).filter((key) => DENIED_KEY_NAMES.has(key));
}

export function enforcePropertiesSize(
  props: Record<string, BetaEventPropertyValue>
): void {
  if (JSON.stringify(props).length > MAX_PROPERTIES_BYTES) {
    throw new BetaEventPropertiesValidationError(
      "properties payload exceeds maximum size",
      { maxBytes: MAX_PROPERTIES_BYTES }
    );
  }
}

export function sanitizeBetaEventProperties(
  input: unknown
): Record<string, BetaEventPropertyValue> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new BetaEventPropertiesValidationError("properties must be an object", {
      received: typeof input,
    });
  }

  const record = input as Record<string, unknown>;
  const deniedKeys = findDeniedKeys(record);
  if (deniedKeys.length > 0) {
    throw new BetaEventPropertiesValidationError("properties contain denied keys", {
      deniedKeys,
    });
  }

  const parsed = propertiesSchema.safeParse(record);
  if (!parsed.success) {
    throw new BetaEventPropertiesValidationError("properties failed validation", {
      issues: parsed.error.flatten(),
    });
  }

  const sanitized: Record<string, BetaEventPropertyValue> = {};
  for (const [key, value] of Object.entries(parsed.data)) {
    if (value !== undefined) {
      sanitized[key] = value;
    }
  }

  enforcePropertiesSize(sanitized);
  return sanitized;
}
