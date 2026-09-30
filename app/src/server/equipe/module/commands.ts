import { runHandoffCommand } from "./handoff";
import { runDiagnosisCommand } from "./diagnosis";
import { runClaimAgentWork, runCompleteAgentWork, runSubmitItemVersion } from "./agent-work";
// executeCommand: the module's single entry point.
//
// Trust boundary: `context` ({ actor, workspaceId, accountId? }) is trusted
// — the adapter builds it from the session and the URL, never from the
// request body. `rawCommand` ({ type, payload }) is the only untrusted part
// and is validated with a strict zod schema. Boundary order: validate
// context → validate rawCommand → workspace gate → authorize → run one
// transaction (which binds the actor to a stored row).

import { authorize, type EquipeAction, err, type Result } from "../domain";
import type { EquipeModuleDeps } from "./ports";
import { adapterContextSchema, commandSchema, type CommandType } from "./envelope";
import { isEquipeEnabledForWorkspace } from "./equipe-enabled";
import type { CommandSuccess, TxBase } from "./shared";
import { runOpenFreeAccount } from "./open-free-account";
import { runOpenAccount } from "./open-account";
import { runConfirmScope, runRegisterMaterial } from "./scope-materials";
import { runAnswerConflict, runApproveContextSection, runProposeContextSection } from "./context";
import {
  runApproveMandate,
  runApprovePlan,
  runProposeMandate,
  runProposePlan,
} from "./plan-mandate";
// #584
import { runProposeMandateActivation } from "./mandate-activation";
import { runApproveAutomaticPublication } from "./publication-mode";
import { runDecideIdea } from "./ideas-decide";
import {
  runAdvanceOnboarding,
  runAgreeManualMode,
  runApproveBrandVoice,
  runPauseOnboarding,
  runRecordInstallmentPaid,
} from "./onboarding";
import { runDeliverBatch } from "./items-deliver";
import { runApproveBatch, runApproveItem } from "./items-approve";
import {
  runCancelScheduled,
  runConfirmBusinessFact,
  runDeclinePublish,
  runEditCaption,
  runRecordCaptionTriage,
  runRequestAdjustment,
} from "./items-adjust";
import { runChoosePiece } from "./items-choose";
import { runExpireItemDeadline, runProposeNewSchedule } from "./items-deadline";
// #551
import { runEnsurePrimaryThread, runOpenParallelThread } from "./threads";
// #547 — escalonamentos, exceções de atendimento e pausas.
import {
  runCloseEscalation,
  runExpireEscalationClientWait,
  runIngestAgentSignal,
  runMergeEscalations,
  runOpenEscalation,
  runReopenFrontCalibration,
  runReportItemProblem,
  runResolveContentEscalation,
  runResolveTechnicalEscalation,
  runRevokeConnection,
} from "./escalations";
import {
  runAssumeException,
  runCloseException,
  runOpenException,
  runPostStaffMessage,
  runRegisterContact,
  runRequestSupport,
} from "./exceptions";
import {
  runPauseAccountTeam,
  runPauseConnection,
  runPauseDelinquency,
  runPauseFrontContent,
  runPausePublications,
  runResumePause,
  runSuspendExecution,
} from "./pauses";
// #583 — parada global de publicações sem deploy.
import { runResumeAllPublications, runStopAllPublications } from "./global-stop";
// Calibration (#546)
import { runCloseRound, runOpenRound } from "./calibration-open-close";
import {
  runReleaseItemToClient,
  runReturnItemForFix,
  runScoreAttempt,
  runSubmitCorrectedVersion,
} from "./calibration-scoring";
import {
  runClassifyRejection,
  runMarkCriticalFailure,
  runWithdrawRoundItem,
} from "./calibration-classify";
import {
  runOpenScopeDecision,
  runReleaseFront,
  runReopenCalibration,
  runResolveScopeDecision,
} from "./calibration-release";
// #548 — despacho de publicação, conexão Instagram e publicação manual.
import { runDispatchPublication } from "./dispatch";
import { runReconcilePublication } from "./reconcile";
import { runDeclareManualPublication } from "./manual-publishing";
import { runRemovePublishedPost } from "./removal";
import { runCompleteInstagramConnect, runFailInstagramConnect } from "./instagram-connect";
// #549 — jobs duráveis e notificações.
import { runReminders } from "./jobs-reminders";
import { runDeadlines } from "./jobs-deadlines";
import { runCalibrationMonitor, runRecordQualityEffort } from "./jobs-monitor";
import { runRecordNotificationDelivered } from "./jobs-delivery";

const COMMAND_ACTIONS: Record<CommandType, EquipeAction> = {
  handoff_set_source: "handoff_decide",
  handoff_retry_reading: "handoff_decide",
  handoff_record_group: "handoff_record_group",
  handoff_confirm_identity: "handoff_decide",
  handoff_confirm_networks: "handoff_decide",
  handoff_confirm_images: "handoff_decide",
  handoff_back_to: "handoff_decide",
  handoff_confirm_summary: "handoff_decide",
  diagnosis_claim: "diagnosis_run",
  diagnosis_record: "diagnosis_run",
  diagnosis_fail: "diagnosis_run",
  diagnosis_retry: "diagnosis_decide",
  diagnosis_correct_source: "diagnosis_decide",
  open_account: "open_account",
  open_free_account: "open_free_account",
  claim_agent_work: "record_delivery",
  complete_agent_work: "create_version",
  submit_item_version: "create_version",
  confirm_scope: "confirm_scope",
  register_material: "register_material",
  propose_context_section: "propose_context_section",
  approve_context_section: "approve_context_section",
  answer_conflict: "answer_conflict",
  propose_plan: "propose_plan",
  approve_plan: "approve_plan",
  propose_mandate: "propose_mandate",
  approve_mandate: "approve_mandate",
  approve_automatic_publication: "approve_automatic_publication",
  // #584
  propose_mandate_activation: "propose_mandate_activation",
  decide_idea: "decide_idea",
  approve_brand_voice: "approve_brand_voice",
  agree_manual_mode: "agree_manual_mode",
  record_installment_paid: "record_installment_paid",
  advance_onboarding: "advance_onboarding",
  pause_onboarding: "pause_onboarding",
  deliver_batch: "deliver_batch",
  approve_item: "approve_item",
  approve_batch: "approve_batch",
  request_adjustment: "request_adjustment",
  edit_caption: "edit_caption",
  record_caption_triage: "record_caption_triage",
  confirm_business_fact: "confirm_business_fact",
  decline_publish: "decline_publish",
  cancel_scheduled: "cancel_scheduled",
  choose_piece: "choose_piece",
  expire_item_deadline: "expire_deadline",
  propose_new_schedule: "propose_new_schedule",
  // #551
  ensure_primary_thread: "manage_threads",
  open_parallel_thread: "manage_threads",
  // #547
  open_escalation: "open_escalation",
  report_item_problem: "report_problem",
  merge_escalations: "merge_escalations",
  resolve_content_escalation: "resolve_content_escalation",
  resolve_technical_escalation: "resolve_technical_escalation",
  close_escalation: "close_escalation",
  expire_escalation_client_wait: "expire_deadline",
  ingest_agent_signal: "ingest_agent_signal",
  reopen_front_calibration: "reopen_calibration",
  open_exception: "open_exception",
  request_support: "request_support",
  assume_exception: "assume_exception",
  post_staff_message: "post_staff_message",
  register_contact: "register_contact",
  close_exception: "close_exception",
  pause_publications: "pause_own_publications",
  pause_account_team: "pause_account",
  pause_front_content: "pause_front_content",
  pause_connection: "apply_automatic_pause",
  // #583 — sem pause_global per-conta: parar/retomar é global.
  stop_all_publications: "global_stop",
  resume_all_publications: "resume_global_stop",
  suspend_execution: "suspend_execution",
  revoke_connection: "revoke_connection",
  pause_delinquency: "apply_automatic_pause",
  resume_pause: "resume_pause",
  // Calibration (#546)
  open_round: "open_round",
  score_attempt: "score_round",
  return_item_for_fix: "return_for_fix",
  submit_corrected_version: "submit_corrected_version",
  release_item_to_client: "release_item_to_client",
  mark_critical_failure: "mark_critical_failure",
  withdraw_round_item: "withdraw_round_item",
  classify_rejection: "classify_rejection",
  close_round: "close_round",
  release_front: "release_front",
  resolve_scope_decision: "resolve_scope_decision",
  open_scope_decision: "open_scope_decision",
  reopen_calibration: "reopen_calibration",
  // #548
  dispatch_publication: "dispatch_publication",
  reconcile_publication: "reconcile_publication",
  declare_manual_publication: "declare_manual_publication",
  remove_published_post: "remove_published_post",
  complete_instagram_connect: "connect_account",
  fail_instagram_connect: "connect_account",
  // #549
  run_reminders: "remind",
  run_deadlines: "expire_deadline",
  run_calibration_monitor: "open_auto_escalation",
  record_notification_delivered: "record_delivery",
  record_quality_effort: "record_quality_effort",
};

export type ExecutedCommand = CommandSuccess & { type: CommandType };

// Explicit free-account allowlist; unknown commands fail closed.
export const FREE_ACCOUNT_COMMANDS: ReadonlySet<CommandType> = new Set<CommandType>([
  "handoff_set_source", "handoff_retry_reading", "handoff_record_group", "handoff_confirm_identity", "handoff_confirm_networks", "handoff_confirm_images", "handoff_back_to", "handoff_confirm_summary",
  "diagnosis_claim", "diagnosis_record", "diagnosis_fail", "diagnosis_retry", "diagnosis_correct_source",
  "ensure_primary_thread", "open_parallel_thread", "request_support", "post_staff_message",
  "assume_exception", "register_contact", "close_exception", "record_notification_delivered",
]);

// #583 — comandos sem conta no contexto: open_account (não há conta ainda)
// e a parada global (vale para todas as contas; o workspace do contexto é
// ignorado e o gate de workspace não se aplica — é uma chave de plataforma,
// um nível abaixo de EQUIPE_PUBLISH_ENABLED).
function isAccountlessCommand(type: CommandType): boolean {
  return type === "open_account" || type === "open_free_account" || type === "stop_all_publications" || type === "resume_all_publications";
}

function isGlobalStopCommand(type: CommandType): boolean {
  return type === "stop_all_publications" || type === "resume_all_publications";
}

function zodIssues(error: { issues: Array<{ path: Array<string | number>; message: string }> }): string {
  return error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`).join("; ");
}

export async function executeCommand(
  deps: EquipeModuleDeps,
  context: unknown,
  rawCommand: unknown,
): Promise<Result<ExecutedCommand>> {
  const parsedContext = adapterContextSchema.safeParse(context);
  if (!parsedContext.success) {
    const actorIssue = parsedContext.error.issues.some((issue) => issue.path[0] === "actor");
    return actorIssue
      ? err("invalid_actor", `invalid actor: ${zodIssues(parsedContext.error)}`)
      : err("invalid_context", `invalid context: ${zodIssues(parsedContext.error)}`);
  }
  const parsedCommand = commandSchema.safeParse(rawCommand);
  if (!parsedCommand.success) {
    return err("invalid_command", `invalid command: ${zodIssues(parsedCommand.error)}`);
  }
  const trusted = parsedContext.data;
  const command = parsedCommand.data;
  const accountId = isAccountlessCommand(command.type) ? "" : trusted.accountId;
  if (!isAccountlessCommand(command.type) && !accountId) {
    return err("invalid_context", `command ${command.type} requires accountId in context`);
  }
  const enabledForWorkspace = deps.isEnabledForWorkspace ?? isEquipeEnabledForWorkspace;
  if (!isGlobalStopCommand(command.type) && !enabledForWorkspace(trusted.workspaceId)) {
    return err(
      "equipe_not_enabled",
      `equipe is not enabled for workspace ${trusted.workspaceId}`,
    );
  }
  const authorized = authorize(trusted.actor, COMMAND_ACTIONS[command.type]);
  if (!authorized.ok) return authorized;
  if (accountId) {
    const account = await deps.uow.repos.accounts.get(trusted.workspaceId, accountId);
    if (account?.status === "free" && !FREE_ACCOUNT_COMMANDS.has(command.type)) {
      return err("requires_plan", "This command requires a paid account.");
    }
  }

  const base: TxBase = {
    actor: trusted.actor,
    workspaceId: trusted.workspaceId,
    accountId: accountId ?? "",
    now: deps.clock.now(),
  };
  let outcome: Result<CommandSuccess>;
  switch (command.type) {
    case "handoff_set_source":
    case "handoff_retry_reading":
    case "handoff_record_group":
    case "handoff_confirm_identity":
    case "handoff_confirm_networks":
    case "handoff_confirm_images":
    case "handoff_back_to":
    case "handoff_confirm_summary":
      outcome = await runHandoffCommand(deps, base, command);
      break;
    case "diagnosis_claim":
    case "diagnosis_record":
    case "diagnosis_fail":
    case "diagnosis_retry":
    case "diagnosis_correct_source":
      outcome = await runDiagnosisCommand(deps, base, command);
      break;
    case "open_free_account":
      outcome = await runOpenFreeAccount(deps, base, command.payload);
      break;
    case "claim_agent_work":
      outcome = await runClaimAgentWork(deps, base, command.payload);
      break;
    case "complete_agent_work":
      outcome = await runCompleteAgentWork(deps, base, command.payload);
      break;
    case "submit_item_version":
      outcome = await runSubmitItemVersion(deps, base, command.payload);
      break;
    case "open_account":
      outcome = await runOpenAccount(deps, base, command.payload);
      break;
    case "confirm_scope":
      outcome = await runConfirmScope(deps, base, command.payload);
      break;
    case "register_material":
      outcome = await runRegisterMaterial(deps, base, command.payload);
      break;
    case "propose_context_section":
      outcome = await runProposeContextSection(deps, base, command.payload);
      break;
    case "approve_context_section":
      outcome = await runApproveContextSection(deps, base, command.payload);
      break;
    case "answer_conflict":
      outcome = await runAnswerConflict(deps, base, command.payload);
      break;
    case "propose_plan":
      outcome = await runProposePlan(deps, base, command.payload);
      break;
    case "approve_plan":
      outcome = await runApprovePlan(deps, base, command.payload);
      break;
    case "propose_mandate":
      outcome = await runProposeMandate(deps, base, command.payload);
      break;
    case "approve_mandate":
      outcome = await runApproveMandate(deps, base, command.payload);
      break;
    case "approve_automatic_publication":
      outcome = await runApproveAutomaticPublication(deps, base, command.payload);
      break;
    // #584
    case "propose_mandate_activation":
      outcome = await runProposeMandateActivation(deps, base, command.payload);
      break;
    case "decide_idea":
      outcome = await runDecideIdea(deps, base, command.payload);
      break;
    case "approve_brand_voice":
      outcome = await runApproveBrandVoice(deps, base, command.payload);
      break;
    case "agree_manual_mode":
      outcome = await runAgreeManualMode(deps, base, command.payload);
      break;
    case "record_installment_paid":
      outcome = await runRecordInstallmentPaid(deps, base, command.payload);
      break;
    case "advance_onboarding":
      outcome = await runAdvanceOnboarding(deps, base, command.payload);
      break;
    case "pause_onboarding":
      outcome = await runPauseOnboarding(deps, base, command.payload);
      break;
    case "deliver_batch":
      outcome = await runDeliverBatch(deps, base, command.payload);
      break;
    case "approve_item":
      outcome = await runApproveItem(deps, base, command.payload);
      break;
    case "approve_batch":
      outcome = await runApproveBatch(deps, base, command.payload);
      break;
    case "request_adjustment":
      outcome = await runRequestAdjustment(deps, base, command.payload);
      break;
    case "edit_caption":
      outcome = await runEditCaption(deps, base, command.payload);
      break;
    case "record_caption_triage":
      outcome = await runRecordCaptionTriage(deps, base, command.payload);
      break;
    case "confirm_business_fact":
      outcome = await runConfirmBusinessFact(deps, base, command.payload);
      break;
    case "decline_publish":
      outcome = await runDeclinePublish(deps, base, command.payload);
      break;
    case "cancel_scheduled":
      outcome = await runCancelScheduled(deps, base, command.payload);
      break;
    case "choose_piece":
      outcome = await runChoosePiece(deps, base, command.payload);
      break;
    case "expire_item_deadline":
      outcome = await runExpireItemDeadline(deps, base, command.payload);
      break;
    case "propose_new_schedule":
      outcome = await runProposeNewSchedule(deps, base, command.payload);
      break;
    // #551
    case "ensure_primary_thread":
      outcome = await runEnsurePrimaryThread(deps, base, command.payload);
      break;
    case "open_parallel_thread":
      outcome = await runOpenParallelThread(deps, base, command.payload);
      break;
    // #547
    case "open_escalation":
      outcome = await runOpenEscalation(deps, base, command.payload);
      break;
    case "report_item_problem":
      outcome = await runReportItemProblem(deps, base, command.payload);
      break;
    case "merge_escalations":
      outcome = await runMergeEscalations(deps, base, command.payload);
      break;
    case "resolve_content_escalation":
      outcome = await runResolveContentEscalation(deps, base, command.payload);
      break;
    case "resolve_technical_escalation":
      outcome = await runResolveTechnicalEscalation(deps, base, command.payload);
      break;
    case "close_escalation":
      outcome = await runCloseEscalation(deps, base, command.payload);
      break;
    case "expire_escalation_client_wait":
      outcome = await runExpireEscalationClientWait(deps, base, command.payload);
      break;
    case "ingest_agent_signal":
      outcome = await runIngestAgentSignal(deps, base, command.payload);
      break;
    case "reopen_front_calibration":
      outcome = await runReopenFrontCalibration(deps, base, command.payload);
      break;
    case "open_exception":
      outcome = await runOpenException(deps, base, command.payload);
      break;
    case "request_support":
      outcome = await runRequestSupport(deps, base, command.payload);
      break;
    case "assume_exception":
      outcome = await runAssumeException(deps, base, command.payload);
      break;
    case "post_staff_message":
      outcome = await runPostStaffMessage(deps, base, command.payload);
      break;
    case "register_contact":
      outcome = await runRegisterContact(deps, base, command.payload);
      break;
    case "close_exception":
      outcome = await runCloseException(deps, base, command.payload);
      break;
    case "pause_publications":
      outcome = await runPausePublications(deps, base, command.payload);
      break;
    case "pause_account_team":
      outcome = await runPauseAccountTeam(deps, base, command.payload);
      break;
    case "pause_front_content":
      outcome = await runPauseFrontContent(deps, base, command.payload);
      break;
    case "pause_connection":
      outcome = await runPauseConnection(deps, base, command.payload);
      break;
    // #583 — parada global de publicações sem deploy.
    case "stop_all_publications":
      outcome = await runStopAllPublications(deps, base, command.payload);
      break;
    case "resume_all_publications":
      outcome = await runResumeAllPublications(deps, base, command.payload);
      break;
    case "suspend_execution":
      outcome = await runSuspendExecution(deps, base, command.payload);
      break;
    case "revoke_connection":
      outcome = await runRevokeConnection(deps, base, command.payload);
      break;
    case "pause_delinquency":
      outcome = await runPauseDelinquency(deps, base, command.payload);
      break;
    case "resume_pause":
      outcome = await runResumePause(deps, base, command.payload);
      break;
    // Calibration (#546)
    case "open_round":
      outcome = await runOpenRound(deps, base, command.payload);
      break;
    case "score_attempt":
      outcome = await runScoreAttempt(deps, base, command.payload);
      break;
    case "return_item_for_fix":
      outcome = await runReturnItemForFix(deps, base, command.payload);
      break;
    case "submit_corrected_version":
      outcome = await runSubmitCorrectedVersion(deps, base, command.payload);
      break;
    case "release_item_to_client":
      outcome = await runReleaseItemToClient(deps, base, command.payload);
      break;
    case "mark_critical_failure":
      outcome = await runMarkCriticalFailure(deps, base, command.payload);
      break;
    case "withdraw_round_item":
      outcome = await runWithdrawRoundItem(deps, base, command.payload);
      break;
    case "classify_rejection":
      outcome = await runClassifyRejection(deps, base, command.payload);
      break;
    case "close_round":
      outcome = await runCloseRound(deps, base, command.payload);
      break;
    case "release_front":
      outcome = await runReleaseFront(deps, base, command.payload);
      break;
    case "resolve_scope_decision":
      outcome = await runResolveScopeDecision(deps, base, command.payload);
      break;
    case "open_scope_decision":
      outcome = await runOpenScopeDecision(deps, base, command.payload);
      break;
    case "reopen_calibration":
      outcome = await runReopenCalibration(deps, base, command.payload);
      break;
    // #548
    case "dispatch_publication":
      outcome = await runDispatchPublication(deps, base, command.payload);
      break;
    case "reconcile_publication":
      outcome = await runReconcilePublication(deps, base, command.payload);
      break;
    case "declare_manual_publication":
      outcome = await runDeclareManualPublication(deps, base, command.payload);
      break;
    case "remove_published_post":
      outcome = await runRemovePublishedPost(deps, base, command.payload);
      break;
    case "complete_instagram_connect":
      outcome = await runCompleteInstagramConnect(deps, base, command.payload);
      break;
    case "fail_instagram_connect":
      outcome = await runFailInstagramConnect(deps, base, command.payload);
      break;
    // #549
    case "run_reminders":
      outcome = await runReminders(deps, base, command.payload);
      break;
    case "run_deadlines":
      outcome = await runDeadlines(deps, base, command.payload);
      break;
    case "run_calibration_monitor":
      outcome = await runCalibrationMonitor(deps, base, command.payload);
      break;
    case "record_notification_delivered":
      outcome = await runRecordNotificationDelivered(deps, base, command.payload);
      break;
    case "record_quality_effort":
      outcome = await runRecordQualityEffort(deps, base, command.payload);
      break;
  }
  if (!outcome.ok) return outcome;
  return {
    ok: true,
    value: { ...outcome.value, type: command.type },
  };
}
