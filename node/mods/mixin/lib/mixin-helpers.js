const Decimal = require('decimal.js');

function createMixinCredentials(account = {}) {
  const keystore = {
    app_id: account.user_id,
    session_id: account.session_id,
    pin_token_base64: account.tip_key_base64 || account.pin_token_base64,
    session_private_key: account.session_seed || account.session_private_key
  };
  const spend_private_key = account.spend_private_key;

  const missing = [];
  for (const [name, value] of Object.entries({ ...keystore, spend_private_key })) {
    if (!value) {
      missing.push(name);
    }
  }

  if (missing.length) {
    throw new Error(`Mixin account configuration is incomplete (missing: ${missing.join(', ')})`);
  }

  return {
    keystore,
    spend_private_key,
    user_id: keystore.app_id
  };
}

function createMixinMemo(memo = '') {
  if (Buffer.isBuffer(memo)) {
    return memo;
  }
  return Buffer.from(String(memo), 'utf8');
}

function calculatePendingBalance(balance, ...deductions) {
  let pending = new Decimal(balance);
  for (const deduction of deductions) {
    pending = pending.minus(deduction);
  }
  return Number(pending.toFixed(8));
}

function formatMixinError(err) {
  const apiError = err?.response?.data?.error;
  if (apiError?.description || apiError?.code) {
    return [apiError.code, apiError.description].filter(Boolean).join(': ');
  }
  if (err instanceof Error) {
    return err.message;
  }
  if (typeof err === 'string') {
    return err;
  }
  try {
    const serialized = JSON.stringify(err);
    return serialized === undefined ? String(err) : serialized;
  } catch (jsonError) {
    return String(err);
  }
}

module.exports = {
  calculatePendingBalance,
  createMixinCredentials,
  createMixinMemo,
  formatMixinError
};
