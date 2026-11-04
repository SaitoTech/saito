/**
 * NFT queue instruction policy for GameTemplate.
 *
 * Host-side only: sandbox scripts call api.addToQueue(string); validation and
 * any local apply run in the game module, never inside the sandbox.
 *
 * Games may extend returnNftQueuePolicy() with additional instructions, but
 * cannot enable HARD_BLOCKED_COMMANDS.
 */

'use strict';

/** Commands that must never be callable from NFT scripts, even if a game adds them. */
const HARD_BLOCKED_COMMANDS = new Set([
  'SEND',
  'RECEIVE',
  'SETTLE',
  'CRYPTOKEY',
  'AVAILABLE_CRYPTOS',
  'REQUEST_AVAILABLE_CRYPTOS',
  'AVAILABLE_NFTS',
  'REQUEST_AVAILABLE_NFTS',
  'GAMEOVER',
  'ROUNDOVER',
  'PICKRADIOACTIVE',
  'WITHDRAW',
  'BALANCE'
]);

function assertNonEmptyString(value, label) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${label}: expected a non-empty string`);
  }
}

function assertNoControlChars(value, label) {
  if (/[\t\n\r]/.test(value)) {
    throw new Error(`${label}: must not contain tab or newline characters`);
  }
}

function createEngineNftQueuePolicy() {
  return {
    NOTIFY: {
      validate(parts) {
        if (parts.length < 2) {
          throw new Error('NOTIFY: missing message');
        }
        const message = parts.slice(1).join('\t');
        if (!message.trim()) {
          throw new Error('NOTIFY: empty message');
        }
        if (message.length > 2000) {
          throw new Error('NOTIFY: message too long');
        }
        return `NOTIFY\t${message}`;
      }
    },
    notify: {
      validate(parts) {
        if (parts.length < 2) {
          throw new Error('notify: missing message');
        }
        const message = parts.slice(1).join('\t');
        if (!message.trim()) {
          throw new Error('notify: empty message');
        }
        if (message.length > 2000) {
          throw new Error('notify: message too long');
        }
        return `notify\t${message}`;
      }
    },
    RESOLVE: {
      validate(parts) {
        // RESOLVE or RESOLVE\t<publickey>
        if (parts.length === 1) {
          return 'RESOLVE';
        }
        if (parts.length === 2) {
          assertNonEmptyString(parts[1], 'RESOLVE key');
          assertNoControlChars(parts[1], 'RESOLVE key');
          return `RESOLVE\t${parts[1]}`;
        }
        throw new Error('RESOLVE: invalid argument count');
      }
    },
    ACKNOWLEDGE: {
      validate(parts) {
        if (parts.length < 2) {
          throw new Error('ACKNOWLEDGE: missing message');
        }
        const message = parts.slice(1).join('\t');
        if (!message.trim()) {
          throw new Error('ACKNOWLEDGE: empty message');
        }
        if (message.length > 2000) {
          throw new Error('ACKNOWLEDGE: message too long');
        }
        return `ACKNOWLEDGE\t${message}`;
      }
    }
  };
}

function mergeNftQueuePolicies(base, extension) {
  const out = { ...(base || {}) };
  if (!extension || typeof extension !== 'object') {
    return out;
  }
  for (const [name, entry] of Object.entries(extension)) {
    if (HARD_BLOCKED_COMMANDS.has(name)) {
      throw new Error(`NFT queue policy cannot enable blocked command: ${name}`);
    }
    if (!entry || typeof entry.validate !== 'function') {
      throw new Error(`NFT queue policy entry "${name}" must provide validate()`);
    }
    out[name] = entry;
  }
  return out;
}

/**
 * Validate instruction against mod.returnNftQueuePolicy(), optionally apply
 * local effects, then append the normalized instruction to this.moves.
 */
function addToQueue(mod, instruction) {
  assertNonEmptyString(instruction, 'addToQueue');
  if (instruction.indexOf('\n') !== -1 || instruction.indexOf('\r') !== -1) {
    throw new Error('addToQueue: instruction must not contain newlines');
  }

  const parts = instruction.split('\t');
  const command = parts[0];
  if (!command) {
    throw new Error('addToQueue: missing command name');
  }
  if (HARD_BLOCKED_COMMANDS.has(command)) {
    throw new Error(`addToQueue: command not permitted: ${command}`);
  }

  const policy =
    typeof mod.returnNftQueuePolicy === 'function' ? mod.returnNftQueuePolicy() : {};
  const entry = policy && policy[command];
  if (!entry || typeof entry.validate !== 'function') {
    throw new Error(`addToQueue: command not permitted: ${command}`);
  }

  const normalized = entry.validate(parts, mod);
  assertNonEmptyString(normalized, 'addToQueue normalized instruction');
  const normalizedParts = normalized.split('\t');
  if (normalizedParts[0] !== command) {
    throw new Error('addToQueue: validator must preserve command name');
  }
  if (HARD_BLOCKED_COMMANDS.has(normalizedParts[0])) {
    throw new Error(`addToQueue: command not permitted: ${normalizedParts[0]}`);
  }

  if (typeof entry.applyLocal === 'function') {
    entry.applyLocal(normalizedParts, mod);
  }

  mod.addMove(normalized);
  return normalized;
}

/**
 * Validate an NFT id before it is used as a card / queue identifier.
 */
function assertValidNftCardId(id, reservedNames) {
  assertNonEmptyString(id, 'NFT id');
  assertNoControlChars(id, 'NFT id');
  if (id.indexOf(' ') !== -1) {
    throw new Error('NFT id: must not contain spaces');
  }
  if (HARD_BLOCKED_COMMANDS.has(id)) {
    throw new Error(`NFT id conflicts with reserved command: ${id}`);
  }
  if (reservedNames && reservedNames.has(id)) {
    throw new Error(`NFT id conflicts with reserved identifier: ${id}`);
  }
  return id;
}

/**
 * Locate an options.nfts entry by its application-level id.
 */
function findNftByAppId(nfts, id) {
  if (!Array.isArray(nfts) || id == null || String(id) === '') {
    return null;
  }
  const key = String(id);
  return nfts.find((n) => n && String(n.id) === key) || null;
}

/**
 * Resolve executable source from nft.data.code at a zero-based index.
 * Supports a legacy single string (index 0 only), string[], and [{code}].
 * Returns { ok: true, code } or { ok: false, error }.
 */
function resolveNftEventCode(raw, index) {
  if (!Number.isInteger(index) || index < 0) {
    return { ok: false, error: `invalid code index ${index}` };
  }

  if (typeof raw === 'string') {
    if (index !== 0) {
      return { ok: false, error: `string code only valid at index 0 (got ${index})` };
    }
    if (!raw.trim()) {
      return { ok: false, error: 'string code is empty' };
    }
    return { ok: true, code: raw };
  }

  if (!Array.isArray(raw)) {
    return { ok: false, error: 'nft has no executable code' };
  }

  if (index >= raw.length) {
    return { ok: false, error: `invalid code index ${index}` };
  }

  const entry = raw[index];
  if (typeof entry === 'string') {
    if (!entry.trim()) {
      return { ok: false, error: `code at index ${index} is empty` };
    }
    return { ok: true, code: entry };
  }

  if (entry && typeof entry === 'object' && typeof entry.code === 'string') {
    if (!entry.code.trim()) {
      return { ok: false, error: `code at index ${index} is empty` };
    }
    return { ok: true, code: entry.code };
  }

  return { ok: false, error: `invalid code entry at index ${index}` };
}

/**
 * Replace nft.args with a fresh array of this invocation's fields.
 */
function applyNftEventArgs(nft, argFields = []) {
  const fields = Array.isArray(argFields) ? argFields.map(String) : [];
  nft.args = [];
  for (const a of fields) {
    nft.args.push(a);
  }
  return nft.args;
}

/**
 * Parse NFT_EVENT fields after the command name.
 * gmv: ['NFT_EVENT', id, index, ...args]
 */
function parseNftEventFields(gmv) {
  const id = String(gmv[1] || '');
  const indexRaw = gmv[2];
  const index = Number(indexRaw);
  const argFields = gmv.slice(3).map((a) => String(a));

  if (!id) {
    return { ok: false, error: 'missing nft id' };
  }
  if (!Number.isInteger(index) || String(index) !== String(indexRaw)) {
    return { ok: false, error: `invalid code index ${indexRaw}` };
  }

  return { ok: true, id, index, argFields };
}

/**
 * Run NFT_EVENT against game.options.nfts using the existing sandbox.
 * Caller must already have spliced the instruction from the queue.
 * Returns 0 to pause the GameTemplate queue, otherwise 1.
 */
async function runNftEvent(game_self, gmv) {
  const parsed = parseNftEventFields(gmv);
  if (!parsed.ok) {
    console.error('NFT_EVENT:', parsed.error);
    return 1;
  }

  const { id, index, argFields } = parsed;
  const listed = game_self?.game?.options?.nfts;
  if (!Array.isArray(listed)) {
    console.error('NFT_EVENT: game.options.nfts missing');
    return 1;
  }

  const nft = findNftByAppId(listed, id);
  if (!nft) {
    console.error('NFT_EVENT: nft not found', id);
    return 1;
  }

  const resolved = resolveNftEventCode(nft.data?.code, index);
  if (!resolved.ok) {
    console.error('NFT_EVENT:', resolved.error, id);
    return 1;
  }

  applyNftEventArgs(nft, argFields);

  if (!game_self.app?.BROWSER || typeof game_self.app?.browser?.executeJS !== 'function') {
    console.error('NFT_EVENT: no browser execution environment', id);
    return 1;
  }

  try {
    const api = game_self.returnApi();
    const context = game_self.returnContext();
    const result = await game_self.app.browser.executeJS(
      resolved.code,
      { api, context, args: nft.args },
      { maxExecutionTime: 0 }
    );
    return result === 0 ? 0 : 1;
  } catch (err) {
    console.error('NFT_EVENT: execution failed', id, err);
    return 1;
  }
}

module.exports = {
  HARD_BLOCKED_COMMANDS,
  createEngineNftQueuePolicy,
  mergeNftQueuePolicies,
  addToQueue,
  assertValidNftCardId,
  findNftByAppId,
  resolveNftEventCode,
  applyNftEventArgs,
  parseNftEventFields,
  runNftEvent
};
