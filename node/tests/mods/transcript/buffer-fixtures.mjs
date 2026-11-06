export function browserLocks(t) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const held = new Set();
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      locks: {
        request: async (name, options, operation) => {
          if (held.has(name)) return operation(null);
          held.add(name);
          try {
            return await operation({ name });
          } finally {
            held.delete(name);
          }
        }
      }
    }
  });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'navigator', previous);
    else delete globalThis.navigator;
  });
}

export class AudioStore {
  constructor() {
    this.blocks = [];
    this.text = [];
  }
  async saveSession() {}
  async appendAudio(session, block) {
    this.blocks.push(structuredClone(block));
  }
  async audioBatch() {
    if (!this.blocks.length) return [];
    const stream = this.blocks[0].streamId;
    return structuredClone(this.blocks.filter((block) => block.streamId === stream).slice(0, 12));
  }
  async audioStats() {
    return {
      count: this.blocks.length,
      bytes: this.blocks.reduce((sum, b) => sum + b.audio.byteLength, 0)
    };
  }
  async completeAudio(sessionId, blocks, entry) {
    this.blocks = this.blocks.filter((block) => !blocks.some((source) => source.id === block.id));
    if (entry) this.text.push(entry);
  }
}
