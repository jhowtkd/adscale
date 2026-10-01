import { z } from "zod";
import { HANDOFF_GROUPS, HANDOFF_MAX_NETWORKS, HANDOFF_STEPS } from "../domain/handoff";

const expected = { expectedStep: z.enum(HANDOFF_STEPS), expectedVersion: z.number().int().positive() };
/** Uploads a brand keeps, counting the decided ones and the saved drafts. */
export const HANDOFF_MAX_UPLOADED_IMAGES = 30;
export const handoffItemSchema = z.object({
  id: z.string().min(1).max(300), value: z.string().min(1).max(4000), origin: z.enum(["site", "instagram", "user"]),
  key: z.string().min(1).max(1000).optional(), caption: z.string().max(4000).optional(),
  width: z.number().int().positive().optional(), height: z.number().int().positive().optional(), platform: z.string().max(40).optional(),
}).strict();
export const handoffSetSourceSchema = z.object({ ...expected, kind: z.enum(["site", "instagram"]), value: z.string().trim().min(1).max(2048) }).strict();
export const handoffRetryReadingSchema = z.object(expected).strict();
export const handoffRecordGroupSchema = z.object({
  readingId: z.string().uuid(), runId: z.string().uuid(), taskIntentId: z.string().uuid(), group: z.enum(HANDOFF_GROUPS),
  result: z.object({ status: z.enum(["running", "found", "not_found", "failed"]), items: z.array(handoffItemSchema).max(30).default([]), error: z.string().max(500).optional(), content: z.array(handoffItemSchema.extend({ value: z.string().max(50000) })).max(2).optional() }).strict(),
}).strict();
export const handoffConfirmIdentitySchema = z.object({
  ...expected, name: z.string().trim().min(1).max(200), logo: z.string().max(300).nullable(),
  colors: z.array(z.string().regex(/^#[0-9a-f]{6}$/i)).max(6), fonts: z.array(z.string().trim().min(1).max(100)).max(8),
  paletteChoice: z.enum(["site", "instagram", "user"]),
}).strict();
export const handoffAttachLogoSchema = z.object({ ...expected, logo: z.string().uuid() }).strict();
export const handoffAttachImageSchema = z.object({ ...expected, image: z.string().uuid() }).strict();
export const handoffConfirmNetworksSchema = z.object({ ...expected, kept: z.array(z.string().min(1).max(300)).max(HANDOFF_MAX_NETWORKS), added: z.array(z.object({ platform: z.enum(["instagram", "facebook", "tiktok", "linkedin", "youtube"]), value: z.string().trim().min(1).max(2048) }).strict()).max(HANDOFF_MAX_NETWORKS) }).strict()
  .refine(p => p.kept.length + p.added.length <= HANDOFF_MAX_NETWORKS, { message: `Confirm at most ${HANDOFF_MAX_NETWORKS} networks, counting the ones you add.`, path: ["added"] });
export const handoffConfirmImagesSchema = z.object({ ...expected, kept: z.array(z.string().min(1).max(300)).max(90), removed: z.array(z.string().min(1).max(300)).max(90), uploaded: z.array(z.string().uuid()).max(HANDOFF_MAX_UPLOADED_IMAGES) }).strict();
export const handoffBackToSchema = z.object({ ...expected, step: z.enum(["source", "identity", "networks", "images"]) }).strict();
export const handoffConfirmSummarySchema = z.object(expected).strict();
export const handoffSchemas = {
  handoff_set_source: handoffSetSourceSchema, handoff_retry_reading: handoffRetryReadingSchema,
  handoff_record_group: handoffRecordGroupSchema, handoff_attach_logo: handoffAttachLogoSchema, handoff_attach_image: handoffAttachImageSchema, handoff_confirm_identity: handoffConfirmIdentitySchema,
  handoff_confirm_networks: handoffConfirmNetworksSchema, handoff_confirm_images: handoffConfirmImagesSchema,
  handoff_back_to: handoffBackToSchema, handoff_confirm_summary: handoffConfirmSummarySchema,
};
export type HandoffCommand = { [K in keyof typeof handoffSchemas]: { type: K; payload: z.infer<typeof handoffSchemas[K]> } }[keyof typeof handoffSchemas];
export const HANDOFF_READ_EVENT = "equipe.handoff.read";
export const HANDOFF_DIAGNOSE_EVENT = "equipe.handoff.diagnose";
/** Conversation events of the first open: the Strategist's opening line, and "Biblioteca montada · N itens" (fixed text, no model). */
export const FREE_INTRO_EVENT = "account.free_intro";
export const LIBRARY_ASSEMBLED_EVENT = "library.assembled";
