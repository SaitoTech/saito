/**
 * Persist Faucet mode flags in app.options.faucet.mode.
 * OAuth secrets stay in memory; only enabled-mode flags are saved.
 */

function normalizeMode(mode = {}) {
  const src = mode && typeof mode === 'object' ? mode : {};
  return {
    free: src.free === true || src.free_use === true,
    github: src.github === true,
    twitter: src.twitter === true
  };
}

function readFaucetMode(options = {}) {
  return normalizeMode(options?.faucet?.mode);
}

function saveFaucetMode(app, mode = {}) {
  const next = normalizeMode(mode);
  if (!app.options) {
    app.options = {};
  }
  if (!app.options.faucet || typeof app.options.faucet !== 'object') {
    app.options.faucet = {};
  }
  app.options.faucet.mode = { ...next };
  if (app.storage?.saveOptions) {
    app.storage.saveOptions();
  }
  return next;
}

module.exports = { readFaucetMode, saveFaucetMode };