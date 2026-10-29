const fs = require('node:fs');
const path = require('node:path');
module.exports = function lock(directory) {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const filename = path.join(directory, 'runner.lock');
  try {
    const fd = fs.openSync(filename, 'wx', 0o600);
    fs.writeFileSync(fd, String(process.pid)); fs.closeSync(fd);
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    throw Error(`Data directory is locked (${filename}). If its process has stopped, remove the lock before resuming.`);
  }
  return () => fs.unlinkSync(filename);
};
