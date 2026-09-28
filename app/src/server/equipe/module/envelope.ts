// Command envelope: { type, workspaceId, accountId?, payload }, validated
// with zod at the module boundary. The actor is NOT part of the envelope:
// adapters pass it separately (see executeCommand), so a route can never
// take the actor from the request body.

import { z } from "zod";
import {
  equipeFrontKeySchema,
  equipeOnboardingStepKeySchema,
  equipePersonRoleSchema,
} from "../data";

export const actorSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("client_person"),
    role: z.enum(["approver", "substitute", "custodian", "member"]),
    personId: z.string().min(1),
  }),
  z.object({
    kind: z.literal("staff"),
    role: z.enum(["support", "quality", "operations"]),
    staffId: z.string().min(1),
  }),
  z.object({ kind: z.literal("agent"), agentId: z.string().min(1) }),
  z.object({ kind: z.literal("system"), job: z.string().min(1) }),
]);

const uuid = z.string().uuid();
const versionHash = z.string().min(1).max(200);

const openAccountPersonSchema = z.object({
  name: z.string().min(1).max(200),
  role: equipePersonRoleSchema,
  userId: z.string().min(1).max(200).optional(),
  email: z.string().email().max(320).optional(),
});

export const openAccountPayloadSchema = z
  .object({
    clientProfileId: uuid,
    fronts: z.array(equipeFrontKeySchema).min(1).max(8),
    people: z.array(openAccountPersonSchema).min(1).max(20),
    notes: z.string().max(2000).optional(),
  })
  .superRefine((payload, ctx) => {
    if (new Set(payload.fronts).size !== payload.fronts.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "fronts must be unique" });
    }
    const approvers = payload.people.filter((p) => p.role === "approver").length;
    const substitutes = payload.people.filter((p) => p.role === "substitute").length;
    if (approvers !== 1) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "exactly one approver is required" });
    }
    if (substitutes > 1) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "at most one substitute is allowed" });
    }
  });

export const confirmScopePayloadSchema = z.object({
  scopeDigest: z.string().min(1).max(200),
  note: z.string().max(2000).optional(),
});

export const registerMaterialPayloadSchema = z.object({
  assetId: uuid,
  kind: z.string().min(1).max(80),
  origin: z.string().max(500).optional(),
});

const contextFieldSchema = z.object({
  status: z.enum(["sustained", "inferred", "unknown"]),
  value: z.unknown().optional(),
  source: z.string().max(500).optional(),
});

export const proposeContextSectionPayloadSchema = z.object({
  section: z.string().min(1).max(120),
  fields: z.record(z.string(), contextFieldSchema).refine((fields) => Object.keys(fields).length > 0, {
    message: "at least one field is required",
  }),
});

export const approveContextSectionPayloadSchema = z.object({
  section: z.string().min(1).max(120),
  expectedVersionHash: versionHash,
});

export const answerConflictPayloadSchema = z.object({
  section: z.string().min(1).max(120),
  field: z.string().min(1).max(200),
  answer: z.string().min(1).max(4000),
});

export const proposePlanPayloadSchema = z.object({
  content: z.record(z.string(), z.unknown()),
});

export const approvePlanPayloadSchema = z.object({
  expectedVersionHash: versionHash,
});

export const proposeMandatePayloadSchema = z
  .object({
    frontId: uuid.optional(),
    limits: z.unknown().optional(),
    window: z.unknown().optional(),
    validFrom: z.coerce.date().optional(),
    validUntil: z.coerce.date().optional(),
    stopCondition: z.unknown().optional(),
    shadow: z.boolean().default(true),
  })
  .superRefine((payload, ctx) => {
    if (payload.validFrom && payload.validUntil && payload.validUntil <= payload.validFrom) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "validUntil must be after validFrom",
      });
    }
  });

export const approveMandatePayloadSchema = z.object({
  expectedVersionHash: versionHash,
});

export const advanceOnboardingPayloadSchema = z.object({
  step: equipeOnboardingStepKeySchema,
  secondInstallmentPaid: z.boolean().optional(),
  brandVoiceApproved: z.boolean().optional(),
  manualModeAgreed: z.boolean().optional(),
});

export const pauseOnboardingPayloadSchema = z.object({
  direction: z.enum(["pause", "resume"]),
  reason: z.string().max(2000).optional(),
});

function withScope<T extends string, P extends z.ZodTypeAny>(type: T, payload: P) {
  return z.object({ type: z.literal(type), workspaceId: uuid, accountId: uuid, payload });
}

export const commandEnvelopeSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("open_account"), workspaceId: uuid, payload: openAccountPayloadSchema }),
  withScope("confirm_scope", confirmScopePayloadSchema),
  withScope("register_material", registerMaterialPayloadSchema),
  withScope("propose_context_section", proposeContextSectionPayloadSchema),
  withScope("approve_context_section", approveContextSectionPayloadSchema),
  withScope("answer_conflict", answerConflictPayloadSchema),
  withScope("propose_plan", proposePlanPayloadSchema),
  withScope("approve_plan", approvePlanPayloadSchema),
  withScope("propose_mandate", proposeMandatePayloadSchema),
  withScope("approve_mandate", approveMandatePayloadSchema),
  withScope("advance_onboarding", advanceOnboardingPayloadSchema),
  withScope("pause_onboarding", pauseOnboardingPayloadSchema),
]);

/** Envelope WITHOUT the actor (the adapter passes the actor separately). */
export type CommandEnvelope = z.infer<typeof commandEnvelopeSchema>;
export type CommandType = CommandEnvelope["type"];
