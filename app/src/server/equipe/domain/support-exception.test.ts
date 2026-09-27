import { describe, expect, it } from "vitest";
import {
  assumeSupportException,
  closeSupportException,
  firstResponseSla,
  openSupportException,
} from "./support-exception";

describe("lifecycle", () => {
  it("opens, assumes, and closes, handing the account back to the AI", () => {
    const opened = openSupportException("stalled_implantation");
    expect(opened.status).toBe("open");
    const assumed = assumeSupportException(opened, "bruna");
    expect(assumed.ok).toBe(true);
    if (!assumed.ok) return;
    expect(assumed.value.state).toEqual({ status: "in_progress", trigger: "stalled_implantation", assignee: "bruna" });
    const closed = closeSupportException(assumed.value.state, "resolved");
    expect(closed.ok).toBe(true);
    if (closed.ok) {
      expect(closed.value.state.status).toBe("closed");
      expect(closed.value.events).toEqual([{ type: "support_exception.closed", reason: "resolved" }]);
    }
  });

  it("closes as unanswered after one in-app and one off-app attempt", () => {
    const assumed = assumeSupportException(openSupportException("repeated_silence"), "bruna");
    if (!assumed.ok) throw new Error("setup failed");
    const closed = closeSupportException(assumed.value.state, "client_no_response");
    expect(closed.ok).toBe(true);
    if (closed.ok) expect(closed.value.events).toEqual([{ type: "support_exception.closed", reason: "client_no_response" }]);
  });

  it("forwards commercial cases instead of resolving them", () => {
    const assumed = assumeSupportException(openSupportException("out_of_contract_request"), "bruna");
    if (!assumed.ok) throw new Error("setup failed");
    const closed = closeSupportException(assumed.value.state, "commercial_forwarded");
    expect(closed.ok).toBe(true);
  });

  it("requires a person to assume before closing", () => {
    const opened = openSupportException("client_requested_person");
    expect(closeSupportException(opened, "resolved").ok).toBe(false);
    const assumed = assumeSupportException(opened, "bruna");
    if (!assumed.ok) throw new Error("setup failed");
    expect(assumeSupportException(assumed.value.state, "bruna").ok).toBe(false);
  });
});

describe("first-response SLA", () => {
  it("answers critical incidents and cancel requests in 2 h", () => {
    expect(firstResponseSla("critical_incident")).toEqual({ hours: 2 });
    expect(firstResponseSla("cancel_request")).toEqual({ hours: 2 });
  });

  it("answers everything else in 1 business day", () => {
    expect(firstResponseSla("stalled_implantation")).toEqual({ businessDays: 1 });
    expect(firstResponseSla("stuck_connection")).toEqual({ businessDays: 1 });
    expect(firstResponseSla("client_requested_person")).toEqual({ businessDays: 1 });
    expect(firstResponseSla("off_app_material")).toEqual({ businessDays: 1 });
  });
});
