// The staff pipeline's cross-account read, in memory (ticket 11): the same rows as postgres-pipeline.ts — every account
// that is not `free`, plus the free ones with something open, and the open rows of those accounts. Accounts keep the
// order they were created in.

import {
  EQUIPE_ESCALATION_OPEN_STATUS,
  EQUIPE_EXCEPTION_OPEN_STATUS,
} from "../../db/equipe-schema";
import { copy, type MemoryEquipeStore } from "./memory-core";
import { memoryAccountLabel } from "./memory-dispatch";
import type { EquipePipelineRows } from "./types";

const OPEN_ESCALATION = new Set<string>(EQUIPE_ESCALATION_OPEN_STATUS);
const OPEN_EXCEPTION = new Set<string>(EQUIPE_EXCEPTION_OPEN_STATUS);
const MANDATE_PIPELINE_STATUS = new Set<string>(["approved", "proposed"]);

export async function listMemoryPipelineRows(store: MemoryEquipeStore): Promise<EquipePipelineRows> {
  const escalations = [...store.escalations.rows.values()].filter((row) => OPEN_ESCALATION.has(row.status));
  const exceptions = [...store.exceptions.rows.values()].filter((row) => OPEN_EXCEPTION.has(row.status));
  const pauses = [...store.pauses.rows.values()].filter((row) => row.status === "active");
  const open = new Set([...escalations, ...exceptions, ...pauses].map((row) => row.accountId));
  const accounts = [...store.accounts.rows.values()]
    .filter((account) => account.status !== "free" || open.has(account.id))
    .map((account) => {
      const { brandName, workspaceName } = memoryAccountLabel(store, account);
      return { ...copy(account), brandName, workspaceName };
    });
  const listed = new Set(accounts.map((account) => account.id));
  return {
    accounts,
    escalations: escalations.map(copy),
    exceptions: exceptions.map(copy),
    pauses: pauses.map(copy),
    mandates: [...store.mandates.rows.values()]
      .filter((row) => MANDATE_PIPELINE_STATUS.has(row.status) && listed.has(row.accountId))
      .map(copy),
  };
}
