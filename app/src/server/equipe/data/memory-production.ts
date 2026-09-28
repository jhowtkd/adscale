import type {
  EquipeItemVersionRepository,
  EquipeReceiptRepository,
  EquipeRepositories,
} from "./repositories";
import {
  asList,
  buildRow,
  checkFields,
  copy,
  inScope,
  makeMemoryAccountRepo,
  makeMemoryAppendRepo,
  type MemoryEquipeStore,
} from "./memory-core";
import {
  equipeActorTypeSchema,
  equipeBatchStatusSchema,
  equipeItemStatusSchema,
  type EquipeItem,
  type EquipeItemFilter,
  type EquipeItemVersion,
  type EquipeReceipt,
  type NewEquipeItemVersion,
  type NewEquipeReceipt,
} from "./types";

// Agregado produção em memória: lotes, itens e os dois registros imutáveis
// (versões e recibos — sem update/delete por interface).

export type MemoryProductionRepositories = Pick<
  EquipeRepositories,
  "batches" | "items" | "itemVersions" | "receipts"
>;

function filterItems(rows: EquipeItem[], filter: EquipeItemFilter): EquipeItem[] {
  const statuses = asList(filter.status);
  if (statuses !== undefined && statuses.length === 0) return [];
  return rows.filter(
    (row) =>
      (statuses === undefined || (statuses as string[]).includes(row.status)) &&
      (filter.frontId === undefined || row.frontId === filter.frontId) &&
      (filter.batchId === undefined || row.batchId === filter.batchId)
  );
}

export function makeMemoryProductionRepositories(
  store: MemoryEquipeStore
): MemoryProductionRepositories {
  const itemVersionsBase = makeMemoryAppendRepo<
    EquipeItemVersion,
    NewEquipeItemVersion & Record<string, unknown>,
    { itemId?: string }
  >({
    table: store.itemVersions,
    build: (scope, input) =>
      buildRow(
        scope,
        input,
        {
          caption: "",
          creativeWorkOutputId: null,
          scheduledFor: null,
          authorId: null,
          reviewerFindings: null,
        },
        "created"
      ),
    uniques: [(row) => `${row.itemId}:${row.versionHash}`],
    filter: (rows, filter) =>
      filter.itemId === undefined ? rows : rows.filter((row) => row.itemId === filter.itemId),
  });
  const itemVersions: EquipeItemVersionRepository = {
    ...itemVersionsBase,
    async getByHash(scope, itemId, versionHash) {
      const found = [...store.itemVersions.rows.values()].find(
        (row) => inScope(row, scope) && row.itemId === itemId && row.versionHash === versionHash
      );
      return found ? copy(found) : null;
    },
  };

  const receiptsBase = makeMemoryAppendRepo<
    EquipeReceipt,
    NewEquipeReceipt & Record<string, unknown>
  >({
    table: store.receipts,
    build: (scope, input) =>
      buildRow(
        scope,
        input,
        { personId: null, personRole: null, objectVersion: null, detail: null },
        "created"
      ),
    validateCreate: checkFields({ personKind: equipeActorTypeSchema }, ["personKind"]),
  });
  const receipts: EquipeReceiptRepository = {
    ...receiptsBase,
    async listByObject(scope, objectType, objectId) {
      return [...store.receipts.rows.values()]
        .filter(
          (row) =>
            inScope(row, scope) && row.objectType === objectType && row.objectId === objectId
        )
        .map(copy);
    },
  };

  return {
    batches: makeMemoryAccountRepo({
      table: store.batches,
      build: (scope, input) =>
        buildRow(
          scope,
          input,
          { status: "open", frontId: null, approveByAt: null, deliveredAt: null },
          "full"
        ),
      validateCreate: checkFields({ status: equipeBatchStatusSchema }),
      validatePatch: checkFields({ status: equipeBatchStatusSchema }),
    }),
    items: makeMemoryAccountRepo({
      table: store.items,
      build: (scope, input) =>
        buildRow(
          scope,
          input,
          {
            status: "draft",
            batchId: null,
            creativeWorkId: null,
            scheduledFor: null,
            deadlineAt: null,
            currentVersionHash: null,
            publishedOutputId: null,
          },
          "full"
        ),
      validateCreate: checkFields({ status: equipeItemStatusSchema }),
      validatePatch: checkFields({ status: equipeItemStatusSchema }),
      filter: filterItems,
    }),
    itemVersions,
    receipts,
  };
}
