const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const execute = promisify(execFile);

module.exports = async function checkProvider(config) {
  if (config.type === 'jev') { require('./jev').credentials(config); return null; }
  if (config.type !== 'codex') return null;
  const executable = config.executable || 'codex';
  try {
    const { stdout } = await execute(executable, ['--version'], {
      env: { ...process.env, ...config.env }, timeout: 10000, maxBuffer: 16384, encoding: 'utf8', shell: false
    });
    return stdout.trim();
  } catch (error) {
    throw Error(`Cannot run Codex executable ${JSON.stringify(executable)} (${error.code || error.message}). ` +
      'Set decisionProvider.executable in your config to the absolute path of your local Codex CLI.');
  }
};
