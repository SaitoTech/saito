const fs = require('node:fs');
const path = require('node:path');
const JSONbig = require('json-bigint');
const Storage = require('../../lib/saito/storage').default;

// One directory and one writer per player. Never reads the node's config/options.
class RunnerStorage extends Storage {
  constructor(app, directory) {
    super(app);
    this.directory = path.resolve(directory);
    fs.mkdirSync(this.directory, { recursive: true, mode: 0o700 });
    this.filename = path.join(this.directory, 'options.json');
  }
  async initialize() {}
  load() {
    if (fs.existsSync(this.filename)) return JSONbig.parse(fs.readFileSync(this.filename, 'utf8'));
    return {};
  }
  saveOptions() {
    const tmp = this.filename + '.tmp';
    fs.writeFileSync(tmp, JSONbig.stringify(this.app.options), { mode: 0o600 });
    const fd = fs.openSync(tmp, 'r');
    try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    fs.renameSync(tmp, this.filename);
    const directory = fs.openSync(this.directory, 'r');
    try { fs.fsyncSync(directory); } finally { fs.closeSync(directory); }
  }
  async saveTransaction() {} // Game checkpoints and pending txs live in options.
  async loadTransactions(_query, callback) { callback?.([]); return []; }
}
module.exports = RunnerStorage;
