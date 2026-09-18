import { parseDraft, UUID_PATTERN } from './guest-core.mjs';
const DB_NAME = 'adscale-public-drafts-v1';
const STORE = 'drafts';
const LAST_KEY = 'adscale:guest:last-draft:v1';
let databasePromise;
function openDatabase() {
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('Este navegador não permite guardar referências locais.')); return; }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'id' });
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
async function transaction(mode, action) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORE, mode);
    const request = action(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(request.result);
    tx.onerror = tx.onabort = () => reject(tx.error ?? request.error ?? new Error('Não foi possível guardar o pedido neste navegador.'));
  });
}
export async function saveDraft(draft) {
  if (!parseDraft(draft)) throw new Error('Pedido inválido ou expirado.');
  await transaction('readwrite', (store) => store.put(draft));
  // Only an opaque UUID is stored in localStorage, never prompt or file content.
  try { localStorage.setItem(LAST_KEY, draft.id); } catch { /* IndexedDB save succeeded. */ }
}
export async function loadDraft(id) {
  if (!id || !UUID_PATTERN.test(id)) return null;
  const raw = await transaction('readonly', (store) => store.get(id));
  const draft = parseDraft(raw);
  if (raw && !draft) await removeDraft(id);
  return draft;
}
export async function removeDraft(id) {
  if (!UUID_PATTERN.test(id)) return;
  await transaction('readwrite', (store) => store.delete(id));
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
    const tx = database.transaction(STORE, 'readwrite');
    const request = tx.objectStore(STORE).openCursor();
    request.onsuccess = () => { const cursor = request.result; if (!cursor) return; if (!parseDraft(cursor.value)) cursor.delete(); cursor.continue(); };
    tx.oncomplete = () => resolve();
    tx.onerror = tx.onabort = () => reject(tx.error ?? new Error('Falha ao limpar pedidos expirados.'));
  });
}
