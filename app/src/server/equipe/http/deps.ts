// Production dependencies for the /api/equipe routes (#552): postgres unit
// of work, system clock and the workspace-scoped live gateway. Route tests
// mock this factory (see module/testing) and run the real module in memory.

import { db } from "@/server/db";
import { systemClock } from "../domain";
import { createPostgresEquipeUnitOfWork } from "../data/postgres";
import { LiveAdscaleGateway } from "../agents/gateway";
import type { EquipeModuleDeps } from "../module/ports";

/**
 * Module deps for one request. Reads never touch the gateway, so staff
 * reads (cross-workspace by design) omit the scope — and a gateway built
 * with "" refuses every lookup instead of reading another workspace.
 */
export function createEquipeRouteDeps(workspaceId?: string): EquipeModuleDeps {
  return {
    uow: createPostgresEquipeUnitOfWork(db),
    clock: systemClock(),
    gateway: new LiveAdscaleGateway(workspaceId ?? ""),
  };
}
