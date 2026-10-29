const fs = require('node:fs');
const path = require('node:path');
const GAMES = { Conquest: 'conquest/conquest', Settlers: 'settlers/settlers', Twilight: 'twilight/twilight' };
function loadConfig(filename) {
  const absolute = path.resolve(filename);
  const input = JSON.parse(fs.readFileSync(absolute, 'utf8'));
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw Error('Config must be an object');
  const config = {
    peer: input.peer, game: input.game || 'Conquest',
    dataDir: path.resolve(path.dirname(absolute), input.dataDir || './runner-data'),
    options: input.options || {},
    decisionProvider: { type: 'codex', executable: 'codex', timeoutMs: 120000, ...input.decisionProvider },
    pollMs: input.pollMs ?? 250, idleTimeoutMs: input.idleTimeoutMs ?? 600000,
    maxDecisions: input.maxDecisions ?? 10000,
    daemon: { games: [input.game || 'Conquest'], mode: 'delay', joinDelayMs: 60000,
      consentTimeoutMs: 600000, refreshMs: 30000, community: true, ...input.daemon }
  };
  if (!config.options || typeof config.options !== 'object' || Array.isArray(config.options)) throw Error('options must be an object');
  if (!GAMES[config.game]) throw Error('game must be Conquest, Settlers or Twilight');
  const d = config.daemon;
  if (!Array.isArray(d.games) || !d.games.length || d.games.some(g => !Object.hasOwn(GAMES, g)) || new Set(d.games).size !== d.games.length) throw Error('daemon.games must list supported games without duplicates');
  if (!['delay', 'ask'].includes(d.mode)) throw Error('daemon.mode must be delay or ask');
  if (!Number.isSafeInteger(d.joinDelayMs) || d.joinDelayMs < 0) throw Error('Invalid daemon.joinDelayMs');
  for (const key of ['consentTimeoutMs', 'refreshMs']) {
    if (!Number.isSafeInteger(d[key]) || d[key] < 1000) throw Error(`Invalid daemon.${key}`);
  }
  if (typeof d.community !== 'boolean') throw Error('Invalid daemon.community');
  const url = new URL(config.peer);
  if (!['ws:', 'wss:'].includes(url.protocol) || url.pathname !== '/wsopen' || url.username || url.password || url.search || url.hash) {
    throw Error('peer must be ws(s)://host:port/wsopen');
  }
  if (!['codex', 'heuristic'].includes(config.decisionProvider.type)) throw Error('Unknown decision provider');
  for (const key of ['pollMs', 'idleTimeoutMs', 'maxDecisions']) {
    if (!Number.isSafeInteger(config[key]) || config[key] <= 0) throw Error(`Invalid ${key}`);
  }
  if (!Number.isSafeInteger(config.decisionProvider.timeoutMs) || config.decisionProvider.timeoutMs < 100) throw Error('Invalid provider timeout');
  if (typeof config.decisionProvider.executable !== 'string' || !config.decisionProvider.executable) throw Error('Invalid Codex executable');
  if (config.decisionProvider.executable.includes('/') && !path.isAbsolute(config.decisionProvider.executable)) {
    config.decisionProvider.executable = path.resolve(path.dirname(absolute), config.decisionProvider.executable);
  }
  if (config.decisionProvider.model !== undefined && typeof config.decisionProvider.model !== 'string') throw Error('Invalid model');
  if (config.game === 'Twilight') {
    config.options.deck ||= 'original';
    if (config.options.deck !== 'original') throw Error('Twilight runner currently supports the original deck');
  }
  if (config.game === 'Settlers') {
    const length = Number(config.options.game_length ?? 10);
    if (!Number.isInteger(length) || length < 5 || length > 20) throw Error('Invalid Settlers game_length');
    if (Number(config.options.turn_limit || 0) !== 0) throw Error('Runner requires games without a turn clock');
  }
  if (config.options.async_dealing) throw Error('Async dealing is unsupported');
  if (config.options.stake && Number(config.options.stake) !== 0) throw Error('Runner supports unstaked games only');
  return config;
}
module.exports = { loadConfig, GAMES };
