// executeCommand: the module's single entry point.
//
// The adapter (route, job, conversation) builds the actor and passes it
// separately from the envelope — the request body can never smuggle an
// actor in. Boundary order: validate actor + envelope (zod) → workspace
// gate → authorize → run one transaction.

import { authorize, type Actor, type EquipeAction, err, type Result } from "../domain";
import type { EquipeModuleDeps } from "./ports";
import { actorSchema, commandEnvelopeSchema, type CommandType } from "./envelope";
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
import { runAdvanceOnboarding, runPauseOnboarding } from "./onboarding";

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
  advance_onboarding: "advance_onboarding",
  pause_onboarding: "pause_onboarding",
};

export type ExecutedCommand = CommandSuccess & { type: CommandType };

function zodIssues(error: { issues: Array<{ path: Array<string | number>; message: string }> }): string {
  return error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`).join("; ");
}

export async function executeCommand(
  deps: EquipeModuleDeps,
  actor: Actor,
  rawEnvelope: unknown,
): Promise<Result<ExecutedCommand>> {
  const parsedActor = actorSchema.safeParse(actor);
  if (!parsedActor.success) {
    return err("invalid_actor", `invalid actor: ${zodIssues(parsedActor.error)}`);
  }
  const parsedEnvelope = commandEnvelopeSchema.safeParse(rawEnvelope);
  if (!parsedEnvelope.success) {
    return err("invalid_command", `invalid command: ${zodIssues(parsedEnvelope.error)}`);
  }
  const envelope = parsedEnvelope.data;
  const enabledForWorkspace = deps.isEnabledForWorkspace ?? isEquipeEnabledForWorkspace;
  if (!enabledForWorkspace(envelope.workspaceId)) {
    return err(
      "equipe_not_enabled",
      `equipe is not enabled for workspace ${envelope.workspaceId}`,
    );
  }
  const authorized = authorize(parsedActor.data, COMMAND_ACTIONS[envelope.type]);
  if (!authorized.ok) return authorized;

  const base: TxBase = {
    actor: parsedActor.data,
    workspaceId: envelope.workspaceId,
    accountId: envelope.type === "open_account" ? "" : envelope.accountId,
    now: deps.clock.now(),
  };
  let outcome: Result<CommandSuccess>;
  switch (envelope.type) {
    case "open_account":
      outcome = await runOpenAccount(deps, base, envelope.payload);
      break;
    case "confirm_scope":
      outcome = await runConfirmScope(deps, base, envelope.payload);
      break;
    case "register_material":
      outcome = await runRegisterMaterial(deps, base, envelope.payload);
      break;
    case "propose_context_section":
      outcome = await runProposeContextSection(deps, base, envelope.payload);
      break;
    case "approve_context_section":
      outcome = await runApproveContextSection(deps, base, envelope.payload);
      break;
    case "answer_conflict":
      outcome = await runAnswerConflict(deps, base, envelope.payload);
      break;
    case "propose_plan":
      outcome = await runProposePlan(deps, base, envelope.payload);
      break;
    case "approve_plan":
      outcome = await runApprovePlan(deps, base, envelope.payload);
      break;
    case "propose_mandate":
      outcome = await runProposeMandate(deps, base, envelope.payload);
      break;
    case "approve_mandate":
      outcome = await runApproveMandate(deps, base, envelope.payload);
      break;
    case "advance_onboarding":
      outcome = await runAdvanceOnboarding(deps, base, envelope.payload);
      break;
    case "pause_onboarding":
      outcome = await runPauseOnboarding(deps, base, envelope.payload);
      break;
  }
  if (!outcome.ok) return outcome;
  return {
    ok: true,
    value: { ...outcome.value, type: envelope.type },
  };
}
