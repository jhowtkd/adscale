import { describe, expect, it } from "vitest";
import {
  closeEscalation,
  closeEscalationForNoResponse,
  deferEscalationToClient,
  mergeEscalations,
  openEscalation,
  resolveEscalationPart,
} from "./escalation";

describe("resolution exits", () => {
  it("resolves by fix and closes with a cause", () => {
    const opened = openEscalation({ kind: "content", severity: "normal", owner: "q1" });
    const resolved = resolveEscalationPart(opened, { kind: "content", resolution: "fix" });
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.value.state.status).toBe("resolved");
    const closed = closeEscalation(resolved.value.state, "missing_source");
    expect(closed.ok).toBe(true);
    if (closed.ok) {
      expect(closed.value.state.status).toBe("closed");
      expect(closed.value.events).toEqual([{ type: "escalation.closed", cause: "missing_source" }]);
    }
  });

  it("resolves by confirming there is no problem", () => {
    const opened = openEscalation({ kind: "technical", severity: "normal", owner: "o1" });
    const resolved = resolveEscalationPart(opened, { kind: "technical", resolution: "confirm_no_issue" });
    expect(resolved.ok).toBe(true);
    if (resolved.ok) expect(resolved.value.state.status).toBe("resolved");
  });
});

describe("awaiting the client", () => {
  it("defers to the client, then resolves on answer", () => {
    const opened = openEscalation({ kind: "content", severity: "normal", owner: "q1" });
    const waiting = deferEscalationToClient(opened, "2 business days or the item limit");
    expect(waiting.ok).toBe(true);
    if (!waiting.ok) return;
    expect(waiting.value.state.status).toBe("awaiting_client");
    const resolved = resolveEscalationPart(waiting.value.state, { kind: "content", resolution: "fix" });
    expect(resolved.ok).toBe(true);
    if (resolved.ok) expect(resolved.value.state.status).toBe("resolved");
  });

  it("closes as unanswered when the client stays silent", () => {
    const opened = openEscalation({ kind: "content", severity: "normal", owner: "q1" });
    const waiting = deferEscalationToClient(opened, "2 business days or the item limit");
    if (!waiting.ok) throw new Error("setup failed");
    const closed = closeEscalationForNoResponse(waiting.value.state);
    expect(closed.ok).toBe(true);
    if (closed.ok) {
      expect(closed.value.state.status).toBe("closed");
      expect(closed.value.events).toEqual([{ type: "escalation.closed", cause: "no_client_response" }]);
    }
  });

  it("cannot close an open escalation without resolving first", () => {
    const opened = openEscalation({ kind: "content", severity: "normal", owner: "q1" });
    expect(closeEscalation(opened, "other").ok).toBe(false);
  });
});

describe("merging two escalations on the same item", () => {
  it("keeps the higher severity owner and adds a co-owner for mixed kinds", () => {
    const technical = openEscalation({ kind: "technical", severity: "normal", owner: "o1" });
    const content = openEscalation({ kind: "content", severity: "critical", owner: "q1" });
    const merged = mergeEscalations(technical, content);
    expect(merged.ok).toBe(true);
    if (!merged.ok) return;
    expect(merged.value.state.severity).toBe("critical");
    expect(merged.value.state.owner).toBe("q1");
    expect(merged.value.state.coOwner).toBe("o1");
  });

  it("closes only when every part resolves", () => {
    const technical = openEscalation({ kind: "technical", severity: "normal", owner: "o1" });
    const content = openEscalation({ kind: "content", severity: "normal", owner: "q1" });
    const merged = mergeEscalations(technical, content);
    if (!merged.ok) throw new Error("setup failed");
    const oneDown = resolveEscalationPart(merged.value.state, { kind: "content", resolution: "fix" });
    expect(oneDown.ok).toBe(true);
    if (!oneDown.ok) return;
    expect(oneDown.value.state.status).toBe("open");
    const bothDown = resolveEscalationPart(oneDown.value.state, { kind: "technical", resolution: "fix" });
    expect(bothDown.ok).toBe(true);
    if (bothDown.ok) {
      expect(bothDown.value.state.status).toBe("resolved");
      expect(closeEscalation(bothDown.value.state, "connection").ok).toBe(true);
    }
  });

  it("refuses to merge closed escalations", () => {
    const first = openEscalation({ kind: "content", severity: "normal", owner: "q1" });
    const resolved = resolveEscalationPart(first, { kind: "content", resolution: "fix" });
    if (!resolved.ok) throw new Error("setup failed");
    const second = openEscalation({ kind: "technical", severity: "normal", owner: "o1" });
    expect(mergeEscalations(resolved.value.state, second).ok).toBe(false);
  });
});
