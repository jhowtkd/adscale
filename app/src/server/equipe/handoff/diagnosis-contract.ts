import { z } from "zod";

/** Sources the free diagnosis can read. `origin=user`, history and uploads are not sources. */
export const DIAGNOSIS_SOURCES = ["site", "instagram"] as const;
export type DiagnosisSource = (typeof DIAGNOSIS_SOURCES)[number];
export const DIAGNOSIS_SOURCE_NAMES: Record<DiagnosisSource, "Site" | "Instagram"> = { site: "Site", instagram: "Instagram" };

export const DIAGNOSIS_STARTED_EVENT = "diagnosis.started";
export const DIAGNOSIS_FAILED_EVENT = "diagnosis.failed";
/** The approver sent an insufficient diagnosis back for a better source: its `{documentId}` stops counting as recorded. */
export const DIAGNOSIS_REOPENED_EVENT = "diagnosis.reopened";
/** Same limit as the handoff (module/handoff.ts): readings that may still be started. */
export const DIAGNOSIS_READ_LIMIT = 3;
export const DIAGNOSIS_KIND = "diagnosis";
/** `created_by_role` of the document: the Pesquisa role wrote it. */
export const DIAGNOSIS_AUTHOR_ROLE = "research";

/** Automatic run (2 attempts) + up to 2 person-requested retries, then the card stops offering one. */
export const DIAGNOSIS_MAX_INTENTS = 3;

export const DIAGNOSIS_LIMITS = {
  /** Input cut ("cortado para caber"): the text the Pesquisa model reads. */
  siteChars: 20_000,
  instagramBioChars: 1_000,
  instagramPosts: 12,
  instagramCaptionChars: 600,
  /** Below this much public text there is nothing to diagnose: no model call, honest document. */
  minPublicChars: 200,
  summaryChars: 480,
  channelChars: 90,
  opportunityChars: 120,
  opportunities: 3,
  notFoundItems: 6,
  notFoundChars: 80,
  quoteMinChars: 12,
  quoteMaxChars: 280,
  evidencePerItem: 3,
} as const;

const source = z.enum(DIAGNOSIS_SOURCES);

/**
 * What the Pesquisa role may receive. Every string comes from a public field
 * collected with origin site/instagram; `.strict()` keeps history, uploads or
 * typed answers from sneaking into the task input.
 */
export const diagnosisInputSchema = z.object({
  name: z.string().max(200).nullable(),
  colors: z.array(z.object({ origin: source, value: z.string().max(20) }).strict()).max(12),
  fonts: z.array(z.object({ origin: source, value: z.string().max(100) }).strict()).max(12),
  site: z.object({ text: z.string().max(DIAGNOSIS_LIMITS.siteChars) }).strict().nullable(),
  instagram: z.object({
    bio: z.string().max(DIAGNOSIS_LIMITS.instagramBioChars),
    posts: z.array(z.string().max(DIAGNOSIS_LIMITS.instagramCaptionChars)).max(DIAGNOSIS_LIMITS.instagramPosts),
  }).strict().nullable(),
}).strict();
export type DiagnosisInput = z.infer<typeof diagnosisInputSchema>;

const evidence = z.object({ source, quote: z.string() });
/**
 * Wire schema of the structured answer. Counts and lengths are NOT encoded
 * here (provider strict modes reject them); the server enforces them while it
 * verifies every excerpt against the source text.
 */
export const diagnosisModelOutputSchema = z.object({
  summary: z.object({ text: z.string(), evidence: z.array(evidence) }),
  channels: z.array(z.object({ source, message: z.string(), evidence: z.array(evidence) })),
  opportunities: z.array(z.object({ title: z.string(), evidence: z.array(evidence) })),
  notFound: z.array(z.string()),
});
export type DiagnosisModelOutput = z.infer<typeof diagnosisModelOutputSchema>;

export const DIAGNOSIS_STATUS = ["complete", "insufficient"] as const;
/** Persisted `equipe_brand_documents.content` of kind `diagnosis`. */
export const diagnosisContentSchema = z.object({
  status: z.enum(DIAGNOSIS_STATUS),
  brand: z.string().nullable(),
  summary: z.string(),
  channels: z.array(z.object({ name: z.enum(["Site", "Instagram"]), source, message: z.string() })),
  opportunities: z.array(z.object({ title: z.string(), sources: z.array(source) })).max(DIAGNOSIS_LIMITS.opportunities),
  notFound: z.array(z.string()),
  /** Verified literal excerpts, each tagged with the claim it backs. */
  sources: z.array(z.object({ origin: source, quote: z.string(), supports: z.string() })),
  meta: z.object({
    readingId: z.string(),
    taskIntentId: z.string().nullable(),
    model: z.string().nullable(),
    promptVersion: z.string().nullable(),
    inputSources: z.array(source),
  }),
});
export type DiagnosisContent = z.infer<typeof diagnosisContentSchema>;

const taskIntentId = z.string().uuid();
export const diagnosisClaimSchema = z.object({ taskIntentId }).strict();
export const diagnosisRecordSchema = z.object({
  taskIntentId,
  /** null = no model call was needed (too little public text). */
  output: diagnosisModelOutputSchema.nullable(),
  model: z.string().max(100).nullable(),
  promptVersion: z.string().max(100).nullable(),
}).strict();
export const diagnosisFailSchema = z.object({ taskIntentId, code: z.string().trim().min(1).max(120) }).strict();
export const diagnosisRetrySchema = z.object({}).strict();
export const diagnosisCorrectSourceSchema = z.object({}).strict();
export const diagnosisSchemas = {
  diagnosis_claim: diagnosisClaimSchema,
  diagnosis_record: diagnosisRecordSchema,
  diagnosis_fail: diagnosisFailSchema,
  diagnosis_retry: diagnosisRetrySchema,
  diagnosis_correct_source: diagnosisCorrectSourceSchema,
};
export type DiagnosisCommand = { [K in keyof typeof diagnosisSchemas]: { type: K; payload: z.infer<typeof diagnosisSchemas[K]> } }[keyof typeof diagnosisSchemas];

/** Failure codes for which asking again can help (provider/transport/shape trouble). */
export const DIAGNOSIS_RETRYABLE_CODES = ["model_truncated", "diagnosis_invalid", "provider_error", "execution_blocked"] as const;
