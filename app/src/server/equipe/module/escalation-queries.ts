// Fluxo-4 queries (#547): the support exceptions queue, the internal
// cross-account pipeline, and the escalation detail. Plain reads, no
// transactions. The cross-account read lives in the internal repositories
// (a fixed number of queries whatever the number of accounts, ticket 11);
// the account-scoped repositories serve the single-account views.

import type {
  AccountScope,
  EquipeEscalation,
  EquipeEvent,
  EquipeException,
  EquipeItem,
  EquipeMandate,
  EquipePause,
  EquipeRepositories,
  InternalEquipeRepositories,
} from "../data";
import { SUPPORT_EXCEPTION_OPENED_EVENT } from "./exceptions";
import { PAUSE_APPLIED_EVENT } from "./pauses-apply";
import { loadStaffLabelMap, staffLabelOf } from "./staff-labels";
// #584
import { activationBaseOf } from "./plan-mandate";

export type QueuedException = {
  exception: EquipeException;
  slaBreached: boolean;
};

export type ExceptionsQueueView = {
  workspaceId: string;
  accountId: string;
  brandName: string | null;
  workspaceName: string | null;
  open: QueuedException[];
};

/**
 * Open support cases oldest-deadline first, with the first-response SLA
 * breach flag computed against the caller's clock.
 */
export async function getExceptionsQueue(
  repos: EquipeRepositories,
  internal: InternalEquipeRepositories,
  workspaceId: string,
  accountId: string,
  now: Date,
): Promise<ExceptionsQueueView | null> {
  const account = await repos.accounts.get(workspaceId, accountId);
  if (!account) return null;
  // Sequential on purpose: repos may share one transaction client, where
  // parallel queries warn today and break in pg@9 (#574).
  const rows = await repos.exceptions.list({ workspaceId, accountId });
  const labels = await loadStaffLabelMap(internal, [accountId]);
  const open = rows
    .filter((row) => row.status === "open" || row.status === "claimed")
    .map((exception) => ({
      exception,
      slaBreached: exception.dueAt !== null && exception.dueAt < now,
    }))
    .sort((a, b) => {
      const left = a.exception.dueAt?.getTime() ?? Number.POSITIVE_INFINITY;
      const right = b.exception.dueAt?.getTime() ?? Number.POSITIVE_INFINITY;
      return left - right;
    });
  const label = staffLabelOf(labels, workspaceId, accountId);
  return {
    workspaceId,
    accountId,
    brandName: label.brandName,
    workspaceName: label.workspaceName,
    open,
  };
}

// #584 — what the internal account view needs to offer "Propor ativação".
export type CrossAccountMandateSummary = {
  /** Latest approved mandate — the activation candidate, if shadow. */
  approved: { id: string; version: number; shadow: boolean } | null;
  /** Pending activation awaiting the client, if any. */
  activationPending: { id: string; version: number } | null;
};

export type CrossAccountEntry = {
  scope: AccountScope;
  brandName: string | null;
  workspaceName: string | null;
  escalations: EquipeEscalation[];
  exceptions: EquipeException[];
  pauses: EquipePause[];
  mandate: CrossAccountMandateSummary;
};

export type CrossAccountPipelineView = {
  entries: CrossAccountEntry[];
};

const SEVERITY_ORDER: Record<string, number> = {
  critical_cross_account: 0,
  critical: 1,
  high: 2,
  medium: 3,
  low: 4,
};

function bySeverityThenDue(a: EquipeEscalation, b: EquipeEscalation): number {
  const rank = (row: EquipeEscalation): number => SEVERITY_ORDER[row.severity] ?? 5;
  if (rank(a) !== rank(b)) return rank(a) - rank(b);
  const left = a.dueAt?.getTime() ?? Number.POSITIVE_INFINITY;
  const right = b.dueAt?.getTime() ?? Number.POSITIVE_INFINITY;
  return left - right;
}

function scopeKey(scope: AccountScope): string {
  return `${scope.workspaceId}:${scope.accountId}`;
}

/** The rows of one account, in the order the read returned them. */
function groupByScope<T extends AccountScope>(rows: T[]): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const key = scopeKey(row);
    const list = grouped.get(key);
    if (list) list.push(row);
    else grouped.set(key, [row]);
  }
  return grouped;
}

/** #584: the account's mandate state for "Propor ativação". */
function mandateSummaryOf(mandates: EquipeMandate[]): CrossAccountMandateSummary {
  const approved =
    mandates
      .filter((row) => row.status === "approved")
      .sort((a, b) => b.version - a.version)[0] ?? null;
  const activation =
    mandates
      .filter((row) => row.status === "proposed" && activationBaseOf(mandates, row) !== null)
      .sort((a, b) => b.version - a.version)[0] ?? null;
  return {
    approved: approved
      ? { id: approved.id, version: approved.version, shadow: approved.shadow }
      : null,
    activationPending: activation ? { id: activation.id, version: activation.version } : null,
  };
}

/**
 * The internal between-accounts pipeline: open escalations, open exceptions
 * and active pauses per account. Every account that is not `free` is listed
 * (as before); a `free` account only when it has something open — the
 * "Assinar o plano" case opens an exception operations has to see. A free
 * account with nothing open is never read, so the cost of the screen does not
 * grow with the number of sign-ups. The whole read is a fixed number of
 * queries (see `listPipelineRows`). Internal only — callers must be behind
 * the internal-staff guard.
 */
export async function getCrossAccountPipeline(
  internal: InternalEquipeRepositories,
): Promise<CrossAccountPipelineView> {
  const rows = await internal.listPipelineRows();
  const escalations = groupByScope(rows.escalations);
  const exceptions = groupByScope(rows.exceptions);
  const pauses = groupByScope(rows.pauses);
  const mandates = groupByScope(rows.mandates);
  const entries: CrossAccountEntry[] = rows.accounts.map((account) => {
    const scope: AccountScope = { workspaceId: account.workspaceId, accountId: account.id };
    const key = scopeKey(scope);
    return {
      scope,
      brandName: account.brandName,
      workspaceName: account.workspaceName,
      escalations: [...(escalations.get(key) ?? [])].sort(bySeverityThenDue),
      exceptions: exceptions.get(key) ?? [],
      pauses: pauses.get(key) ?? [],
      mandate: mandateSummaryOf(mandates.get(key) ?? []),
    };
  });
  return { entries };
}

export type IsolatedConnectionView = {
  id: string;
  provider: string;
  accountId: string;
  status: string;
};

export type EscalationDetailView = {
  workspaceId: string;
  accountId: string;
  brandName: string | null;
  workspaceName: string | null;
  escalation: EquipeEscalation;
  /** Resolution parts with their current state (two entries after a merge). */
  parts: Array<{ kind: string; resolved: boolean }>;
  item: EquipeItem | null;
  /** Events on the escalation itself, oldest first. */
  events: EquipeEvent[];
  /** Active pauses that cover the escalation's item/front. */
  pauses: EquipePause[];
  /** Support exception auto-opened alongside (critical cases). */
  exception: EquipeException | null;
  /** Connections isolated through this escalation, for the revoke picker. */
  isolatedConnections: IsolatedConnectionView[];
};

/** Connection ids carried by `isolatedConnectionIds` in an event payload. */
function isolatedIdsOf(event: EquipeEvent): string[] {
  const payload = event.payload as { isolatedConnectionIds?: unknown } | null;
  if (!payload || !Array.isArray(payload.isolatedConnectionIds)) return [];
  return payload.isolatedConnectionIds.filter((id): id is string => typeof id === "string");
}

/**
 * Everything quality/operations need on one escalation: parts, the item at
 * risk, the event trail, covering pauses and the linked support case.
 */
export async function getEscalationDetail(
  repos: EquipeRepositories,
  internal: InternalEquipeRepositories,
  workspaceId: string,
  accountId: string,
  escalationId: string,
): Promise<EscalationDetailView | null> {
  const scope = { workspaceId, accountId };
  const escalation = await repos.escalations.get(scope, escalationId);
  if (!escalation) return null;
  const parts = Array.isArray(escalation.parts)
    ? (escalation.parts as Array<{ kind?: unknown; resolved?: unknown }>)
        .filter(
          (part): part is { kind: string; resolved: boolean } =>
            typeof part.kind === "string" && typeof part.resolved === "boolean",
        )
        .map((part) => ({ kind: part.kind, resolved: part.resolved }))
    : [{ kind: escalation.kind, resolved: escalation.status === "resolved" || escalation.status === "closed" }];
  const item = escalation.itemId ? await repos.items.get(scope, escalation.itemId) : null;
  const events = await repos.events.list(scope, { objectType: "escalation", objectId: escalationId });
  const pauses = await repos.pauses.list(scope);
  const exceptions = await repos.exceptions.list(scope);
  const openedEvents = await repos.events.list(scope, { eventType: SUPPORT_EXCEPTION_OPENED_EVENT });
  const pauseEvents = await repos.events.list(scope, { eventType: PAUSE_APPLIED_EVENT });
  const labels = await loadStaffLabelMap(internal, [accountId]);
  const covering = pauses.filter((pause) => {
    if (pause.status !== "active") return false;
    if (pause.scope === "front") {
      if (escalation.frontId) return pause.frontId === escalation.frontId;
      if (item) return pause.frontId === item.frontId;
      return false;
    }
    return true;
  });
  const linkedId = new Set(
    openedEvents
      .filter(
        (event) =>
          (event.payload as { escalationId?: unknown } | null)?.escalationId === escalationId,
      )
      .map((event) => event.objectId)
      .filter((id): id is string => typeof id === "string"),
  );
  const exception = exceptions.find((row) => linkedId.has(row.id)) ?? null;
  // Isolated connections: the escalation.opened event carries them, and so
  // do the pause.applied events of this escalation's suspensions (those live
  // on their pause objects, hence the second scan filtered by escalationId).
  const isolatedIds = new Set<string>();
  for (const event of events) {
    for (const id of isolatedIdsOf(event)) isolatedIds.add(id);
  }
  for (const event of pauseEvents) {
    if ((event.payload as { escalationId?: unknown } | null)?.escalationId !== escalationId) {
      continue;
    }
    for (const id of isolatedIdsOf(event)) isolatedIds.add(id);
  }
  const isolatedConnections: IsolatedConnectionView[] = [];
  for (const id of [...isolatedIds].sort()) {
    const connection = await repos.connections.get(scope, id);
    if (!connection) continue;
    isolatedConnections.push({
      id: connection.id,
      provider: connection.provider,
      accountId: connection.accountId,
      status: connection.status,
    });
  }
  const label = staffLabelOf(labels, workspaceId, accountId);
  return {
    workspaceId,
    accountId,
    brandName: label.brandName,
    workspaceName: label.workspaceName,
    escalation,
    parts,
    item,
    events: [...events].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime()),
    pauses: covering,
    exception,
    isolatedConnections,
  };
}
