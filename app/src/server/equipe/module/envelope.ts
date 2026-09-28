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

export const deliverBatchItemSchema = z.object({
  creativeWorkId: uuid,
  creativeWorkOutputId: uuid,
  caption: z.string().max(4000).default(""),
  destinationAccount: z.string().min(1).max(200),
  scheduledFor: z.coerce.date(),
  needsConfirmation: z.boolean().default(false),
});

export const deliverBatchPayloadSchema = z.object({
  title: z.string().min(1).max(200),
  frontId: uuid,
  approveByAt: z.coerce.date(),
  items: z.array(deliverBatchItemSchema).min(1).max(50),
});

export const approveItemPayloadSchema = z.object({
  itemId: uuid,
  expectedVersionHash: versionHash,
});

export const approveBatchPayloadSchema = z.object({
  items: z
    .array(z.object({ itemId: uuid, versionHash }))
    .min(1)
    .max(50),
});

export const requestAdjustmentPayloadSchema = z.object({
  itemId: uuid,
  category: z.enum(["fact", "brand", "voice", "visual", "other"]),
  note: z.string().max(2000).optional(),
});

export const editCaptionPayloadSchema = z.object({
  itemId: uuid,
  caption: z.string().min(1).max(4000),
});

export const recordCaptionTriagePayloadSchema = z.object({
  itemId: uuid,
  natures: z
    .array(z.enum(["permanent_fact", "commercial_condition", "regulated_claim", "none"]))
    .max(4),
  warnings: z.array(z.string().min(1).max(500)).max(10).default([]),
  qualityRecheckPassed: z.boolean().default(false),
});

export const confirmBusinessFactPayloadSchema = z.object({
  itemId: uuid,
  expectedVersionHash: versionHash,
});

export const declinePublishPayloadSchema = z.object({
  itemId: uuid,
  reason: z.string().min(1).max(2000),
});

export const cancelScheduledPayloadSchema = z.object({
  itemId: uuid,
});

export const choosePiecePayloadSchema = z.object({
  itemId: uuid,
  expectedVersionHash: versionHash,
  creativeWorkOutputId: uuid,
});

export const expireItemDeadlinePayloadSchema = z.object({
  itemId: uuid,
});

export const proposeNewSchedulePayloadSchema = z.object({
  itemId: uuid,
  scheduledFor: z.coerce.date(),
});

// #551 — conversation map: the module maps assistant threads to the account.
export const ensurePrimaryThreadPayloadSchema = z.object({
  assistantThreadId: uuid,
});

export const openParallelThreadPayloadSchema = z.object({
  assistantThreadId: uuid,
  topic: z.string().min(1).max(200),
});

// #547 — escalonamentos, exceções de atendimento e pausas.

export const escalationKindSchema = z.enum(["content", "technical", "security"]);
export const escalationSeveritySchema = z.enum(["normal", "critical", "critical_cross_account"]);
export const escalationCauseSchema = z.enum([
  "missing_source",
  "outdated_offer",
  "model_error",
  "connection",
  "client_request",
  "isolation",
  "other",
  "no_client_response",
]);
export const escalationExitSchema = z.enum(["fix", "confirm_no_issue", "defer_to_client"]);
export const supportTriggerSchema = z.enum([
  "client_requested_person",
  "stalled_implantation",
  "stuck_connection",
  "unresolved_fact_conflict",
  "repeated_silence",
  "out_of_contract_request",
  "dissatisfaction_signal",
  "cancel_request",
  "critical_incident",
  "off_app_material",
]);
export const supportCloseReasonSchema = z.enum([
  "resolved",
  "commercial_forwarded",
  "client_no_response",
]);
export const contactChannelSchema = z.enum(["phone", "whatsapp", "in_person", "other"]);

export const openEscalationPayloadSchema = z.object({
  kind: escalationKindSchema,
  severity: escalationSeveritySchema,
  itemId: uuid.optional(),
  frontId: uuid.optional(),
  reason: z.string().min(1).max(2000),
  systemic: z.boolean().default(false),
  connectionIds: z.array(uuid).max(10).default([]),
});

export const reportItemProblemPayloadSchema = z.object({
  itemId: uuid,
  note: z.string().min(1).max(2000),
});

export const mergeEscalationsPayloadSchema = z.object({
  escalationIds: z.tuple([uuid, uuid]),
});

export const resolveContentEscalationPayloadSchema = z.object({
  escalationId: uuid,
  exit: escalationExitSchema,
});

export const resolveTechnicalEscalationPayloadSchema = z.object({
  escalationId: uuid,
  kind: z.enum(["technical", "security"]).optional(),
  exit: escalationExitSchema,
});

export const closeEscalationPayloadSchema = z.object({
  escalationId: uuid,
  cause: escalationCauseSchema,
  lessonCandidate: z.string().max(2000).optional(),
});

export const expireEscalationClientWaitPayloadSchema = z.object({
  escalationId: uuid,
});

export const ingestAgentSignalPayloadSchema = z.object({
  sourceEventId: uuid,
});

export const reopenFrontCalibrationPayloadSchema = z.object({
  frontId: uuid,
  escalationId: uuid,
});

export const openExceptionPayloadSchema = z.object({
  trigger: supportTriggerSchema,
  reason: z.string().max(2000).optional(),
});

export const requestSupportPayloadSchema = z.object({
  note: z.string().max(2000).optional(),
});

export const assumeExceptionPayloadSchema = z.object({
  exceptionId: uuid,
});

export const postStaffMessagePayloadSchema = z.object({
  exceptionId: uuid,
  body: z.string().min(1).max(4000),
});

export const registerContactPayloadSchema = z.object({
  exceptionId: uuid,
  channel: contactChannelSchema,
  summary: z.string().min(1).max(2000),
});

export const closeExceptionPayloadSchema = z.object({
  exceptionId: uuid,
  reason: supportCloseReasonSchema,
});

export const pausePublicationsPayloadSchema = z.object({
  reason: z.string().max(2000).optional(),
});

export const pauseAccountTeamPayloadSchema = z.object({
  reason: z.string().max(2000).optional(),
});

export const pauseFrontContentPayloadSchema = z.object({
  frontId: uuid,
  reason: z.string().max(2000).optional(),
});

export const pauseConnectionPayloadSchema = z.object({
  reason: z.string().max(2000).optional(),
  connectionId: uuid.optional(),
});

export const pauseGlobalPayloadSchema = z.object({
  reason: z.string().max(2000).optional(),
});

export const suspendExecutionPayloadSchema = z.object({
  reason: z.string().max(2000).optional(),
  connectionIds: z.array(uuid).max(10).default([]),
});

export const revokeConnectionPayloadSchema = z.object({
  connectionId: uuid,
  escalationId: uuid,
  reason: z.string().min(1).max(2000),
});

export const pauseDelinquencyPayloadSchema = z.object({
  reason: z.string().max(2000).optional(),
});

export const resumePausePayloadSchema = z.object({
  pauseId: uuid,
});

// Calibration (#546): weekly rounds per front, quality scoring, release.
const rubricDimension = z.number().int().min(0).max(4);

export const openRoundPayloadSchema = z.object({
  frontId: uuid,
  batchId: uuid,
});

export const scoreAttemptPayloadSchema = z.object({
  roundId: uuid,
  itemId: uuid,
  facts: rubricDimension,
  brand: rubricDimension,
  usefulness: rubricDimension,
  execution: rubricDimension,
  feedback: z.string().max(2000).optional(),
});

export const returnItemForFixPayloadSchema = z.object({
  roundId: uuid,
  itemId: uuid,
  note: z.string().min(1).max(2000),
});

export const submitCorrectedVersionPayloadSchema = z
  .object({
    roundId: uuid,
    itemId: uuid,
    caption: z.string().min(1).max(4000).optional(),
    creativeWorkOutputId: uuid.optional(),
  })
  .superRefine((payload, ctx) => {
    if (payload.caption === undefined && payload.creativeWorkOutputId === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "caption or creativeWorkOutputId is required",
      });
    }
  });

export const releaseItemToClientPayloadSchema = z.object({
  roundId: uuid,
  itemId: uuid,
});

export const markCriticalFailurePayloadSchema = z.object({
  roundId: uuid,
  itemId: uuid,
  reason: z.string().min(1).max(2000),
});

export const withdrawRoundItemPayloadSchema = z.object({
  roundId: uuid,
  itemId: uuid,
  reason: z.string().max(2000).optional(),
});

export const classifyRejectionPayloadSchema = z.object({
  roundId: uuid,
  itemId: uuid,
  category: z.enum(["fact", "brand", "taste"]),
  evidence: z.string().max(4000).optional(),
});

export const closeRoundPayloadSchema = z.object({
  roundId: uuid,
});

export const releaseFrontPayloadSchema = z.object({
  frontId: uuid,
  notes: z.string().max(4000).optional(),
});

export const resolveScopeDecisionPayloadSchema = z.object({
  frontId: uuid,
  decision: z.enum(["reduce_scope", "pause_front", "close_front"]),
  note: z.string().max(4000).optional(),
});

export const openScopeDecisionPayloadSchema = z.object({
  frontId: uuid,
});

export const reopenCalibrationPayloadSchema = z.object({
  frontId: uuid,
  reason: z.string().min(1).max(2000),
  escalationId: uuid.optional(),
});

// #548 — despacho de publicação, conexão Instagram e publicação manual.

export const dispatchPublicationPayloadSchema = z.object({
  intentId: uuid,
});

export const reconcilePublicationPayloadSchema = z.object({
  itemId: uuid,
});

export const declareManualPublicationPayloadSchema = z.object({
  itemId: uuid,
});

export const removePublishedPostPayloadSchema = z.object({
  itemId: uuid,
  via: z.enum(["api", "custodian"]).default("api"),
  reason: z.string().max(2000).optional(),
});

export const completeInstagramConnectPayloadSchema = z.object({
  encryptedToken: z.string().min(1).max(8000),
  igUsername: z.string().max(200).optional(),
});

export const failInstagramConnectPayloadSchema = z.object({
  code: z.string().min(1).max(80),
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
  command("deliver_batch", deliverBatchPayloadSchema),
  command("approve_item", approveItemPayloadSchema),
  command("approve_batch", approveBatchPayloadSchema),
  command("request_adjustment", requestAdjustmentPayloadSchema),
  command("edit_caption", editCaptionPayloadSchema),
  command("record_caption_triage", recordCaptionTriagePayloadSchema),
  command("confirm_business_fact", confirmBusinessFactPayloadSchema),
  command("decline_publish", declinePublishPayloadSchema),
  command("cancel_scheduled", cancelScheduledPayloadSchema),
  command("choose_piece", choosePiecePayloadSchema),
  command("expire_item_deadline", expireItemDeadlinePayloadSchema),
  command("propose_new_schedule", proposeNewSchedulePayloadSchema),
  // #551
  command("ensure_primary_thread", ensurePrimaryThreadPayloadSchema),
  command("open_parallel_thread", openParallelThreadPayloadSchema),
  // #547
  command("open_escalation", openEscalationPayloadSchema),
  command("report_item_problem", reportItemProblemPayloadSchema),
  command("merge_escalations", mergeEscalationsPayloadSchema),
  command("resolve_content_escalation", resolveContentEscalationPayloadSchema),
  command("resolve_technical_escalation", resolveTechnicalEscalationPayloadSchema),
  command("close_escalation", closeEscalationPayloadSchema),
  command("expire_escalation_client_wait", expireEscalationClientWaitPayloadSchema),
  command("ingest_agent_signal", ingestAgentSignalPayloadSchema),
  command("reopen_front_calibration", reopenFrontCalibrationPayloadSchema),
  command("open_exception", openExceptionPayloadSchema),
  command("request_support", requestSupportPayloadSchema),
  command("assume_exception", assumeExceptionPayloadSchema),
  command("post_staff_message", postStaffMessagePayloadSchema),
  command("register_contact", registerContactPayloadSchema),
  command("close_exception", closeExceptionPayloadSchema),
  command("pause_publications", pausePublicationsPayloadSchema),
  command("pause_account_team", pauseAccountTeamPayloadSchema),
  command("pause_front_content", pauseFrontContentPayloadSchema),
  command("pause_connection", pauseConnectionPayloadSchema),
  command("pause_global", pauseGlobalPayloadSchema),
  command("suspend_execution", suspendExecutionPayloadSchema),
  command("revoke_connection", revokeConnectionPayloadSchema),
  command("pause_delinquency", pauseDelinquencyPayloadSchema),
  command("resume_pause", resumePausePayloadSchema),
  // Calibration (#546)
  command("open_round", openRoundPayloadSchema),
  command("score_attempt", scoreAttemptPayloadSchema),
  command("return_item_for_fix", returnItemForFixPayloadSchema),
  command("submit_corrected_version", submitCorrectedVersionPayloadSchema),
  command("release_item_to_client", releaseItemToClientPayloadSchema),
  command("mark_critical_failure", markCriticalFailurePayloadSchema),
  command("withdraw_round_item", withdrawRoundItemPayloadSchema),
  command("classify_rejection", classifyRejectionPayloadSchema),
  command("close_round", closeRoundPayloadSchema),
  command("release_front", releaseFrontPayloadSchema),
  command("resolve_scope_decision", resolveScopeDecisionPayloadSchema),
  command("open_scope_decision", openScopeDecisionPayloadSchema),
  command("reopen_calibration", reopenCalibrationPayloadSchema),
  // #548
  command("dispatch_publication", dispatchPublicationPayloadSchema),
  command("reconcile_publication", reconcilePublicationPayloadSchema),
  command("declare_manual_publication", declareManualPublicationPayloadSchema),
  command("remove_published_post", removePublishedPostPayloadSchema),
  command("complete_instagram_connect", completeInstagramConnectPayloadSchema),
  command("fail_instagram_connect", failInstagramConnectPayloadSchema),
]);

/** Validated untrusted half of the call: { type, payload } only. */
export type EquipeCommand = z.infer<typeof commandSchema>;
export type CommandType = EquipeCommand["type"];
