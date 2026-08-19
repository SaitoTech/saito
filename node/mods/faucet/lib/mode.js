function readFaucetMode(options = {}) {
  const faucet = options?.faucet && typeof options.faucet === 'object' ? options.faucet : {};
  const saved = faucet.mode && typeof faucet.mode === 'object' ? faucet.mode : {};

  return {
    free: saved.free === true || saved.free_use === true || faucet.free_use === true,
    github: saved.github === true,
    twitter: saved.twitter === true
  };
}

function saveFaucetMode(app, mode = {}) {
  if (!app.options.faucet || typeof app.options.faucet !== 'object') {
    app.options.faucet = {};
  }

  const normalized = {
    free: mode.free === true || mode.free_use === true,
    github: mode.github === true,
    twitter: mode.twitter === true
  };

  app.options.faucet.mode = { ...normalized };
  // Keep the legacy scalar in sync so older options and node builds retain
  // the administrator's choice across a restart too.
  app.options.faucet.free_use = normalized.free;
  app.storage.saveOptions();

  return normalized;
}

module.exports = { readFaucetMode, saveFaucetMode };
