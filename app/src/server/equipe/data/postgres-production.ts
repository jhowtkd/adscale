import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  equipeBatches,
  equipeCalibrationRounds,
  equipeCalibrationScores,
  equipeEscalations,
  equipeExceptions,
  equipeItemVersions,
  equipeItems,
  equipePauses,
  equipeReceipts,
} from "../../db/equipe-schema";
import type {
  EquipeBatchRepository,
  EquipeCalibrationRoundRepository,
  EquipeCalibrationScoreRepository,
  EquipeEscalationRepository,
  EquipeExceptionRepository,
  EquipeItemRepository,
  EquipeItemVersionRepository,
  EquipePauseRepository,
  EquipeReceiptRepository,
} from "./repositories";
import {
  makePgAccountRepo,
  makePgAppendRepo,
  pgList,
  type PostgresEquipeExecutor,
} from "./postgres";
import type {
  AccountScope,
  EquipeBatchPatch,
  EquipeCalibrationRoundPatch,
  EquipeEscalationFilter,
  EquipeEscalationPatch,
  EquipeExceptionPatch,
  EquipeItemFilter,
  EquipeItemPatch,
  EquipeItemVersion,
  EquipePausePatch,
  EquipeReceipt,
  NewEquipeBatch,
  NewEquipeCalibrationRound,
  NewEquipeCalibrationScore,
  NewEquipeEscalation,
  NewEquipeException,
  NewEquipeItem,
  NewEquipeItemVersion,
  NewEquipePause,
  NewEquipeReceipt,
} from "./types";

// Repositórios Postgres de produção: lotes, itens, versões, recibos,
// calibração, escalonamentos, exceções e pausas.

export function makePgBatches(executor: PostgresEquipeExecutor): EquipeBatchRepository {
  return makePgAccountRepo<typeof equipeBatches, NewEquipeBatch, EquipeBatchPatch>(
    executor,
    { table: equipeBatches }
  );
}

export function makePgItems(executor: PostgresEquipeExecutor): EquipeItemRepository {
  return makePgAccountRepo<typeof equipeItems, NewEquipeItem, EquipeItemPatch, EquipeItemFilter>(
    executor,
    {
      table: equipeItems,
      buildFilter: (table, filter) => {
        const conditions = [];
        if (filter.status !== undefined) {
          const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
          if (statuses.length === 0) return sql`false`;
          conditions.push(
            statuses.length === 1
              ? eq(table.status, statuses[0] as string)
              : inArray(table.status, statuses as string[])
          );
        }
        if (filter.frontId !== undefined) conditions.push(eq(table.frontId, filter.frontId));
        if (filter.batchId !== undefined) {
          conditions.push(
            filter.batchId === null ? isNull(table.batchId) : eq(table.batchId, filter.batchId)
          );
        }
        if (conditions.length === 0) return undefined;
        return and(...conditions);
      },
    }
  );
}

export function makePgItemVersions(
  executor: PostgresEquipeExecutor
): EquipeItemVersionRepository {
  const base = makePgAppendRepo<typeof equipeItemVersions, NewEquipeItemVersion, { itemId?: string }>(
    executor,
    {
      table: equipeItemVersions,
      buildFilter: (table, filter) =>
        filter.itemId === undefined ? undefined : eq(table.itemId, filter.itemId),
    }
  );
  return {
    ...base,
    async getByHash(
      scope: AccountScope,
      itemId: string,
      versionHash: string
    ): Promise<EquipeItemVersion | null> {
      const rows = await pgList(executor, equipeItemVersions, scope, and(
        eq(equipeItemVersions.itemId, itemId),
        eq(equipeItemVersions.versionHash, versionHash)
      ));
      return rows[0] ?? null;
    },
  };
}

export function makePgReceipts(executor: PostgresEquipeExecutor): EquipeReceiptRepository {
  const base = makePgAppendRepo<typeof equipeReceipts, NewEquipeReceipt>(executor, {
    table: equipeReceipts,
  });
  return {
    ...base,
    async listByObject(
      scope: AccountScope,
      objectType: string,
      objectId: string
    ): Promise<EquipeReceipt[]> {
      return pgList(executor, equipeReceipts, scope, and(
        eq(equipeReceipts.objectType, objectType),
        eq(equipeReceipts.objectId, objectId)
      ));
    },
  };
}

export function makePgCalibrationRounds(
  executor: PostgresEquipeExecutor
): EquipeCalibrationRoundRepository {
  return makePgAccountRepo<
    typeof equipeCalibrationRounds,
    NewEquipeCalibrationRound,
    EquipeCalibrationRoundPatch
  >(executor, { table: equipeCalibrationRounds });
}

export function makePgCalibrationScores(
  executor: PostgresEquipeExecutor
): EquipeCalibrationScoreRepository {
  return makePgAppendRepo<typeof equipeCalibrationScores, NewEquipeCalibrationScore>(
    executor,
    { table: equipeCalibrationScores }
  );
}

export function makePgEscalations(
  executor: PostgresEquipeExecutor
): EquipeEscalationRepository {
  return makePgAccountRepo<
    typeof equipeEscalations,
    NewEquipeEscalation,
    EquipeEscalationPatch,
    EquipeEscalationFilter
  >(executor, {
    table: equipeEscalations,
    buildFilter: (table, filter) =>
      filter.itemId === undefined ? undefined : eq(table.itemId, filter.itemId),
  });
}

export function makePgExceptions(
  executor: PostgresEquipeExecutor
): EquipeExceptionRepository {
  return makePgAccountRepo<typeof equipeExceptions, NewEquipeException, EquipeExceptionPatch>(
    executor,
    { table: equipeExceptions }
  );
}

export function makePgPauses(executor: PostgresEquipeExecutor): EquipePauseRepository {
  return makePgAccountRepo<typeof equipePauses, NewEquipePause, EquipePausePatch>(executor, {
    table: equipePauses,
  });
}
