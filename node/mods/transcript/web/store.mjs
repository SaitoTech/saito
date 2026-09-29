export function timestamp(milliseconds) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  return [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60]
    .map((part) => String(part).padStart(2, '0'))
    .join(':');
}

export function transcriptText(session, entries) {
  const lines = [...entries]
    .sort((a, b) => a.start - b.start || a.id - b.id)
    .map((entry) => `[${timestamp(entry.start)}] ${entry.speaker}: ${entry.text}`);
  return [
    'Saito Talk transcript (English, automatically generated)',
    `Call: ${session.callId}`,
    `Started: ${new Date(session.startedAt).toISOString()}`,
    `Ended: ${session.endedAt ? new Date(session.endedAt).toISOString() : 'In progress / interrupted'}`,
    'Contains only speech captured while transcript saving was enabled.',
    ...(session.notice ? [`Note: ${session.notice}`] : []),
    '',
    ...lines,
    ''
  ].join('\n');
}

export async function saveTranscript(session, entries) {
  if (typeof window.showSaveFilePicker === 'function') {
    const handle = await window.showSaveFilePicker({
      suggestedName: `saito-call-${new Date(session.startedAt).toISOString().replace(/[:.]/g, '-')}.txt`,
      types: [{ description: 'Text transcript', accept: { 'text/plain': ['.txt'] } }]
    });
    const writable = await handle.createWritable();
    try {
      await writable.write(transcriptText(session, entries));
      await writable.close();
    } catch (error) {
      await writable.abort().catch(() => {});
      throw error;
    }
    return true;
  }
  downloadTranscript(session, entries);
  // Downloads do not expose completion. Require explicit user confirmation.
  return false;
}

export function downloadTranscript(session, entries) {
  const url = URL.createObjectURL(
    new Blob([transcriptText(session, entries)], { type: 'text/plain;charset=utf-8' })
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = `saito-call-${new Date(session.startedAt).toISOString().replace(/[:.]/g, '-')}.txt`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Keep the existing database name so the module rename preserves crash recovery.
export class TranscriptStore {
  open() {
    if (!this.opening) {
      this.opening = new Promise((resolve, reject) => {
        const request = indexedDB.open('saito-call-captions', 1);
        request.onupgradeneeded = () => {
          const db = request.result;
          db.createObjectStore('sessions', { keyPath: 'id' });
          db.createObjectStore('entries', { keyPath: ['sessionId', 'id'] }).createIndex(
            'sessionId',
            'sessionId'
          );
        };
        request.onsuccess = () => {
          request.result.onversionchange = () => request.result.close();
          resolve(request.result);
        };
        request.onerror = () => reject(request.error);
        request.onblocked = () =>
          reject(new Error('Transcript storage is blocked by another tab.'));
      });
    }
    return this.opening;
  }

  async transaction(stores, mode, callback) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(stores, mode);
      const request = callback(tx);
      tx.oncomplete = () => resolve(request?.result);
      tx.onerror = tx.onabort = () => reject(tx.error || new Error('Transcript storage failed.'));
    });
  }

  saveSession(session) {
    return this.transaction(['sessions'], 'readwrite', (tx) =>
      tx.objectStore('sessions').put(session)
    );
  }

  append(session, entry) {
    return this.transaction(['sessions', 'entries'], 'readwrite', (tx) => {
      tx.objectStore('sessions').put(session);
      tx.objectStore('entries').put({ ...entry, sessionId: session.id });
    });
  }

  addEntry(sessionId, entry) {
    return this.updateEntries(sessionId, [entry]);
  }

  updateEntries(sessionId, entries) {
    return this.transaction(['entries'], 'readwrite', (tx) => {
      const store = tx.objectStore('entries');
      for (const entry of entries) store.put({ ...entry, sessionId });
    });
  }

  sessions() {
    return this.transaction(['sessions'], 'readonly', (tx) => tx.objectStore('sessions').getAll());
  }

  entries(sessionId) {
    return this.transaction(['entries'], 'readonly', (tx) =>
      tx.objectStore('entries').index('sessionId').getAll(sessionId)
    );
  }

  remove(sessionId) {
    return this.transaction(['sessions', 'entries'], 'readwrite', (tx) => {
      tx.objectStore('sessions').delete(sessionId);
      const request = tx.objectStore('entries').index('sessionId').openCursor(sessionId);
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      };
    });
  }
}
