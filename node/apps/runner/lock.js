const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
module.exports = function lock(directory) {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const filename = path.join(directory, 'runner.lock');
  const contents = JSON.stringify({ pid: process.pid, token: randomUUID() });
  try {
    const fd = fs.openSync(filename, 'wx', 0o600);
    try { fs.writeFileSync(fd, contents); } finally { fs.closeSync(fd); }
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    let pid;
    try {
      const owner = JSON.parse(fs.readFileSync(filename, 'utf8'));
      pid = typeof owner === 'number' ? owner : owner?.pid; // Older locks contain only a PID.
    } catch (_) {}
    let detail = 'Cannot identify its owner.';
    if (Number.isSafeInteger(pid) && pid > 0) {
      try {
        process.kill(pid, 0);
        detail = `Owner PID ${pid} is still running. Stop that runner and wait for it to exit; do not delete its lock.`;
      } catch (e) {
        detail = e.code === 'ESRCH' ?
          `Owner PID ${pid} has exited. Check for orphan daemon-worker.js or multi-worker.js processes before removing the stale lock.` :
          `Cannot verify owner PID ${pid} (${e.code}); do not remove its lock while it may be running.`;
      }
    }
    throw Error(`Data directory is locked (${filename}). ${detail}`);
  }
  // Never let an old process delete a replacement lock after manual removal.
  // Releasing twice, or releasing an already removed lock, is harmless.
  return () => {
    try {
      if (fs.readFileSync(filename, 'utf8') === contents) fs.unlinkSync(filename);
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  };
};
