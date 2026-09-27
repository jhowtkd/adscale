import { describe, expect, it } from "vitest";
import { authorize, type Actor } from "./actors";

const approver: Actor = { kind: "client_person", role: "approver", personId: "ana" };
const substitute: Actor = { kind: "client_person", role: "substitute", personId: "carla" };
const custodian: Actor = { kind: "client_person", role: "custodian", personId: "ana" };
const member: Actor = { kind: "client_person", role: "member", personId: "rui" };
const quality: Actor = { kind: "staff", role: "quality", staffId: "q1" };
const operations: Actor = { kind: "staff", role: "operations", staffId: "o1" };
const support: Actor = { kind: "staff", role: "support", staffId: "bruna" };
const agent: Actor = { kind: "agent", agentId: "estrategista" };
const system: Actor = { kind: "system", job: "reminders" };

describe("hard rule: approvals", () => {
  it("allows the approver and the substitute to approve", () => {
    expect(authorize(approver, "approve_item").ok).toBe(true);
    expect(authorize(substitute, "approve_item").ok).toBe(true);
    expect(authorize(approver, "approve_batch").ok).toBe(true);
    expect(authorize(substitute, "approve_plan").ok).toBe(true);
  });

  it("rejects an agent attempting to approve with a domain error", () => {
    const result = authorize(agent, "approve_item");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("forbidden_actor");
    expect(authorize(agent, "approve_batch").ok).toBe(false);
  });

  it("rejects members, custodians, staff and system for approvals", () => {
    expect(authorize(member, "approve_item").ok).toBe(false);
    expect(authorize(custodian, "approve_item").ok).toBe(false);
    expect(authorize(quality, "approve_item").ok).toBe(false);
    expect(authorize(support, "approve_item").ok).toBe(false);
    expect(authorize(system, "approve_item").ok).toBe(false);
  });
});

describe("actors table", () => {
  it("grants client decisions to approver/substitute only", () => {
    expect(authorize(approver, "confirm_business_fact").ok).toBe(true);
    expect(authorize(substitute, "edit_caption").ok).toBe(true);
    expect(authorize(member, "edit_caption").ok).toBe(false);
    expect(authorize(agent, "confirm_business_fact").ok).toBe(false);
    expect(authorize(approver, "pause_own_publications").ok).toBe(true);
    expect(authorize(support, "pause_own_publications").ok).toBe(false);
  });

  it("grants connections to the custodian", () => {
    expect(authorize(custodian, "connect_account").ok).toBe(true);
    expect(authorize(approver, "connect_account").ok).toBe(false);
    expect(authorize(support, "reconnect_account").ok).toBe(false);
  });

  it("lets any client person comment and report problems", () => {
    expect(authorize(member, "comment").ok).toBe(true);
    expect(authorize(member, "report_problem").ok).toBe(true);
    expect(authorize(approver, "report_problem").ok).toBe(true);
    expect(authorize(agent, "comment").ok).toBe(false);
  });

  it("grants calibration and content decisions to quality", () => {
    expect(authorize(quality, "score_round").ok).toBe(true);
    expect(authorize(quality, "release_front").ok).toBe(true);
    expect(authorize(quality, "mark_critical_failure").ok).toBe(true);
    expect(authorize(support, "release_front").ok).toBe(false);
    expect(authorize(agent, "score_round").ok).toBe(false);
  });

  it("grants technical and safety actions to operations", () => {
    expect(authorize(operations, "suspend_execution").ok).toBe(true);
    expect(authorize(operations, "global_stop").ok).toBe(true);
    expect(authorize(quality, "global_stop").ok).toBe(false);
    expect(authorize(system, "global_stop").ok).toBe(false);
  });

  it("lets quality or the system pause front content on an incident", () => {
    expect(authorize(quality, "pause_front_content").ok).toBe(true);
    expect(authorize(system, "pause_front_content").ok).toBe(true);
    expect(authorize(operations, "pause_front_content").ok).toBe(false);
    expect(authorize(support, "pause_front_content").ok).toBe(false);
    expect(authorize(agent, "pause_front_content").ok).toBe(false);
    expect(authorize(approver, "pause_front_content").ok).toBe(false);
  });

  it("lets the system suspend execution alongside operations", () => {
    expect(authorize(system, "suspend_execution").ok).toBe(true);
    expect(authorize(operations, "suspend_execution").ok).toBe(true);
    expect(authorize(quality, "suspend_execution").ok).toBe(false);
    expect(authorize(agent, "suspend_execution").ok).toBe(false);
  });

  it("restricts connection/delinquency automatic pauses to the system", () => {
    expect(authorize(system, "apply_automatic_pause").ok).toBe(true);
    expect(authorize(operations, "apply_automatic_pause").ok).toBe(false);
    expect(authorize(support, "apply_automatic_pause").ok).toBe(false);
    expect(authorize(quality, "apply_automatic_pause").ok).toBe(false);
    expect(authorize(agent, "apply_automatic_pause").ok).toBe(false);
    expect(authorize(approver, "apply_automatic_pause").ok).toBe(false);
  });

  it("grants exceptions to support, with agents and jobs opening them", () => {
    expect(authorize(support, "assume_exception").ok).toBe(true);
    expect(authorize(support, "upload_for_client").ok).toBe(true);
    expect(authorize(agent, "open_exception").ok).toBe(true);
    expect(authorize(system, "open_auto_exception").ok).toBe(true);
    expect(authorize(agent, "assume_exception").ok).toBe(false);
  });

  it("keeps agents on producing, never deciding", () => {
    expect(authorize(agent, "propose_idea").ok).toBe(true);
    expect(authorize(agent, "create_version").ok).toBe(true);
    expect(authorize(agent, "open_escalation").ok).toBe(true);
    expect(authorize(agent, "dispatch_publication").ok).toBe(false);
    expect(authorize(agent, "release_front").ok).toBe(false);
  });

  it("keeps jobs on reminding, holding and dispatching", () => {
    expect(authorize(system, "remind").ok).toBe(true);
    expect(authorize(system, "hold_item").ok).toBe(true);
    expect(authorize(system, "dispatch_publication").ok).toBe(true);
    expect(authorize(agent, "dispatch_publication").ok).toBe(false);
    expect(authorize(support, "dispatch_publication").ok).toBe(false);
  });
});
