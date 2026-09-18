import { parseDraft, UUID_PATTERN } from './guest-core.mjs';

/**
 * @typedef {import('../../lib/guest-home/import-contracts').GuestImportReceipt} GuestImportReceipt
 * @typedef {import('../../lib/guest-home/import-contracts').ImportContext} ImportContext
 * @typedef {import('../../lib/guest-home/import-contracts').ReferenceReceipt} ReferenceReceipt
 * @typedef {{ kind: 'acquired', receipt: GuestImportReceipt } | { kind: 'busy' | 'context_mismatch' | 'unavailable' }} ImportLeaseResult
 */

const DB_NAME = 'adscale-public-drafts-v1';
const DRAFTS = 'drafts';
const RECEIPTS = 'importReceipts';
const LAST_KEY = 'adscale:guest:last-draft:v1';

/** Local import lease TTL: 120s, renewed every 30s while an operation runs. */
export const IMPORT_LEASE_TTL_MS = 120_000;

/** @type {Promise<IDBDatabase> | undefined} */
let databasePromise;

function openDatabase() {
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('Este navegador não permite guardar referências locais.')); return; }
    const request = indexedDB.open(DB_NAME, 2);
    request.onupgradeneeded = (event) => {
      const db = request.result;
      if (event.oldVersion < 1) db.createObjectStore(DRAFTS, { keyPath: 'id' });
      // v2 adds receipts while preserving existing drafts untouched.
      if (event.oldVersion < 2 && !db.objectStoreNames.contains(RECEIPTS)) {
        db.createObjectStore(RECEIPTS, { keyPath: 'guestDraftId' });
      }
    };
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => { database.close(); databasePromise = undefined; };
      resolve(database);
    };
    request.onerror = () => { databasePromise = undefined; reject(request.error ?? new Error('Não foi possível abrir o armazenamento local.')); };
    request.onblocked = () => { databasePromise = undefined; reject(new Error('Feche outras abas do Adscale e tente novamente.')); };
  });
  return databasePromise;
}

/**
 * @template T
 * @param {string | string[]} names
 * @param {IDBTransactionMode} mode
 * @param {(stores: IDBObjectStore[]) => Promise<T>} run
 */
async function withTransaction(names, mode, run) {
  const database = await openDatabase();
  const tx = database.transaction(names, mode);
  const stores = (Array.isArray(names) ? names : [names]).map((name) => tx.objectStore(name));
  const pending = run(stores);
  return new Promise((resolve, reject) => {
    const fallback = new Error('Não foi possível guardar o pedido neste navegador.');
    /** @type {{ settled: boolean, value?: T, error?: unknown }} */
    const outcome = { settled: false };
    pending.then(
      (value) => { outcome.settled = true; outcome.value = value; },
      (error) => {
        outcome.settled = true; outcome.error = error;
        try { tx.abort(); } catch { /* Already finished; oncomplete/onabort decides. */ }
      },
    );
    // Confirmation only on transaction completion; the decision error (e.g.
    // a receipt conflict) always wins over the transport fallback.
    tx.oncomplete = () => {
      if (!outcome.settled) { pending.then(resolve, reject); return; }
      if (outcome.error) reject(outcome.error);
      else resolve(outcome.value);
    };
    tx.onerror = tx.onabort = () => {
      if (!outcome.settled) {
        pending.then(
          () => reject(tx.error ?? fallback),
          (error) => reject(error),
        );
        return;
      }
      reject(outcome.error ?? tx.error ?? fallback);
    };
  });
}

/**
 * @template T
 * @param {string} name
 * @param {IDBTransactionMode} mode
 * @param {(store: IDBObjectStore) => IDBRequest<T>} action
 */
async function withStore(name, mode, action) {
  return withTransaction(name, mode, async ([store]) => new Promise((resolve, reject) => {
    const request = action(store);
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error ?? new Error('Falha ao ler o armazenamento local.'));
  }));
}

/**
 * @param {IDBObjectStore} store
 * @param {string} key
 */
function getValue(store, key) {
  return new Promise((resolve, reject) => {
    const request = store.get(key);
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error ?? new Error('Falha ao ler o armazenamento local.'));
  });
}

export async function saveDraft(draft) {
  if (!parseDraft(draft)) throw new Error('Pedido inválido ou expirado.');
  await withStore(DRAFTS, 'readwrite', (store) => store.put(draft));
  // Only an opaque UUID is stored in localStorage, never prompt or file content.
  try { localStorage.setItem(LAST_KEY, draft.id); } catch { /* IndexedDB save succeeded. */ }
}

export async function loadDraft(id) {
  if (!id || !UUID_PATTERN.test(id)) return null;
  const raw = await withStore(DRAFTS, 'readonly', (store) => store.get(id));
  const draft = parseDraft(raw);
  if (raw && !draft) await removeDraft(id);
  return draft;
}

export async function removeDraft(id) {
  if (!UUID_PATTERN.test(id)) return;
  await withStore(DRAFTS, 'readwrite', (store) => store.delete(id));
  try { if (localStorage.getItem(LAST_KEY) === id) localStorage.removeItem(LAST_KEY); } catch { /* No redirect or loss of active state. */ }
}

export async function loadLastDraft() {
  let id = null;
  try { id = localStorage.getItem(LAST_KEY); } catch { return null; }
  return loadDraft(id);
}

export async function pruneExpiredDrafts() {
  await withTransaction(DRAFTS, 'readwrite', async ([store]) => new Promise((resolve, reject) => {
    const request = store.openCursor();
    const fail = (error) => reject(error ?? new Error('Falha ao limpar pedidos expirados.'));
    request.onsuccess = () => {
      try {
        const cursor = request.result;
        if (!cursor) { resolve(); return; }
        if (!parseDraft(cursor.value)) {
          const removal = cursor.delete();
          removal.onerror = () => fail(removal.error);
        }
        cursor.continue();
      } catch (error) { fail(error); }
    };
    request.onerror = () => fail(request.error);
  }));
  await pruneExpiredImportReceipts();
}

// ---------------------------------------------------------------------------
// Import receipts: pure decisions (unit-testable) + single-transaction I/O.
// ---------------------------------------------------------------------------

const RECEIPT_PHASES = new Set(['claimed', 'created', 'transferring', 'partial', 'verified']);
const REFERENCE_STATES = new Set(['pending', 'uploading', 'uploaded', 'attaching', 'attached', 'uncertain']);

/**
 * @param {unknown} entry
 * @returns {ReferenceReceipt | null}
 */
function parseReference(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const raw = /** @type {Record<string, unknown>} */ (entry);
  if (typeof raw.fileId !== 'string' || !raw.fileId) return null;
  if (raw.assetId !== null && typeof raw.assetId !== 'string') return null;
  if (raw.sourceId !== null && typeof raw.sourceId !== 'string') return null;
  if (!REFERENCE_STATES.has(/** @type {string} */ (raw.state))) return null;
  return {
    fileId: raw.fileId,
    assetId: /** @type {string | null} */ (raw.assetId),
    sourceId: /** @type {string | null} */ (raw.sourceId),
    state: /** @type {ReferenceReceipt['state']} */ (raw.state),
  };
}

/**
 * @param {unknown} raw
 * @returns {GuestImportReceipt | null}
 */
export function parseImportReceipt(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const value = /** @type {Record<string, unknown>} */ (raw);
  if (typeof value.guestDraftId !== 'string' || !UUID_PATTERN.test(value.guestDraftId)) return null;
  if (typeof value.userId !== 'string' || !value.userId) return null;
  if (typeof value.workspaceId !== 'string' || !value.workspaceId) return null;
  if (typeof value.clientProfileId !== 'string' || !value.clientProfileId) return null;
  if (typeof value.workId !== 'string' && value.workId !== null) return null;
  if (!RECEIPT_PHASES.has(/** @type {string} */ (value.phase))) return null;
  if (!Array.isArray(value.references)) return null;
  const references = [];
  for (const entry of value.references) {
    const reference = parseReference(entry);
    if (!reference) return null;
    references.push(reference);
  }
  if (typeof value.expiresAt !== 'number' || !Number.isFinite(value.expiresAt)) return null;
  if (!Number.isInteger(value.revision) || /** @type {number} */ (value.revision) < 1) return null;
  if (value.leaseOwner !== null && (typeof value.leaseOwner !== 'string' || !value.leaseOwner)) return null;
  if (typeof value.leaseExpiresAt !== 'number' || !Number.isFinite(value.leaseExpiresAt)) return null;
  return {
    userId: value.userId,
    workspaceId: value.workspaceId,
    clientProfileId: value.clientProfileId,
    guestDraftId: value.guestDraftId,
    workId: /** @type {string | null} */ (value.workId),
    phase: /** @type {GuestImportReceipt['phase']} */ (value.phase),
    references,
    expiresAt: value.expiresAt,
    revision: /** @type {number} */ (value.revision),
    leaseOwner: /** @type {string | null} */ (value.leaseOwner),
    leaseExpiresAt: value.leaseExpiresAt,
  };
}

/**
 * @param {ImportContext} left
 * @param {ImportContext} right
 */
function sameImportContext(left, right) {
  return left.userId === right.userId && left.workspaceId === right.workspaceId
    && left.clientProfileId === right.clientProfileId;
}

/**
 * Pure claim decision. A fresh claim binds the snapshot's ORIGINAL expiry and
 * pending references; another user/workspace/brand never takes an existing
 * receipt; a verified receipt with the same context still allows opening the
 * authorized work. Every acquisition advances the revision so a loser of a
 * lease race fails its next conditional save instead of clobbering.
 * @param {GuestImportReceipt | null} stored
 * @param {{ id: string, expiresAt: number, files: unknown[] } | null} snapshot
 * @param {ImportContext} context
 * @param {string} owner
 * @param {number} now
 * @returns {ImportLeaseResult}
 */
export function planImportClaim(stored, snapshot, context, owner, now) {
  if (!stored && !snapshot) return { kind: 'unavailable' };
  if (stored && !sameImportContext(stored, context)) return { kind: 'context_mismatch' };
  if (stored && stored.leaseOwner && stored.leaseOwner !== owner && stored.leaseExpiresAt > now) {
    return { kind: 'busy' };
  }
  if (!stored && snapshot) {
    return {
      kind: 'acquired',
      receipt: {
        ...context,
        guestDraftId: snapshot.id,
        workId: null,
        phase: 'claimed',
        references: snapshot.files.map((_, index) => ({
          fileId: `${snapshot.id}:${index}`, assetId: null, sourceId: null, state: 'pending',
        })),
        expiresAt: snapshot.expiresAt,
        revision: 1,
        leaseOwner: owner,
        leaseExpiresAt: now + IMPORT_LEASE_TTL_MS,
      },
    };
  }
  return {
    kind: 'acquired',
    receipt: {
      .../** @type {GuestImportReceipt} */ (stored),
      revision: /** @type {GuestImportReceipt} */ (stored).revision + 1,
      leaseOwner: owner,
      leaseExpiresAt: now + IMPORT_LEASE_TTL_MS,
    },
  };
}

/**
 * Pure conditional-save decision. Rejects stale revisions so concurrent tabs
 * cannot overwrite each other.
 * @param {GuestImportReceipt | null} stored
 * @param {GuestImportReceipt} receipt
 * @param {number} expectedRevision
 */
export function planImportSave(stored, receipt, expectedRevision) {
  const current = stored ? stored.revision : 0;
  if (current !== expectedRevision || receipt.revision !== expectedRevision) {
    throw new Error('import_receipt_conflict');
  }
  return { ...receipt, revision: expectedRevision + 1 };
}

/**
 * Pure lease-renewal decision. A heartbeat, not a state transition: the
 * revision is untouched so in-flight conditional saves keep working.
 * @param {GuestImportReceipt | null} stored
 * @param {string} owner
 * @param {number} now
 */
export function planLeaseRenewal(stored, owner, now) {
  if (!stored || stored.leaseOwner !== owner) return null;
  return { ...stored, leaseExpiresAt: now + IMPORT_LEASE_TTL_MS };
}

/**
 * Pure lease-release decision. Only the holder releases.
 * @param {GuestImportReceipt | null} stored
 * @param {string} owner
 */
export function planLeaseRelease(stored, owner) {
  if (!stored || stored.leaseOwner !== owner) return null;
  return { ...stored, leaseOwner: null, leaseExpiresAt: 0 };
}

/** @param {string} id */
export async function loadImportReceipt(id) {
  if (!UUID_PATTERN.test(id)) return null;
  const raw = await withStore(RECEIPTS, 'readonly', (store) => store.get(id));
  return parseImportReceipt(raw);
}

/**
 * Conditional write: persists only when the stored revision matches
 * `expectedRevision`. Returns the advanced receipt; rejects with
 * `import_receipt_conflict` on concurrent modification.
 * @param {GuestImportReceipt} receipt
 * @param {number} expectedRevision
 */
export async function saveImportReceipt(receipt, expectedRevision) {
  const clean = parseImportReceipt(receipt);
  if (!clean) throw new Error('Recibo de importação inválido.');
  return withTransaction(RECEIPTS, 'readwrite', async ([store]) => {
    const stored = parseImportReceipt(await getValue(store, clean.guestDraftId));
    const advanced = planImportSave(stored, clean, expectedRevision);
    await new Promise((resolve, reject) => {
      const put = store.put(advanced);
      put.onsuccess = () => resolve();
      put.onerror = () => reject(put.error ?? new Error('Não foi possível guardar o recibo de importação.'));
    });
    return advanced;
  });
}

/**
 * Claims the import lease and binds the receipt to `context` in a single
 * readwrite transaction over snapshots + receipts. No network inside.
 * @param {string} id
 * @param {ImportContext} context
 * @param {string} owner
 * @param {number} now
 * @returns {Promise<ImportLeaseResult>}
 */
export async function claimImportLease(id, context, owner, now) {
  if (!UUID_PATTERN.test(id) || !owner) return { kind: 'unavailable' };
  return withTransaction([DRAFTS, RECEIPTS], 'readwrite', async ([drafts, receipts]) => {
    const snapshot = parseDraft(await getValue(drafts, id), now);
    const stored = parseImportReceipt(await getValue(receipts, id));
    const decision = planImportClaim(stored, snapshot, context, owner, now);
    if (decision.kind !== 'acquired') return decision;
    await new Promise((resolve, reject) => {
      const put = receipts.put(decision.receipt);
      put.onsuccess = () => resolve();
      put.onerror = () => reject(put.error ?? new Error('Não foi possível reservar a importação.'));
    });
    return decision;
  });
}

/**
 * @param {string} id
 * @param {string} owner
 * @param {number} now
 */
export async function renewImportLease(id, owner, now) {
  if (!UUID_PATTERN.test(id) || !owner) return false;
  return withTransaction(RECEIPTS, 'readwrite', async ([store]) => {
    const renewed = planLeaseRenewal(parseImportReceipt(await getValue(store, id)), owner, now);
    if (!renewed) return false;
    await new Promise((resolve, reject) => {
      const put = store.put(renewed);
      put.onsuccess = () => resolve();
      put.onerror = () => reject(put.error ?? new Error('Não foi possível renovar a importação.'));
    });
    return true;
  });
}

/**
 * @param {string} id
 * @param {string} owner
 */
export async function releaseImportLease(id, owner) {
  if (!UUID_PATTERN.test(id) || !owner) return;
  await withTransaction(RECEIPTS, 'readwrite', async ([store]) => {
    const released = planLeaseRelease(parseImportReceipt(await getValue(store, id)), owner);
    if (!released) return;
    await new Promise((resolve, reject) => {
      const put = store.put(released);
      put.onsuccess = () => resolve();
      put.onerror = () => reject(put.error ?? new Error('Não foi possível liberar a importação.'));
    });
  });
}

/**
 * Removes import receipts whose draft validity already expired. Runs with
 * draft pruning; never extends the original TTL.
 * @param {number} [now]
 */
export async function pruneExpiredImportReceipts(now = Date.now()) {
  await withTransaction(RECEIPTS, 'readwrite', async ([store]) => new Promise((resolve, reject) => {
    const request = store.openCursor();
    const fail = (error) => reject(error ?? new Error('Falha ao limpar recibos de importação.'));
    request.onsuccess = () => {
      try {
        const cursor = request.result;
        if (!cursor) { resolve(); return; }
        const receipt = parseImportReceipt(cursor.value);
        if (!receipt || receipt.expiresAt <= now) {
          const removal = cursor.delete();
          removal.onerror = () => fail(removal.error);
        }
        cursor.continue();
      } catch (error) { fail(error); }
    };
    request.onerror = () => fail(request.error);
  }));
}
