// Pausa (pause) — three stackable levels; the most restrictive wins and the
// front/account only resumes when every pause is lifted. Who may resume
// depends on the origin ("Pausas e retomadas").

import { err, ok, type Result } from "./result";
import { actorId, type Actor } from "./actors";

export type PauseLevel =
  | "publication" // Pausa de publicação
  | "execution" // Suspensão de execução
  | "delinquency"; // Suspensão por inadimplência

export type PauseOrigin =
  | "client" // Client button: approver/substitute pauses own account
  | "team" // Support/operations staff in an exception
  | "content_incident" // Front paused by content incident
  | "connection" // Connection down (automatic)
  | "global_stop" // Global publication stop
  | "security" // Security or cross-account incident
  | "delinquency"; // Delinquency (automatic, per contract)

export type Pause = {
  id: string;
  level: PauseLevel;
  origin: PauseOrigin;
  scope: "account" | "front";
  /** Front id when scope is "front", null for account scope. */
  scopeId: string | null;
  /** Actor id that paused (person, staff, or job name). */
  pausedBy: string;
  pausedAt: Date;
};

/** Restrictiveness rank: execution stops the most, publication the least. */
const LEVEL_RANK: Record<PauseLevel, number> = {
  publication: 0,
  delinquency: 1,
  execution: 2,
};

const ORIGIN_LEVEL: Record<PauseOrigin, PauseLevel> = {
  client: "publication",
  team: "publication",
  content_incident: "publication",
  connection: "publication",
  global_stop: "publication",
  security: "execution",
  delinquency: "delinquency",
};

export function createPause(args: {
  id: string;
  origin: PauseOrigin;
  scope: "account" | "front";
  scopeId?: string;
  pausedBy: string;
  pausedAt: Date;
}): Pause {
  return {
    id: args.id,
    level: ORIGIN_LEVEL[args.origin],
    origin: args.origin,
    scope: args.scope,
    scopeId: args.scope === "front" ? (args.scopeId ?? null) : null,
    pausedBy: args.pausedBy,
    pausedAt: args.pausedAt,
  };
}

/** Stack a pause; duplicate ids are rejected. */
export function applyPause(pauses: Pause[], pause: Pause): Result<Pause[]> {
  if (pauses.some((p) => p.id === pause.id)) {
    return err("duplicate_pause", `pause ${pause.id} is already applied`);
  }
  return ok([...pauses, pause]);
}

/** Effective level: the most restrictive of the stacked pauses, if any. */
export function effectivePauseLevel(pauses: Pause[]): PauseLevel | null {
  let best: PauseLevel | null = null;
  for (const pause of pauses) {
    if (best === null || LEVEL_RANK[pause.level] > LEVEL_RANK[best]) {
      best = pause.level;
    }
  }
  return best;
}

/** Whether this actor may lift this pause (depends on its origin). */
export function canResumePause(pause: Pause, actor: Actor): Result<void> {
  switch (pause.origin) {
    case "client":
      // Only the client resumes their own pause.
      if (actor.kind === "client_person" && (actor.role === "approver" || actor.role === "substitute")) {
        return ok(undefined);
      }
      return err("forbidden_actor", "only the client approver or substitute resumes a client pause");
    case "team":
      // The same person resumes, after talking to the client.
      if (actor.kind === "staff" && actorId(actor) === pause.pausedBy) {
        return ok(undefined);
      }
      return err("forbidden_actor", "only the staff member who paused resumes a team pause");
    case "content_incident":
      if (actor.kind === "staff" && actor.role === "quality") {
        return ok(undefined);
      }
      return err("forbidden_actor", "only quality resumes a content-incident pause");
    case "connection":
      // Automatic, after a verified reconnection.
      if (actor.kind === "system") return ok(undefined);
      return err("forbidden_actor", "a connection pause resumes automatically after reconnection");
    case "global_stop":
      if (actor.kind === "staff" && actor.role === "operations") {
        return ok(undefined);
      }
      return err("forbidden_actor", "only authorized operations resumes the global stop");
    case "security":
      // After root cause and the isolation test (checked by the caller).
      if (actor.kind === "staff" && actor.role === "operations") {
        return ok(undefined);
      }
      return err("forbidden_actor", "only operations resumes a security suspension");
    case "delinquency":
      // Automatic on regularization.
      if (actor.kind === "system") return ok(undefined);
      return err("forbidden_actor", "a delinquency suspension resumes automatically on regularization");
  }
}

/** Lift one pause; the scope stays paused while others remain stacked. */
export function resumePause(pauses: Pause[], pauseId: string, actor: Actor): Result<Pause[]> {
  const pause = pauses.find((p) => p.id === pauseId);
  if (!pause) {
    return err("unknown_pause", `no pause ${pauseId} is applied`);
  }
  const allowed = canResumePause(pause, actor);
  if (!allowed.ok) return allowed;
  return ok(pauses.filter((p) => p.id !== pauseId));
}
