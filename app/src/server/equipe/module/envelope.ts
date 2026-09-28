// Trust boundary of executeCommand(deps, context, rawCommand).
//
// - `context` is TRUSTED: the adapter builds it from the session and the
//   URL ({ actor, workspaceId, accountId? }), never from the request body.
// - `rawCommand` is UNTRUSTED: { type, payload } only, validated with zod.
//   The schema is strict: a rawCommand smuggling `actor`, `workspaceId` or
//   `accountId` keys is rejected.

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

export const approveBrandVoicePayloadSchema = z.object({
  voice: z.string().min(1).max(8000),
});

export const agreeManualModePayloadSchema = z.object({});

export const recordInstallmentPaidPayloadSchema = z.object({
  installment: z.union([z.literal(1), z.literal(2)]),
  reference: z.string().min(1).max(200),
});

export const advanceOnboardingPayloadSchema = z.object({
  step: equipeOnboardingStepKeySchema,
});

export const pauseOnboardingPayloadSchema = z.object({
  direction: z.enum(["pause", "resume"]),
  reason: z.string().max(2000).optional(),
});

/** Adapter-provided scope: session + URL, never the request body. */
export const adapterContextSchema = z.object({
  actor: actorSchema,
  workspaceId: uuid,
  accountId: uuid.optional(),
});

export type AdapterContext = z.infer<typeof adapterContextSchema>;

function command<T extends string, P extends z.ZodTypeAny>(type: T, payload: P) {
  return z.object({ type: z.literal(type), payload }).strict();
}

export const commandSchema = z.discriminatedUnion("type", [
  command("open_account", openAccountPayloadSchema),
  command("confirm_scope", confirmScopePayloadSchema),
  command("register_material", registerMaterialPayloadSchema),
  command("propose_context_section", proposeContextSectionPayloadSchema),
  command("approve_context_section", approveContextSectionPayloadSchema),
  command("answer_conflict", answerConflictPayloadSchema),
  command("propose_plan", proposePlanPayloadSchema),
  command("approve_plan", approvePlanPayloadSchema),
  command("propose_mandate", proposeMandatePayloadSchema),
  command("approve_mandate", approveMandatePayloadSchema),
  command("approve_brand_voice", approveBrandVoicePayloadSchema),
  command("agree_manual_mode", agreeManualModePayloadSchema),
  command("record_installment_paid", recordInstallmentPaidPayloadSchema),
  command("advance_onboarding", advanceOnboardingPayloadSchema),
  command("pause_onboarding", pauseOnboardingPayloadSchema),
]);

/** Validated untrusted half of the call: { type, payload } only. */
export type EquipeCommand = z.infer<typeof commandSchema>;
export type CommandType = EquipeCommand["type"];
