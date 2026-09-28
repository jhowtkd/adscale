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
import { runOpenAccount } from "./open-account";
import { runConfirmScope, runRegisterMaterial } from "./scope-materials";
import { runAnswerConflict, runApproveContextSection, runProposeContextSection } from "./context";
import {
  runApproveMandate,
  runApprovePlan,
  runProposeMandate,
  runProposePlan,
} from "./plan-mandate";
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

const COMMAND_ACTIONS: Record<CommandType, EquipeAction> = {
  open_account: "open_account",
  confirm_scope: "confirm_scope",
  register_material: "register_material",
  propose_context_section: "propose_context_section",
  approve_context_section: "approve_context_section",
  answer_conflict: "answer_conflict",
  propose_plan: "propose_plan",
  approve_plan: "approve_plan",
  propose_mandate: "propose_mandate",
  approve_mandate: "approve_mandate",
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
};

export type ExecutedCommand = CommandSuccess & { type: CommandType };

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
  const accountId = command.type === "open_account" ? "" : trusted.accountId;
  if (command.type !== "open_account" && !accountId) {
    return err("invalid_context", `command ${command.type} requires accountId in context`);
  }
  const enabledForWorkspace = deps.isEnabledForWorkspace ?? isEquipeEnabledForWorkspace;
  if (!enabledForWorkspace(trusted.workspaceId)) {
    return err(
      "equipe_not_enabled",
      `equipe is not enabled for workspace ${trusted.workspaceId}`,
    );
  }
  const authorized = authorize(trusted.actor, COMMAND_ACTIONS[command.type]);
  if (!authorized.ok) return authorized;

  const base: TxBase = {
    actor: trusted.actor,
    workspaceId: trusted.workspaceId,
    accountId: accountId ?? "",
    now: deps.clock.now(),
  };
  let outcome: Result<CommandSuccess>;
  switch (command.type) {
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
  }
  if (!outcome.ok) return outcome;
  return {
    ok: true,
    value: { ...outcome.value, type: command.type },
  };
}
