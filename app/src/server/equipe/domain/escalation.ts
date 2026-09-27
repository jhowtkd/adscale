// Escalonamento (escalation) machine — content, technical, or security.
// Closing the escalation, resuming the front, and finishing a recalibration
// are separate decisions with separate owners (only the first is modeled
// here). Two escalations on the same item merge into one.

import { err, ok, type Result, type Transition } from "./result";

export type EscalationKind = "content" | "technical" | "security";

export type EscalationSeverity =
  | "normal"
  | "critical"
  | "critical_cross_account"; // Crítica entre contas

export type EscalationStatus =
  | "open"
  | "awaiting_client" // Aguardando cliente
  | "resolved"
  | "closed";

export type EscalationCause =
  | "missing_source" // Fonte ausente
  | "outdated_offer" // Oferta desatualizada
  | "model_error" // Erro de modelo
  | "connection" // Conexão
  | "client_request" // Pedido do cliente
  | "isolation" // Isolamento
  | "other" // Outro
  | "no_client_response"; // Sem resposta do cliente

export type EscalationPart = {
  kind: EscalationKind;
  resolved: boolean;
};

export type EscalationState = {
  status: EscalationStatus;
  severity: EscalationSeverity;
  owner: string;
  /** Set when a merged escalation spans two kinds. */
  coOwner: string | null;
  /** One entry normally; two after a merge. */
  parts: EscalationPart[];
};

export type EscalationEvent =
  | { type: "escalation.opened"; kind: EscalationKind; severity: EscalationSeverity }
  | { type: "escalation.merged"; kinds: EscalationKind[] }
  | { type: "escalation.deferred_to_client"; deadlineNote: string }
  | { type: "escalation.part_resolved"; kind: EscalationKind; resolution: "fix" | "confirm_no_issue" }
  | { type: "escalation.resolved" }
  | { type: "escalation.closed"; cause: EscalationCause };

const SEVERITY_RANK: Record<EscalationSeverity, number> = {
  normal: 0,
  critical: 1,
  critical_cross_account: 2,
};

export function openEscalation(args: {
  kind: EscalationKind;
  severity: EscalationSeverity;
  owner: string;
}): EscalationState {
  return {
    status: "open",
    severity: args.severity,
    owner: args.owner,
    coOwner: null,
    parts: [{ kind: args.kind, resolved: false }],
  };
}

function mustBeIn(state: EscalationState, expected: EscalationStatus[], action: string): Result<void> {
  if (!expected.includes(state.status)) {
    return err("invalid_transition", `cannot ${action} from ${state.status}`);
  }
  return ok(undefined);
}

/** Resolve one part ("corrigir" or "confirmar que não há problema"). */
export function resolveEscalationPart(
  state: EscalationState,
  args: { kind: EscalationKind; resolution: "fix" | "confirm_no_issue" },
): Result<Transition<EscalationState, EscalationEvent>> {
  const gate = mustBeIn(state, ["open", "awaiting_client"], "resolve escalation");
  if (!gate.ok) return gate;
  const parts = state.parts.map((part) =>
    part.kind === args.kind ? { ...part, resolved: true } : part,
  );
  if (parts.every((part) => part.kind !== args.kind)) {
    return err("unknown_part", `escalation has no ${args.kind} part`);
  }
  const events: EscalationEvent[] = [
    { type: "escalation.part_resolved", kind: args.kind, resolution: args.resolution },
  ];
  if (parts.every((part) => part.resolved)) {
    events.push({ type: "escalation.resolved" });
    return ok({ state: { ...state, status: "resolved", parts }, events });
  }
  return ok({ state: { ...state, parts }, events });
}

/**
 * Third resolution exit: bring the decision to the client. The escalation
 * waits up to 2 business days (or the item limit, whichever first) — the
 * caller computes the deadline with the calendar.
 */
export function deferEscalationToClient(
  state: EscalationState,
  deadlineNote: string,
): Result<Transition<EscalationState, EscalationEvent>> {
  const gate = mustBeIn(state, ["open"], "defer escalation to client");
  if (!gate.ok) return gate;
  return ok({
    state: { ...state, status: "awaiting_client" },
    events: [{ type: "escalation.deferred_to_client", deadlineNote }],
  });
}

/** Close with a cause category; merged parts must all be resolved first. */
export function closeEscalation(
  state: EscalationState,
  cause: EscalationCause,
): Result<Transition<EscalationState, EscalationEvent>> {
  const gate = mustBeIn(state, ["resolved"], "close escalation");
  if (!gate.ok) return gate;
  return ok({
    state: { ...state, status: "closed" },
    events: [{ type: "escalation.closed", cause }],
  });
}

/**
 * No client answer in time: the item goes to "não publicar" (handled by the
 * caller on the item machine) and the escalation closes as unanswered.
 */
export function closeEscalationForNoResponse(
  state: EscalationState,
): Result<Transition<EscalationState, EscalationEvent>> {
  const gate = mustBeIn(state, ["awaiting_client"], "close escalation for no response");
  if (!gate.ok) return gate;
  return ok({
    state: { ...state, status: "closed" },
    events: [{ type: "escalation.closed", cause: "no_client_response" }],
  });
}

/**
 * Merge two escalations on the same item: the higher severity leads, and
 * mixed kinds gain a co-owner. The merged escalation resolves only when
 * every part resolves.
 */
export function mergeEscalations(
  first: EscalationState,
  second: EscalationState,
): Result<Transition<EscalationState, EscalationEvent>> {
  for (const [label, escalation] of [["first", first], ["second", second]] as const) {
    if (escalation.status === "closed" || escalation.status === "resolved") {
      return err("invalid_transition", `cannot merge ${label} escalation from ${escalation.status}`);
    }
  }
  const primary = SEVERITY_RANK[first.severity] >= SEVERITY_RANK[second.severity] ? first : second;
  const secondary = primary === first ? second : first;
  const kinds = [...first.parts.map((p) => p.kind), ...second.parts.map((p) => p.kind)];
  const distinctKinds = [...new Set(kinds)];
  const mixedKinds = distinctKinds.length > 1;
  const merged: EscalationState = {
    status: "open",
    severity: primary.severity,
    owner: primary.owner,
    coOwner: mixedKinds ? secondary.owner : primary.coOwner ?? secondary.coOwner,
    parts: distinctKinds.map((kind) => ({ kind, resolved: false })),
  };
  return ok({ state: merged, events: [{ type: "escalation.merged", kinds: distinctKinds }] });
}
