import { z } from "zod";
import { RULE_CATEGORIES, type RuleCategory } from "./calibration-signal-types";
import { GUIDANCE_ROLES, type GuidanceRole } from "./learned-guidance";

/** Human confirmation concerns these exact approved bytes and explicit destinations. */
export interface ConfirmedGuidanceMetadata {
  readonly category: RuleCategory;
  readonly nature: "text" | "visual";
  readonly roles: readonly GuidanceRole[];
  readonly generationModes: readonly string[];
  readonly formats: readonly string[];
  readonly contentHash: string;
}

const scopeValue = z.string().trim().min(1).max(120);
export const confirmedGuidanceMetadataSchema = z.object({
  category: z.enum(RULE_CATEGORIES),
  nature: z.enum(["text", "visual"]),
  roles: z.array(z.enum(GUIDANCE_ROLES)).min(1).max(GUIDANCE_ROLES.length),
  generationModes: z.array(scopeValue).min(1),
  formats: z.array(scopeValue).min(1),
  contentHash: z.string().regex(/^[0-9a-f]{64}$/),
}).strict();
