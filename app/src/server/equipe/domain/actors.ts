// Actor model ("Quem participa") and the authorization check.
// Authorization lives in the module, not in the routes: callers build the
// Actor, never the request body.

import { err, ok, type Result } from "./result";

export type ClientPersonRole = "approver" | "substitute" | "custodian" | "member";
export type StaffRole = "support" | "quality" | "operations";

export type Actor =
  | { kind: "client_person"; role: ClientPersonRole; personId: string }
  | { kind: "staff"; role: StaffRole; staffId: string }
  | { kind: "agent"; agentId: string }
  | { kind: "system"; job: string };

export function actorId(actor: Actor): string {
  switch (actor.kind) {
    case "client_person":
      return actor.personId;
    case "staff":
      return actor.staffId;
    case "agent":
      return actor.agentId;
    case "system":
      return actor.job;
  }
}

export type EquipeAction =
  // Client decisions (approver or substitute)
  | "approve_item"
  | "approve_batch"
  | "approve_plan"
  | "approve_mandate"
  | "approve_context_section"
  | "confirm_business_fact"
  | "edit_caption"
  | "request_adjustment"
  | "decline_publish"
  | "cancel_scheduled"
  | "pause_own_publications"
  | "resume_own_publications"
  // Custodian
  | "connect_account"
  | "reconnect_account"
  // Any client person
  | "comment"
  | "report_problem"
  // Staff: quality ("qualidade")
  | "score_round"
  | "return_for_fix"
  | "mark_critical_failure"
  | "release_front"
  | "resolve_content_escalation"
  | "pause_front_content"
  | "resume_content_pause"
  // Staff: operations ("operação")
  | "resolve_technical_escalation"
  | "suspend_execution"
  | "revoke_connection"
  | "global_stop"
  | "resume_technical"
  // Staff: support ("atendimento")
  | "open_exception"
  | "assume_exception"
  | "close_exception"
  | "register_contact"
  | "upload_for_client"
  | "pause_account"
  // Agent ("Especialistas IA" + "Estrategista IA")
  | "propose_idea"
  | "create_version"
  | "record_finding"
  | "open_escalation"
  | "ask_question"
  // Batch approval (#545)
  | "deliver_batch"
  | "record_caption_triage"
  | "choose_piece"
  | "propose_new_schedule"
  // System (jobs)
  | "remind"
  | "expire_deadline"
  | "hold_item"
  | "dispatch_publication"
  | "reconcile_publication"
  | "open_auto_exception"
  | "open_auto_escalation"
  | "apply_automatic_pause"
  // Escalonamentos, exceções e pausas (#547)
  | "merge_escalations"
  | "close_escalation"
  | "ingest_agent_signal"
  | "reopen_calibration"
  | "request_support"
  | "post_staff_message"
  | "resume_pause"
  // Implantation (module #544; owners from the implantação flow)
  | "open_account"
  | "confirm_scope"
  | "register_material"
  | "propose_context_section"
  | "answer_conflict"
  | "propose_plan"
  | "propose_mandate"
  | "approve_brand_voice"
  | "agree_manual_mode"
  | "record_installment_paid"
  | "advance_onboarding"
  | "pause_onboarding"
  // Conversation map (#551): mapping assistant threads to the account.
  | "manage_threads";

type Permission =
  | { kind: "client_person"; roles: ClientPersonRole[] }
  | { kind: "staff"; roles: StaffRole[] }
  | { kind: "agent" }
  | { kind: "system" };

const CLIENT_DECISION: Permission = { kind: "client_person", roles: ["approver", "substitute"] };
const CUSTODIAN: Permission = { kind: "client_person", roles: ["custodian"] };
const ANY_CLIENT: Permission = { kind: "client_person", roles: ["approver", "substitute", "custodian", "member"] };
const QUALITY: Permission = { kind: "staff", roles: ["quality"] };
const OPERATIONS: Permission = { kind: "staff", roles: ["operations"] };
const SUPPORT: Permission = { kind: "staff", roles: ["support"] };
const AGENT: Permission = { kind: "agent" };
const SYSTEM: Permission = { kind: "system" };

const ACTION_PERMISSIONS: Record<EquipeAction, Permission[]> = {
  approve_item: [CLIENT_DECISION],
  approve_batch: [CLIENT_DECISION],
  approve_plan: [CLIENT_DECISION],
  approve_mandate: [CLIENT_DECISION],
  approve_context_section: [CLIENT_DECISION],
  confirm_business_fact: [CLIENT_DECISION],
  edit_caption: [CLIENT_DECISION],
  request_adjustment: [CLIENT_DECISION],
  decline_publish: [CLIENT_DECISION],
  cancel_scheduled: [CLIENT_DECISION],
  pause_own_publications: [CLIENT_DECISION],
  resume_own_publications: [CLIENT_DECISION],
  connect_account: [CUSTODIAN],
  reconnect_account: [CUSTODIAN],
  comment: [ANY_CLIENT],
  report_problem: [ANY_CLIENT],
  score_round: [QUALITY],
  return_for_fix: [QUALITY],
  mark_critical_failure: [QUALITY],
  release_front: [QUALITY],
  resolve_content_escalation: [QUALITY],
  pause_front_content: [QUALITY, SYSTEM],
  resume_content_pause: [QUALITY],
  resolve_technical_escalation: [OPERATIONS],
  suspend_execution: [OPERATIONS, SYSTEM],
  revoke_connection: [OPERATIONS],
  global_stop: [OPERATIONS],
  resume_technical: [OPERATIONS],
  open_exception: [SUPPORT, AGENT, SYSTEM],
  assume_exception: [SUPPORT],
  close_exception: [SUPPORT],
  register_contact: [SUPPORT],
  upload_for_client: [SUPPORT],
  pause_account: [SUPPORT, OPERATIONS],
  propose_idea: [AGENT],
  create_version: [AGENT],
  record_finding: [AGENT],
  open_escalation: [AGENT, SYSTEM],
  ask_question: [AGENT],
  deliver_batch: [AGENT, SYSTEM],
  record_caption_triage: [AGENT],
  choose_piece: [CLIENT_DECISION],
  propose_new_schedule: [AGENT],
  remind: [SYSTEM],
  expire_deadline: [SYSTEM],
  hold_item: [SYSTEM],
  dispatch_publication: [SYSTEM],
  reconcile_publication: [SYSTEM],
  open_auto_exception: [SYSTEM],
  open_auto_escalation: [SYSTEM],
  apply_automatic_pause: [SYSTEM],
  // #547: fine-grained owner checks (part kind, pause origin, escalation
  // owner) run inside the command; the action grants the candidate set.
  merge_escalations: [QUALITY, OPERATIONS],
  close_escalation: [QUALITY, OPERATIONS],
  ingest_agent_signal: [SYSTEM],
  reopen_calibration: [QUALITY],
  request_support: [ANY_CLIENT],
  post_staff_message: [SUPPORT],
  resume_pause: [CLIENT_DECISION, QUALITY, OPERATIONS, SUPPORT, SYSTEM],
  open_account: [OPERATIONS],
  confirm_scope: [CLIENT_DECISION],
  register_material: [ANY_CLIENT, SUPPORT],
  propose_context_section: [AGENT],
  answer_conflict: [CLIENT_DECISION],
  propose_plan: [AGENT],
  propose_mandate: [AGENT],
  approve_brand_voice: [CLIENT_DECISION],
  agree_manual_mode: [CLIENT_DECISION],
  record_installment_paid: [SUPPORT, OPERATIONS],
  advance_onboarding: [SUPPORT, OPERATIONS, AGENT, SYSTEM],
  pause_onboarding: [SUPPORT, OPERATIONS, SYSTEM],
  // #551: clients open parallel conversations, the strategist/system ensure
  // the primary for proactive messages, support joins for exceptions. Mapping
  // a conversation decides nothing — approvals stay human-only elsewhere.
  manage_threads: [ANY_CLIENT, SUPPORT, AGENT, SYSTEM],
};

function permissionGrants(permission: Permission, actor: Actor): boolean {
  switch (permission.kind) {
    case "client_person":
      return actor.kind === "client_person" && permission.roles.includes(actor.role);
    case "staff":
      return actor.kind === "staff" && permission.roles.includes(actor.role);
    case "agent":
      return actor.kind === "agent";
    case "system":
      return actor.kind === "system";
  }
}

/**
 * Pure authorization check. Hard rule: approvals accept only a
 * `client_person` approver/substitute — an `agent` attempting to approve
 * gets a domain error.
 */
export function authorize(actor: Actor, action: EquipeAction): Result<void> {
  const granted = (ACTION_PERMISSIONS[action] ?? []).some((permission) => permissionGrants(permission, actor));
  if (!granted) {
    const who = actor.kind === "client_person" || actor.kind === "staff" ? `${actor.kind}:${actor.role}` : actor.kind;
    return err("forbidden_actor", `${who} may not perform ${action}`);
  }
  return ok(undefined);
}
