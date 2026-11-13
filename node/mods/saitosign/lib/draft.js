const { canWriteDraft, markCodeReturned } = require('./recovery');

const DB_NAME = 'saitosign';
const STORE = 'draft';
const KEY = 'current';

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available'));
      return;
    }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveDraft(record) {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      const request = store.get(KEY);
      let allowed = false;
      request.onsuccess = () => {
        allowed = canWriteDraft(request.result, record);
        if (allowed) {
          store.put(record, KEY);
        }
      };
      tx.oncomplete = () => resolve(allowed);
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

async function claimDraft(code, writerId) {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      const request = store.get(KEY);
      let result = null;
      request.onsuccess = () => {
        const current = request.result;
        if (!current || current.code !== code) {
          return;
        }
        if (current.handoff?.writerId && current.handoff.writerId !== writerId) {
          return;
        }
        markCodeReturned(current.document, code);
        current.handoff = { code, writerId };
        store.put(current, KEY);
        result = current;
      };
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

async function loadDraft() {
  let db;
  try {
    db = await openDb();
  } catch (err) {
    return null;
  }
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const request = tx.objectStore(STORE).get(KEY);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    return null;
  } finally {
    db.close();
  }
}

async function clearDraft() {
  let db;
  try {
    db = await openDb();
  } catch (err) {
    return;
  }
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      const request = store.get(KEY);
      request.onsuccess = () => {
        if (request.result?.handoff?.writerId) {
          return;
        }
        store.delete(KEY);
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

module.exports = { saveDraft, loadDraft, clearDraft, claimDraft };
