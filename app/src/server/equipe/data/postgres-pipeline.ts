// The staff pipeline's cross-account read (ticket 11). Five queries, whatever the number of accounts: the open rows of
// the platform (partial indexes hold only those), then the accounts they belong to and every account that is not `free`.
// With `*` nearly every account is `free`; a free account with nothing open never shows up here, so the cost of the
// screen follows the work in progress, not the number of sign-ups.

import { and, asc, eq, getTableColumns, or, sql } from "drizzle-orm";
import {
  EQUIPE_ACCOUNT_STATUS,
  EQUIPE_ESCALATION_OPEN_STATUS,
  EQUIPE_EXCEPTION_OPEN_STATUS,
  equipeAccounts,
  equipeEscalations,
  equipeExceptions,
  equipeMandates,
  equipePauses,
  inList,
} from "../../db/equipe-schema";
import { clientProfiles, workspaces } from "../../db/schema";
import type { PostgresEquipeExecutor } from "./postgres";
import type { EquipePipelineRows } from "./types";

/** Every status but `free`: the paid ones and `closed`, which the pipeline has always listed. */
const NOT_FREE_STATUS = EQUIPE_ACCOUNT_STATUS.filter((status) => status !== "free");
const MANDATE_PIPELINE_STATUS = ["approved", "proposed"] as const;

/** One uuid[] parameter: no per-id placeholders, so the size of the list never reaches the protocol's parameter limit. */
function anyUuid(ids: readonly string[]) {
  return sql`any(${sql.param([...ids])}::uuid[])`;
}

export async function listPipelineRows(executor: PostgresEquipeExecutor): Promise<EquipePipelineRows> {
  // Sequential on purpose: the executor may be one transaction client, where parallel queries break in pg@9 (#574).
  // The literals of the status lists are inlined (`inList`), so the planner can prove the partial-index predicates.
  const escalations = await executor.select().from(equipeEscalations)
    .where(inList(equipeEscalations.status, EQUIPE_ESCALATION_OPEN_STATUS))
    .orderBy(asc(equipeEscalations.createdAt), asc(equipeEscalations.id));
  const exceptions = await executor.select().from(equipeExceptions)
    .where(inList(equipeExceptions.status, EQUIPE_EXCEPTION_OPEN_STATUS))
    .orderBy(asc(equipeExceptions.createdAt), asc(equipeExceptions.id));
  const pauses = await executor.select().from(equipePauses)
    .where(sql`${equipePauses.status} = 'active'`)
    .orderBy(asc(equipePauses.createdAt), asc(equipePauses.id));
  // Everything that is open belongs to a "pipeline account": a paid one, or a free one that has something open.
  const openIds = [...new Set([...escalations, ...exceptions, ...pauses].map((row) => row.accountId))];
  const accounts = await executor
    .select({ ...getTableColumns(equipeAccounts), brandName: clientProfiles.name, workspaceName: workspaces.name })
    .from(equipeAccounts)
    .leftJoin(clientProfiles, and(
      eq(clientProfiles.id, equipeAccounts.clientProfileId),
      eq(clientProfiles.workspaceId, equipeAccounts.workspaceId),
    ))
    .leftJoin(workspaces, eq(workspaces.id, equipeAccounts.workspaceId))
    .where(or(inList(equipeAccounts.status, NOT_FREE_STATUS), sql`${equipeAccounts.id} = ${anyUuid(openIds)}`))
    .orderBy(asc(equipeAccounts.createdAt), asc(equipeAccounts.id));
  const mandates = await executor.select().from(equipeMandates)
    .where(and(
      inList(equipeMandates.status, MANDATE_PIPELINE_STATUS),
      sql`${equipeMandates.accountId} = ${anyUuid(accounts.map((account) => account.id))}`,
    ));
  return {
    accounts: accounts.map((row) => ({ ...row, brandName: row.brandName ?? null, workspaceName: row.workspaceName ?? null })),
    escalations,
    exceptions,
    pauses,
    mandates,
  };
}
