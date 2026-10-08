// Shared job-layer assembly for the Equipe durable jobs (#549).
//
// Every job is a thin adapter: it enumerates the paid accounts, calls module
// commands as actor system, and isolates per-object failures so one bad row
// never blocks the sweep. All decisions live in the module; this file only
// wires dependencies (Postgres unit of work, live gateway, live publisher).

import { db } from "@/server/db";
import { workspaceHasActivePaidAccess } from "@/server/billing/access";
import { creativeWorkOutputs } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import { objectStorage } from "@/server/storage";
import { logger } from "@/lib/logger";
import { systemClock, type Actor, type Clock } from "../domain";
import type {
  AccountScope,
  EquipeAccount,
  EquipeAccountStatus,
  EquipeUnitOfWork,
} from "../data";
import { EQUIPE_PAID_ACCOUNT_STATUS } from "../data/types";
import { createPostgresEquipeUnitOfWork } from "../data/postgres";
import { executeCommand } from "../module/commands";
import type { CommandType } from "../module/envelope";
import type { EquipeModuleDeps, Publisher } from "../module/ports";
import { LiveAdscaleGateway } from "../agents/gateway";
import { InstagramPublisher } from "../publishing/publisher";
import { loadInstagramAuth } from "../publishing/auth";

/** Paid account states only: free accounts never enter the paid sweeps (the same list the global stop reads). */
export const EQUIPE_JOB_ACCOUNT_STATUSES: readonly EquipeAccountStatus[] = EQUIPE_PAID_ACCOUNT_STATUS;

export function systemJobActor(job: string): Actor {
  return { kind: "system", job };
}

export type EquipeJobDeps = {
  uow: EquipeUnitOfWork;
  clock: Clock;
  gatewayFor: (workspaceId: string) => EquipeModuleDeps["gateway"];
  publisher?: Publisher;
  /**
   * Publication kill-switch override. Defaults to the env-based
   * `isEquipePublishEnabled`; tests inject a stub.
   */
  isPublishEnabled?: () => boolean;
  /**
   * Whether the workspace pays for the classic product (spec 2026-10-07 §3): the free plan's limits follow it. Production
   * wires `workspaceHasActivePaidAccess`; tests leave it out, which reads as not paid.
   */
  hasClassicPaidAccess?: (workspaceId: string) => Promise<boolean>;
};

async function resolveOutputMediaUrl(outputId: string): Promise<string> {
  const rows = await db
    .select({ outputKey: creativeWorkOutputs.outputKey })
    .from(creativeWorkOutputs)
    .where(eq(creativeWorkOutputs.id, outputId))
    .limit(1);
  const key = rows[0]?.outputKey;
  if (!key) throw new Error(`output ${outputId} has no stored media`);
  // Instagram fetches the image itself, so the container step needs the
  // public URL, not a signed download.
  return objectStorage.publicUrl(key);
}

function createLivePublisher(uow: EquipeUnitOfWork): Publisher {
  return new InstagramPublisher({
    loadAuth: async ({ workspaceId, accountId }) => {
      const auth = await loadInstagramAuth(uow.repos, { workspaceId, accountId });
      return { accessToken: auth.accessToken, igUserId: auth.igUserId };
    },
    resolveMediaUrl: resolveOutputMediaUrl,
  });
}

/** Production dependencies: Postgres, system clock, live gateway/publisher. */
export function createProdJobDeps(): EquipeJobDeps {
  const uow = createPostgresEquipeUnitOfWork(db);
  return {
    uow,
    clock: systemClock(),
    gatewayFor: (workspaceId) => new LiveAdscaleGateway(workspaceId),
    publisher: createLivePublisher(uow),
    hasClassicPaidAccess: (workspaceId) => workspaceHasActivePaidAccess(workspaceId),
  };
}

/** Module deps for one account: the gateway is scoped per workspace. */
export function moduleDepsFor(deps: EquipeJobDeps, workspaceId: string): EquipeModuleDeps {
  return {
    uow: deps.uow,
    clock: deps.clock,
    gateway: deps.gatewayFor(workspaceId),
    publisher: deps.publisher,
    ...(deps.isPublishEnabled ? { isPublishEnabled: deps.isPublishEnabled } : {}),
    ...(deps.hasClassicPaidAccess ? { hasClassicPaidAccess: deps.hasClassicPaidAccess } : {}),
  };
}

/** Paid accounts for the sweeps. */
export async function listEnabledAccounts(
  deps: EquipeJobDeps,
): Promise<Array<{ workspaceId: string; accountId: string; status: string }>> {
  const found: EquipeAccount[] = [];
  for (const status of EQUIPE_JOB_ACCOUNT_STATUSES) {
    found.push(...(await deps.uow.internal.listAccountsByStatus(status)));
  }
  return found.map((account) => ({
    workspaceId: account.workspaceId,
    accountId: account.id,
    status: account.status,
  }));
}

export type AccountCommandOutcome =
  | { accountId: string; ok: true; data: Record<string, unknown> }
  | { accountId: string; ok: false; code: string; message: string };

/**
 * Run one command for every paid account, isolating failures: a
 * throwing/erroring account is reported, never aborts the sweep.
 */
export async function forEachEnabledAccount(
  jobId: string,
  deps: EquipeJobDeps,
  command: { type: CommandType; payload: Record<string, unknown> },
): Promise<{ accounts: number; outcomes: AccountCommandOutcome[] }> {
  const accounts = await listEnabledAccounts(deps);
  const outcomes: AccountCommandOutcome[] = [];
  for (const account of accounts) {
    const scope: AccountScope = { workspaceId: account.workspaceId, accountId: account.accountId };
    try {
      const outcome = await executeCommand(
        moduleDepsFor(deps, account.workspaceId),
        { actor: systemJobActor(jobId), ...scope },
        command,
      );
      if (!outcome.ok) {
        logger.error(`[${jobId}] command failed for account`, {
          ...scope,
          code: outcome.error.code,
        });
        outcomes.push({
          accountId: account.accountId,
          ok: false,
          code: outcome.error.code,
          message: outcome.error.message,
        });
        continue;
      }
      outcomes.push({ accountId: account.accountId, ok: true, data: outcome.value.data });
    } catch (error) {
      logger.error(`[${jobId}] command threw for account`, {
        ...scope,
        error: error instanceof Error ? error.message : "unknown",
      });
      outcomes.push({
        accountId: account.accountId,
        ok: false,
        code: "threw",
        message: error instanceof Error ? error.message : "unknown",
      });
    }
  }
  return { accounts: accounts.length, outcomes };
}

export type JobStep = {
  run: <T>(name: string, fn: () => Promise<T>) => Promise<T>;
};
