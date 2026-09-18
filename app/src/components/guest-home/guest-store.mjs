import { parseDraft, UUID_PATTERN } from './guest-core.mjs';

const DB_NAME = 'adscale-public-drafts-v1';
const DB_VERSION = 2;
const DRAFTS = 'drafts';
const RECEIPTS = 'importReceipts';
const LAST_KEY = 'adscale:guest:last-draft:v1';
const LEASE_MS = 120_000;
const OPEN_TIMEOUT_MS = 10_000;

let databasePromise;

function sameContext(left, right) {
  return left.userId === right.userId
    && left.workspaceId === right.workspaceId
    && left.clientProfileId === right.clientProfileId;
}

function openDatabase() {
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      databasePromise = undefined;
      reject(new Error('Este navegador não permite guardar referências locais.'));
      return;
    }
    let settled = false;
    const fail = (error) => {
      if (settled) return;
      settled = true;
      databasePromise = undefined;
      reject(error);
    };
    const timer = setTimeout(() => fail(new Error('O armazenamento local demorou a responder. Feche outras abas e tente novamente.')), OPEN_TIMEOUT_MS);
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(DRAFTS)) database.createObjectStore(DRAFTS, { keyPath: 'id' });
      if (!database.objectStoreNames.contains(RECEIPTS)) database.createObjectStore(RECEIPTS, { keyPath: 'guestDraftId' });
    };
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => { database.close(); databasePromise = undefined; };
      if (settled) { database.close(); return; }
      settled = true;
      clearTimeout(timer);
      resolve(database);
    };
    request.onerror = () => { clearTimeout(timer); fail(request.error ?? new Error('Não foi possível abrir o armazenamento local.')); };
    request.onblocked = () => { clearTimeout(timer); fail(new Error('Feche outras abas do Adscale e tente novamente.')); };
  });
  return databasePromise;
}

function transaction(storeNames, mode, action) {
  return openDatabase().then((database) => new Promise((resolve, reject) => {
    const tx = database.transaction(storeNames, mode);
    let request = null;
    let asyncValue;
    tx.oncomplete = () => resolve(request ? request.result : asyncValue);
    tx.onerror = tx.onabort = () => reject(tx.error ?? new Error('Não foi possível guardar o pedido neste navegador.'));
    try {
      const out = action(tx);
      if (out && typeof out.then === 'function') {
        // Async actions must chain IndexedDB requests without yielding to the
        // event loop, so the transaction stays alive until the last request.
        out.then((value) => { asyncValue = value; }, (error) => {
          try { tx.abort(); } catch { /* keep original error */ }
          reject(error);
        });
      } else {
        request = out;
      }
    } catch (error) {
      try { tx.abort(); } catch { /* keep original error */ }
      reject(error);
    }
  }));
}

function requestPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Falha de leitura no armazenamento local.'));
  });
}

export async function saveDraft(draft) {
  if (!parseDraft(draft)) throw new Error('Pedido inválido ou expirado.');
  await transaction([DRAFTS], 'readwrite', (tx) => tx.objectStore(DRAFTS).put(draft));
  // Only an opaque UUID is stored in localStorage, never prompt or file content.
  try { localStorage.setItem(LAST_KEY, draft.id); } catch { /* IndexedDB save succeeded. */ }
}

export async function loadDraft(id) {
  if (!id || !UUID_PATTERN.test(id)) return null;
  const raw = await transaction([DRAFTS], 'readonly', (tx) => requestPromise(tx.objectStore(DRAFTS).get(id)));
  const draft = parseDraft(raw);
  if (raw && !draft) await removeDraft(id);
  return draft;
}

export async function removeDraft(id) {
  if (!UUID_PATTERN.test(id)) return;
  await transaction([DRAFTS], 'readwrite', (tx) => tx.objectStore(DRAFTS).delete(id));
  try { if (localStorage.getItem(LAST_KEY) === id) localStorage.removeItem(LAST_KEY); } catch { /* No redirect or loss of active state. */ }
}

export async function loadLastDraft() {
  let id = null;
  try { id = localStorage.getItem(LAST_KEY); } catch { return null; }
  return loadDraft(id);
}

export async function pruneExpiredDrafts() {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = database.transaction([DRAFTS, RECEIPTS], 'readwrite');
    const now = Date.now();
    const drafts = tx.objectStore(DRAFTS).openCursor();
    drafts.onsuccess = () => {
      const cursor = drafts.result;
      if (cursor) { if (!parseDraft(cursor.value, now)) cursor.delete(); cursor.continue(); }
    };
    const receipts = tx.objectStore(RECEIPTS).openCursor();
    receipts.onsuccess = () => {
      const cursor = receipts.result;
      if (cursor) {
        const receipt = cursor.value;
        if (!receipt || !Number.isFinite(receipt.expiresAt) || receipt.expiresAt <= now) cursor.delete();
        cursor.continue();
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = tx.onabort = () => reject(tx.error ?? new Error('Falha ao limpar pedidos expirados.'));
  });
}

export async function loadImportReceipt(id) {
  if (!id || !UUID_PATTERN.test(id)) return null;
  return transaction([RECEIPTS], 'readonly', (tx) => requestPromise(tx.objectStore(RECEIPTS).get(id)));
}

export async function saveImportReceipt(receipt, expectedRevision) {
  return transaction([RECEIPTS], 'readwrite', async (tx) => {
    const store = tx.objectStore(RECEIPTS);
    const current = await requestPromise(store.get(receipt.guestDraftId));
    const currentRevision = current ? current.revision : 0;
    if (currentRevision !== expectedRevision) throw new Error('Recibo desatualizado. Recarregue o pedido e tente novamente.');
    const next = { ...receipt, revision: expectedRevision + 1 };
    await requestPromise(store.put(next));
    return next;
  });
}

export async function claimImportLease(id, context, owner, now) {
  if (!UUID_PATTERN.test(id)) return { kind: 'unavailable' };
  return transaction([DRAFTS, RECEIPTS], 'readwrite', async (tx) => {
    const drafts = tx.objectStore(DRAFTS);
    const receipts = tx.objectStore(RECEIPTS);
    const raw = await requestPromise(drafts.get(id));
    const draft = parseDraft(raw, now);
    if (!draft) return { kind: 'unavailable' };
    const existing = await requestPromise(receipts.get(id));
    if (existing && !sameContext(existing, context)) return { kind: 'context_mismatch' };
    if (existing && existing.leaseOwner && existing.leaseOwner !== owner && existing.leaseExpiresAt > now) {
      return { kind: 'busy' };
    }
    if (!existing) {
      const receipt = {
        ...context,
        guestDraftId: id,
        workId: null,
        phase: 'claimed',
        references: draft.files.map((_, index) => ({
          fileId: `${id}:${index}`, assetId: null, sourceId: null, state: 'pending',
        })),
        expiresAt: draft.expiresAt,
        revision: 1,
        leaseOwner: owner,
        leaseExpiresAt: now + LEASE_MS,
      };
      await requestPromise(receipts.put(receipt));
      return { kind: 'acquired', receipt };
    }
    const receipt = { ...existing, revision: existing.revision + 1, leaseOwner: owner, leaseExpiresAt: now + LEASE_MS };
    await requestPromise(receipts.put(receipt));
    return { kind: 'acquired', receipt };
  });
}

export async function renewImportLease(id, owner, now) {
  if (!UUID_PATTERN.test(id)) return false;
  return transaction([RECEIPTS], 'readwrite', async (tx) => {
    const store = tx.objectStore(RECEIPTS);
    const existing = await requestPromise(store.get(id));
    if (!existing || existing.leaseOwner !== owner) return false;
    await requestPromise(store.put({ ...existing, leaseExpiresAt: now + LEASE_MS }));
    return true;
  });
}

export async function releaseImportLease(id, owner) {
  if (!UUID_PATTERN.test(id)) return;
  await transaction([RECEIPTS], 'readwrite', async (tx) => {
    const store = tx.objectStore(RECEIPTS);
    const existing = await requestPromise(store.get(id));
    if (!existing || existing.leaseOwner !== owner) return;
    await requestPromise(store.put({ ...existing, leaseOwner: null }));
  });
}
