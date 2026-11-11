const fs = require('node:fs');
const path = require('node:path');
const defaults = { type: 'codex', executable: 'codex', timeoutMs: 120000,
  maxAttempts: 3, retryDelayMs: 30000 };

function normalize(input, directory) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw Error('Invalid agent connection');
  const provider = { ...defaults, ...input };
  if (!['codex', 'jev', 'heuristic'].includes(provider.type)) throw Error('Unknown decision provider');
  if (!Number.isSafeInteger(provider.timeoutMs) || provider.timeoutMs < 100) throw Error('Invalid provider timeout');
  for (const key of ['maxAttempts', 'retryDelayMs']) {
    if (!Number.isSafeInteger(provider[key]) || provider[key] < 1) throw Error(`Invalid decisionProvider.${key}`);
  }
  if (typeof provider.executable !== 'string' || !provider.executable) throw Error('Invalid Codex executable');
  if (provider.executable.includes('/') && !path.isAbsolute(provider.executable)) {
    provider.executable = path.resolve(directory, provider.executable);
  }
  if (provider.model !== undefined && typeof provider.model !== 'string') throw Error('Invalid model');
  if (provider.env !== undefined && (!provider.env || typeof provider.env !== 'object' || Array.isArray(provider.env) ||
    Object.entries(provider.env).some(([key, value]) => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || typeof value !== 'string' || value.includes('\0')))) {
    throw Error('Agent env must map environment variable names to strings');
  }
  if (provider.type === 'jev') require('./providers/jev').validate(provider);
  return provider;
}

function resolveAgents(input, filename, game, games) {
  const directory = path.dirname(filename);
  const named = input.agent !== undefined || input.gameAgents !== undefined;
  if (input.chatAgent !== undefined && input.chatAgent !== null && (typeof input.chatAgent !== 'string' || !input.chatAgent)) {
    throw Error('chatAgent must be an LLM connection ID or null');
  }
  if (!named && !input.chatAgent) {
    return { decisionProvider: normalize(input.decisionProvider || {}, directory), chatProvider: null };
  }
  if (named && input.decisionProvider !== undefined) throw Error('Use agent selection or legacy decisionProvider, not both');
  if (input.agentsFile !== undefined && (typeof input.agentsFile !== 'string' || !input.agentsFile)) throw Error('Invalid agentsFile');
  const file = path.resolve(directory, input.agentsFile || 'agents.json');
  const registry = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!Array.isArray(registry?.connections) || !registry.connections.length) throw Error('agents.connections must be a non-empty array');
  const connections = new Map();
  for (const connection of registry.connections) {
    if (!connection || typeof connection.id !== 'string' || !/^[A-Za-z0-9_-]+$/.test(connection.id)) throw Error('Invalid agent connection id');
    if (connections.has(connection.id)) throw Error('Duplicate agent connection id');
    connections.set(connection.id, normalize(connection, path.dirname(file)));
  }
  const chatProvider = input.chatAgent ? connections.get(input.chatAgent) : null;
  if (input.chatAgent && (!chatProvider || chatProvider.type !== 'codex')) throw Error('chatAgent must select an LLM connection (codex)');
  if (!named) return { decisionProvider: normalize(input.decisionProvider || {}, directory), chatProvider };
  const selections = input.gameAgents === undefined ? {} : input.gameAgents;
  if (!selections || typeof selections !== 'object' || Array.isArray(selections)) throw Error('gameAgents must map games to connection IDs');
  const { GAMES } = require('./config');
  if (Object.keys(selections).some(name => !Object.hasOwn(GAMES, name))) throw Error('Unknown game in gameAgents');
  const gameProviders = {};
  for (const name of new Set([game, ...games, ...Object.keys(selections)])) {
    const id = selections[name] ?? input.agent;
    if (typeof id !== 'string' || !connections.has(id)) throw Error(`Unknown or missing agent for ${name}`);
    gameProviders[name] = connections.get(id);
  }
  return { chatProvider, gameProviders, decisionProvider: gameProviders[game] };
}

function forGame(config, game) {
  return { ...config, game, decisionProvider: config.gameProviders?.[game] || config.decisionProvider };
}
module.exports = { resolveAgents, forGame };
