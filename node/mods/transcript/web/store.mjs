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
  // Downloads expose no completion signal; a non-errored dispatch counts as saved.
  return true;
}

export function downloadTranscript(session, entries) {
  const url = URL.createObjectURL(
    new Blob([transcriptText(session, entries)], { type: 'text/plain;charset=utf-8' })
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = `saito-call-${new Date(session.startedAt).toISOString().replace(/[:.]/g, '-')}.txt`;
  try {
    link.click();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

// Keep the existing database name so the module rename preserves crash recovery.
export class TranscriptStore {
  open() {
    if (!this.opening) {
      this.opening = new Promise((resolve, reject) => {
        const request = indexedDB.open('saito-call-captions', 2);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains('sessions'))
            db.createObjectStore('sessions', { keyPath: 'id' });
          if (!db.objectStoreNames.contains('entries'))
            db.createObjectStore('entries', { keyPath: ['sessionId', 'id'] }).createIndex(
              'sessionId',
              'sessionId'
            );
          if (!db.objectStoreNames.contains('audioChunks')) {
            const audio = db.createObjectStore('audioChunks', { keyPath: ['sessionId', 'id'] });
            audio.createIndex('sessionId', 'sessionId');
            audio.createIndex('order', ['sessionId', 'start', 'id']);
            audio.createIndex('stream', ['sessionId', 'streamId', 'start', 'id']);
            db.createObjectStore('audioUsage', { keyPath: 'id' });
          }
        };
        request.onsuccess = () => {
          request.result.onversionchange = () => {
            request.result.close();
            this.opening = null;
          };
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
      const timeout = setTimeout(() => {
        try {
          tx.abort();
        } catch {
          /* Transaction already finished. */
        }
      }, 15000);
      let request;
      try {
        request = callback(tx);
      } catch (error) {
        clearTimeout(timeout);
        tx.abort();
        reject(error);
        return;
      }
      tx.oncomplete = () => {
        clearTimeout(timeout);
        resolve(request?.result);
      };
      tx.onerror = tx.onabort = () => {
        clearTimeout(timeout);
        reject(tx.error || new Error('Transcript storage failed or timed out.'));
      };
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

  audioStats(sessionId) {
    return this.transaction(['audioUsage'], 'readonly', (tx) =>
      tx.objectStore('audioUsage').get(sessionId)
    ).then((value) => value || { id: sessionId, bytes: 0, count: 0 });
  }

  // Audio and accounting commit together. The global budget includes all sessions.
  async appendAudio(session, chunk, limit = 256 * 1024 * 1024) {
    let failure;
    try {
      await this.transaction(['sessions', 'audioChunks', 'audioUsage'], 'readwrite', (tx) => {
        const usage = tx.objectStore('audioUsage');
        const total = usage.get('*');
        total.onsuccess = () => {
          const value = total.result || { id: '*', bytes: 0, count: 0 };
          if (value.bytes + chunk.audio.byteLength > limit) {
            failure = new Error(
              'Local audio buffer is full. Capture stopped; saved audio can be finished later.'
            );
            tx.abort();
            return;
          }
          usage.put({
            ...value,
            bytes: value.bytes + chunk.audio.byteLength,
            count: value.count + 1
          });
        };
        const current = usage.get(session.id);
        current.onsuccess = () => {
          const value = current.result || { id: session.id, bytes: 0, count: 0 };
          usage.put({
            ...value,
            bytes: value.bytes + chunk.audio.byteLength,
            count: value.count + 1
          });
        };
        tx.objectStore('audioChunks').add({ ...chunk, sessionId: session.id });
        const sessions = tx.objectStore('sessions');
        const existing = sessions.get(session.id);
        existing.onsuccess = () =>
          sessions.put({
            ...(existing.result || session),
            selection: session.selection,
            updatedAt: Date.now()
          });
      });
    } catch (error) {
      throw failure || error;
    }
  }

  // Read at most twelve seconds from the oldest stream, even with interleaved speakers.
  async audioBatch(sessionId) {
    const blocks = [];
    await this.transaction(['audioChunks'], 'readonly', (tx) => {
      const audio = tx.objectStore('audioChunks');
      const first = audio
        .index('order')
        .openCursor(IDBKeyRange.bound([sessionId, 0], [sessionId, Number.MAX_SAFE_INTEGER, []]));
      first.onsuccess = () => {
        if (!first.result) return;
        const { streamId } = first.result.value;
        const request = audio
          .index('stream')
          .openCursor(
            IDBKeyRange.bound(
              [sessionId, streamId, 0],
              [sessionId, streamId, Number.MAX_SAFE_INTEGER, []]
            )
          );
        let samples = 0;
        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor) return;
          const block = cursor.value;
          if (
            blocks.length &&
            (samples + block.audio.length > 16000 * 12 || block.start - blocks.at(-1).end > 1000)
          )
            return;
          blocks.push(block);
          samples += block.audio.length;
          if (!block.final && blocks.length < 16) cursor.continue();
        };
      };
    });
    return blocks;
  }

  // A retry can commit once only. Empty recognition still consumes its source audio.
  async completeAudio(sessionId, blocks, entry) {
    let committed = false;
    await this.transaction(['entries', 'audioChunks', 'audioUsage'], 'readwrite', (tx) => {
      const audio = tx.objectStore('audioChunks');
      let found = 0;
      for (const block of blocks) {
        const request = audio.get([sessionId, block.id]);
        request.onsuccess = () => {
          if (!request.result) {
            tx.abort();
            return;
          }
          if (++found !== blocks.length) return;
          if (entry) tx.objectStore('entries').put({ ...entry, sessionId });
          for (const source of blocks) audio.delete([sessionId, source.id]);
          const bytes = blocks.reduce((sum, source) => sum + source.audio.byteLength, 0);
          const usage = tx.objectStore('audioUsage');
          for (const id of ['*', sessionId]) {
            const previous = usage.get(id);
            previous.onsuccess = () =>
              usage.put({
                id,
                bytes: Math.max(0, (previous.result?.bytes || 0) - bytes),
                count: Math.max(0, (previous.result?.count || 0) - blocks.length)
              });
          }
          committed = true;
        };
      }
    });
    return committed;
  }

  remove(sessionId) {
    return this.transaction(
      ['sessions', 'entries', 'audioChunks', 'audioUsage'],
      'readwrite',
      (tx) => {
        tx.objectStore('sessions').delete(sessionId);
        for (const name of ['entries', 'audioChunks']) {
          const request = tx.objectStore(name).index('sessionId').openCursor(sessionId);
          request.onsuccess = () => {
            const cursor = request.result;
            if (cursor) {
              cursor.delete();
              cursor.continue();
            }
          };
        }
        const usage = tx.objectStore('audioUsage');
        const session = usage.get(sessionId);
        session.onsuccess = () => {
          const total = usage.get('*');
          total.onsuccess = () => {
            usage.put({
              id: '*',
              bytes: Math.max(0, (total.result?.bytes || 0) - (session.result?.bytes || 0)),
              count: Math.max(0, (total.result?.count || 0) - (session.result?.count || 0))
            });
            usage.delete(sessionId);
          };
        };
      }
    );
  }
}

// Hold this across capture, recognition, or export/deletion. Browsers release it on crash.
export function withTranscriptLock(sessionId, operation) {
  if (!globalThis.navigator?.locks)
    return Promise.reject(
      new Error('This browser needs Web Locks support for recoverable transcription.')
    );
  return navigator.locks.request(`saito-transcript:${sessionId}`, { ifAvailable: true }, (lock) => {
    if (!lock) throw new Error('This transcript is in use in another tab.');
    return operation();
  });
}
